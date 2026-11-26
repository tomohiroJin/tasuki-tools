import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMiniWindow } from '../src/hooks/use-mini-window';
import * as platform from '../src/platform/mini-window';

vi.mock('../src/platform/mini-window', () => ({
  isMiniWindowSupported: vi.fn(),
  requestMiniWindow: vi.fn(),
  copyStylesInto: vi.fn(),
}));

/** 偽の小さな窓。`close()` は本物と同じく `pagehide` を起こす。 */
function fakeWindow() {
  const events = new EventTarget();
  const doc = document.implementation.createHTMLDocument('mini');
  const win = {
    document: doc,
    close: vi.fn(() => events.dispatchEvent(new Event('pagehide'))),
    focus: vi.fn(),
    addEventListener: (type: string, fn: EventListener, opts?: AddEventListenerOptions) => events.addEventListener(type, fn, opts),
    removeEventListener: (type: string, fn: EventListener) => events.removeEventListener(type, fn),
  };
  return { win, doc, events };
}

beforeEach(() => {
  vi.mocked(platform.isMiniWindowSupported).mockReturnValue(true);
});

/**
 * @requirements #476 設計 §5 D3（窓の寿命・描画先・後片付け）
 */
describe('useMiniWindow', () => {
  it('Given 非対応 / When フックを使う / Then supported は偽で、開こうとしても何も頼まない', async () => {
    vi.mocked(platform.isMiniWindowSupported).mockReturnValue(false);
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(null);
    const { result } = renderHook(() => useMiniWindow());
    expect(result.current.supported).toBe(false);
    expect(result.current.container).toBeNull();
  });

  it('Given 対応 / When 開く / Then 見た目を窓へ写し、窓の body に描画先を置く', async () => {
    const { win, doc } = fakeWindow();
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(win as unknown as Window);
    const { result } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    expect(platform.copyStylesInto).toHaveBeenCalledWith(document, doc);
    expect(result.current.container).not.toBeNull();
    expect(result.current.container!.ownerDocument).toBe(doc);
    expect(doc.body.contains(result.current.container)).toBe(true);
  });

  it('Given 開く要求が失敗（null） / When 開く / Then 描画先は無いまま', async () => {
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(null);
    const { result } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    expect(result.current.container).toBeNull();
    expect(platform.copyStylesInto).not.toHaveBeenCalled();
  });

  it('Given 開いている / When もう一度開く / Then 開き直さず窓を前に出す', async () => {
    const { win } = fakeWindow();
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(win as unknown as Window);
    const { result } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    await act(async () => result.current.open());
    expect(platform.requestMiniWindow).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('Given 開く要求の最中 / When 続けて開く / Then 重ねて頼まない', async () => {
    const { win } = fakeWindow();
    let resolve: (w: Window) => void = () => undefined;
    vi.mocked(platform.requestMiniWindow).mockReturnValue(new Promise<Window | null>((r) => (resolve = r as (w: Window) => void)));
    const { result } = renderHook(() => useMiniWindow());
    let first!: Promise<void>;
    act(() => {
      first = result.current.open();
      void result.current.open();
    });
    await act(async () => {
      resolve(win as unknown as Window);
      await first;
    });
    expect(platform.requestMiniWindow).toHaveBeenCalledTimes(1);
  });

  it('Given 利用者が窓を閉じた（pagehide） / When 受ける / Then 描画先を手放し、開き直せる', async () => {
    const first = fakeWindow();
    const second = fakeWindow();
    vi.mocked(platform.requestMiniWindow)
      .mockResolvedValueOnce(first.win as unknown as Window)
      .mockResolvedValueOnce(second.win as unknown as Window);
    const { result } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    act(() => {
      first.events.dispatchEvent(new Event('pagehide'));
    });
    expect(result.current.container).toBeNull();
    await act(async () => result.current.open());
    expect(result.current.container!.ownerDocument).toBe(second.doc);
  });

  it('Given 開いている / When close を呼ぶ / Then 窓を閉じ、描画先を手放す', async () => {
    const { win } = fakeWindow();
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(win as unknown as Window);
    const { result } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    act(() => result.current.close());
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(result.current.container).toBeNull();
  });

  it('Given 開いている / When 画面を外す / Then 窓も閉じる', async () => {
    const { win } = fakeWindow();
    vi.mocked(platform.requestMiniWindow).mockResolvedValue(win as unknown as Window);
    const { result, unmount } = renderHook(() => useMiniWindow());
    await act(async () => result.current.open());
    unmount();
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('Given 開く要求の最中に画面が外れた / When 窓が届く / Then その窓を閉じる', async () => {
    const { win } = fakeWindow();
    let resolve: (w: Window) => void = () => undefined;
    vi.mocked(platform.requestMiniWindow).mockReturnValue(new Promise<Window | null>((r) => (resolve = r as (w: Window) => void)));
    const { result, unmount } = renderHook(() => useMiniWindow());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.open();
    });
    unmount();
    await act(async () => {
      resolve(win as unknown as Window);
      await pending;
    });
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
