/**
 * `deriveClientKeySafely` のテスト（#103 Task 7 レビュー S-2）。
 *
 * `server.ts` は `fetch` の中で `deriveClientKey(...)` を try/catch なしで
 * 呼んでおり、例外が発生すると（Bun 1.3.14 実測）例外メッセージがそのまま
 * stderr に出る。`deriveClientKey` の入力は利用者由来の X-Forwarded-For なので、
 * 将来この値を含む例外が起きれば journal に生の IP が載る（ADR 0012 D3 違反）。
 *
 * timer-sync の `ws-adapter.ts` は `deriveClientKey` を DI できるため、
 * 実際に throw させて確かめるテストが書ける。poker-sync の `server.ts` は
 * エントリポイントで、実際の `deriveClientKey` は
 * `createClientKeyDeriver(randomBytes(32))` によってプロセス起動時に
 * 一度だけ作られるモジュールスコープの値であり、そのままでは throw させられない。
 * そこで `deriveClientKeySafely` を純粋関数として切り出し、`deriveClientKey`
 * 自体を引数として受け取れるようにする（timer-sync の DI と同じ狙い）。
 */
import { describe, it, expect } from 'bun:test';
import { deriveClientKeySafely } from '../src/client-key-safety';

/** `.name` へのアクセス自体が throw する例外（timer-sync の I-1 の 3 ケース目と同じ）。 */
class NameGetterThrowsError extends Error {
  override get name(): string {
    throw new Error('name getter boom');
  }
}

describe('deriveClientKeySafely', () => {
  it('通常時は deriveClientKey の戻り値をそのまま返す', () => {
    const result = deriveClientKeySafely(
      (xff) => `key:${xff ?? 'none'}`,
      '203.0.113.7',
      () => {},
    );
    expect(result).toBe('key:203.0.113.7');
  });

  const THROW_CASES: Array<[string, () => unknown]> = [
    ['null', () => null],
    ['undefined', () => undefined],
    ['name ゲッタが throw する例外', () => new NameGetterThrowsError('boom')],
  ];

  describe.each(THROW_CASES)('deriveClientKey が %s を throw したとき', (_label, makeErr) => {
    it('(a) 呼び出し元を巻き込まず null を返す', () => {
      const errors: string[] = [];
      const result = deriveClientKeySafely(
        () => {
          throw makeErr();
        },
        '203.0.113.7',
        (name) => errors.push(name),
      );
      expect(result).toBeNull();
      expect(errors).toHaveLength(1);
    });
  });

  it('(b) ログに渡るのは例外の分類だけ（Error の name）', () => {
    const errors: string[] = [];
    deriveClientKeySafely(
      () => {
        throw new Error('derive failed for 203.0.113.88');
      },
      '203.0.113.88',
      (name) => errors.push(name),
    );
    expect(errors).toEqual(['Error']);
  });

  it('(c) XFF の値・例外メッセージが1バイトも渡らない', () => {
    const errors: string[] = [];
    deriveClientKeySafely(
      () => {
        throw new Error('leak SECRET-XFF-VALUE-203.0.113.7');
      },
      '203.0.113.7',
      (name) => errors.push(name),
    );
    expect(errors[0]).not.toContain('203.0.113.7');
    expect(errors[0]).not.toContain('SECRET');
  });

  it('name に偽の key=value を仕込んでも丸められる（ログ注入対策）', () => {
    const errors: string[] = [];
    const err = new Error('boom');
    err.name = 'Error xff=203.0.113.88 level=info fake'.repeat(3);
    deriveClientKeySafely(
      () => {
        throw err;
      },
      undefined,
      (name) => errors.push(name),
    );
    expect(errors[0]).not.toContain('xff=203.0.113.88');
    expect(errors[0]).not.toContain('level=info');
    expect(errors[0]!.length).toBeLessThanOrEqual(40);
  });
});
