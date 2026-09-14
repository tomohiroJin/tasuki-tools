/**
 * 端末に残った完了記録への入口（#95 S5c・利用者の申し送り 2026-09-14）。
 *
 * **入口だけを置き、描画は timer 側に残す。** ここで見るのは href の組み立てだけで、
 * 記録そのものの読み書きは `apps/timer-web` の `History.tsx` が担う（`docs/adr/0017`）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryLink } from '../src/screens/HistoryLink.js';
import { TOOLS } from '../src/tools.js';

/**
 * timer の公開パス。**期待値に `/timer/` と書かない**（#95 S5c・C-I3）。
 *
 * `src/tools.ts` は「href は公開パスで、変える場所はここ 1 箇所」と宣言している。
 * テストが綴りを写していると、`tools.ts` を変えたときに**画面もテストも揃って
 * 古いまま緑**になる（1 つでも取り残すと白画面か 404 になる、と同じ文書が警告している）。
 *
 * **選ぶ鍵に `href` を使わない** —— 使うと突き合わせが恒真になる。`Tool` に識別子が
 * 無いので札の意匠（`mark`）で引く。意匠を変えた人はここで `undefined` を踏み、
 * 対応を考える機会を得る。
 */
const TIMER_BASE = TOOLS.find((tool) => tool.mark === 'ring')?.href;

describe('HistoryLink（端末の記録への入口）', () => {
  it('Given tools.ts の宣言 / When timer の札を引く / Then 公開パスが取れる（この後の期待値の土台）', () => {
    // Given / When: 上の TIMER_BASE
    // Then: 引けないまま各テストが undefined を連結すると、壊れているのに読めない
    //       期待値（"undefined?view=history"）で緑になりうる
    expect(TIMER_BASE).toBeDefined();
  });

  it('Given ルームに入っていない / When 記録の入口を描く / Then room の付かない履歴 URL を指す', () => {
    // Given: ルームに入っていない（roomCode が無い）
    // When: 記録の入口を描く
    render(<HistoryLink roomCode={null} />);

    // Then
    expect(screen.getByRole('link', { name: '記録を見る' })).toHaveAttribute(
      'href',
      `${TIMER_BASE}?view=history`,
    );
  });

  it('Given ルームに入っている / When 記録の入口を描く / Then 戻ってこられるよう room を持たせる', () => {
    // Given: ルームに入っている
    // When: 記録の入口を描く
    render(<HistoryLink roomCode="朝会モブ-a1b2" />);

    // Then
    expect(screen.getByRole('link', { name: '記録を見る' })).toHaveAttribute(
      'href',
      `${TIMER_BASE}?view=history&room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2`,
    );
  });
});
