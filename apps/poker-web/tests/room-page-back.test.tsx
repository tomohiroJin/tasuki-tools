/**
 * RoomPage のヘッダに「選択画面へ戻る」導線があることを確かめる。
 *
 * #95 S5c で旧入口（poker のトップ画面等）を畳むと、ツールへ入った人が選択画面へ
 * 戻る手段を失う（利用者の申し送り・2026-09-14）。行き先は**同じルームの選択画面**
 * （`/?room=CODE`）——玄関まで戻すと、ルームから出たことになってしまう。
 *
 * 招待リンク（`InviteLink`）が配る URL も同じ選択画面の URL なので（#95 D11・
 * `docs/adr/0018` 決定 2）、戻る導線は `sync.inviteUrl(roomId)` を再利用する
 * （組み立ては `@tasuki/sync-client` に 1 つだけ・画面は同期クライアントを直接
 * import しない・`docs/adr/0015` MUST 2）。
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RoomPage } from '../src/pages/RoomPage';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

/** 投票中のルーム。ヘッダの描画に必要な最小限のスナップショット。 */
function votingSnapshot(): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p1',
    participants: [{ id: 'p1', name: 'あかり', connected: true, hasVoted: false }],
    round: { status: 'voting' },
    yourVote: null,
  };
}

function makeSync(): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    // **保存の読み書きは本物を通す**（下の beforeEach が前提を作る）。
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot: votingSnapshot(),
    topic: null,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    nextRound: () => {},
  };
}

/**
 * 入室済みの画面を描くための前提。
 *
 * **端末の同一性は「入室済み」と不可分である**（#95 S5c・R9）。旧入口を撤去してから、
 * ルーム画面は同一性が無ければ玄関の参加画面へ送り返す —— 保存を持たない造作で
 * `joinedThisConnection: true` を渡すと、**実ブラウザなら玄関へ去っていく最中の画面**を
 * 検証することになる（jsdom では `Not implemented: navigation` が出るだけで緑になった）。
 * 保存の読み書きは本物を通し、前提を実態に合わせる。
 */
beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({
    code: ROOM_ID,
    participantId: 'p1',
    resumeToken: 'tok-1',
    displayName: 'あかり',
  });
});

/**
 * `Object.defineProperty` で入れた値は `vi.unstubAllGlobals()` では戻らない。
 * 戻さないと、後から足したテストが「使えない `execCommand`」を引き継いで偽の緑になる。
 */
const execCommandBefore = Object.getOwnPropertyDescriptor(document, 'execCommand');
function restoreExecCommand(): void {
  if (execCommandBefore) Object.defineProperty(document, 'execCommand', execCommandBefore);
  else Reflect.deleteProperty(document, 'execCommand');
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  restoreExecCommand();
});

describe('RoomPage のヘッダ', () => {
  it('Given 入室済み / When 招待リンクをコピーする / Then 同期フックの URL を clipboard へ書く', async () => {
    // Given: Clipboard API が使える入室済みの画面。
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);

    // When: 招待リンクをコピーする。
    fireEvent.click(screen.getByRole('button', { name: '招待リンクをコピー' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://example.test/?room=ABCD1234'));
    // `writeText` の呼び出しは同期に済む。表示は解決後の再描画なので、DOM は待って取る。
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeDefined();
  });

  it('Given clipboard と従来コピーが使えない / When コピーを選ぶ / Then 手動選択を案内し URL を残す', async () => {
    // Given: どちらの自動コピーも使えない。
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });
    render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);

    // When: 招待リンクをコピーする。
    fireEvent.click(screen.getByRole('button', { name: '招待リンクをコピー' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'コピーできません（URL を選択してください）' })).toBeDefined());
    expect(screen.getByText('https://example.test/?room=ABCD1234')).toBeDefined();
  });

  it('Given ルームに入っている / When ヘッダを描く / Then 選択画面へ戻る道がある', () => {
    // Given
    const sync = makeSync();

    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);

    // Then: 行き先は同じルームの選択画面。玄関まで戻すと、ルームから出たことになる
    // （`@testing-library/jest-dom` は入れていないので `getAttribute` で見る）
    expect(screen.getByRole('link', { name: '選択画面へ戻る' }).getAttribute('href')).toBe(
      'https://example.test/?room=ABCD1234',
    );
  });
});
