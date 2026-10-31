/**
 * 玄関へ送り返す処理（#472・#463-C3）。判定は同期フック、適用はこのフック 1 箇所。
 * 抜けた・外されたとき（departed）は理由を運ぶ。そうでなく玄関が要るとき（needsHub）は理由なしで送る。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useHubRedirect } from '../src/room/index.js';

afterEach(cleanup);

const hubPathFor = (code: string, departure?: string): string => `HUB:${code}:${departure ?? '-'}`;

describe('useHubRedirect', () => {
  it('Given どちらでもない / When 描く / Then 送らない', () => {
    const redirectTo = vi.fn();
    renderHook(() => useHubRedirect({ departed: null, needsHub: false, roomCode: 'R', hubPathFor, redirectTo }));
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('Given 玄関が要る / When 描く / Then 理由なしで玄関のそのルームへ 1 度送る', () => {
    const redirectTo = vi.fn();
    const { rerender } = renderHook(() => useHubRedirect({ departed: null, needsHub: true, roomCode: 'R', hubPathFor, redirectTo }));
    rerender();
    expect(redirectTo.mock.calls).toEqual([['HUB:R:-']]);
  });

  it('Given 抜けた（理由つき）と玄関が要るが同時 / When 描く / Then 理由を運ぶほうだけを送る', () => {
    const redirectTo = vi.fn();
    renderHook(() => useHubRedirect({ departed: 'removed', needsHub: true, roomCode: 'R', hubPathFor, redirectTo }));
    expect(redirectTo.mock.calls).toEqual([['HUB:R:removed']]);
  });

  it('Given ルームコードが変わる / When 描き直す / Then 新しいコードで送り直す', () => {
    const redirectTo = vi.fn();
    const { rerender } = renderHook(({ code }) => useHubRedirect({ departed: null, needsHub: true, roomCode: code, hubPathFor, redirectTo }), {
      initialProps: { code: 'A' },
    });
    rerender({ code: 'B' });
    expect(redirectTo.mock.calls).toEqual([['HUB:A:-'], ['HUB:B:-']]);
  });

  it('Given 描くたびに新しい関数を渡す / When 再描画する / Then 同じ行き先へ送り直さず、最新の関数で送る', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useHubRedirect({ departed: null, needsHub: true, roomCode: 'R', hubPathFor: (c) => `HUB:${c}`, redirectTo: fn }), {
      initialProps: { fn: first },
    });
    rerender({ fn: first });
    rerender({ fn: second });
    expect(first.mock.calls).toEqual([['HUB:R']]);
    expect(second).not.toHaveBeenCalled();
  });
  it('Given 新しい関数に差し替えた後で理由が変わる / When 送る / Then 最新の redirectTo が呼ばれる', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn, departed }: { fn: (to: string) => void; departed: string | null }) =>
      useHubRedirect({ departed, needsHub: false, roomCode: 'R', hubPathFor, redirectTo: fn }), { initialProps: { fn: first, departed: null as string | null } });
    rerender({ fn: second, departed: 'removed' });
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([['HUB:R:removed']]);
  });
});
