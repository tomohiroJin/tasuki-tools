/**
 * 混雑で入室を拒まれたときに次へ何をするかの決め方（#147）。
 *
 * 判定を純粋関数へ切り出しているのは、`RoomPage` の効果に埋めると
 * テストできないためである（このパッケージには React の描画テスト環境が無い）。
 * `connection-notice.ts` と同じ形にそろえてある。
 *
 * **「入り直せるか」で案内の文言が変わる。** 招待リンクで初めて来た人が
 * 名前を入れる前に弾かれた場合、こちらは名前を持っていないので入り直せない。
 * それでも「自動で入り直しています」と出すと、画面の言うことが嘘になる。
 */
import { describe, it, expect } from 'vitest';
import {
  planJoinRetry,
  RETRY_WAITING_TEXT,
  RETRY_WAITING_WITHOUT_NAME_TEXT,
  RETRY_EXHAUSTED_TEXT,
} from '../src/join-retry-plan';

describe('planJoinRetry', () => {
  it('1 回目は待つことにし、待ち時間を返す', () => {
    // Given: まだ一度も再試行していない
    // When
    const plan = planJoinRetry(0, true, () => 0.5);
    // Then
    expect(plan.kind).toBe('wait');
    if (plan.kind === 'wait') {
      expect(plan.attempt).toBe(1);
      expect(plan.delayMs).toBeGreaterThan(0);
    }
  });

  it('入り直せるなら、自動で入り直すと伝える', () => {
    // Given: 名前を持っている（保存済み、または入力済み）
    // When
    const plan = planJoinRetry(0, true, () => 0.5);
    // Then
    expect(plan.notice).toBe(RETRY_WAITING_TEXT);
  });

  it('入り直せないなら、自動で入り直すとは言わない', () => {
    // Given: 名前を持っていない（招待リンクで来て、まだ名前を入れていない）
    // When
    const plan = planJoinRetry(0, false, () => 0.5);
    // Then: 「自動で入り直しています」は嘘になる
    expect(plan.notice).toBe(RETRY_WAITING_WITHOUT_NAME_TEXT);
    expect(plan.notice).not.toBe(RETRY_WAITING_TEXT);
  });

  it('回を追うごとに待ち時間が伸びる', () => {
    // Given: ばらつきを中央に固定する
    const mid = () => 0.5;
    // When
    const first = planJoinRetry(0, true, mid);
    const third = planJoinRetry(2, true, mid);
    // Then
    if (first.kind === 'wait' && third.kind === 'wait') {
      expect(third.delayMs).toBeGreaterThan(first.delayMs);
    } else {
      throw new Error('どちらも待つ判断になるはず');
    }
  });

  it('試行を使い切ったら諦め、何をすれば入れるかを伝える', () => {
    // Given: 上限まで試した後
    // When
    const plan = planJoinRetry(6, true, () => 0.5);
    // Then: 際限なく送り続けない
    expect(plan.kind).toBe('give-up');
    expect(plan.notice).toBe(RETRY_EXHAUSTED_TEXT);
    expect(plan.notice).toMatch(/再読込/);
  });

  it('諦めの判断は、入り直せるかどうかで変わらない', () => {
    // Given: 上限まで試した後
    // When
    const withName = planJoinRetry(6, true, () => 0.5);
    const withoutName = planJoinRetry(6, false, () => 0.5);
    // Then: どちらも人が手を打つしかない
    expect(withName).toEqual(withoutName);
  });
});
