/**
 * `css-rules.mjs` の型（#594）。node の型を出さない（読む側に `@types/node` を求めない）。
 */
export interface CssRuleSet {
  readonly selectors: readonly string[];
  readonly body: string;
}
export declare const readFromCwd: (p: string) => string;
export declare function collectRules(css: string): CssRuleSet[];
export declare function rulesOf(css: string, selector: string): string[];
export declare function rulesMatching(css: string, pattern: RegExp): string[];
export declare function foundBody(bodies: readonly string[], what: string): string;
