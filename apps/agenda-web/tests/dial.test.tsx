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
    // 斜線は style で当てる（属性だと CSS の `.dial-plan` の stroke に負けて、ただの太い帯になる）
    const skipped = container.querySelector<SVGPathElement>('.dial-plan--skipped');
    expect(skipped?.style.stroke).toMatch(/^url\(["']?#dial[A-Za-z0-9]+-hatch["']?\)$/);
    expect(skipped?.getAttribute('stroke')).toBeNull();
    expect(container.querySelectorAll('.dial-plan-number--skipped')).toHaveLength(1);
    expect(container.querySelector('.dial-marker')).toHaveClass('dial-marker--early');
  });

  it('延長したいまのステップには足しの区画が出る', () => {
    const v = new Driver([5, 5]).extend(3).view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial-extension')).not.toBeNull();
  });

  it('中央の台座は針の後に描かれ（軸の内側を覆う）、針の矢じりは台座の外に出る', () => {
    const v = new Driver([5, 5]).view(1 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    const needle = container.querySelector('.dial-needle');
    const plate = container.querySelector('.dial-plate');
    expect(needle && plate && needle.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 矢じりの付け根（中心から 108）は台座の半径より外
    const r = Number(plate?.getAttribute('r'));
    const tipBaseY = Number(container.querySelector('.dial-needle-shaft')?.getAttribute('y2'));
    expect(200 - tipBaseY).toBeGreaterThan(r + 20);
  });

  it('オーバー中、終了見込みの印はオーバーの軌道と重ならない（印の三角の内端が軌道の外端より外）', () => {
    const v = new Driver([5, 5]).next(4 * MIN).view(12 * MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    const track = container.querySelector('.dial-overrun-track')?.getAttribute('d') ?? '';
    const trackR = Number(/A(\d+(?:\.\d+)?) /.exec(track)?.[1]);
    const translate = container.querySelector('.dial-marker')?.parentElement?.getAttribute('transform') ?? '';
    const [, tx, ty] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(translate) ?? [];
    const markerR = Math.hypot(Number(tx) - 200, Number(ty) - 200);
    // 軌道の太さ 4.5 の半分・三角の中心からの広がり 7
    expect(markerR - 7).toBeGreaterThan(trackR + 2.25);
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

  it('開始前の名前は「今日の進行」と「n ステップ」を折り返さない塊で組む（小さな盤で語の中で割れない）', () => {
    const { container } = render(<Dial view={idleView([5, 7, 1, 40, 7])} wallNow={WALL} reducedMotion={false} />);
    const name = container.querySelector('.dial-name');
    expect(name?.textContent).toBe('今日の進行 5 ステップ');
    expect([...(name?.querySelectorAll('.dial-name-chunk') ?? [])].map((el) => el.textContent)).toEqual(['今日の進行', '5 ステップ']);
  });
});

/**
 * @requirements #429 spec §7.3（回の札）
 */
describe('盤の回の札', () => {
  const tagTexts = (el: HTMLElement): string[] => [...el.querySelectorAll('.dial-tag')].map((t) => t.textContent ?? '');

  it('回数 2 以上の進行中は、盤の中央に「2 / 6 回」の札が出る', () => {
    const v = new Driver([1, 1], 'LT', 'wait', 6).next(MIN).next(2 * MIN).view(2 * MIN + 1000);
    expect(v.steps.find((s) => s.id === v.currentId)?.round).toBe(2);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(tagTexts(container)).toEqual(['2 / 6 回']);
  });

  it('一時停止中は「一時停止」の札と並ぶ', () => {
    const v = new Driver([1, 1], 'LT', 'wait', 6).pause(10_000).view(20_000);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(tagTexts(container)).toEqual(['1 / 6 回', '一時停止中']);
  });

  it('回数 1 では回の札も、札の入れ物も出ない（第 1 段のまま）（m458）', () => {
    const v = new Driver([5, 7]).view(MIN);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect(container.querySelector('.dial-tags')).toBeNull();
    expect(container.textContent).not.toMatch(/\d \/ \d 回/);
  });

  it('外の環の札は planLabels の文字（回数 5 は「1」〜「5」。幅の足りない区画の番号は出ない）', () => {
    const v = idleView([1, 1], 'LT', 5);
    const { container } = render(<Dial view={v} wallNow={WALL} reducedMotion={false} />);
    expect([...container.querySelectorAll('.dial-plan-number')].map((t) => t.textContent)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('回数 1 の KPT は第 1 段と同じ番号の札（1・2・4・5）', () => {
    const { container } = render(<Dial view={idleView([5, 7, 1, 40, 7])} wallNow={WALL} reducedMotion={false} />);
    expect([...container.querySelectorAll('.dial-plan-number')].map((t) => t.textContent)).toEqual(['1', '2', '4', '5']);
  });
});
