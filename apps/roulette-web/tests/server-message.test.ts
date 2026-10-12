import { describe, expect, it } from 'vitest';
import { parseRouletteWebMessage } from '../src/server-message';

const TOPIC_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };
const ROULETTE_STATE = {
  excluded: [],
  guests: [],
  drawn: [],
  spin: null,
};
const ROSTER = {
  type: 'roster',
  room: { code: 'R1', participants: [{ participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['roulette'] }] },
};

/**
 * ルーレットの接続へ届くのは、`roulette` フレーム・お題の `topic` フレーム・ハブと同じ形の応答
 * （`room.joined`・`roster`・参加の失敗）である。見分ける順は `topic` → `roulette` → ハブ（spec §5.3）。
 *
 * @requirements #94 spec §5.3
 */
describe('ルーレットが受け取るフレーム', () => {
  it('Given ルーレットの状態のフレーム / When 検める / Then ルーレットの状態として受け取る', () => {
    // Given
    const raw = JSON.stringify({ type: 'roulette', state: ROULETTE_STATE });
    // When
    const msg = parseRouletteWebMessage(raw);
    // Then
    expect(msg).toEqual({ type: 'roulette', state: ROULETTE_STATE });
  });

  it('Given お題の状態のフレーム / When 検める / Then お題として受け取る', () => {
    // Given
    const raw = JSON.stringify({ type: 'topic', state: TOPIC_STATE });
    // When
    const msg = parseRouletteWebMessage(raw);
    // Then
    expect(msg).toEqual({ type: 'topic', state: TOPIC_STATE });
  });

  it('Given 名簿と参加の応答とハブのコードの失敗 / When 検める / Then ハブと同じ形で受け取る', () => {
    // Given
    const joined = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };
    const error = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    // When / Then
    expect(parseRouletteWebMessage(JSON.stringify(ROSTER))).toEqual(ROSTER);
    expect(parseRouletteWebMessage(JSON.stringify(joined))).toEqual(joined);
    expect(parseRouletteWebMessage(JSON.stringify(error))).toEqual(error);
  });

  it('Given ルーレットのコマンドの失敗 / When 検める / Then ハブの形のエラーとして受け取る', () => {
    // Given: ルーレットのコードもハブの `error` の形（コードは非空文字列）に収まる
    const error = { type: 'error', code: 'ROULETTE_TOO_FEW', message: '2 人から回せます' };
    // When / Then
    expect(parseRouletteWebMessage(JSON.stringify(error))).toEqual(error);
  });

  it('Given どれにも合わないフレーム / When 検める / Then 受け取らない', () => {
    // Given: 壊れた JSON・項目が足りない 2 種・未知の type
    const raws = [
      'not json',
      JSON.stringify({ type: 'roulette', state: { excluded: [] } }),
      JSON.stringify({ type: 'topic', state: { topic: 'broken' } }),
      JSON.stringify({ type: 'unknown' }),
    ];
    // When
    const results = raws.map(parseRouletteWebMessage);
    // Then
    expect(results).toEqual([null, null, null, null]);
  });
});
