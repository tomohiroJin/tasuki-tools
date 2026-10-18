/**
 * 見積もりの記録（#93）の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #93 spec §4.1（UI 文言は書体の base 層に収める）
 */
import { describe, expect, it } from 'vitest';
import { messageForRoundError } from '@tasuki/poker-core';
import { outsideBase } from './support/font-base';
import * as copy from '../src/estimate-copy';

describe('見積もりの記録の文言は書体の常用の層に収まる', () => {
  it('Given estimate-copy の全定数・attemptLabel(2)・サーバーの 2 文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given
    const constants: string[] = [];
    for (const v of Object.values(copy)) if (typeof v === 'string') constants.push(v);
    const texts = [
      ...constants,
      copy.attemptLabel(2),
      messageForRoundError({ code: 'estimate-not-found' }),
      messageForRoundError({ code: 'estimate-open' }),
    ];
    // 対照: 定数が 1 つも拾えないまま空配列で緑に倒れるのを防ぐ
    expect(constants.length).toBeGreaterThanOrEqual(14);
    // When / Then
    expect(outsideBase(texts)).toEqual([]);
  });

  it('Given 文言 / When 読む / Then 計画で決めた値である', () => {
    expect(copy.ESTIMATE_LOG_HEADING).toBe('見積もりの記録');
    expect(copy.ESTIMATE_ITEM_LABEL).toBe('いま見積もっているもの');
    expect(copy.ESTIMATE_ITEM_PLACEHOLDER).toBe('例: PROJ-123 ログイン画面');
    expect(copy.ESTIMATE_UNNAMED).toBe('（名前なし）');
    expect(copy.attemptLabel(2)).toBe('2 回め');
    expect(copy.ESTIMATE_OPEN).toBe('見積もり中');
    expect(copy.ESTIMATE_NO_POINTS).toBe('ポイントなし');
    expect(copy.ESTIMATE_POINTS_LABEL).toBe('ポイント（任意）');
    expect(copy.ESTIMATE_CHANGE_POINTS).toBe('ポイントを変える');
    expect(copy.NEXT_ITEM).toBe('次のアイテムへ');
    expect(copy.REVOTE).toBe('再投票');
    expect(copy.ESTIMATE_LOG_EMPTY).toBe('開票すると、ここに残ります');
    expect(copy.ESTIMATE_LOG_SHOW_ALL).toBe('記録をすべて見る');
    expect(copy.RECORDING_TOGGLE).toBe('記録する');
    expect(copy.RENAME_GROUP).toBe('アイテム名を変える');
  });
});
