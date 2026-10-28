/**
 * テーブルの文言は書体の常用の層に収まる（#403・設計 §5.4）。札は SVG なので、角の文字（ASCII）以外は書体に頼らない。
 *
 * @requirements #403 設計 §5.4
 */
import { describe, expect, it } from 'vitest';
import { messageForRoundError } from '@tasuki/poker-core';
import { outsideBase } from './support/font-base';
import * as copy from '../src/card-table-copy';

describe('テーブルの文言は書体の常用の層に収まる', () => {
  it('Given 文言・役の名前・札の読み上げ・サーバーのエラー文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    const constants = Object.values(copy as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
    const texts = [
      ...constants,
      ...Object.values(copy.CATEGORY_LABELS),
      copy.exchangeLabel(3),
      copy.handOf('あや'),
      ...(['S', 'H', 'D', 'C'] as const).map((suit) => copy.cardSpeech({ suit, rank: 12 })),
      ...(['table-not-player', 'table-exchanged', 'table-no-game', 'table-in-play'] as const).map((code) =>
        messageForRoundError({ code }),
      ),
    ];
    // 対照: 定数が拾えないまま空配列で緑に倒れるのを防ぐ
    expect(constants.length).toBeGreaterThanOrEqual(10);
    expect(outsideBase(texts)).toEqual([]);
  });

  it('Given 札 / When 読み上げ名・角の文字にする / Then 「スペードのA」「10」の形', () => {
    expect(copy.cardSpeech({ suit: 'D', rank: 13 })).toBe('ダイヤのK');
    expect(copy.cardSpeech({ suit: 'C', rank: 10 })).toBe('クラブの10');
    expect(copy.rankText(14)).toBe('A');
    expect(copy.rankText(11)).toBe('J');
    expect(copy.rankText(9)).toBe('9');
  });

  it('Given 役の分類 / When 名前を引く / Then 10 分類すべてに名前がある', () => {
    expect(copy.CATEGORY_LABELS['royal-flush']).toBe('ロイヤルストレートフラッシュ');
    expect(Object.keys(copy.CATEGORY_LABELS)).toHaveLength(10);
  });
});
