/**
 * 帯の高さを測って CSS 変数へ書く hook（#554）。jsdom には ResizeObserver が無いので、差し替えて呼び出しを見る。
 * @requirements #554 手で写した高さに頼ると、文字を大きくしたとき帯の下に最後の行が隠れる
 */
import { render } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
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

  it('Given 2 つのインスタンスが同じ変数に書く / When 先のものが外れる / Then 後のものが書いた生きた値を消さない', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.dataset.h === 'b' ? 200 : 120 } as DOMRect;
    });
    function Two({ showA }: { showA: boolean }) {
      const a = useRef<HTMLDivElement>(null);
      const b = useRef<HTMLDivElement>(null);
      return (
        <>
          {showA && <Inner refEl={a} h="a" />}
          <Inner refEl={b} h="b" />
        </>
      );
    }
    function Inner({ refEl, h }: { refEl: RefObject<HTMLDivElement | null>; h: string }) {
      useMeasuredBlockSize(refEl, '--probe-height');
      return <div ref={refEl} data-h={h} />;
    }
    const view = render(<Two showA />);
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('200px');
    view.rerender(<Two showA={false} />);
    // A は 120px を書いたが、いまの値は B の 200px。A が外れても消さない
    expect(document.documentElement.style.getPropertyValue('--probe-height')).toBe('200px');
  });
});
