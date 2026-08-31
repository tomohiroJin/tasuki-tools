/**
 * 捨てたフレームが「画面を古くするもの」かどうかの判定（#212）。
 *
 * @requirements #212
 */
import { describe, it, expect } from 'vitest';
import { indicatesStaleState } from '../src/sync-staleness';

describe('indicatesStaleState', () => {
  it('room-state の項目で落ちたものは画面を古くする', () => {
    expect(indicatesStaleState(['participants.0.name'])).toBe(true);
  });

  it('round の中で落ちたものも画面を古くする', () => {
    expect(indicatesStaleState(['round.status'])).toBe(true);
  });

  it('joined の項目で落ちたものは画面を古くする（入室が成立しない）', () => {
    expect(indicatesStaleState(['token'])).toBe(true);
  });

  it('読めないフレームは安全側へ倒す', () => {
    expect(indicatesStaleState(['<root>'])).toBe(true);
  });

  it('何のフレームか分からないものも安全側へ倒す', () => {
    expect(indicatesStaleState(['type'])).toBe(true);
  });

  /**
   * **未知のキー名は判別の材料にならない。** poker の契約は `v.strictObject` なので、
   * 送り手が付けた余剰キーの名前がそのまま経路に載る。安全側へ倒す。
   */
  it('見覚えのないキー名は安全側へ倒す', () => {
    expect(indicatesStaleState(['evilKey'])).toBe(true);
  });

  it('落ちた項目が 1 つも分からないときも安全側へ倒す', () => {
    expect(indicatesStaleState([])).toBe(true);
  });

  it('error フレーム固有の項目だけなら一過性とみなす', () => {
    // Given: error だけが持つ項目
    // When: 判定する
    // Then: 画面は古くならない
    expect(indicatesStaleState(['code'])).toBe(false);
    expect(indicatesStaleState(['message'])).toBe(false);
    expect(indicatesStaleState(['code', 'message'])).toBe(false);
  });

  it('1 つでも画面を古くする項目があれば古くする', () => {
    expect(indicatesStaleState(['code', 'round.status'])).toBe(true);
  });
});
