/**
 * 進行表（#429 spec §7.2）。回数 2 以上では回ごとの見出しで区切り、枠の中で「いま」の行へ合わせる。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepList } from '../src/components/StepList';
import { scrollTopToReveal } from '../src/agenda-view';
import { roundHeading, skipStepLabel } from '../src/copy';
import { Driver, MIN } from './support/agenda-states';

const noop = (): void => undefined;

/** 1 行の高さ・枠の高さ（jsdom にレイアウトは無いので、値を与える） */
const ROW_H = 40;
const BOX_H = 120;
/** 枠は body の上から 500px の所にある（盤やヘッダーが上にある）。`offsetTop` は body から測った値になる */
const BOX_TOP = 500;

/** 差し替えた記述子（後片付けで必ず戻す。`vi.unstubAllGlobals` は defineProperty を戻さない） */
interface Saved {
  readonly target: object;
  readonly key: string;
  readonly desc: PropertyDescriptor | undefined;
}
let saved: Saved[] = [];
const scrollTops = new WeakMap<Element, number>();

function override(target: object, key: string, desc: PropertyDescriptor): void {
  saved.push({ target, key, desc: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, ...desc });
}

const isRow = (el: Element): boolean => el.classList.contains('step-list-row');
const rowIndex = (el: Element): number => [...(el.closest('.step-list-rows')?.querySelectorAll('.step-list-row') ?? [])].indexOf(el);

beforeEach(() => {
  saved = [];
  // 行は上から ROW_H ずつ積む。枠は BOX_H。scrollTop は枠ごとに覚える
  // offsetParent は body。枠の上の高さ（BOX_TOP）が混ざる。枠の中の位置は getBoundingClientRect の差で測る
  override(HTMLElement.prototype, 'offsetTop', { get(this: HTMLElement) { return isRow(this) ? BOX_TOP + rowIndex(this) * ROW_H : 0; } });
  override(Element.prototype, 'getBoundingClientRect', {
    value(this: Element): DOMRect {
      const box = this.closest('.step-list-rows');
      const top = isRow(this) && box !== null ? BOX_TOP + rowIndex(this) * ROW_H - (scrollTops.get(box) ?? 0) : BOX_TOP;
      const height = isRow(this) ? ROW_H : BOX_H;
      return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
    },
    writable: true,
  });
  override(HTMLElement.prototype, 'offsetHeight', { get(this: HTMLElement) { return isRow(this) ? ROW_H : 0; } });
  override(Element.prototype, 'clientHeight', { get(this: Element) { return this.classList.contains('step-list-rows') ? BOX_H : 0; } });
  override(Element.prototype, 'scrollTop', {
    get(this: Element) { return scrollTops.get(this) ?? 0; },
    set(this: Element, v: number) { scrollTops.set(this, v); },
  });
});

afterEach(() => {
  for (const { target, key, desc } of saved.reverse()) {
    if (desc === undefined) Reflect.deleteProperty(target, key);
    else Object.defineProperty(target, key, desc);
  }
  vi.restoreAllMocks();
});

/**
 * @requirements #429 spec §7.2
 */
