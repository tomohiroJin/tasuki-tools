/**
 * お題の板（#406・設計 §5）。公開の仕方の切り替えは、誰かが出したあとは押せない（E7 の画面側）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptPanel } from '../src/components/PromptPanel';

function panel(over: Partial<React.ComponentProps<typeof PromptPanel>> = {}) {
  const props = {
    method: 'weather' as const,
    visibility: 'named' as const,
    locked: false,
    canOperate: true,
    onSetVisibility: vi.fn(),
    onChangeMethod: vi.fn(),
    ...over,
  };
  render(<PromptPanel {...props} />);
  return props;
}

describe('お題の板', () => {
  it('Given 天気 / When 描く / Then 小見出し・問い・凡例が出る', () => {
    panel();
    expect(screen.getByText('CHECK-IN')).toBeInTheDocument();
    expect(screen.getByText('今日の天気')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '今日のあなたの空模様は？' })).toBeInTheDocument();
    expect(screen.getByText('荒れ模様・余裕がない')).toBeInTheDocument();
  });

  it('Given ROTI / When 描く / Then CHECK-OUT', () => {
    panel({ method: 'roti', visibility: 'anonymous' });
    expect(screen.getByText('CHECK-OUT')).toBeInTheDocument();
  });

  it('Given 名前つき / When 描く / Then 名前つきが aria-pressed=true・匿名が false', () => {
    panel();
    expect(screen.getByRole('button', { name: '名前つき' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '匿名' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Given 空き / When 匿名を押す / Then 匿名で setVisibility', () => {
    const p = panel();
    fireEvent.click(screen.getByRole('button', { name: '匿名' }));
    expect(p.onSetVisibility).toHaveBeenCalledExactlyOnceWith('anonymous');
  });

  it('Given locked / When 描く / Then 公開の仕方の 2 つとも disabled（E7）', () => {
    panel({ locked: true });
    expect(screen.getByRole('button', { name: '名前つき' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '匿名' })).toBeDisabled();
  });

  it('Given 別のやり方を押す / Then onChangeMethod', () => {
    const p = panel();
    fireEvent.click(screen.getByRole('button', { name: '別のやり方' }));
    expect(p.onChangeMethod).toHaveBeenCalledTimes(1);
  });

  it('Given onChangeMethod を渡さない（開いた後） / When 描く / Then 別のやり方は出ない（下の帯と 2 つ出さない）', () => {
    panel({ onChangeMethod: undefined });
    expect(screen.queryByRole('button', { name: '別のやり方' })).toBeNull();
  });
});
