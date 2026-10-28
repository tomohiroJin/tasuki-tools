/**
 * テーブルのエラー文言（#403）。
 *
 * @requirements #403 T-6 T-7 T-8 T-9
 */
import { describe, expect, it } from 'vitest';
import { messageForRoundError } from '../src/error-messages.js';

describe('テーブルのエラー文言（#403）', () => {
  it.each([
    ['table-not-seated', 'テーブルに入っていません'],
    ['table-in-play', 'いまの手を見せてから引き直してください'],
    ['table-no-hand', 'まだカードを引いていません'],
    ['table-full', 'テーブルは満員です'],
  ] as const)('%s → %s', (code, text) => {
    expect(messageForRoundError({ code })).toBe(text);
  });
});
