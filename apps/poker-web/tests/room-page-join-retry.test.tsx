/**
 * ルーム画面で、混雑による入室拒否から自動で入り直す配線のテスト（#205 / #147 の申し送り）。
 *
 * 待ち時間の決め方そのものは `join-retry.ts` と `join-retry-plan.ts` が持ち、
 * それぞれ単体テストがある。**ここが見るのは効果の配線**で、純粋関数へ切り出せない
 * 3 点に絞る（#147 の敵対的検証が挙げたもの）。
 *
 *   1. 効果の依存が `sync.error` だけであること。接続の他の値（`status` を含む）が
 *      変わっただけで効果が畳まれて張り直されると、**一度も送り直さないまま
 *      試行回数だけを使い切る**
 *   2. 待っている途中で画面を離れたら、待機中の入り直しが取り消されること
 *   3. 接続し直したら数え直すこと。前の接続で諦めていても、新しい接続では改めて試みる
 *   4. 送り直す名前を持っていないときに「自動で入り直しています」と言わず、
 *      それでもルームの生死は尋ね直すこと
 *
 * この 3 点はどれも「画面に何が出るか」と「いつ送り直すか」の組み合わせで決まるため、
 * 描画しないと確かめられない。そのために jsdom を入れている（`vitest.config.ts`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomPage } from '../src/pages/RoomPage';
import type { ConnectionStatus, PokerSync, SyncError } from '../src/hooks/useSync';
import {
  RETRY_EXHAUSTED_TEXT,
  RETRY_WAITING_TEXT,
  RETRY_WAITING_WITHOUT_NAME_TEXT,
} from '../src/join-retry-plan';
import { JOIN_RETRY_MAX_ATTEMPTS } from '../src/join-retry';
import { saveIdentity } from '../src/storage';

const ROOM_ID = 'ABCD1234';
const PARTICIPANT_NAME = 'はなこ';
const STORED_TOKEN = 'tok-1';

/**
 * どの回の待ち時間よりも長い時間（ms）。
 *
 * 待ち時間は上限 30 秒にばらつき（最大 1.5 倍）が乗るので、45 秒を超えれば
 * 何回目であっても必ず時間が来る。**個別の回の値を書き写さない**のは、
 * 方針を変えたときにこのテストが黙って何も進めなくなるのを避けるため。
 */
const LONGER_THAN_ANY_DELAY_MS = 60_000;

let joinRoom: ReturnType<typeof vi.fn<PokerSync['joinRoom']>>;
let checkRoom: ReturnType<typeof vi.fn<PokerSync['checkRoom']>>;

/** 混雑で入室を拒まれたことを表すエラー。**呼ぶたびに別の値**（＝拒否 1 回分）になる。 */
function rateLimited(): SyncError {
  return { code: 'rate-limited', message: '混み合っています。しばらくしてからお試しください' };
}

/** 画面へ渡す同期の状態。既定は「繋がっていて、まだ何も起きていない」。 */
function makeSync(over: Partial<PokerSync> = {}): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    self: null,
    snapshot: null,
    joinedThisConnection: false,
    syncStale: false,
    error: null,
    clearError: vi.fn(),
    createRoom: vi.fn(),
    joinRoom,
    checkRoom,
    vote: vi.fn(),
    reveal: vi.fn(),
    nextRound: vi.fn(),
    ...over,
  };
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  joinRoom = vi.fn<PokerSync['joinRoom']>();
  checkRoom = vi.fn<PokerSync['checkRoom']>();
});

afterEach(() => {
  // `globals: true` なので Testing Library の自動 cleanup も登録されるが、
  // 明示的にも呼ぶ。設定が変わってもこのファイル単体で正しくあるようにするため。
  cleanup();
  vi.useRealTimers();
});

