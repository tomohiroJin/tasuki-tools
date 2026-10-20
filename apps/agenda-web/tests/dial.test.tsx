/**
 * 懐中時計の盤の部品（#429 spec §7.2・§7.4・§7.7）。見た目の値は幾何の関数が持つので、ここでは
 * 「どの部品が描かれ、色以外の手がかりが付くか」と a11y の形を見る。
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dial } from '../src/components/Dial';
import { needleDeg } from '../src/dial-geometry';
import { Driver, MIN, idleView } from './support/agenda-states';
import { outsideBase } from './support/font-base';

const WALL = new Date(2026, 9, 20, 14, 0, 0);

/**
 * @requirements #429 spec §7.7（動きを減らす設定でも針は消さない）
 */
describe('盤', () => {
  it('動きを減らす設定でも針が描かれ、実時間の角度を指す（m450）', () => {
    const v = new Driver([5, 5]).pause(1 * MIN).view(3 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion />);
    const needle = container.querySelector('.dial-needle');
    expect(needle).not.toBeNull();
    expect(needle?.getAttribute('transform')).toBe(`rotate(${needleDeg(v)} 200 200)`);
    expect(container.querySelector('.dial')).toHaveClass('dial--reduced');
  });

  it('盤の SVG と中央の文字は読み上げから外し、要約の一文を持つ', () => {
    const v = new Driver([5, 7]).view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(container.querySelector('.dial-face')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.ui-visually-hidden')?.textContent).toBe('S1、残り 4 分、予定どおり');
  });

  it('進行中: 残り・名前・押し巻き・盤の下の一行が並ぶ', () => {
    const v = new Driver([5, 7]).view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial-time')?.textContent).toBe('4:00');
    expect(container.querySelector('.dial-name')?.textContent).toBe('S1');
    expect(container.querySelector('.dial-drift')?.textContent).toBe('予定どおり');
    expect(container.querySelector('.dial-footer')?.textContent).toBe('次は S2 ・ 14:11 に終了見込み');
    expect(container.querySelector('.dial-overrun-track')).toBeNull();
  });

  it('オーバー: 「+」・「オーバー」の小札・赤銅の段・1 周を超えたらオーバーの軌道（色以外の手がかり）', () => {
    const v = new Driver([5, 5]).next(4 * MIN).view(12 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial')).toHaveClass('is-overrun');
    expect(container.querySelector('.dial-time')?.textContent).toBe('+3:00');
    expect(container.querySelector('.dial-tag--overrun')?.textContent).toBe('オーバー');
    expect(container.querySelector('.dial-overrun-track')).not.toBeNull();
    expect(container.querySelector('.dial-drift')).toHaveClass('is-late');
    expect(container.querySelector('.dial-late-rim')).not.toBeNull();
    expect(container.querySelector('.dial-marker')).toHaveClass('dial-marker--late');
  });

  it('一時停止: 「一時停止中」の小札', () => {
    const v = new Driver([5, 5]).pause(1 * MIN).view(2 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial')).toHaveClass('is-paused');
    expect(container.querySelector('.dial-tag--paused')?.textContent).toBe('一時停止中');
  });

  it('飛ばしたステップの外の区画は斜線の形になり、番号に打ち消し線の印が付く', () => {
    const v = new Driver([5, 5, 5]).skip('s-2').view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelectorAll('.dial-plan--skipped')).toHaveLength(1);
    expect(container.querySelectorAll('.dial-plan-number--skipped')).toHaveLength(1);
    expect(container.querySelector('.dial-marker')).toHaveClass('dial-marker--early');
  });

  it('延長したいまのステップには足しの区画が出る', () => {
    const v = new Driver([5, 5]).extend(3).view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial-extension')).not.toBeNull();
  });

  it('開始前: 針は 12 時・終了見込みの印は出さない・中央は予定の合計', () => {
    const { container } = render(<Dial view={idleView([30, 30])} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial-needle')?.getAttribute('transform')).toBe('rotate(0 200 200)');
    expect(container.querySelector('.dial-marker')).toBeNull();
    expect(container.querySelector('.dial-time')?.textContent).toBe('60:00');
    expect(container.querySelector('.dial-drift')?.textContent).toBe('開始前');
  });

  it('時打ちの印（striking）と映す表示の大きさをクラスで受ける', () => {
    const v = new Driver([5]).view(5 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} striking size="stage" />);
    expect(container.querySelector('.dial')).toHaveClass('dial--striking', 'dial--stage');
  });

  it('同じ画面に 2 つ描いても、グラデーションの id が重ならない', () => {
    const v = new Driver([5]).view(0);
    const { container } = render(
      <>
        <Dial view={v} wallNow={WALL} reducedMotion={false} />
        <Dial view={v} wallNow={WALL} reducedMotion={false} />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(2);
  });

  it.each([
    ['開始前', idleView([5, 7])],
    ['進行中', new Driver([5, 7]).view(1 * MIN)],
    ['オーバー', new Driver([5, 7]).view(6 * MIN)],
    ['終了', new Driver([5]).next(6 * MIN).view(7 * MIN)],
  ])('%s: 描いた文字は書体の常用の層に収まる', (_label, v) => {
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(outsideBase([container.textContent ?? ''])).toEqual([]);
  });
});
