import { describe, expect, it } from 'vitest';
import { parseTrackWebMessage } from '../src/server-message';
import { EMPTY_TRACK, JOINED, ROSTER_FRAME, runningTrack } from './support/track-states';

const TOPIC_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * うちわけの接続へ届くのは、`track` フレーム・お題の `topic` フレーム・ハブと同じ形の応答である。
 * 見分ける順は `topic` → `track` → ハブ（`docs/adr/0021` 決定 2 の MUST）。
 *
 * @requirements #476 設計 §4.4
 */
describe('うちわけが受け取るフレーム', () => {
  it('Given うちわけの写しのフレーム / When 検める / Then うちわけの写しとして受け取る', () => {
    expect(parseTrackWebMessage(JSON.stringify({ type: 'track', state: runningTrack(1500) }))).toEqual({ type: 'track', state: runningTrack(1500) });
    expect(parseTrackWebMessage(JSON.stringify({ type: 'track', state: EMPTY_TRACK }))).toEqual({ type: 'track', state: EMPTY_TRACK });
  });

  it('Given 知らない項目が足されたフレーム・任意の項目が無いフレーム / When 検める / Then 捨てずに受け取り、無い項目は既定で埋める', () => {
    const raw = JSON.stringify({ type: 'track', state: { epochWallMs: 1, nowMs: 2, segments: [{ id: 'g-1', kind: 'work', label: 'A', startMs: 0, endMs: null, later: 1 }], rev: 1, later: true } });
    const parsed = parseTrackWebMessage(raw);
    expect(parsed?.type).toBe('track');
    expect(parsed).toMatchObject({ state: { pinned: [], undo: null, resumeOffer: false, segments: [{ id: 'g-1', autoClosed: false }] } });
  });

  it('Given お題の状態のフレーム / When 検める / Then お題として受け取る', () => {
    const raw = JSON.stringify({ type: 'topic', state: TOPIC_STATE });
    expect(parseTrackWebMessage(raw)).toEqual({ type: 'topic', state: TOPIC_STATE });
  });

  it('Given 名簿と参加の応答とエラー / When 検める / Then ハブと同じ形で受け取る', () => {
    const hubError = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    const trackError = { type: 'error', code: 'TRACK_FULL', message: '区切りは 200 件までです' };
    expect(parseTrackWebMessage(JSON.stringify(ROSTER_FRAME))).toEqual(ROSTER_FRAME);
    expect(parseTrackWebMessage(JSON.stringify(JOINED))).toEqual(JOINED);
    expect(parseTrackWebMessage(JSON.stringify(hubError))).toEqual(hubError);
    expect(parseTrackWebMessage(JSON.stringify(trackError))).toEqual(trackError);
  });

  it('Given どれにも合わないフレーム / When 検める / Then 受け取らない', () => {
    const raws = [
      'not json',
      JSON.stringify({ type: 'track', state: { rev: 1 } }),
      JSON.stringify({ type: 'track', state: { ...EMPTY_TRACK, segments: 'broken' } }),
      JSON.stringify({ type: 'topic', state: { topic: 'broken' } }),
      JSON.stringify({ type: 'unknown' }),
    ];
    expect(raws.map(parseTrackWebMessage)).toEqual([null, null, null, null, null]);
  });
});
