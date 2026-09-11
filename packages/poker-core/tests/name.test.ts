import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH, isValidName, validateName } from '../src/name';

/**
 * 名前ルール（#95 S4a で `tests/room.test.ts` から引っ越した）。
 *
 * 元は `createRoom` / `joinRoom` の入り口で検証されていた。両関数は名簿ごと
 * `@tasuki/room-core` へ移ったが、**poker の名前規則（上限 24）は境界の規則として残る**
 * （timer-core の `MAX_DISPLAY_NAME` = 40 とは食い違う。寄せるのは S5）。
 * 検証している値・境界・エラーコードは移設前と同一である。
 */
describe('validateName（名前ルール・上限 24）', () => {
  it('名前は前後の空白がトリムされる', () => {
    // Given: 呼び出しに渡す値自体が前提の指定を兼ねる
    // When
    const result = validateName('  たろう  ');
    // Then
    expect(result._unsafeUnwrap()).toBe('たろう');
  });

  it.each([
    ['', '空文字'],
    ['   ', '空白のみ'],
    ['あ'.repeat(25), '25文字'],
  ])('不正な名前 %s（%s）は invalid-name エラー', (name) => {
    // Given: name の各値を渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = validateName(name);
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('invalid-name');
  });

  it('上限ちょうど（24 文字）は受理される', () => {
    // Given: 上限が 1 減っても増えても落ちる境界。定数を式に使わず実測値で固定する
    expect(NAME_MAX_LENGTH).toBe(24);
    // When / Then: 上限ちょうどは受理し、1 文字超えたら弾く
    expect(isValidName('あ'.repeat(24))).toBe(true);
    expect(isValidName('あ'.repeat(25))).toBe(false);
  });
});
