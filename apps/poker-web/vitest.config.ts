import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 画面の効果（RoomPage の自動再試行の配線など）を試せるようにするため、
// jsdom と React プラグインを入れている。判定を純粋関数へ切り出しても、
// 効果の配線そのもの（依存配列・タイマーの後始末・再接続での数え直し）は
// 描画しないと確かめられない。構成は apps/landing と同じ形にそろえてある。
//
// **`@testing-library/jest-dom` は入れていない。** timer-web と landing は入れて
// いるが、こちらのテストは要素の有無と文言しか見ず、独自の照合子を要さない。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    // `passWithNoTests` は外した。テストが 1 件も無い時期の名残で、
    // 残すと **include が壊れてテストが 1 件も拾われなくなっても緑**になる。
  },
});
