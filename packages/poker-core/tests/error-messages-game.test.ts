/**
 * ゲームのエラー文言（#403）。
 *
 * @requirements #403 G-6 G-11
 */
import { describe, expect, it } from 'vitest';
import { messageForRoundError } from '../src/error-messages.js';

describe('ゲームのエラー文言（#403）', () => {
  it.each([
    ['table-not-player', 'この手には加わっていません'],
    ['table-exchanged', 'チェンジは 1 回だけです'],
    ['table-no-game', 'いまはポーカーをしていません'],
    ['table-in-play', 'ポーカーの最中です。見積もりに戻ってから操作してください'],
  ] as const)('%s → %s', (code, text) => {
    expect(messageForRoundError({ code })).toBe(text);
  });
});
