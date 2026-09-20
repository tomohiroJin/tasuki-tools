import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCopyText } from '../src/index.js';

/**
 * `Object.defineProperty` で入れた値は `vi.unstubAllGlobals()` では戻らない。
 * 戻さないと、後から足したテストが「使えない `execCommand`」を引き継いで偽の緑になる。
 */
const execCommandBefore = Object.getOwnPropertyDescriptor(document, 'execCommand');
function restoreExecCommand(): void {
  if (execCommandBefore) Object.defineProperty(document, 'execCommand', execCommandBefore);
  else Reflect.deleteProperty(document, 'execCommand');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreExecCommand();
});

describe('共有コピー操作', () => {
  it('Given clipboard が使える / When コピーする / Then 渡された文字列を書き、成功を一時表示する', async () => {
    // Given: Clipboard API の書き込みが成功する。
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { result } = renderHook(() => useCopyText('https://example.test/?room=朝会'));

    // When: 渡された URL をコピーする。
    await act(() => result.current.copy());

    expect(writeText).toHaveBeenCalledWith('https://example.test/?room=朝会');
    expect(result.current.state).toBe('done');
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.state).toBe('idle');
  });

  it.each(['missing', 'rejected'])('Given clipboard が %s / When コピーする / Then 従来のコピーへ縮退して後片付けする', async (mode) => {
    // Given: Clipboard API が使えず、従来のコピーだけが成功する。
    vi.stubGlobal('navigator', mode === 'missing' ? {} : {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('招待 URL');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const { result } = renderHook(() => useCopyText('招待 URL'));

    // When: コピーを要求する。
    await act(() => result.current.copy());

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(result.current.state).toBe('done');
  });

  it.each(['false', 'throw'])('Given どちらのコピーも使えない（%s） / When コピーする / Then 失敗を返し一時欄を残さない', async (mode) => {
    // Given: 従来のコピーも拒否または例外になる。
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => {
      if (mode === 'throw') throw new Error('unsupported');
      return false;
    } });
    const { result } = renderHook(() => useCopyText('URL'));

    // When: コピーを要求する。
    await act(() => result.current.copy());

    expect(result.current.state).toBe('failed');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('Given コピーが未完了 / When 対象 URL が変わる / Then 古い成功を新しい URL の成功として見せない', async () => {
    // Given: 以前の URL のコピーが保留されている。
    let finish!: () => void;
    vi.stubGlobal('navigator', { clipboard: { writeText: () => new Promise<void>((resolve) => { finish = resolve; }) } });
    const { result, rerender } = renderHook(({ text }) => useCopyText(text), { initialProps: { text: 'old' } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.copy(); });

    // When: URL を変えた後に以前のコピーが完了する。
    rerender({ text: 'new' });
    await act(async () => { finish(); await pending; });

    expect(result.current.state).toBe('idle');
  });

  it('Given 成功表示中 / When アンマウントする / Then 表示を戻すタイマーを片付ける', async () => {
    // Given: コピー成功から 2 秒経っていない。
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { result, unmount } = renderHook(() => useCopyText('URL'));
    await act(() => result.current.copy());

    // When: 招待画面を閉じる。
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
