import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS, type MethodId } from '@tasuki/checkin-core';
import { CARD_FACES, type Face } from '../src/components/card-faces';
import { METHOD_COPY } from '../src/method-copy';

/**
 * 型の試験。やり方を足したのに絵・文言・規則の表へ足し忘れると、コンパイル（`pnpm typecheck`）で落ちる。
 *
 * 仕掛け: 表の鍵の集合が `Ids` と**ちょうど一致する**ときだけ通る関数 `exactTable` を、実際の表へ当てる。
 * - 正の対照（`@ts-expect-error` なし）: 表がいまのやり方を全部持つ → コンパイルが通る。表が `Partial` に緩むと、ここが落ちる
 * - 負の対照（`@ts-expect-error`）: 仮のやり方 `temp-method` を足した鍵に対して、足し忘れの表は落ちる。
 *   正の対照が通っているので、この落ちは「鍵が足りない」ことが原因と分かる。足し忘れで落ちなくなれば `@ts-expect-error` が未使用で落ちる
 * @requirements #482-4（やり方の足し忘れをコンパイルで拾う）
 */
function exactTable<Id extends string, T>(_ids: readonly Id[], table: Readonly<Record<Id, T>>): Readonly<Record<Id, T>> {
  return table;
}
const WITH_TEMP = [...METHOD_IDS, 'temp-method'] as const;
const tempFace: Face = { kind: 'numeral', numeral: (card) => card };

describe('やり方の表は全部のやり方を網羅する', () => {
  it('絵の表（CARD_FACES）: いまのやり方を全部持ち、足し忘れた鍵では型が落ちる（型）', () => {
    expect(exactTable(METHOD_IDS, CARD_FACES)).toBe(CARD_FACES);
    // @ts-expect-error 仮のやり方の絵が表に無い
    exactTable(WITH_TEMP, CARD_FACES);
    expect(exactTable(WITH_TEMP, { ...CARD_FACES, 'temp-method': tempFace })).toBeDefined();
  });

  it('文言の表（METHOD_COPY）: 同上（型）', () => {
    expect(exactTable(METHOD_IDS, METHOD_COPY)).toBe(METHOD_COPY);
    // @ts-expect-error 仮のやり方の文言が表に無い
    exactTable(WITH_TEMP, METHOD_COPY);
  });

  it('規則の表（METHODS）: 同上（型）', () => {
    expect(exactTable(METHOD_IDS, METHODS)).toBe(METHODS);
    // @ts-expect-error 仮のやり方の規則が表に無い
    exactTable(WITH_TEMP, METHODS);
  });

  it('どの表にも、やり方でない余計な鍵が無い（実行時）', () => {
    const want = [...METHOD_IDS].sort();
    for (const table of [CARD_FACES, METHOD_COPY, METHODS] as Record<MethodId, unknown>[]) {
      expect(Object.keys(table).sort()).toEqual(want);
    }
  });
});
