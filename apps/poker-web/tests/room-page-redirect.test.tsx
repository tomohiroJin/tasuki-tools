/**
 * 端末に同一性が無いままルーム画面を開いたときの行き先（#95 S5c・R9）。
 *
 * **名乗る場所はハブに 1 つだけある。** 撤去前は `RoomPage` の `JoinForm` が
 * ここでも名前を聞いており、玄関で名乗った人がもう一度聞かれていた。
 * いまは玄関の参加画面（`/?room=CODE`）へ送り返す —— **コードは落とさない**。
 *
 * 遷移は `src/router.ts` に閉じてある（画面へ `navigate` を渡さない。入口が 2 つに
 * 増えると、どちらを通ったかで挙動が割れる）ので、そのモジュールを差し替えて見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import { usePokerSync } from '../src/hooks/useSync';
import { hubPathFor, redirectTo } from '../src/router';
import { FakeListenerSocket } from './support/fakes';

vi.mock('../src/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/router')>();
  return { ...actual, redirectTo: vi.fn() };
});

const ROOM_ID = '朝会モブ-a1b2';
const PARTICIPANT_NAME = 'はなこ';

let joinRoom: ReturnType<typeof vi.fn<PokerSync['joinRoom']>>;

function makeSync(over: Partial<PokerSync> = {}): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    snapshot: null,
    topic: null,
    joinedThisConnection: false,
    syncStale: false,
    error: null,
    clearError: vi.fn(),
    // **保存の読み書きは本物を通す。** 偽物にすると「端末の同一性を見ているか」を確かめられない
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    joinRoom,
    checkRoom: vi.fn(),
    vote: vi.fn(),
    reveal: vi.fn(),
    setItem: vi.fn(),
    revote: vi.fn(),
    nextItem: vi.fn(),
    setPoints: vi.fn(),
    setSpectator: vi.fn(),
    removeParticipant: vi.fn(),
    departed: null,
    setRecording: () => {},
    renameGroup: () => {},
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  joinRoom = vi.fn<PokerSync['joinRoom']>();
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('端末に同一性が無いままルーム画面を開く', () => {
  it('Given 端末に同一性が無い / When ルーム画面を開く / Then 玄関の参加画面へ送られる', () => {
    // Given: 名乗っていない（ハブを迂回した旧リンクやブックマークから来た人）
    const sync = makeSync();

    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);

    // Then: コードを保ったまま玄関へ。名乗らないまま入室を試みない
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith(hubPathFor(ROOM_ID));
    expect(joinRoom).not.toHaveBeenCalled();
  });

  /**
   * **送り返しは接続を待たない。** timer は同じ決定（`?room=` ＋ 同一性なし → 玄関の
   * そのルームへ replace）を mount 時の効果で、接続状態を見ずに適用する
   * （`apps/timer-web/src/sync/use-timer-sync.ts` の入口の効果）。poker だけが
   * WS の確立を待つと、**同じ URL で 2 つの道具の挙動が割れる**うえ、サーバーが
   * 落ちている間は入室を試みられないのに「ルームに参加しています」を見せ続ける。
   */
  it('Given 同期サーバーへ繋がらない / When ルーム画面を開く / Then 接続を待たずに玄関へ送られる', () => {
    // Given: 名乗っておらず、同期サーバーへ一度も繋がっていない
    const sync = makeSync({ status: 'connecting', everConnected: false, failedAttempts: 2 });

    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);

    // Then: 接続の確立を待たずに玄関の参加画面へ
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith(hubPathFor(ROOM_ID));
    expect(joinRoom).not.toHaveBeenCalled();
  });

  /**
   * **消滅の案内より先に送り返さない。** `room-not-found` を受けると
   * `forgetIdentity` が保存を捨てるので、同一性の有無だけで送り返すと
   * 「戻る道つきで知らされる」画面が出る前に玄関へ飛ぶ（#76 J-1 の回帰）。
   */
  it('Given ルームが消えて同一性も捨てられた / When 専用画面が出ている / Then 玄関へ送り返さない', () => {
    // Given: 消滅したルーム（保存は捨てられ、専用画面が出る状態）
    const sync = makeSync({ error: { code: 'room-not-found', message: 'ルームが見つかりません' } });

    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);

    // Then: 案内を出したまま留まる
    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
  });

  it('Given 端末に同一性がある / When ルーム画面を開く / Then 送り返さずにそのルームへ入る', () => {
    // Given: 玄関で名乗り済み（ハブから札を選んで来た人）
    saveResumeIdentity({
      code: ROOM_ID,
      participantId: 'p-stored',
      resumeToken: 'tok-1',
      displayName: PARTICIPANT_NAME,
    });

    // When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);

    // Then: 送り返さず、保存された名乗りで入室する
    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(joinRoom).toHaveBeenCalledWith(ROOM_ID, PARTICIPANT_NAME, 'tok-1');
    expect(screen.queryByLabelText('あなたの名前'), '名乗りはハブに 1 つだけある').toBeNull();
  });
});

