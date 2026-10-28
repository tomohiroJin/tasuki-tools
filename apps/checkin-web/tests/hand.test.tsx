/**
 * 手札（#406・設計 §5）。札のボタン・選んだ札・見学中は出さない（E9）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Hand } from '../src/components/Hand';

const noop = () => undefined;

/**
 * @requirements #406 設計 §5（手札）・E9
 */
describe('手札', () => {
  it('Given 天気のやり方 / When 描く / Then 札の名前を読み上げ名に持つボタンが 4 つ並び、どれも選ばれていない', () => {
    render(<Hand method="weather" selected={null} spectating={false} onPlay={noop} onSetSpectator={noop} />);
    for (const name of ['晴れ', 'くもり', '雨', '雷']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('Given 自分の札が雨 / When 描く / Then 雨だけが aria-pressed=true', () => {
    render(<Hand method="weather" selected="rain" spectating={false} onPlay={noop} onSetSpectator={noop} />);
    expect(screen.getByRole('button', { name: '雨' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '晴れ' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Given 手札 / When 札を押す / Then その札の ID で出す', () => {
    const onPlay = vi.fn();
    render(<Hand method="weather" selected={null} spectating={false} onPlay={onPlay} onSetSpectator={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'くもり' }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('cloudy');
  });

  it('Given 見学中 / When 描く / Then 札のボタンは 0 個で、見学中と投票に加わるが出る（E9）', () => {
    const onSetSpectator = vi.fn();
    render(<Hand method="weather" selected={null} spectating onPlay={noop} onSetSpectator={onSetSpectator} />);
    expect(screen.queryAllByRole('button', { name: /晴れ|くもり|雨|雷/ })).toHaveLength(0);
    expect(screen.getByText(/見学中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '投票に加わる' }));
    expect(onSetSpectator).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Given 見学していない / When 見学するを押す / Then 見学に切り替える', () => {
    const onSetSpectator = vi.fn();
    render(<Hand method="weather" selected={null} spectating={false} onPlay={noop} onSetSpectator={onSetSpectator} />);
    fireEvent.click(screen.getByRole('button', { name: '見学する' }));
    expect(onSetSpectator).toHaveBeenCalledExactlyOnceWith(true);
  });
});
