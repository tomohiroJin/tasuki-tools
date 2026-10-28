/**
 * やり方の選択（#406・設計 §4）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MethodPicker } from '../src/components/MethodPicker';

describe('やり方の選択', () => {
  it('Given 初期 / When 描く / Then チェックインの 5 つのやり方とランダムが出る', () => {
    render(<MethodPicker onChoose={vi.fn()} onDraw={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'チェックイン' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'チェックアウト' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /今日の天気/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ROTI/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
  });

  it('Given チェックアウトへ切り替え / When 描く / Then チェックアウトのやり方に替わる', () => {
    render(<MethodPicker onChoose={vi.fn()} onDraw={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    expect(screen.getByRole('button', { name: /ROTI/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /今日の天気/ })).toBeNull();
  });

  it('Given やり方を押す / Then choose が 1 回だけ呼ばれる', () => {
    const onChoose = vi.fn();
    const onDraw = vi.fn();
    render(<MethodPicker onChoose={onChoose} onDraw={onDraw} />);
    fireEvent.click(screen.getByRole('button', { name: /今日の天気/ }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('weather');
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('Given チェックアウトでランダム / Then draw に側を載せる', () => {
    const onDraw = vi.fn();
    render(<MethodPicker onChoose={vi.fn()} onDraw={onDraw} />);
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    fireEvent.click(screen.getByRole('button', { name: 'ランダム' }));
    expect(onDraw).toHaveBeenCalledExactlyOnceWith('checkout');
  });

  it('Given 戻れる場合 / When 戻るを押す / Then onCancel', () => {
    const onCancel = vi.fn();
    render(<MethodPicker onChoose={vi.fn()} onDraw={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
