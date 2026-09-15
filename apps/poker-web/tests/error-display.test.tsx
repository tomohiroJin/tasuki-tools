/**
 * サーバーから届いたエラーが、**どの画面でも利用者に伝わる**ことを固定する（#217）。
 *
 * #214 で `error` を捨てなくなり、フレームは `setError` まで届くようになった。
 * ところが `sync.error` を描いていたのは**入室後**の `error-note` だけで、
 * 入室前の画面には表出が無かった。その結果、
 * **#214 以前は出ていた「同期できていません」も出なくなり**（捨てないので当然）、
 * 入室前のエラーは画面からも devtools からも完全に消えていた（2026-08-31 に実測）。
 *
 * `App` を通して実経路で見る。**画面ごとに配線が別**なので、1 つ通ったからといって
 * 他が通っているとは言えない（#212 で 1 つの画面しか通らない検査が素通りした）。
 *
 * **入室前の画面は 1 つになった**（#95 S5c・R9）。トップ画面と参加フォームを撤去し、
 * 残るのは入室を待つ画面である。名乗りと、名乗る前のエラーは玄関が受け持つ。
 *
 * @requirements #217
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { FakeListenerSocket } from './support/fakes';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { RETRY_WAITING_TEXT } from '../src/join-retry-plan';

const ROOM_ID = 'ABCD1234';
const UNKNOWN_ERROR = { type: 'error', code: 'room-closed', message: 'このルームは終了しました' };

function deliver(frame: unknown): void {
  act(() => {
    FakeListenerSocket.latest().fire('message', { data: JSON.stringify(frame) });
  });
}

/**
 * 参加用 URL からルーム画面を開く。
 *
 * **同一性を先に置く。** 無いまま開くと画面は玄関の参加画面へ送り返し、
 * ここで見たいエラーの表出まで辿り着かない（#95 S5c・R9）。
 */
function openRoom(): void {
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p-stored', resumeToken: 'tok-1', displayName: 'はなこ' });
  window.history.replaceState(null, '', `/poker/?room=${ROOM_ID}`);
  render(<App />);
  open();
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
  participants: [{ id: 'p1', name: 'はなこ', connected: true, hasVoted: false }],
  round: { status: 'voting' },
  yourVote: null,
};

beforeEach(() => {
  FakeListenerSocket.instances = [];
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  window.history.replaceState(null, '', `/poker/?room=${ROOM_ID}`);
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
  it('入室を待つ画面で伝える', () => {
    // Given: 参加用 URL を開き、まだ入室できていない
    openRoom();
    // When
    deliver(UNKNOWN_ERROR);
    // Then
    expect(screen.getByText('このルームは終了しました')).toBeTruthy();
  });

  it('入室後の画面で伝える（従来どおり）', () => {
    // Given
    openRoom();
    deliver(A_ROOM_STATE);
    // When
    deliver(UNKNOWN_ERROR);
    // Then
    expect(screen.getByText('このルームは終了しました')).toBeTruthy();
  });

  it('閉じると消える', () => {
    // Given
    openRoom();
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
    // Given: 参加用 URL を開き、まだ入室していない
    vi.useFakeTimers();
    openRoom();
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
    openRoom();
    // When
    deliver({ type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' });
    // Then
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull();
  });
});