describe('進行表の回の見出し', () => {
  it('Given 回数 2 以上 / When 描く / Then 回ごとの見出し「1 回」「2 回」で区切られる', () => {
    render(<StepList view={new Driver([1, 1], 'LT', 'wait', 3).view(0)} canOperate onSetSkipped={noop} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([roundHeading(1), roundHeading(2), roundHeading(3)]);
    expect(screen.getAllByRole('listitem').filter(isRow)).toHaveLength(6);
  });

  it('Given 回数 1 / When 描く / Then 見出しも枠のクラスも無い（第 1 段のまま）', () => {
    const { container } = render(<StepList view={new Driver([1, 1]).view(0)} canOperate onSetSkipped={noop} />);
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
    expect(container.querySelector('.step-list-rows--scroll')).toBeNull();
    expect(container.querySelector('.step-list-round')).toBeNull();
  });

  it('Given 回数 2 以上 / When 描く / Then 行の番号は回の中の 1 から振り直す', () => {
    const { container } = render(<StepList view={new Driver([1, 1], 'LT', 'wait', 2).view(0)} canOperate onSetSkipped={noop} />);
    expect([...container.querySelectorAll('.step-list-number')].map((n) => n.textContent)).toEqual(['1', '2', '1', '2']);
  });

  it('Given 回数 2 以上 / When 描く / Then スキップの読み上げ名に回が入る。回数 1 は第 1 段のまま', () => {
    render(<StepList view={new Driver([1, 1], 'LT', 'wait', 3).view(0)} canOperate onSetSkipped={noop} />);
    expect(screen.getByRole('button', { name: skipStepLabel(1, 3) }).getAttribute('aria-label')).toBe('3 回のステップ 1 をスキップ');
    expect(screen.queryByRole('button', { name: 'ステップ 1 をスキップ' })).toBeNull();
    cleanup();
    render(<StepList view={new Driver([1, 1, 1]).view(0)} canOperate onSetSkipped={noop} />);
    expect(screen.getByRole('button', { name: 'ステップ 3 をスキップ' })).toBeDefined();
  });
});

describe('scrollTopToReveal', () => {
  const box = { scrollTop: 100, clientHeight: 120 };
  it('行が枠に収まっていれば、いまの scrollTop のまま', () => {
    expect(scrollTopToReveal(box, { top: 120, height: 40 })).toBe(100);
    expect(scrollTopToReveal(box, { top: 100, height: 40 })).toBe(100);
    expect(scrollTopToReveal(box, { top: 180, height: 40 })).toBe(100);
  });
  it('上にはみ出せば、行の上端に合わせる', () => {
    expect(scrollTopToReveal(box, { top: 60, height: 40 })).toBe(60);
  });
  it('下にはみ出せば、行の下端が枠の下端に来るよう合わせる', () => {
    expect(scrollTopToReveal(box, { top: 200, height: 40 })).toBe(120);
  });
});

/**
 * @requirements #429 spec §7.2（スクロールは枠の中だけ。m459）
 */
describe('進行表の枠のスクロール', () => {
  it('Given 回数 2 以上 / When 描く / Then 枠はキーボードで届き、進行表の見出しで名前が付く。回数 1 には属性が無い', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 6);
    const { container, unmount } = render(<StepList view={d.view(0)} canOperate onSetSkipped={noop} />);
    const box = container.querySelector('.step-list-rows--scroll');
    expect(box?.getAttribute('tabindex')).toBe('0');
    const labelledBy = box?.getAttribute('aria-labelledby') ?? '';
    expect(labelledBy).not.toBe('');
    expect(container.querySelector('h2')?.id).toBe(labelledBy);
    unmount();

    const single = render(<StepList view={new Driver([1, 1, 1]).view(0)} canOperate onSetSkipped={noop} />);
    const ol = single.container.querySelector('.step-list-rows');
    expect(ol?.hasAttribute('tabindex')).toBe(false);
    expect(ol?.hasAttribute('aria-labelledby')).toBe(false);
  });


  it('Given 回数 2 以上 / When 区切りが移る / Then 枠の scrollTop だけが動き、ページはスクロールしない（m459）', () => {
    const scrollIntoView = vi.fn();
    override(Element.prototype, 'scrollIntoView', { value: scrollIntoView, writable: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const d = new Driver([1, 1], 'LT', 'wait', 6);
    const { container, rerender } = render(<StepList view={d.view(0)} canOperate onSetSkipped={noop} />);
    const box = container.querySelector('.step-list-rows--scroll');
    expect(box).not.toBeNull();
    // 最初の描画: 1 行目は収まっている
    expect(box?.scrollTop).toBe(0);

    // 7 つ目（index 6）の区切りへ。枠の中の位置 240・高さ 40 → 下にはみ出す: 240 + 40 − 120 = 160
    for (let i = 0; i < 6; i++) d.next((i + 1) * MIN);
    rerender(<StepList view={d.view(7 * MIN)} canOperate onSetSkipped={noop} />);
    expect(box?.scrollTop).toBe(scrollTopToReveal({ scrollTop: 0, clientHeight: BOX_H }, { top: 6 * ROW_H, height: ROW_H }));
    expect(box?.scrollTop).toBe(160);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('Given 枠がすでにスクロールしている / When 区切りがもう 1 つ移る / Then 枠の中の位置で測り、scrollTop が足し込まれる（m460）', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 6);
    const { container, rerender } = render(<StepList view={d.view(0)} canOperate onSetSkipped={noop} />);
    const box = container.querySelector('.step-list-rows--scroll');
    for (let i = 0; i < 6; i++) d.next((i + 1) * MIN);
    rerender(<StepList view={d.view(7 * MIN)} canOperate onSetSkipped={noop} />);
    // 二段目: scrollTop が 0 でない所（160）から index 7 へ。枠の中の位置 280・高さ 40 → 280 + 40 − 120 = 200
    expect(box?.scrollTop).toBe(160);
    d.next(7 * MIN);
    rerender(<StepList view={d.view(8 * MIN)} canOperate onSetSkipped={noop} />);
    expect(box?.scrollTop).toBe(200);
  });

  it('Given 途中から参加した / When 最初の描画 / Then いまの行へ合わせる', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 6);
    for (let i = 0; i < 8; i++) d.next((i + 1) * MIN);
    const { container } = render(<StepList view={d.view(9 * MIN)} canOperate onSetSkipped={noop} />);
    // index 8 → 8 * 40 + 40 − 120 = 240
    expect(container.querySelector('.step-list-rows--scroll')?.scrollTop).toBe(240);
  });

  it('Given 回数 1 / When 区切りが移る / Then 枠が無いので scrollTop を触らない', () => {
    const d = new Driver([1, 1, 1, 1, 1, 1, 1]);
    const { container, rerender } = render(<StepList view={d.view(0)} canOperate onSetSkipped={noop} />);
    for (let i = 0; i < 6; i++) d.next((i + 1) * MIN);
    rerender(<StepList view={d.view(7 * MIN)} canOperate onSetSkipped={noop} />);
    expect(container.querySelector('.step-list-rows')?.scrollTop).toBe(0);
  });
});
