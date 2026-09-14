/**
 * 端末に残った完了記録への入口（#95 S5c・利用者の申し送り 2026-09-14）。
 *
 * **入口だけを置き、描画は timer 側に残す。** ここで見るのは href の組み立てだけで、
 * 記録そのものの読み書きは `apps/timer-web` の `History.tsx` が担う（`docs/adr/0017`）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryLink } from '../src/screens/HistoryLink.js';

describe('HistoryLink（端末の記録への入口）', () => {
  it('Given ルームに入っていない / When 記録の入口を描く / Then room の付かない履歴 URL を指す', () => {
    // Given: ルームに入っていない（roomCode が無い）
    // When: 記録の入口を描く
    render(<HistoryLink roomCode={null} />);

    // Then
    expect(screen.getByRole('link', { name: '記録を見る' })).toHaveAttribute(
      'href',
      '/timer/?view=history',
    );
  });

  it('Given ルームに入っている / When 記録の入口を描く / Then 戻ってこられるよう room を持たせる', () => {
    // Given: ルームに入っている
    // When: 記録の入口を描く
    render(<HistoryLink roomCode="朝会モブ-a1b2" />);

    // Then
    expect(screen.getByRole('link', { name: '記録を見る' })).toHaveAttribute(
      'href',
      '/timer/?view=history&room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2',
    );
  });
});