/**
 * 別のタブ・別のツールで外された／抜けたとき（#427）。サーバーは同じ人の全接続へ
 * `REMOVED_FROM_ROOM` / `LEFT_ROOM` を送る。poker はこれを知らないコードとして帯に出し、
 * 「参加者 0 人」の操作できる画面に取り残されていた。実際の同期フックと画面をつないで見る。
 */
describe('別の場所で外された・抜けた', () => {
  function Harness() {
    const sync = usePokerSync();
    return <RoomPage roomId={ROOM_ID} sync={sync} />;
  }

  function mountJoined(): void {
    saveResumeIdentity({ code: ROOM_ID, participantId: 'p-1', resumeToken: 'tok-1', displayName: PARTICIPANT_NAME });
    vi.stubGlobal('WebSocket', FakeListenerSocket);
    FakeListenerSocket.instances = [];
    render(<Harness />);
    act(() => {
      FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
      FakeListenerSocket.latest().fire('open');
    });
  }

  function deliverError(code: string, message: string): void {
    act(() => {
      FakeListenerSocket.latest().fire('message', { data: JSON.stringify({ type: 'error', code, message }) });
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('Given 入室済み / When REMOVED_FROM_ROOM が届く / Then 玄関へ ?left=removed で移り、復帰の組が消え、帯は出ない', () => {
    mountJoined();
    deliverError('REMOVED_FROM_ROOM', 'ルームから外されました');
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith(hubPathFor(ROOM_ID, 'removed'));
    expect(vi.mocked(redirectTo).mock.calls.at(-1)?.[0]).toContain('left=removed');
    expect(loadResumeIdentity(ROOM_ID)).toBeNull();
    expect(screen.queryByText('ルームから外されました')).toBeNull();
  });

  it('Given 入室済み / When LEFT_ROOM が届く / Then 玄関へ ?left=self で移る', () => {
    mountJoined();
    deliverError('LEFT_ROOM', 'ルームを抜けました');
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith(hubPathFor(ROOM_ID, 'self'));
    expect(loadResumeIdentity(ROOM_ID)).toBeNull();
  });

  it('Given 入室済み / When 未知のコードが届く / Then 移動せず今までどおり帯に出る', () => {
    mountJoined();
    deliverError('SOMETHING_NEW', '新しい種類の失敗です');
    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(loadResumeIdentity(ROOM_ID)).not.toBeNull();
    expect(screen.getByText('新しい種類の失敗です')).toBeTruthy();
  });

  it('hubPathFor は理由を ?left= で運び、無ければ付けない', () => {
    expect(hubPathFor('A-1')).toBe('/?room=A-1');
    expect(hubPathFor('A-1', 'removed')).toBe('/?room=A-1&left=removed');
  });
});
