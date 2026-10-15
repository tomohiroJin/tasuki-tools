import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { emWidthOf, fitLabel, splitGraphemes } from '../src/wheel-geometry';
import { CARD_NAME_TIER_LIMITS, cardNameSize, displayWidthOf } from '../src/card-name-size';

/** 結果の札の名前の段（#373）。境目の両側を表で固定する。長さは表示幅（全角 1・半角 0.6）。 */
describe('cardNameSize', () => {
  it.each([
    ['あや', 'lg'],
    ['あ'.repeat(5), 'lg'],
    ['あ'.repeat(6), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md + 1), 'sm'],
    ['あ'.repeat(MAX_DISPLAY_NAME), 'sm'],
  ] as const)('Given 全角 %#: %s / Then 段は %s', (name, size) => {
    expect(cardNameSize(name)).toBe(size);
  });

  it('Given 境目の値 / Then 最大の段は表示幅 5.5 まで（全角 5 字・英字 9 字）', () => {
    expect(CARD_NAME_TIER_LIMITS.lg).toBe(5.5);
    expect(displayWidthOf('Alexander')).toBeCloseTo(5.4);
    expect(cardNameSize('Alexander')).toBe('lg');
    expect(cardNameSize('a'.repeat(10))).toBe('md');
  });

  it('Given 英字 33 字（表示幅 19.8） / Then 全角の同じ字数（sm）より大きい段に収まる', () => {
    expect(cardNameSize('a'.repeat(33))).toBe('md');
    expect(cardNameSize('あ'.repeat(33))).toBe('sm');
  });

  it('Given サロゲートペアの名前 / Then 書記素で数え、UTF-16 の長さの 2 と数えない', () => {
    expect(displayWidthOf('😀😀')).toBe(2);
    expect(cardNameSize('😀'.repeat(5))).toBe('lg');
  });

  it('Given 半角カナ / Then 円盤の席と同じく半角として数える（濁点も半角 1 つ分）', () => {
    expect(displayWidthOf('ﾔﾏﾀﾞ')).toBeCloseTo(2.4);
  });

  it('Given ZWJ の家族絵文字・国旗・結合文字 / Then 書記素で数える（1 字）', () => {
    expect(displayWidthOf('👨‍👩‍👧‍👦')).toBe(1);
    expect(displayWidthOf('🇯🇵')).toBe(1);
    expect(displayWidthOf('é')).toBeCloseTo(0.6); // e + U+0301（結合）
    expect(displayWidthOf('が')).toBe(1); // か + U+3099（結合）
    // 家族絵文字 5 つ = 表示幅 5（コードポイントで数えると 7×5）→ 最大の段
    expect(cardNameSize('👨‍👩‍👧‍👦'.repeat(5))).toBe('lg');
    expect(cardNameSize('👨‍👩‍👧‍👦'.repeat(6))).toBe('md');
  });

  it('Given Intl.Segmenter が無い環境 / Then コードポイントで数える代替へ倒れる', () => {
    expect(splitGraphemes('ab😀', null)).toEqual(['a', 'b', '😀']);
    // 家族絵文字はコードポイントに割れる（代替では 4 人 + ZWJ 3 つ = 7 単位）
    expect(splitGraphemes('👨‍👩‍👧‍👦', null)).toHaveLength(7);
    expect(displayWidthOf('Alexander', null)).toBeCloseTo(5.4);
  });

  it('Given 物差しの共有 / Then 円盤の席（fitLabel）と同じ幅で数え、席の振る舞いが変わるのは書記素だけ', () => {
    expect(emWidthOf('a')).toBe(0.6);
    expect(emWidthOf('ﾔ')).toBe(0.6);
    expect(emWidthOf('あ')).toBe(1);
    // 従来（コードポイント）と同じ結果になる入力
    expect(fitLabel('abcdefghij', 5.5)).toBe('abcdefghi…');
    expect(fitLabel('あいうえおかき', 5.5)).toBe('あいうえお…');
    expect(fitLabel('abcdefghijk', 5.5, true)).toBe('abcde…');
    expect(fitLabel('ﾔﾏﾀﾞｶｽﾞｵﾐｷ', 5.5)).toBe('ﾔﾏﾀﾞｶｽﾞｵﾐ…');
    // 書記素で変わる入力: ZWJ の絵文字・国旗・結合文字を途中で割らない
    expect(fitLabel('👨‍👩‍👧‍👦👨‍👩‍👧‍👦', 1)).toBe('👨‍👩‍👧‍👦…');
    expect(fitLabel('🇯🇵🇯🇵', 1)).toBe('🇯🇵…');
    expect(fitLabel('éé', 0.6)).toBe('é…');
  });
});
