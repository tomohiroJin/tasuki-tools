/**
 * 手札（#406・設計 §5）。札のボタン・選んだ札・見学中は出さない（E9）。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { METHOD_IDS, METHODS } from '@tasuki/checkin-core';
import { Hand } from '../src/components/Hand';
import { METHOD_COPY } from '../src/method-copy';

const noop = () => undefined;

/**
 * @requirements #406 設計 §5（手札）・E9
 */
describe('手札', () => {
  it('Given 天気のやり方 / When 描く / Then 札の名前を読み上げ名に持つボタンが 4 つ並び、どれも選ばれていない', () => {
    render(<Hand method="weather" selected={null} spectating={false} canOperate onPlay={noop} onSetSpectator={noop} />);
    for (const name of ['晴れ', 'くもり', '雨', '雷']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('Given 自分の札が雨 / When 描く / Then 雨だけが aria-pressed=true', () => {
    render(<Hand method="weather" selected="rain" spectating={false} canOperate onPlay={noop} onSetSpectator={noop} />);
    expect(screen.getByRole('button', { name: '雨' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '晴れ' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Given 手札 / When 札を押す / Then その札の ID で出す', () => {
    const onPlay = vi.fn();
    render(<Hand method="weather" selected={null} spectating={false} canOperate onPlay={onPlay} onSetSpectator={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'くもり' }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('cloudy');
  });

  it('Given 見学中 / When 描く / Then 札のボタンは 0 個で、見学中と投票に加わるが出る（E9）', () => {
    const onSetSpectator = vi.fn();
    render(<Hand method="weather" selected={null} spectating canOperate onPlay={noop} onSetSpectator={onSetSpectator} />);
    expect(screen.queryAllByRole('button', { name: /晴れ|くもり|雨|雷/ })).toHaveLength(0);
    expect(screen.getByText(/見学中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '投票に加わる' }));
    expect(onSetSpectator).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Given 見学していない / When 見学するを押す / Then 見学に切り替える', () => {
    const onSetSpectator = vi.fn();
    render(<Hand method="weather" selected={null} spectating={false} canOperate onPlay={noop} onSetSpectator={onSetSpectator} />);
    fireEvent.click(screen.getByRole('button', { name: '見学する' }));
    expect(onSetSpectator).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each(METHOD_IDS)('Given %s / When 描く / Then 各札のボタンの中に、その札の名前と意味が見た目でも出る（#480）', (method) => {
    render(<Hand method={method} selected={null} spectating={false} canOperate onPlay={noop} onSetSpectator={noop} />);
    const group = screen.getByRole('group', { name: 'あなたの札' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(METHODS[method].cards.length);
    METHODS[method].cards.forEach((card, i) => {
      const { name, meaning } = METHOD_COPY[method].cards[card]!;
      const button = buttons[i]!;
      // 名前と意味は札のボタンの中（押せる範囲）に、読み上げから隠さずに出る
      expect(button.querySelector('.hand-card-name')?.textContent).toBe(name);
      expect(button.querySelector('.hand-card-meaning')?.textContent).toBe(meaning);
      expect(button.querySelector('.hand-card-caption')?.closest('[aria-hidden="true"]')).toBeNull();
    });
  });

  it.each(METHOD_IDS)('Given %s / When 描く / Then 読み上げ名は札の名前ちょうど 1 回で、意味は説明として 1 回だけ結ぶ（#480）', (method) => {
    render(<Hand method={method} selected={null} spectating={false} canOperate onPlay={noop} onSetSpectator={noop} />);
    const buttons = within(screen.getByRole('group', { name: 'あなたの札' })).getAllByRole('button');
    METHODS[method].cards.forEach((card, i) => {
      const { name, meaning } = METHOD_COPY[method].cards[card]!;
      const button = buttons[i]!;
      // aria-label を残すと、見た目の名前と別の出どころになる（ずれても気づけない）。名前の要素へ結ぶ
      expect(button).not.toHaveAttribute('aria-label');
      expect(button).toHaveAccessibleName(name);
      expect(button).toHaveAccessibleDescription(meaning);
    });
  });

  it('Given 天気のやり方 / When 描く / Then 手札の上に問いが出て、どの問いへの答えかが手札だけで分かる（#480）', () => {
    const { container } = render(<Hand method="weather" selected={null} spectating={false} canOperate onPlay={noop} onSetSpectator={noop} />);
    const label = container.querySelector('.hand-label');
    expect(label?.textContent).toContain(METHOD_COPY.weather.prompt);
    expect(label?.textContent).toContain('あなたの札');
  });

  it('Given 見学中 / When 描く / Then 札の名前・意味の添え書きも出さない（E9）', () => {
    const { container } = render(<Hand method="weather" selected={null} spectating canOperate onPlay={noop} onSetSpectator={noop} />);
    expect(container.querySelectorAll('.hand-card-caption')).toHaveLength(0);
  });
});
