/**
 * 契約に合わないサーバーメッセージを捨てたことが、**画面から分かる**ことを固定する（#212）。
 *
 * 純関数（`indicatesStaleState` / `connectionNotice`）が個別に緑でも、**その間の配線が
 * 1 本切れていれば利用者には何も見えない**。ここは App を通して実経路を通す。
 *
 * @requirements #212
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { App } from '../src/App';

/** onopen/onmessage を手動で発火できる最小 WebSocket スタブ。 */
class FakeWS {
  static instances: FakeWS[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  private readonly handlers: Record<string, ((event: unknown) => void)[]> = {};
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.handlers[type] ??= []).push(handler);
  }
  fire(type: string, event?: unknown): void {
    for (const handler of this.handlers[type] ?? []) handler(event);
  }
  send(): void {}
  close(): void {}
}

function latest(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  if (ws === undefined) throw new Error('WebSocket が作られていません。');
  return ws;
}

/** サーバーからのフレーム 1 通を届ける。 */
function deliver(frame: unknown): void {
  act(() => {
    latest().fire('message', { data: JSON.stringify(frame) });
  });
}

function open(): void {
  act(() => {
    latest().readyState = FakeWS.OPEN;
    latest().fire('open');
  });
}

const A_VALID_ROOM_STATE = {
  type: 'room-state',
  roomId: 'ABCD1234',
  you: 'p1',
  participants: [{ id: 'p1', name: 'はなこ', isHost: true, connected: true, hasVoted: false }],
  round: { status: 'voting' },
  yourVote: null,
};

/** 画面の状態を載せているのに契約へ合わないフレーム（参加者名が数値）。 */
const A_BROKEN_ROOM_STATE = {
  ...A_VALID_ROOM_STATE,
  participants: [{ id: 'p1', name: 1, isHost: true, connected: true, hasVoted: false }],
};

/** 一過性のフレームの棄却（`error` 固有の項目だけが落ちる）。 */
const A_BROKEN_ERROR = { type: 'error', code: 'unknown-code', message: 'm' };

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal('WebSocket', FakeWS);
  window.history.replaceState(null, '', '/poker/');
  // 捨てたことは devtools にも残る。テスト出力を汚さないために黙らせる。
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('捨てたサーバーメッセージを画面で伝える', () => {
  it('正常に同期できている間は何も出さない', () => {
    // Given
    render(<App />);
    // When
    open();
    deliver(A_VALID_ROOM_STATE);
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  it('画面の状態を載せたフレームを捨てると、そのことを伝える', () => {
    // Given
    render(<App />);
    open();
    deliver(A_VALID_ROOM_STATE);
    // When
    deliver(A_BROKEN_ROOM_STATE);
    // Then
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
  });

  it('有効な room-state が届けば消える', () => {
    // Given
    render(<App />);
    open();
    deliver(A_BROKEN_ROOM_STATE);
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
    // When
    deliver(A_VALID_ROOM_STATE);
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  /**
   * **一過性の棄却で警告を立てない。** poker-sync に定期的な `room-state` 配信は無いので、
   * 一度立てると次に誰かが操作するまで下りない。
   */
  it('一過性のフレームの棄却では出さない', () => {
    // Given
    render(<App />);
    open();
    deliver(A_VALID_ROOM_STATE);
    // When
    deliver(A_BROKEN_ERROR);
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });
});
