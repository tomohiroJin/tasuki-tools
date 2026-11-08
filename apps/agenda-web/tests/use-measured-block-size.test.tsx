/**
 * 帯の高さを測って CSS 変数へ書く hook（#554）。jsdom には ResizeObserver が無いので、差し替えて呼び出しを見る。
 * @requirements #554 手で写した高さに頼ると、文字を大きくしたとき帯の下に最後の行が隠れる
 */
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMeasuredBlockSize } from '../src/hooks/use-measured-block-size';

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  useMeasuredBlockSize(ref, '--probe-height');
  return <div ref={ref} />;
}

describe('useMeasuredBlockSize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--probe-height');
  });

  it('Given ResizeObserver がある / When 描く / Then 実際の高さを <html> の変数に書き、変化のたびに更新し、外れたら消す', () => {
    let notify: () => void = () => undefined;
    let height = 120;
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { notify = cb; } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
    const view = render(<Probe />);
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('120px');
    height = 380;
    notify();
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('380px');
    view.unmount();
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('');
  });

  it('Given ResizeObserver が無い環境 / When 描く / Then 何も書かず、CSS の既定値に任せる', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Probe />);
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('');
  });
});
