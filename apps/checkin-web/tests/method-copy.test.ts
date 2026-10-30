import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS } from '@tasuki/checkin-core';
import { METHOD_COPY } from '../src/method-copy';

/**
 * @requirements #406 E1（やり方の種類・札の並び）・#465（各側 7 つ）
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

  it('#465 で足した 4 つの名前（設計 §3.1）', () => {
    expect(METHOD_COPY.expectation.title).toBe('期待の大きさ');
    expect(METHOD_COPY['mood-start'].title).toBe('始まりの気分');
    expect(METHOD_COPY['weather-end'].title).toBe('終わりの天気');
    expect(METHOD_COPY.understanding.title).toBe('わかった度');
  });

  it('終わりの天気の札は今日の天気と同じ名前と意味（口頭で比べやすい）', () => {
    expect(METHOD_COPY['weather-end'].cards).toEqual(METHOD_COPY.weather.cards);
  });

  it('始まりの気分と終わりの気分（mood）の札の名前は重ならない', () => {
    const end = new Set(Object.values(METHOD_COPY.mood.cards).map((c) => c.name));
    for (const card of Object.values(METHOD_COPY['mood-start'].cards)) {
      expect(end.has(card.name), card.name).toBe(false);
    }
  });
});
