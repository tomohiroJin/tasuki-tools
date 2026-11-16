/**
 * `font-base.mjs` の型（#594）。node の型を出さない（読む側に `@types/node` を求めない）。
 */
export type Range = readonly [number, number];
export declare function baseFaces(): Map<string, Range[]>;
export declare function outsideBase(texts: readonly string[]): string[];
