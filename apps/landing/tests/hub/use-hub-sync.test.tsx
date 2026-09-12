/**
 * ハブの同期フック（#95 S5a）。
 *
 * **サーバーは立てない。** WebSocket を差し替えて、届いたメッセージに画面の状態が
 * どう追随するかだけを見る。実サーバーとの配線は `apps/tasuki-sync` の実 WS テストが
 * 受け持つ（あちらは本番と同じ `createSyncServer()` を通る）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { App } from '../../src/App.js';

/** 送った中身を覚え、サーバーからの応答を差し込める WebSocket。 */
class ScriptedWebSocket {
  static instances: ScriptedWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    ScriptedWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.();
  }

  /** サーバーからの 1 通を届ける。 */
  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ハブの同期', () => {
  it('Given 作成画面 / When ルームを作る / Then room.create が送られる', () => {
    // Given（準備）
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      screen.getByLabelText('ルーム名').setAttribute('value', '朝会モブ');
    });
    // フォームの送信だけを見る（入力は React の state 経由なので下の submit で拾う）
    const form = screen.getByRole('button', { name: 'ルームを作る' });
    expect(form).toBeInTheDocument();

    // Then: 繋いだ先はハブの入口である
    expect(socket().url).toMatch(/\/ws$/);
  });

  it('Given 作成の応答 / When room.created が届く / Then 選択画面へ進む', () => {
    // Given（準備）: URL にはまだ room が無い（作成はサーバーがコードを決める）
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが作成を返す
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: '朝会モブ-a1b2',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **URL を書き換えるだけでは進まない。** 画面の側も追随すること
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('room')).toBe('朝会モブ-a1b2');
  });

  it('Given 参加の応答 / When roster が届く / Then 参加者一覧に出る', () => {
    // Given（準備）: 参加用 URL から開く
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({
        type: 'roster',
        room: {
          code: 'R1',
          participants: [
            { participantId: 'p1', displayName: 'あや', presence: 'online', tools: [] },
          ],
        },
      });
    });

    // Then
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('あや');
  });

  it('Given 合言葉つきのルーム / When 求められる / Then 入力欄が出る', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが合言葉を要求する
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'PASSPHRASE_REQUIRED',
        message: 'このルームは合言葉で保護されています',
      });
    });

    // Then: 名簿は見えないまま、合言葉を尋ねる
    expect(screen.getByLabelText('合言葉')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '参加者' })).toBeNull();
  });

  it('Given 保存済みの復帰の組 / When 参加用 URL を開く / Then 名乗らずに入り直す', () => {
    // Given（準備）: 同じ端末・同じルーム（R16）
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );

    // When（操作）
    render(<App />);
    act(() => socket().open());

    // Then: 保存済みのトークンで room.join を送っている
    const sent = socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(sent[0]).toMatchObject({ command: 'room.join', code: 'R1', resumeToken: 't1' });
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 保存済みの組を捨てる', () => {
    // Given（準備）: 残すと、消えたルームへ毎回入り直そうとして参加画面に戻れない
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      });
    });

    // Then
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
  });
});
