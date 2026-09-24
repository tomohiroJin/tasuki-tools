import { describe, expect, it } from 'vitest';
import { parseTopicWebMessage } from '../src/server-message';

const STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * お題の接続へ届くのは、`topic` フレームと、ハブと同じ形の応答（`room.joined`・参加の失敗）である
 * （`apps/tasuki-sync/src/ports/topic-server-msg.ts`）。参加の失敗のコードはハブのもの
 * （`ROOM_NOT_FOUND` 等）なので、お題のエラーのスキーマ（`TopicErrorFrameSchema`）では検めない。
 *
 * @requirements #91 E4
 */
describe('お題ツールが受け取るフレーム', () => {
  it('Given お題の状態のフレーム / When 検める / Then 状態として受け取る', () => {
    expect(parseTopicWebMessage(JSON.stringify({ type: 'topic', state: STATE }))).toEqual({
      type: 'topic',
      state: STATE,
    });
  });

  it('Given 参加の応答 / When 検める / Then ハブと同じ形で受け取る', () => {
    const joined = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };
    expect(parseTopicWebMessage(JSON.stringify(joined))).toEqual(joined);
  });

  it('Given ハブのコードの参加の失敗 / When 検める / Then エラーとして受け取る', () => {
    const error = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    expect(parseTopicWebMessage(JSON.stringify(error))).toEqual(error);
  });

  it('Given 契約に合わないフレーム / When 検める / Then 受け取らない', () => {
    expect(parseTopicWebMessage('not json')).toBeNull();
    expect(parseTopicWebMessage(JSON.stringify({ type: 'topic', state: { topic: null } }))).toBeNull();
  });
});
