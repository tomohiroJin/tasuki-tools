import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncConnection } from '../src/connection.js';

/**
 * 観測できる最小の WebSocket。実装が読む `readyState` と、送った中身を覚える。
 *
 * 実物を使わないのは、接続の**手順**（いつ繋ぎ直すか・何を溜めるか）を見たいからである。
 * サーバーを立てると、見たいものが通信の成否に隠れる。
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** サーバーが受け入れた（onopen が発火した）ことにする。 */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

const latest = (): FakeWebSocket => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SyncConnection', () => {
  it('Given 未接続 / When send する / Then 確立後にまとめて送られる', () => {
    // Given
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {} });
    conn.connect();

    // When
    conn.send({ command: 'room.join', code: 'ABC' });
    latest().open();

    // Then
    expect(latest().sent).toEqual([JSON.stringify({ command: 'room.join', code: 'ABC' })]);
  });

  it('Given 確立済み / When send する / Then その場で送られる', () => {
    // Given
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {} });
    conn.connect();
    latest().open();

    // When
    conn.send({ command: 'time.ping' });

    // Then
    expect(latest().sent).toEqual([JSON.stringify({ command: 'time.ping' })]);
  });

  it('Given 受信 / When メッセージが届く / Then 生テキストのまま渡る', () => {
    // Given: 境界の検証は利用側の責務なので、ここでは解釈しない
    const received: string[] = [];
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: (raw) => received.push(raw) });
    conn.connect();
    latest().open();

    // When
    latest().onmessage?.({ data: '{"type":"roster"}' });

    // Then
    expect(received).toEqual(['{"type":"roster"}']);
  });

  it('Given 一度確立した接続 / When 切断される / Then 待ってから繋ぎ直し、再接続として知らせる', () => {
    // Given
    const onReconnected = vi.fn();
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {}, onReconnected });
    conn.connect();
    latest().open();

    // When
    latest().onclose?.();
    vi.advanceTimersByTime(1000);
    latest().open();

    // Then: 初回の確立は再接続ではない（利用側は「保存済みの組で入り直す」判断に使う）
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it('Given 切断が続く / When 繋ぎ直しを待つ / Then 待ち時間が伸びる（指数バックオフ）', () => {
    // Given
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {} });
    conn.connect();
    latest().open();

    // When: 1 回目の切断は 1 秒、2 回目は 2 秒待つ
    latest().onclose?.();
    vi.advanceTimersByTime(999);
    const afterFirstWait = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(1);
    latest().onclose?.();
    vi.advanceTimersByTime(1999);
    const afterSecondWait = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(1);

    // Then: 待ち時間の途中では繋ぎ直していない
    expect(afterFirstWait).toBe(1);
    expect(afterSecondWait).toBe(2);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('Given 確立後に切断 / When 状態の変化を見る / Then online と reconnecting が順に通知される', () => {
    // Given
    const states: string[] = [];
    const conn = new SyncConnection({
      url: 'ws://example/ws',
      onMessage: () => {},
      onConnectionChange: (state) => states.push(state),
    });
    conn.connect();

    // When
    latest().open();
    latest().onclose?.();

    // Then
    expect(states).toEqual(['online', 'reconnecting']);
  });

  it('Given dispose 済み / When 接続が閉じる / Then 繋ぎ直さず、切断として通知もしない', () => {
    // Given
    const onClose = vi.fn();
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {}, onClose });
    conn.connect();
    latest().open();

    // When: こちらから閉じた結果を「切断」として扱わない（FR-086）
    conn.dispose();
    latest().onclose?.();
    vi.advanceTimersByTime(60_000);

    // Then
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Given dispose 済み / When send する / Then 溜めない（後から繋いで流れることがない）', () => {
    // Given
    const conn = new SyncConnection({ url: 'ws://example/ws', onMessage: () => {} });
    conn.connect();
    conn.dispose();

    // When
    conn.send({ command: 'room.join', code: 'ABC' });

    // Then: 破棄した接続のコマンドが、次の接続で蘇らないこと
    conn.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
