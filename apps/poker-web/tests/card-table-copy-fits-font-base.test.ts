/**
 * テーブルの文言は書体の常用の層に収まる（#403・設計 §5.3）。
 *
 * @requirements #403 設計 §5.3
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
      ...(['S', 'H', 'D', 'C'] as const).map((suit) => copy.cardText({ suit, rank: 14 })),
      ...(['S', 'H', 'D', 'C'] as const).map((suit) => copy.cardSpeech({ suit, rank: 12 })),
      ...(['table-not-seated', 'table-in-play', 'table-no-hand', 'table-full'] as const).map((code) =>
        messageForRoundError({ code }),
      ),
    ];
    // 対照: 定数が拾えないまま空配列で緑に倒れるのを防ぐ
    expect(constants.length).toBeGreaterThanOrEqual(6);
    expect(outsideBase(texts)).toEqual([]);
  });

  it('Given 札 / When 文字にする / Then 「A♠」の形、読み上げは「スペードのA」の形', () => {
    expect(copy.cardText({ suit: 'S', rank: 14 })).toBe('A♠');
    expect(copy.cardText({ suit: 'H', rank: 10 })).toBe('10♥');
    expect(copy.cardText({ suit: 'D', rank: 11 })).toBe('J♦');
    expect(copy.cardText({ suit: 'C', rank: 2 })).toBe('2♣');
    expect(copy.cardSpeech({ suit: 'D', rank: 13 })).toBe('ダイヤのK');
  });

  it('Given 役の分類 / When 名前を引く / Then 10 分類すべてに名前がある', () => {
    expect(copy.CATEGORY_LABELS['royal-flush']).toBe('ロイヤルストレートフラッシュ');
    expect(copy.CATEGORY_LABELS['three-of-a-kind']).toBe('スリーカード');
    expect(Object.keys(copy.CATEGORY_LABELS)).toHaveLength(10);
  });
});
