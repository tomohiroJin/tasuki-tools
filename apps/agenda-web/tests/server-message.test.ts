import { describe, expect, it } from 'vitest';
import { parseAgendaWebMessage } from '../src/server-message';
import { IDLE_AGENDA, ROSTER_FRAME, runningAgenda } from './support/scripted-web-socket';

const TOPIC_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * 進行タイマーの接続へ届くのは、`agenda` フレーム・お題の `topic` フレーム・ハブと同じ形の応答である。
 * 見分ける順は `topic` → `agenda` → ハブ（`docs/adr/0021` 決定 2 の MUST）。
 *
 * @requirements #429 spec §5.3
 */
describe('進行タイマーが受け取るフレーム', () => {
  it('Given 進行タイマーの状態のフレーム / When 検める / Then 進行タイマーの状態として受け取る', () => {
    const raw = JSON.stringify({ type: 'agenda', state: runningAgenda(1500) });
    expect(parseAgendaWebMessage(raw)).toEqual({ type: 'agenda', state: runningAgenda(1500) });
    const idle = JSON.stringify({ type: 'agenda', state: IDLE_AGENDA });
    expect(parseAgendaWebMessage(idle)).toEqual({ type: 'agenda', state: IDLE_AGENDA });
  });

  it('Given お題の状態のフレーム / When 検める / Then お題として受け取る', () => {
    const raw = JSON.stringify({ type: 'topic', state: TOPIC_STATE });
    expect(parseAgendaWebMessage(raw)).toEqual({ type: 'topic', state: TOPIC_STATE });
  });

  it('Given 名簿と参加の応答とエラー / When 検める / Then ハブと同じ形で受け取る', () => {
    const joined = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };
    const hubError = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    const agendaError = { type: 'error', code: 'AGENDA_EMPTY', message: 'ステップがありません' };
    expect(parseAgendaWebMessage(JSON.stringify(ROSTER_FRAME))).toEqual(ROSTER_FRAME);
    expect(parseAgendaWebMessage(JSON.stringify(joined))).toEqual(joined);
    expect(parseAgendaWebMessage(JSON.stringify(hubError))).toEqual(hubError);
    expect(parseAgendaWebMessage(JSON.stringify(agendaError))).toEqual(agendaError);
  });

  it('Given どれにも合わないフレーム / When 検める / Then 受け取らない', () => {
    const raws = [
      'not json',
      JSON.stringify({ type: 'agenda', state: { phase: 'running' } }),
      JSON.stringify({ type: 'agenda', state: { ...IDLE_AGENDA, phase: 'bogus' } }),
      JSON.stringify({ type: 'topic', state: { topic: 'broken' } }),
      JSON.stringify({ type: 'unknown' }),
    ];
    expect(raws.map(parseAgendaWebMessage)).toEqual([null, null, null, null, null]);
  });
});
