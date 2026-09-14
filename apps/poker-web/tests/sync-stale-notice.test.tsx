/**
 * 契約に合わないサーバーメッセージを捨てたことが、**画面から分かる**ことを固定する（#212）。
 *
 * 純関数（`connectionNotice`）とフックが個別に緑でも、**その間の配線が 1 本切れていれば
 * 利用者には何も見えない**。ここは App を通して実経路を通す。
 *
 * **入室後の画面まで見る。** 症状（名簿や票が更新されない）が出るのはそちらで、
 * 入室前の画面だけを見ていると、入室後の画面から告知を落としても気づけない
 * （実際に、入室前しか通らない版では告知を消しても全件緑だった）。
 *
 * @requirements #212
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { FakeListenerSocket } from './support/fakes';
import { saveResumeIdentity } from '@tasuki/sync-client';

const ROOM_ID = 'ABCD1234';

/** サーバーからのフレーム 1 通を届ける。 */
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

/**
 * 参加用 URL からルーム画面を開く。
 *
 * **同一性を先に置く。** 無いまま開くと画面は玄関の参加画面へ送り返し、
 * ここで見たい告知の経路まで辿り着かない（#95 S5c・R9）。
 */
function openRoom(): void {
  render(<App />);
  open();
}

function close(): void {
  act(() => {
    FakeListenerSocket.latest().fire('close');
  });
}

const A_VALID_ROOM_STATE = {
  type: 'room-state',
  roomId: ROOM_ID,
  you: 'p1',
  participants: [{ id: 'p1', name: 'はなこ', connected: true, hasVoted: false }],
  round: { status: 'voting' },
  yourVote: null,
};

/** 画面の状態を載せているのに契約へ合わないフレーム（参加者名が数値）。 */
const A_BROKEN_ROOM_STATE = {
  ...A_VALID_ROOM_STATE,
  participants: [{ id: 'p1', name: 1, connected: true, hasVoted: false }],
};

/**
 * 一見「一過性」に見える棄却（`error` の項目だけが落ちる）。
 *
 * **これも黙ってはいけない。** poker の `error` は消えたルームの案内（#76 J-1）と
 * 入室の自動再試行（#147）の唯一の引き金で、捨てれば利用者は何の反応も得られない。
 *
 * **落とし方を `code` の未知から `message` の型違反へ替えた（#214）。**
 * 未知の `code` は `docs/poker/adr/0003` で通すようにしたので、もう捨てられない
 * （捨てないことは `error-frame-forward-compat.test.tsx` が固定している）。
 * ここで見たいのは「`error` 固有の項目が落ちても黙らない」ことなので、
 * **いま実際に落ちる形**へ差し替える。経路は `["message"]` になり、
 * 正しい `room-state` に余剰キー `message` を足したときと**同じ名前**になる ——
 * `0002` 決定 2 が「経路では選り分けられない」と結論した理由そのものである。
 */
const A_BROKEN_ERROR = { type: 'error', code: 'room-not-found', message: 123 };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  FakeListenerSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p-stored', resumeToken: 'tok-1', displayName: 'はなこ' });
  window.history.replaceState(null, '', `/poker/?room=${ROOM_ID}`);
  // 捨てたことは devtools にも残る。出力を汚さずに、呼ばれたことは見られるようにする。
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('捨てたサーバーメッセージを画面で伝える', () => {
  it('正常に同期できている間は何も出さない', () => {
    // Given
    openRoom();
    // When
    deliver(A_VALID_ROOM_STATE);
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  it('画面の状態を載せたフレームを捨てると、そのことを伝える', () => {
    // Given
    openRoom();
    deliver(A_VALID_ROOM_STATE);
    // When
    deliver(A_BROKEN_ROOM_STATE);
    // Then
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
  });

  /**
   * **症状が出るのはこの画面である。** 入室前だけを見ていると、
   * 入室後の画面から告知を落としても検査が素通りする。
   */
  it('入室後の画面でも伝える', () => {
    // Given: 入室が成立している
    openRoom();
    deliver(A_VALID_ROOM_STATE);
    // When
    deliver(A_BROKEN_ROOM_STATE);
    // Then
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
  });

  it('有効なフレームが届けば消える', () => {
    // Given
    openRoom();
    deliver(A_BROKEN_ROOM_STATE);
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
    // When
    deliver(A_VALID_ROOM_STATE);
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  /**
   * **捨てて無害なフレームは 1 つも無い。** 経路から「一過性」を選り分ける案は
   * 経路がそれに耐えないため採らなかった（`docs/poker/adr/0002` 決定 2）。
   */
  it('一過性に見えるフレームの棄却でも伝える', () => {
    // Given
    openRoom();
    deliver(A_VALID_ROOM_STATE);
    // When
    deliver(A_BROKEN_ERROR);
    // Then
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
  });

  /**
   * 前の接続で捨てたことを新しい接続へ持ち越さない。持ち越すと、
   * **1 通も受け取っていない接続に対して**警告が出続ける。
   */
  it('接続が切れたら持ち越さない', () => {
    // Given
    openRoom();
    deliver(A_BROKEN_ROOM_STATE);
    expect(screen.getByText(/同期できていません/)).toBeTruthy();
    // When
    close();
    // Then（接続の告知に替わり、同期の告知は残らない）
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  /**
   * 利用者への表出と別に、開発者が気づける記録も残す（`docs/poker/adr/0002` 決定 4）。
   * **これが消えても画面は変わらない**ので、ここで固定しないと誰も気づけない。
   */
  it('捨てたことを devtools にも残す', () => {
    // Given
    openRoom();
    // When
    deliver(A_BROKEN_ROOM_STATE);
    // Then
    expect(warn).toHaveBeenCalledWith('契約に合わないサーバーメッセージを捨てました');
  });
});
