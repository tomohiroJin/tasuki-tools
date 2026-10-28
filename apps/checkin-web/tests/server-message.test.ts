import { describe, expect, it } from 'vitest';
import { parseCheckinWebMessage } from '../src/server-message';
import { IDLE_CHECKIN, ROSTER_FRAME, openCheckin } from './support/scripted-web-socket';

const TOPIC_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * Check-in Cards の接続へ届くのは、`checkin` フレーム・お題の `topic` フレーム・ハブと同じ形の応答である。
 * 見分ける順は `topic` → `checkin` → ハブ（`docs/adr/0021` 決定 2 の MUST）。
 *
 * @requirements #406 設計 §6（受け手ごとのフレーム）
 */
describe('Check-in Cards が受け取るフレーム', () => {
  it('Given 札の状態のフレーム / When 検める / Then 札の状態として受け取る', () => {
    const open = JSON.stringify({ type: 'checkin', state: openCheckin('sunny') });
    expect(parseCheckinWebMessage(open)).toEqual({ type: 'checkin', state: openCheckin('sunny') });
    const idle = JSON.stringify({ type: 'checkin', state: IDLE_CHECKIN });
    expect(parseCheckinWebMessage(idle)).toEqual({ type: 'checkin', state: IDLE_CHECKIN });
  });

  it('Given 開いた後の山のフレーム / When 検める / Then 山と枚数を受け取る', () => {
    const state = {
      ...openCheckin('sunny'),
      round: {
        seq: 1,
        method: 'weather',
        visibility: 'anonymous',
        locked: true,
        seats: [{ id: 'p1', name: 'あや', played: true }],
        status: 'revealed',
        piles: [{ card: 'sunny', count: 2 }],
      },
    };
    expect(parseCheckinWebMessage(JSON.stringify({ type: 'checkin', state }))).toEqual({ type: 'checkin', state });
  });

  it('Given お題の状態のフレーム / When 検める / Then お題として受け取る（topic を先に見分ける）', () => {
    const raw = JSON.stringify({ type: 'topic', state: TOPIC_STATE });
    expect(parseCheckinWebMessage(raw)).toEqual({ type: 'topic', state: TOPIC_STATE });
  });

  it('Given 名簿と参加の応答とエラー / When 検める / Then ハブと同じ形で受け取る', () => {
    const joined = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };
    const hubError = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    const checkinError = { type: 'error', code: 'CHECKIN_REVEALED', message: '開いた後は出せません' };
    expect(parseCheckinWebMessage(JSON.stringify(ROSTER_FRAME))).toEqual(ROSTER_FRAME);
    expect(parseCheckinWebMessage(JSON.stringify(joined))).toEqual(joined);
    expect(parseCheckinWebMessage(JSON.stringify(hubError))).toEqual(hubError);
    expect(parseCheckinWebMessage(JSON.stringify(checkinError))).toEqual(checkinError);
  });

  it('Given どれにも合わないフレーム / When 検める / Then 受け取らない', () => {
    const raws = [
      'not json',
      JSON.stringify({ type: 'checkin', state: { you: 'p1' } }),
      JSON.stringify({ type: 'checkin', state: { ...IDLE_CHECKIN, round: { seq: 1, status: 'bogus' } } }),
      JSON.stringify({ type: 'topic', state: { topic: 'broken' } }),
      JSON.stringify({ type: 'unknown' }),
    ];
    expect(raws.map(parseCheckinWebMessage)).toEqual([null, null, null, null, null]);
  });
});
