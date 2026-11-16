/**
 * ハブの受信フレームの見分けと、エラーの扱いの決め方（#595）。
 *
 * どちらも副作用の無い純粋な判断で、`use-hub-sync.ts` から分けてある（`docs/adr/0015` MUST 1）。
 * 配線（フックがこの判断を使っていること）は `use-hub-sync.test.tsx` が受け持つ。
 */
import { describe, it, expect } from 'vitest';
import type { JoinErrorPlan } from '@tasuki/sync-client';
import { classifyHubFrame, planHubError as plan } from '../../src/hub/hub-frames.js';

/**
 * `planForJoinError` の結果の写し（同期クライアントの値は純粋判断の検査にも持ち込まない）。
 * 対応は `packages/sync-client/src/join-error-plan.ts` と同じ。
 */
function joinPlan(code: string, message: string): JoinErrorPlan {
  if (code === 'ROOM_NOT_FOUND') return { kind: 'gone' };
  if (code === 'LEFT_ROOM') return { kind: 'left', reason: 'self' };
  if (code === 'REMOVED_FROM_ROOM' || code === 'REMOVED_BY_HOST') return { kind: 'left', reason: 'removed' };
  if (code === 'PASSPHRASE_REQUIRED' || code === 'PASSPHRASE_MISMATCH') return { kind: 'to-hub' };
  if (code === 'JOIN_RATE_LIMITED') return { kind: 'retry' };
  return { kind: 'show', message };
}

const planHubError = (
  err: { code: string; message: string },
  ctx: { currentCode: string | null; initialCode: string | null },
) => plan(err, joinPlan(err.code, err.message), ctx);

const topicFrame = (title: string | null) =>
  JSON.stringify({
    type: 'topic',
    state: {
      topic: title === null ? null : { title, body: '説明', source: 'manual' },
      generating: false,
      degraded: false,
      aiUnlocked: false,
    },
  });

describe('受信フレームの見分け', () => {
  it('Given topic フレーム / When 見分ける / Then タイトルだけを取り出す', () => {
    expect(classifyHubFrame(topicFrame('ふりかえり'))).toEqual({ kind: 'topic', title: 'ふりかえり' });
  });

  it('Given お題が下ろされた topic フレーム / When 見分ける / Then タイトルは null になる', () => {
    expect(classifyHubFrame(topicFrame(null))).toEqual({ kind: 'topic', title: null });
  });

  it('Given ハブのメッセージ / When 見分ける / Then 検めた中身を返す', () => {
    const msg = { type: 'error', code: 'X', message: 'm' };
    expect(classifyHubFrame(JSON.stringify(msg))).toEqual({ kind: 'hub', msg });
  });

  it('Given 契約に合わないフレーム / When 見分ける / Then 捨てる', () => {
    expect(classifyHubFrame(JSON.stringify({ type: 'unknown' }))).toEqual({ kind: 'drop' });
    expect(classifyHubFrame('not json')).toEqual({ kind: 'drop' });
  });
});

describe('エラーの扱いの決め方', () => {
  const ctx = (currentCode: string | null, initialCode: string | null) => ({ currentCode, initialCode });

  it('Given 抜けた・外された / When 決める / Then いまのルームを捨てて戻る', () => {
    expect(planHubError({ code: 'LEFT_ROOM', message: 'm' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'leave',
      target: 'A-1',
      reason: 'self',
    });
    expect(planHubError({ code: 'REMOVED_FROM_ROOM', message: 'm' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'leave',
      target: 'A-1',
      reason: 'removed',
    });
  });

  it('Given 抜けたがルームが無い / When 決める / Then 何もしない', () => {
    expect(planHubError({ code: 'LEFT_ROOM', message: 'm' }, ctx(null, null))).toEqual({ kind: 'ignore' });
  });

  it('Given 合言葉を求められた / When 決める / Then 入力を促す', () => {
    expect(planHubError({ code: 'PASSPHRASE_REQUIRED', message: 'm' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'passphrase',
      message: 'm',
    });
    expect(planHubError({ code: 'PASSPHRASE_MISMATCH', message: 'm' }, ctx(null, null)).kind).toBe('passphrase');
  });

  it('Given 混雑で弾かれた / When 決める / Then 自動で試み直す', () => {
    expect(planHubError({ code: 'JOIN_RATE_LIMITED', message: 'm' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'rate-limited',
      message: 'm',
    });
  });

  it('Given URL 由来のルームが無い / When 決める / Then 不在にする', () => {
    expect(planHubError({ code: 'ROOM_NOT_FOUND', message: 'm' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'gone',
      target: 'A-1',
    });
  });

  it('Given 作成でルームが進んだ後の古いコードの不在 / When 決める / Then 新しいルームを巻き添えにしない', () => {
    expect(planHubError({ code: 'ROOM_NOT_FOUND', message: 'm' }, ctx('NEW-2', 'OLD-1'))).toEqual({ kind: 'ignore' });
  });

  it('Given ルームの無い不在 / When 決める / Then 文言を見せる', () => {
    expect(planHubError({ code: 'ROOM_NOT_FOUND', message: 'm' }, ctx(null, null))).toEqual({
      kind: 'show',
      message: 'm',
    });
  });

  it('Given 知らないコード / When 決める / Then サーバーの文を見せる', () => {
    expect(planHubError({ code: 'WHAT', message: 'さあ' }, ctx('A-1', 'A-1'))).toEqual({
      kind: 'show',
      message: 'さあ',
    });
  });
});
