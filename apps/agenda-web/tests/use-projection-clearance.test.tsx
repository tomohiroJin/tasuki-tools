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
      <div ref={strip} data-testid="strip" />
    </div>
  );
}

let observed: Element[] = [];
function stubGeometry({ contentBottom, scrollHeight, stripHeight }: { contentBottom: number; scrollHeight: number; stripHeight: number }) {
  observed = [];
  vi.stubGlobal('ResizeObserver', class { observe(el: Element) { observed.push(el); } disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
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

  it('Given 帯が中身に重ならない（広い画面） / When 帯を出す / Then 余白は 0 のまま（何も足さない）', () => {
    stubGeometry({ contentBottom: 300, scrollHeight: 720, stripHeight: 69 });
    const { getByTestId } = render(<Probe shown />);
    expect(getByTestId('root').style.getPropertyValue('--projection-clearance')).toBe('0px');
  });

  it('Given 広い画面でも帯が中身に重なる（文字 200%） / When 帯を出す / Then 重なる量だけ余白を取る', () => {
    stubGeometry({ contentBottom: 700, scrollHeight: 720, stripHeight: 138 });
    const { getByTestId } = render(<Probe shown />);
    expect(parseFloat(getByTestId('root').style.getPropertyValue('--projection-clearance'))).toBeGreaterThan(100);
  });

  it('Given 最初の通知までの間に中身が伸びる / When 最初の ResizeObserver の通知が来る / Then その通知でも測り直す（取りこぼさない）', () => {
    stubGeometry({ contentBottom: 300, scrollHeight: 568, stripHeight: 149 });
    let notify: () => void = () => undefined;
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { notify = cb; } observe() {} disconnect() {} });
    const { getByTestId } = render(<Probe shown />);
    const root = getByTestId('root');
    expect(root.style.getPropertyValue('--projection-clearance')).toBe('0px');
    // observe の直後〜最初の通知の間に、中身が伸びて帯に重なる
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { notify = cb; } observe() {} disconnect() {} });
    notify();
    expect(parseFloat(root.style.getPropertyValue('--projection-clearance'))).toBeGreaterThan(90);
  });

  it('Given 帯が出ている / When 描く / Then 外枠・帯・中身（body とその子）の大きさを見る（帯が出ている間に中身が伸びても測り直す）', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    const { getByTestId } = render(<Probe shown />);
    expect(observed).toContain(getByTestId('root'));
    expect(observed).toContain(getByTestId('content'));
    expect(observed).toContain(getByTestId('content').parentElement);
  });

  it('Given 帯 / When 帯の中でフォーカスが動く / Then 測り直しを予約する（Tab で帯へ入ると帯は :focus-within で見える）', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    const frames: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(1); cb(); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const { getByTestId } = render(<Probe shown={false} />);
    expect(frames).toHaveLength(0);
    getByTestId('strip').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(frames).toHaveLength(1);
    getByTestId('strip').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(frames).toHaveLength(2);
  });

  it('Given 帯を素早く出し入れする / When 隠れたとき / Then 変数は 0 に戻り、observer を作り直さない（shown は ref で読む）', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    let created = 0;
    vi.stubGlobal('ResizeObserver', class { constructor() { created += 1; } observe() {} disconnect() {} });
    const view = render(<Probe shown />);
    const root = view.getByTestId('root');
    expect(parseFloat(root.style.getPropertyValue('--projection-clearance'))).toBeGreaterThan(0);
    for (let i = 0; i < 5; i += 1) {
      view.rerender(<Probe shown={false} />);
      view.rerender(<Probe shown />);
    }
    view.rerender(<Probe shown={false} />);
    expect(root.style.getPropertyValue('--projection-clearance')).toBe('0px');
    expect(root.style.getPropertyValue('--projection-body-pin')).toBe('');
    expect(created).toBe(1);
  });

  it('Given フォーカスで測り直しを予約した / When 止める（アンマウント）前に予約が走る前 / Then 予約を取り消し、古い測定は書き戻さない', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    const pending = new Map<number, () => void>();
    let id = 0;
    const cancelled: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { id += 1; pending.set(id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', (n: number) => { cancelled.push(n); pending.delete(n); });
    const view = render(<Probe shown={false} />);
    view.getByTestId('strip').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(pending.size).toBe(1);
    view.unmount();
    expect(cancelled).toHaveLength(1);
    expect(pending.size).toBe(0);
  });

  it('Given 中身の子が取り除かれる / When 子の増減の通知が来る / Then 外れた子を unobserve する（観測し続けてリークしない）', () => {
    stubGeometry({ contentBottom: 300, scrollHeight: 720, stripHeight: 69 });
    const unobserved: Element[] = [];
    let mutate: () => void = () => undefined;
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve(el: Element) { unobserved.push(el); } disconnect() {} });
    vi.stubGlobal('MutationObserver', class { constructor(cb: () => void) { mutate = cb; } observe() {} disconnect() {} });
    const { getByTestId } = render(<Probe shown />);
    const content = getByTestId('content');
    const extra = document.createElement('div');
    content.parentElement!.append(extra);
    mutate(); // extra を観測に加える
    extra.remove();
    mutate(); // extra が外れた
    expect(unobserved).toContain(extra);
    expect(unobserved).not.toContain(content);
  });

  it('Given 余白の中まで送ったまま帯が消える / When 帯が消え、上へ送る / Then 消えた時点では余白を残し（盤を動かさない）、余白の外まで上へ送ったら畳む', () => {
    stubGeometry({ contentBottom: 520, scrollHeight: 568, stripHeight: 149 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 568 });
    const view = render(<Probe shown />);
    const root = view.getByTestId('root');
    const clearance = parseFloat(root.style.getPropertyValue('--projection-clearance'));
    expect(clearance).toBeGreaterThan(90);
    let top = 568 + clearance - 568; // 最下部（余白の中）まで送っている
    Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    view.rerender(<Probe shown={false} />);
    // 帯が消えても、余白の中まで送っている間は余白を残す（消すと scrollTop が詰められて盤が跳ねる）
    expect(root.style.getPropertyValue('--projection-clearance')).toBe(`${clearance}px`);
    top = 0; // 上へ送った
    root.dispatchEvent(new Event('scroll'));
    expect(root.style.getPropertyValue('--projection-clearance')).toBe('0px');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  });
});
