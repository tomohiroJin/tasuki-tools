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
import { cleanup, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import { hubPathFor, redirectTo } from '../src/router';

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
    self: null,
    snapshot: null,
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
    nextRound: vi.fn(),
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
