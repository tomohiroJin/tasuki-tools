import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS } from '@tasuki/checkin-core';
import { METHOD_COPY } from '../src/method-copy';

/**
 * @requirements #406 E1（やり方 10 種・札の並び）
 */
describe('やり方ごとの文言の表', () => {
  it('鍵が METHOD_IDS と過不足なく一致する', () => {
    expect(Object.keys(METHOD_COPY).sort()).toEqual([...METHOD_IDS].sort());
  });

  it.each(METHOD_IDS)('%s: 札の鍵が METHODS の札と一致し、順序も同じ', (method) => {
    expect(Object.keys(METHOD_COPY[method].cards)).toEqual([...METHODS[method].cards]);
  });

  it.each(METHOD_IDS)('%s: タイトル・お題・札の名前と意味がすべて空でない', (method) => {
    const copy = METHOD_COPY[method];
    expect(copy.title.trim()).not.toBe('');
    expect(copy.prompt.trim()).not.toBe('');
    for (const card of Object.values(copy.cards)) {
      expect(card.name.trim()).not.toBe('');
      expect(card.meaning.trim()).not.toBe('');
    }
  });

  it('同じやり方の中で札の名前は重ならない（読み上げで区別できる）', () => {
    for (const method of METHOD_IDS) {
      const names = Object.values(METHOD_COPY[method].cards).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('設計 §3 の名前と天気の例のとおり', () => {
    expect(METHOD_COPY.weather.title).toBe('今日の天気');
    expect(METHOD_COPY.weather.prompt).toBe('今日のあなたの空模様は？');
    expect(METHOD_COPY.weather.cards['thunder']).toEqual({ name: '雷', meaning: '荒れ模様・余裕がない' });
    expect(METHOD_COPY.focus.cards['100']?.name).toBe('10 割');
    expect(METHOD_COPY.roti.prompt).toBe('この時間、使った分の価値はありましたか？');
  });
});