describe('混雑で入室を拒まれたときの自動再試行', () => {
  it('待っている間に接続の他の値が変わっても、入り直しを取り消さない', async () => {
    // Given: 保存済みの名前を持つ人が、混雑で入室を拒まれて待っている
    saveIdentity(ROOM_ID, { token: STORED_TOKEN, name: PARTICIPANT_NAME });
    const error = rateLimited();
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync({ error })} />);
    joinRoom.mockClear(); // 画面を開いた時点の自動復帰は数えない
    // When: 拒否はそのままに、接続まわりの値だけが動く（瞬断で繋ぎ直しに入った状態）。
    //       同期の状態は値が 1 つ変わるだけで別の入れ物になるので、効果の依存に
    //       それ自体や `status` を置くと、ここで畳まれて張り直される。
    //
    //       **`open` へは戻さない。** 戻すと「繋がり直したら数え直す」が走って
    //       試行が 0 に戻り、依存の誤りが打ち消されて見えなくなる。
    for (let i = 1; i <= JOIN_RETRY_MAX_ATTEMPTS; i++) {
      const status: ConnectionStatus = i % 2 === 0 ? 'closed' : 'connecting';
      rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ error, failedAttempts: i, status })} />);
    }
    await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    // Then: 待っていた 1 回がそのまま実行され、試行を使い切ってもいない
    expect(joinRoom).toHaveBeenCalledTimes(1);
    expect(joinRoom).toHaveBeenCalledWith(ROOM_ID, PARTICIPANT_NAME, STORED_TOKEN);
    expect(screen.queryByText(RETRY_EXHAUSTED_TEXT)).toBeNull();
  });

  it('待っている途中で画面を離れたら、離れた後に入り直さない', async () => {
    // Given: 保存済みの名前を持つ人が、混雑で拒まれて待っている
    saveIdentity(ROOM_ID, { token: STORED_TOKEN, name: PARTICIPANT_NAME });
    const { unmount } = render(
      <RoomPage roomId={ROOM_ID} sync={makeSync({ error: rateLimited() })} />,
    );
    joinRoom.mockClear(); // 画面を開いた時点の自動復帰は数えない
    // When: 待ち時間が来る前に画面を離れる
    unmount();
    await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    // Then: 離れたはずのルームへ入り直さない
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('繋がり直したら、前の接続で使い切った試行を数え直す', async () => {
    // Given: 保存済みの名前を持つ人が、この接続で試行を使い切っている
    saveIdentity(ROOM_ID, { token: STORED_TOKEN, name: PARTICIPANT_NAME });
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);
    for (let i = 0; i <= JOIN_RETRY_MAX_ATTEMPTS; i++) {
      rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ error: rateLimited() })} />);
      await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    }
    if (screen.queryByText(RETRY_EXHAUSTED_TEXT) === null) {
      throw new Error('前提を作れていない: 試行を使い切った状態にならなかった');
    }
    // When: 回線が切れて繋がり直し、そのうえでまた混雑で拒まれる
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ status: 'closed' })} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ status: 'open' })} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ error: rateLimited() })} />);
    joinRoom.mockClear(); // 繋がり直した時点の自動復帰は数えない
    await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    // Then: 諦めた案内のままにせず、改めて入り直す
    expect(screen.queryByText(RETRY_EXHAUSTED_TEXT)).toBeNull();
    expect(joinRoom).toHaveBeenCalledWith(ROOM_ID, PARTICIPANT_NAME, STORED_TOKEN);
  });
});

describe('入り直せるかどうかで案内を変える', () => {
  it('名前をまだ入れていない人には、入り直していると言わない', async () => {
    // Given: 保存も入力も無い（招待リンクで初めて来て、まだ名前を入れていない人）
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);
    joinRoom.mockClear();
    checkRoom.mockClear(); // 画面を開いた時点の生死確認は数えない
    // When: 混雑で入室を拒まれ、待ち時間が過ぎる
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ error: rateLimited() })} />);
    await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    // Then: 入り直しているとは言わず、名前を伴う入室も試みない
    expect(screen.getByText(RETRY_WAITING_WITHOUT_NAME_TEXT)).not.toBeNull();
    expect(screen.queryByText(RETRY_WAITING_TEXT)).toBeNull();
    expect(joinRoom).not.toHaveBeenCalled();
    // それでもルームの生死は尋ね直す。ここが落ちると、待っている間にルームが
    // 終了しても知らされず、参加フォームの前で待ち続ける（#76 J-1 の再発）。
    expect(checkRoom).toHaveBeenCalledWith(ROOM_ID);
  });

  it('名前を入れてから弾かれた人には、入り直していると伝える', async () => {
    // Given: 招待リンクで来た人が名前を入れて送った（保存はまだ無い）
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: PARTICIPANT_NAME } });
    fireEvent.click(screen.getByRole('button', { name: '参加する' }));
    joinRoom.mockClear();
    // When: 混雑で入室を拒まれ、待ち時間が過ぎる
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ error: rateLimited() })} />);
    await advanceTimers(LONGER_THAN_ANY_DELAY_MS);
    // Then: 入り直していると伝え、実際にその名前で入り直す
    expect(screen.getByText(RETRY_WAITING_TEXT)).not.toBeNull();
    expect(screen.queryByText(RETRY_WAITING_WITHOUT_NAME_TEXT)).toBeNull();
    expect(joinRoom).toHaveBeenCalledWith(ROOM_ID, PARTICIPANT_NAME, undefined);
  });
});
