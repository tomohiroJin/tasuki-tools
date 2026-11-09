/**
 * 行数で省略される名前（`ClampedName`・#555）。jsdom は寸法を持たないので、`scrollHeight`・`clientHeight` と
 * `ResizeObserver`・`document.fonts` を差し替えて、省略の有無・開閉・フォーカス・見張りの数を確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClampedName } from '../src/room/index.js';

/** 省略されているか（scrollHeight > clientHeight）。テストごとに差し替える。 */
let clipped = true;
const created: Array<{ observed: Set<Element>; fire: () => void }> = [];
const fontListeners = new Map<string, Set<() => void>>();
let fontsReady: Promise<void> = Promise.resolve();

beforeEach(() => {
  clipped = true;
  created.length = 0;
  fontListeners.clear();
  fontsReady = Promise.resolve();
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => (clipped ? 60 : 20) });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 20 });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observed = new Set<Element>();
      constructor(private cb: ResizeObserverCallback) {
        created.push({ observed: this.observed, fire: () => this.cb([...this.observed].map((target) => ({ target }) as ResizeObserverEntry), this as unknown as ResizeObserver) });
      }
      observe(el: Element) { this.observed.add(el); }
      unobserve(el: Element) { this.observed.delete(el); }
      disconnect() { this.observed.clear(); }
    },
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      get ready() { return fontsReady; },
      addEventListener: (type: string, fn: () => void) => { (fontListeners.get(type) ?? fontListeners.set(type, new Set()).get(type)!).add(fn); },
      removeEventListener: (type: string, fn: () => void) => { fontListeners.get(type)?.delete(fn); },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  delete (document as unknown as Record<string, unknown>).fonts;
});

describe('ClampedName', () => {
  it('Given 省略されている名前 / When 描く / Then ボタンで、押すと全文に開き、title は付かない', () => {
    render(<ClampedName className="n" label="ながい名前" />);
    const name = screen.getByRole('button', { name: 'ながい名前' });
    expect(name.getAttribute('aria-expanded')).toBe('false');
    expect(name.hasAttribute('title')).toBe(false);
    fireEvent.click(name);
    expect(name.getAttribute('aria-expanded')).toBe('true');
    expect(name.hasAttribute('data-expanded')).toBe(true);
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(name.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(name, { key: ' ' });
    expect(name.getAttribute('aria-expanded')).toBe('true');
  });

  it('Given 省略されていない名前 / When 描く / Then ただの文字（ボタンでもタブ停止でもない）', () => {
    clipped = false;
    render(<ClampedName className="n" label="短い" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('短い').hasAttribute('tabindex')).toBe(false);
  });

  it('Given 3 つの名前 / When 描く / Then 見張りは 1 つだけで、外すと解く', () => {
    const { unmount } = render(
      <>
        <ClampedName className="n" label="あ" />
        <ClampedName className="n" label="い" />
        <ClampedName className="n" label="う" />
      </>,
    );
    expect(created).toHaveLength(1);
    expect(created[0]!.observed.size).toBe(3);
    unmount();
    expect(created[0]!.observed.size).toBe(0);
    expect(fontListeners.get('loadingdone')?.size ?? 0).toBe(0);
  });

  it('Given 書体が届いて行数が変わる / When loadingdone・fonts.ready / Then 測り直して省略の有無が変わる（ResizeObserver が鳴らなくても）', async () => {
    clipped = false;
    let resolveReady: () => void = () => undefined;
    fontsReady = new Promise<void>((r) => { resolveReady = r; });
    render(<ClampedName className="n" label="名前" />);
    expect(screen.queryByRole('button')).toBeNull();
    clipped = true;
    act(() => { for (const fn of fontListeners.get('loadingdone') ?? []) fn(); });
    expect(screen.getByRole('button', { name: '名前' })).toBeTruthy();
    cleanup();
    clipped = false;
    render(<ClampedName className="n" label="名前" />);
    clipped = true;
    await act(async () => { resolveReady(); await fontsReady; });
    expect(screen.getByRole('button', { name: '名前' })).toBeTruthy();
  });

  it('Given 開いたまま幅が変わって省略が無くなる / When 閉じる / Then フォーカスのある名前はボタンのまま残り、ぼかすと戻る', () => {
    render(<ClampedName className="n" label="名前" />);
    const name = screen.getByRole('button', { name: '名前' });
    name.focus();
    fireEvent.click(name);
    clipped = false; // 開いている間に幅が広がる
    fireEvent.click(name); // 閉じる
    const after = screen.getByRole('button', { name: '名前' });
    expect(after).toBe(name);
    expect(document.activeElement).toBe(name);
    act(() => name.blur());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Given 開いた名前 / When 名前が変わる / Then 閉じた状態に戻る', () => {
    const { rerender } = render(<ClampedName className="n" label="名前1" />);
    fireEvent.click(screen.getByRole('button', { name: '名前1' }));
    rerender(<ClampedName className="n" label="名前2" />);
    expect(screen.getByRole('button', { name: '名前2' }).getAttribute('aria-expanded')).toBe('false');
  });
});
