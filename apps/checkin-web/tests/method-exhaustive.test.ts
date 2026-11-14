import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS, type MethodId } from '@tasuki/checkin-core';
import { CARD_FACES } from '../src/components/CardFace';
import { METHOD_COPY } from '../src/method-copy';

/** 仮のやり方を 1 つ足した「足し忘れの表」の鍵。`METHOD_IDS` に足した状態を型で写す */
type WithTemp = MethodId | 'temp-method';

/**
 * 型の試験。やり方を足したのに絵・文言・規則の表へ足し忘れると、コンパイル（`pnpm typecheck`）で落ちる。
 * 下の `@ts-expect-error` は「足りない表を、仮のやり方を足した鍵の表へ渡すとコンパイルが落ちる」ことを固定する。
 * 落ちなくなる（表が `default: return null` のような抜けを許す形へ戻る）と、`@ts-expect-error` が未使用になって typecheck が落ちる。
 * @requirements #482-4（やり方の足し忘れをコンパイルで拾う）
 */
describe('やり方の表は全部のやり方を網羅する（型）', () => {
  it('絵の表（CARD_FACES）は足し忘れでコンパイルが落ちる', () => {
    // @ts-expect-error 仮のやり方の絵が表に無い
    const faces: Record<WithTemp, unknown> = CARD_FACES;
    expect(faces).toBe(CARD_FACES);
  });

  it('文言の表（METHOD_COPY）は足し忘れでコンパイルが落ちる', () => {
    // @ts-expect-error 仮のやり方の文言が表に無い
    const copy: Record<WithTemp, unknown> = METHOD_COPY;
    expect(copy).toBe(METHOD_COPY);
  });

  it('規則の表（METHODS）は足し忘れでコンパイルが落ちる', () => {
    // @ts-expect-error 仮のやり方の規則が表に無い
    const rules: Record<WithTemp, unknown> = METHODS;
    expect(rules).toBe(METHODS);
  });

  it('いまのやり方では全部の表が揃っている（実行時）', () => {
    for (const m of METHOD_IDS) {
      expect(CARD_FACES[m]).toBeDefined();
      expect(METHOD_COPY[m]).toBeDefined();
      expect(METHODS[m]).toBeDefined();
    }
  });

  it('絵の表の種類（数字か絵か）と METHODS の numeric が一致する', () => {
    for (const m of METHOD_IDS) {
      expect(CARD_FACES[m].kind === 'numeral').toBe(METHODS[m].numeric);
    }
  });
});
