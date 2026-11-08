/**
 * 映す表示の帯に隠れる量だけ余白を取る hook（#554）。jsdom は寸法を測れないので、矩形と scrollHeight を差し替えて呼び出しを見る。
 * @requirements #554 帯を出すたびに盤が跳ねた（無条件に帯の高さを足していた）
 */
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectionClearance } from '../src/hooks/use-projection-clearance';

function Probe({ shown }: { shown: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  useProjectionClearance(root, body, strip, shown);
  return (
    <div ref={root} data-testid="root">
      <div ref={body}><div data-testid="content" /></div>
      <div ref={strip} />
    </div>
  );
}

function stubGeometry({ contentBottom, scrollHeight, stripHeight }: { contentBottom: number; scrollHeight: number; stripHeight: number }) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'content') return { height: 10, bottom: contentBottom, top: 0 } as DOMRect;
    if (this.dataset.testid === 'root') return { height: scrollHeight, bottom: scrollHeight, top: 0 } as DOMRect;
    return { height: this.parentElement?.dataset.testid === 'root' && !this.hasChildNodes() ? stripHeight : 100, bottom: 0, top: 0 } as DOMRect;
  });
  // 余白を足すとスクロールの高さがその分伸びる（実際の DOM と同じ）
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollHeight + (parseFloat(this.style.getPropertyValue('--projection-clearance')) || 0);
    },
  });
}

describe('useProjectionClearance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  });

  it('Given 中身の下に帯より広い空きがある / When 帯を出す / Then 余白は 0 で、盤を動かさない', () => {
    stubGeometry({ contentBottom: 500, scrollHeight: 844, stripHeight: 100 });
    const { getByTestId } = render(<Probe shown />);
    expect(getByTestId('root').style.getPropertyValue('--projection-clearance')).toBe('0px');
  });

  it('Given 中身の下が帯より狭い / When 帯を出す / Then 隠れる量（帯の高さ − 空き）だけ余白を取る', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    const { getByTestId } = render(<Probe shown />);
    const clearance = parseFloat(getByTestId('root').style.getPropertyValue('--projection-clearance'));
    expect(clearance).toBeGreaterThan(90);
    expect(clearance).toBeLessThanOrEqual(149);
    // 盤を動かさないよう、body の高さを固定して margin で足す（padding の中央寄せのやり直しを避ける）
    expect(getByTestId('root').style.getPropertyValue('--projection-body-pin')).not.toBe('');
  });

  it('Given 帯が出ていない / When 描く / Then 余白は 0', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    const { getByTestId } = render(<Probe shown={false} />);
    expect(getByTestId('root').style.getPropertyValue('--projection-clearance')).toBe('0px');
  });
});
