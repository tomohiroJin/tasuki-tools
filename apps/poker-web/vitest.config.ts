import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 画面の効果（RoomPage の自動再試行の配線など）を試せるようにするため、
// jsdom と React プラグインを入れている。判定を純粋関数へ切り出しても、
// 効果の配線そのもの（依存配列・タイマーの後始末・再接続での数え直し）は
// 描画しないと確かめられない。構成は apps/landing と同じ形にそろえてある。
//
// **`globals` は落とせない。** `@testing-library/react` の自動 cleanup は
// `afterEach` がグローバルに居るときだけ登録される。落とすと描画した DOM が
// テストをまたいで積み上がり、**「無いこと」を見る検証が前の回の残骸を拾う**
// （実測: 同じ文言を 2 回描画すると `getAllByText` が 2 を返した）。
//
// **`@testing-library/jest-dom` は入れていない。** timer-web と landing は入れて
// いるが、こちらのテストは要素の有無と文言しか見ず、独自の照合子を要さない。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    // `passWithNoTests` は外した。テストが 1 件も無い時期の名残で、
    // 残すと **include が壊れてテストが 1 件も拾われなくなっても緑**になる。
  },
});
