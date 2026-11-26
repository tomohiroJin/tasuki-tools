import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrackKeys } from '../src/hooks/use-track-keys';

afterEach(() => {
  document.body.replaceChildren();
});

function handlers() {
  return { enabled: true, onCandidate: vi.fn(), onStop: vi.fn(), onResume: vi.fn() };
}

/**
 * @requirements #476 設計 §5 D3（ミニ表示の窓の S・C キーも、本体の確かめが開いている間は拾わない）
 */
describe('useTrackKeys', () => {
  it('Given 本体の文書にキーを付けた / When S を押す / Then 止める', () => {
    const h = handlers();
    renderHook(() => useTrackKeys(h));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(h.onStop).toHaveBeenCalledTimes(1);
  });

  it('Given 窓の文書にキーを付けた / When 窓で S を押す / Then 止める', () => {
    const h = handlers();
    const win = document.implementation.createHTMLDocument('mini');
    renderHook(() => useTrackKeys(h, win));
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(h.onStop).toHaveBeenCalledTimes(1);
  });

  it('Given 本体の文書に確かめが開いている / When 窓で S を押す / Then 拾わない', () => {
    const h = handlers();
    const win = document.implementation.createHTMLDocument('mini');
    const confirm = document.createElement('div');
    confirm.setAttribute('data-track-confirm', '');
    document.body.appendChild(confirm);
    renderHook(() => useTrackKeys(h, win));
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(h.onStop).not.toHaveBeenCalled();
  });

  it('Given 本体の文書に開いた dialog がある / When 窓で C を押す / Then 拾わない', () => {
    const h = handlers();
    const win = document.implementation.createHTMLDocument('mini');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    renderHook(() => useTrackKeys(h, win));
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    expect(h.onResume).not.toHaveBeenCalled();
  });
});
