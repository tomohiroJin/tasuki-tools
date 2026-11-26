/**
 * 画面全体に重なるカットイン（#670）。
 *
 * 性質: 出す時機（待ち・id の更新）・消す時機（時間・null・id の更新・アンマウント）・
 * 操作を奪わないこと（aria-hidden・フォーカスできる物なし）・動きを減らす設定では描かないこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { CUTIN_DURATION_MS, CutIn, type CutInCue } from '../src/room/index.js';

function stubMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

const cue = (over: Partial<CutInCue> = {}): CutInCue => ({
  id: 1,
  title: '全員同じ',
  kicker: 'PLANNING POKER',
  sub: 'ひと休みしよう',
  tone: 'gold',
  ...over,
});

const layer = (): HTMLElement | null => document.body.querySelector<HTMLElement>(':scope > .ui-cutin');

beforeEach(() => {
  vi.useFakeTimers();
  stubMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CutIn', () => {
  it('Given cue が null / When 描く / Then 層は無い', () => {
    render(<CutIn cue={null} />);
    expect(layer()).toBeNull();
  });

  it('Given 待ちのある cue / When 待つ間 / Then 出ない。待ちが明けると body 直下に出る', () => {
    render(<CutIn cue={cue({ delayMs: 500 })} />);
    expect(layer()).toBeNull();
    act(() => void vi.advanceTimersByTime(499));
    expect(layer()).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(layer()).not.toBeNull();
  });

  it('Given 待ちの無い cue / When 描く / Then 次のタイマーで出る（既定の待ちは 0）', () => {
    render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(layer()).not.toBeNull();
  });

  it('Given 出ている層 / Then aria-hidden・tone・題・kicker・sub・時間の変数を持つ', () => {
    render(<CutIn cue={cue({ tone: 'rose' })} />);
    act(() => void vi.advanceTimersByTime(0));
    const root = layer();
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.getAttribute('data-tone')).toBe('rose');
    expect(root?.textContent).toContain('全員同じ');
    expect(root?.textContent).toContain('PLANNING POKER');
    expect(root?.textContent).toContain('ひと休みしよう');
    expect(root?.style.getPropertyValue('--cutin-duration')).toBe(`${CUTIN_DURATION_MS}ms`);
  });

  it('Given kicker・sub が無い cue / Then 題だけが出る', () => {
    render(<CutIn cue={{ id: 1, title: '全員同じ', tone: 'gold' }} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(layer()?.querySelector('.ui-cutin-kicker')).toBeNull();
    expect(layer()?.querySelector('.ui-cutin-sub')).toBeNull();
    expect(layer()?.textContent).toContain('全員同じ');
  });

  it('Given 出ている層 / When CUTIN_DURATION_MS 経つ / Then DOM から外れる', () => {
    render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS - 1));
    expect(layer()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(layer()).toBeNull();
  });

  it('Given 待ちのある cue / When 長さは待ちの後から数える', () => {
    render(<CutIn cue={cue({ delayMs: 300 })} />);
    act(() => void vi.advanceTimersByTime(300 + CUTIN_DURATION_MS - 1));
    expect(layer()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(layer()).toBeNull();
  });

  it('Given 同じ id / When 描き直す / Then 出し直さない（途中で外れず、終わったあとも戻らない）', () => {
    const { rerender } = render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    const first = layer();
    act(() => void vi.advanceTimersByTime(1000));
    rerender(<CutIn cue={cue({ sub: '別の文字' })} />);
    expect(layer()).toBe(first);
    // 外れる時刻は最初の出し始めから数える（描き直しで延びない）
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS - 1000));
    expect(layer()).toBeNull();
    rerender(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS));
    expect(layer()).toBeNull();
  });

  it('Given 出ている層 / When id が替わる / Then 前の分はすぐ外れ、新しい id は待ちからやり直す', () => {
    const { rerender } = render(<CutIn cue={cue({ id: 1 })} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(layer()).not.toBeNull();
    rerender(<CutIn cue={cue({ id: 2, title: '全員バラバラ', delayMs: 400 })} />);
    expect(layer()).toBeNull();
    act(() => void vi.advanceTimersByTime(400));
    expect(layer()?.textContent).toContain('全員バラバラ');
    // 前の id の終わりの時刻には巻き込まれない
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS - 1));
    expect(layer()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(layer()).toBeNull();
  });

  it('Given 待ちの途中 / When cue が null になる / Then 出ない', () => {
    const { rerender } = render(<CutIn cue={cue({ delayMs: 500 })} />);
    rerender(<CutIn cue={null} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(layer()).toBeNull();
  });

  it('Given 出ている層 / When cue が null になる / Then 即座に外れる', () => {
    const { rerender } = render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(layer()).not.toBeNull();
    rerender(<CutIn cue={null} />);
    expect(layer()).toBeNull();
  });

  it('Given 出ている層 / When アンマウント / Then 層もタイマーも残らない', () => {
    const { unmount } = render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    unmount();
    expect(layer()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Given 動きを減らす設定 / When 描く / Then 待っても層を描かない', () => {
    stubMedia(true);
    render(<CutIn cue={cue({ delayMs: 100 })} />);
    // 層が出ている時間の途中（待ちの後・終わりの前）で見る。終わった後に見ると、描いても消えていて恒真になる
    act(() => void vi.advanceTimersByTime(100 + CUTIN_DURATION_MS / 2));
    expect(layer()).toBeNull();
  });

  it('Given 描かない設定へ実行中に変わる / When 層が出ている / Then 外れる', () => {
    let fire: () => void = () => undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_: string, fn: () => void) => {
        fire = fn;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(layer()).not.toBeNull();
    media.matches = true;
    act(() => fire());
    expect(layer()).toBeNull();
  });

  it('Given 出ている層 / Then フォーカスできる物を持たない', () => {
    render(<CutIn cue={cue()} />);
    act(() => void vi.advanceTimersByTime(0));
    const tabbable = layer()?.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable]',
    );
    expect(tabbable?.length).toBe(0);
  });
});
