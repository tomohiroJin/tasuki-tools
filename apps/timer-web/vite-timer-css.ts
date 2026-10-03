/**
 * timer の CSS のビルドの切り替え（#321・計画 P3・P4）。どちらも比較の仕組み（`e2e/parity/`）からだけ使う。PR 4 で消す。
 *
 * - `TASUKI_TIMER_UNLAYERED=1`: 入口（`src/index.css`）の `@import … layer(timer)` から `layer(timer)` を外す（設計正本 D3 の
 *   「囲いを外した一時ビルド」）。外す箇所が 0 件ならビルドを止める（外し損ねたまま普通のビルドを比べて緑にしない）
 * - `TASUKI_TIMER_CSS_UNMINIFIED=1`: CSS を最小化しない（E8 の規則の使用状況を、ソースの規則と鍵で突き合わせるため）。
 *   `vite.config.ts` の `build.cssMinify` と `postcss.config.js` の `optimize` が読む
 *
 * turbo は宣言していない環境変数を渡さず、キャッシュの鍵にも入れないので、`turbo.json` の `@tasuki/timer-web#build` に宣言する。
 */
import type { Plugin } from "vite";

export function timerCssSwitches(env: NodeJS.ProcessEnv): { unlayered: boolean; unminified: boolean } {
  return { unlayered: env["TASUKI_TIMER_UNLAYERED"] === "1", unminified: env["TASUKI_TIMER_CSS_UNMINIFIED"] === "1" };
}

/** CSS のコメント。閉じないコメントはファイルの終わりまで（CSS の読み方と同じ）。 */
const COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/g;

/**
 * `@import` の行の末尾の ` layer(timer)` だけを外す（順序宣言の `@layer …, timer, …;` は触らない）。
 * **コメントの中は数えも書き換えもしない**（注釈に例を書くと、本物を外し損ねても件数が 1 以上になり 0 件の停止が黙る）。
 */
export function stripTimerLayer(code: string): { code: string; count: number } {
  let count = 0;
  const strip = (segment: string): string =>
    segment.replace(/(@import\s+(['"])[^'"]+\2)\s+layer\(timer\)/g, (_m, head: string) => {
      count += 1;
      return head;
    });
  let out = "";
  let last = 0;
  for (const m of code.matchAll(COMMENT)) {
    out += strip(code.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  out += strip(code.slice(last));
  return { code: out, count };
}

const ENTRY = /\/apps\/timer-web\/src\/index\.css$/;

export function timerCssPlugin(env: NodeJS.ProcessEnv = process.env): Plugin {
  const { unlayered } = timerCssSwitches(env);
  return {
    name: "tasuki-timer-css-unlayered",
    enforce: "pre",
    transform(code, id) {
      if (!unlayered || !ENTRY.test(id.split("?")[0] ?? "")) return null;
      const stripped = stripTimerLayer(code);
      if (stripped.count === 0) throw new Error("TASUKI_TIMER_UNLAYERED=1 なのに src/index.css に layer(timer) の @import が 1 本も無い");
      return { code: stripped.code, map: null };
    },
  };
}
