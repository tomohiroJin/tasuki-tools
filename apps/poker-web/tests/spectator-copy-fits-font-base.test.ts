/**
 * 見学の文言は書体の常用の層に収まる（#419・設計 §5.3）。
 *
 * @requirements #419 spec §5.3（UI 文言は書体の base 層に収める）
 */
import { describe, expect, it } from 'vitest';
import { messageForRoundError } from '@tasuki/poker-core';
import { outsideBase } from './support/font-base';
import * as copy from '../src/spectator-copy';

describe('見学の文言は書体の常用の層に収まる', () => {
  it('Given spectator-copy の全定数・見出し・サーバーの spectating 文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given
    const constants: string[] = [];
    for (const v of Object.values(copy)) if (typeof v === 'string') constants.push(v);
    const texts = [
      ...constants,
      copy.participantsHeading(3, 1),
      copy.removalTitle('あや さん（ID: 1a2b）'),
      messageForRoundError({ code: 'spectating', op: 'vote' }),
    ];
    // 対照: 定数が 1 つも拾えないまま空配列で緑に倒れるのを防ぐ
    expect(constants.length).toBeGreaterThanOrEqual(6);
    // When / Then
    expect(outsideBase(texts)).toEqual([]);
  });

  it('Given 文言 / When 読む / Then 設計で決めた値である', () => {
    expect(copy.SPECTATE).toBe('見学する');
    expect(copy.JOIN_VOTING).toBe('投票に加わる');
    expect(copy.SPECTATOR_BADGE).toBe('見学');
    expect(copy.SPECTATING_NOTE).toBe('見学中です。投票には加わりません。');
    expect(copy.REMOVE).toBe('退出させる');
    expect(copy.CANCEL).toBe('キャンセル');
    expect(copy.removalTitle('あや さん')).toBe('あや さんを退出させますか？');
    expect(copy.participantsHeading(3, 0)).toBe('参加者（3人）');
    expect(copy.participantsHeading(3, 1)).toBe('参加者（3人・見学1人）');
    expect(messageForRoundError({ code: 'spectating', op: 'vote' })).toBe('見学中は投票できません');
  });
});
