export default {
  plugins: {
    // Tailwind 4 は PostCSS プラグインを本体から `@tailwindcss/postcss` へ分離した。
    // 新しいライブラリの採用ではなく、同一エコシステム内の構成変更である
    // （技術選定は Tailwind のまま。ADR は要さないと判断した — #113 PR-5）。
    '@tailwindcss/postcss': {},
    // autoprefixer は残置する（依存の削除は #113 の非目標。判断は #71 へ申し送り）。
    //
    // **「Tailwind 4 が自前で prefix を付けるので不要」は実測で成り立たなかった**
    // （2026-08-11・tailwindcss 4.3.3 で外して測った）:
    //   - 外すと CSS が 69,242 → 69,606 バイトへ**増える**
    //   - `-moz-column-gap`（.gap-x-*）は Tailwind 4 が出さないので消える
    //   - Tailwind 4 が出す `-webkit-text-decoration-color` の 3 重複を
    //     autoprefixer が 1 つに畳んでいる
    // つまり現状は冗長ではない。#71 で外すなら、この 2 点の是非を判断すること。
    autoprefixer: {},
  },
};
