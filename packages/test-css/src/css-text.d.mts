/**
 * `css-text.mjs` の型。`@tasuki/test-css` は試験の共有支援のパッケージで、読む側の試験が型検査を保って共有する（#554）。
 * 置くのは試験の補助だけ（CSS を読む・書体の判定・偽の WebSocket。docs/adr/0017 の追記（#599））。製品コードからは読まない。
 * 型は node の型を出さない（読む側に `@types/node` を求めない）。
 */
export declare const stripComments: (css: string) => string;
export declare function mediaBlock(css: string, head: string): string;
export declare function mediaBlocks(css: string, head: string): string;
export declare function outsideMedia(css: string): string;
export declare const normalizeSelector: (selector: string) => string;
export interface CssRule {
  selector: string;
  body: string;
}
export declare function rules(css: string): CssRule[];
export declare function only(list: CssRule[], selector: string): string;
