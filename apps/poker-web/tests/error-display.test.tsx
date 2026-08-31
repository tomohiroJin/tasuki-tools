/**
 * サーバーから届いたエラーが、**どの画面でも利用者に伝わる**ことを固定する（#217）。
 *
 * #214 で `error` を捨てなくなり、フレームは `setError` まで届くようになった。
 * ところが `sync.error` を描いていたのは**入室後**の `error-note` だけで、
 * トップ画面と参加フォームには表出が無かった。その結果、
 * **#214 以前は出ていた「同期できていません」も出なくなり**（捨てないので当然）、
 * 入室前のエラーは画面からも devtools からも完全に消えていた（2026-08-31 に実測）。
 *
 * `App` を通して実経路で見る。**画面ごとに配線が別**なので、1 つ通ったからといって
 * 他が通っているとは言えない（#212 でトップ画面しか通らない検査が素通りした）。
 *
 * @requirements #217
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { FakeListenerSocket } from './support/fakes';
import { saveIdentity } from '../src/storage';
import { RETRY_WAITING_TEXT } from '../src/join-retry-plan';

const ROOM_ID = 'ABCD1234';
const UNKNOWN_ERROR = { type: 'error', code: 'room-closed', message: 'このルームは終了しました' };

function deliver(frame: unknown): void {
  act(() => {
    FakeListenerSocket.latest().fire('message', { data: JSON.stringify(frame) });
  });
}

function open(): void {
  act(() => {
    FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
    FakeListenerSocket.latest().fire('open');
  });
}

const A_ROOM_STATE = {
  type: 'room-state',
  roomId: ROOM_ID,
  you: 'p1',
  participants: [{ id: 'p1', name: 'はなこ', isHost: true, connected: true, hasVoted: false }],
  round: { status: 'voting' },
  yourVote: null,
};

beforeEach(() => {
  FakeListenerSocket.instances = [];
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  window.history.replaceState(null, '', '/poker/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('サーバーのエラーはどの画面でも伝わる（#217）', () => {
  it('トップ画面で伝える', () => {
    // Given: ルームを作ろうとしている
    window.history.replaceState(null, '', '/poker/');
    render(<App />);
    open();
    // When
    deliver(UNKNOWN_ERROR);
    // Then
    expect(screen.getByText('このルームは終了しました')).toBeTruthy();
  });

  it('参加フォームで伝える', () => {
    // Given: 招待リンクを開き、まだ入室していない
    saveIdentity(ROOM_ID, { token: 'tok-1', name: 'はなこ' });
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    // When
    deliver(UNKNOWN_ERROR);
    // Then
    expect(screen.getByText('このルームは終了しました')).toBeTruthy();
  });

  it('入室後の画面で伝える（従来どおり）', () => {
    // Given
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    deliver(A_ROOM_STATE);
    // When
    deliver(UNKNOWN_ERROR);
    // Then
    expect(screen.getByText('このルームは終了しました')).toBeTruthy();
  });

  it('閉じると消える', () => {
    // Given
    render(<App />);
    open();
    deliver(UNKNOWN_ERROR);
    // When
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    // Then
    expect(screen.queryByText('このルームは終了しました')).toBeNull();
  });

  /**
   * **専用の表出を持つ code は汎用表示に出さない。** 二重に出ると、
   * 同じ 1 つの出来事が 2 つの別々の問題に見える。
   */
  it('rate-limited は「自動で入り直しています」だけを出し、二重にしない', () => {
    // Given: 招待リンクを開き、まだ入室していない
    vi.useFakeTimers();
    saveIdentity(ROOM_ID, { token: 'tok-1', name: 'はなこ' });
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    // When
    deliver({ type: 'error', code: 'rate-limited', message: '混み合っています' });
    // Then
    expect(screen.getByText(RETRY_WAITING_TEXT)).toBeTruthy();
    expect(screen.queryByText('混み合っています')).toBeNull();
    vi.useRealTimers();
  });

  /**
   * `room-not-found` はページ全体が専用画面に替わる（#76 J-1）。
   * その上に汎用表示を重ねない。
   */
  it('room-not-found は専用画面だけを出す', () => {
    // Given
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    // When
    deliver({ type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' });
    // Then
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull();
  });
});
