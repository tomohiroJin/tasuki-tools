/** `css-text.mjs` の型。アプリのテスト（agenda・timer）が `@tasuki/ui/test-support/css-text.mjs` から、型検査を保って共有する（#554）。 */
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
