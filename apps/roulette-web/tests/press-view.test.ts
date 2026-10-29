import { describe, expect, it } from 'vitest';
import {
  PRESS_AUTO_TEXT,
  PRESS_IDLE,
  PRESS_SPINNING,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  STOP_BUTTON,
  TOO_FEW_TEXT,
  TOO_MANY_TEXT,
  pressDecidedText,
  pressStoppedText,
} from '../src/copy';
import type { RouletteView } from '@tasuki/roulette-core';
import { glideMsOf, glideSeatsOf, pressAngleOf, pressButtonOf, pressCaptionOf, seatAt, withPressStop } from '../src/press-view';

/**
 * @requirements #401 押して止める P2・P3（位置と角度）
 */
describe('位置と角度', () => {
  it('位置が 1 減るごとに 1 席ぶん時計回りに進む。位置 0 で 0 番の席の端が指し針に来る', () => {
    // Given / When / Then: 4 席・指し針は下（180°）
    expect(pressAngleOf(0, 4, 180)).toBe(180);
    expect(pressAngleOf(-1, 4, 180)).toBe(270);
    expect(pressAngleOf(2.5, 4, 180)).toBe(-45);
    expect(pressAngleOf(1, 0, 180)).toBe(0);
  });

  it('位置を席の番号と席の中の位置に分ける（負の位置・席の数を超える位置も巡る）', () => {
    // Given / When / Then
    expect(seatAt(2.25, 4)).toEqual({ index: 2, settle: 0.25 });
    expect(seatAt(-0.5, 4)).toEqual({ index: 3, settle: 0.5 });
    expect(seatAt(9, 4)).toEqual({ index: 1, settle: 0 });
  });

  it('寄せは前へ進む。短すぎるときは 1 周足す', () => {
    // Given / When / Then: 6 席・1 秒 20 席（0.25 秒ぶん = 5 席より短ければ 1 周足す）
    expect(glideSeatsOf(3.5, 1.5, 6, 20)).toBe(8);
    expect(glideSeatsOf(1.5, 3.5, 6, 20)).toBe(10);
    expect(glideSeatsOf(1, 3.5, 24, 20)).toBe(21.5);
  });

  it('寄せの時間は勢いを保つ長さで、0.35〜1.6 秒に収める', () => {
    // Given / When / Then
    expect(glideMsOf(8, 20)).toBe(1200);
    expect(glideMsOf(1, 20)).toBe(350);
    expect(glideMsOf(30, 20)).toBe(1600);
  });
});

/**
 * @requirements #401 押して止める §4.1（一言）・P9（主ボタン）
 */
describe('一言と主ボタン', () => {
  it('回す前・回っている間・止まった後（押した人・自動）の一言。決まった人は読み上げにだけ足す', () => {
    // Given / When / Then
    expect(pressCaptionOf({ phase: 'idle', stop: null, winnerName: null, poolCount: 3 })).toEqual({ text: PRESS_IDLE, hidden: '' });
    expect(pressCaptionOf({ phase: 'idle', stop: null, winnerName: null, poolCount: 1 }).text).toBe(TOO_FEW_TEXT);
    expect(pressCaptionOf({ phase: 'spinning', stop: null, winnerName: null, poolCount: 3 }).text).toBe(PRESS_SPINNING);
    const stop = { index: 1, settle: 0.5, by: 'ゆう', atMs: 800 };
    expect(pressCaptionOf({ phase: 'spinning', stop, winnerName: 'れん', poolCount: 3 }).text).toBe(PRESS_SPINNING);
    expect(pressCaptionOf({ phase: 'settled', stop, winnerName: 'れん', poolCount: 3 })).toEqual({
      text: pressStoppedText('ゆう'),
      hidden: pressDecidedText('れん'),
    });
    expect(pressCaptionOf({ phase: 'settled', stop: { ...stop, by: null }, winnerName: 'れん', poolCount: 3 }).text).toBe(PRESS_AUTO_TEXT);
  });

  it('回っている間は「止める」で誰でも押せる。この画面で押した後と切断中は押せない', () => {
    // Given
    const base = { hasSpin: true, stopped: false, landed: false, pressedHere: false, poolCount: 3, operable: true };
    // When / Then
    expect(pressButtonOf(base)).toEqual({ label: STOP_BUTTON, disabled: false, stop: true });
    expect(pressButtonOf({ ...base, pressedHere: true }).disabled).toBe(true);
    expect(pressButtonOf({ ...base, operable: false }).disabled).toBe(true);
  });

  it('止まって寄せ終わるまでは次を回せない。回す前は 2 人から', () => {
    // Given
    const base = { hasSpin: true, stopped: true, landed: false, pressedHere: false, poolCount: 3, operable: true };
    // When / Then
    expect(pressButtonOf(base)).toEqual({ label: SPIN_AGAIN_BUTTON, disabled: true, stop: false });
    expect(pressButtonOf({ ...base, landed: true }).disabled).toBe(false);
    expect(pressButtonOf({ ...base, hasSpin: false, stopped: false })).toEqual({ label: SPIN_BUTTON, disabled: false, stop: false });
    expect(pressButtonOf({ ...base, hasSpin: false, stopped: false, poolCount: 1 }).disabled).toBe(true);
  });
});

/**
 * @requirements #401 押して止める P5（30 秒の自動の停止を画面で書き込む）
 */
describe('withPressStop', () => {
  const view: RouletteView = {
    mode: 'press',
    excluded: [],
    guests: [],
    drawn: [],
    spin: { seq: 1, wheel: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], winnerIndex: 0, settle: 0.2, picks: [], press: { p0: 1, rate: 20, stop: null }, spunBy: 'A', durationMs: 30000, elapsedMs: 0 },
  };
  const stop = { index: 1, settle: 0.4, by: null, atMs: 30000 };

  it('止まっていない回転に止まりを書き込み、当たりの席と picks をそろえる', () => {
    // Given / When
    const v = withPressStop(view, stop);
    // Then
    expect(v.spin?.press?.stop).toEqual(stop);
    expect(v.spin?.winnerIndex).toBe(1);
    expect(v.spin?.picks).toEqual([{ index: 1, settle: 0.4 }]);
  });

  it('止まりが無い・すでに止まりがある・押して止める回転でないなら同じ参照', () => {
    // Given
    const stopped = withPressStop(view, stop);
    const once = { ...view, spin: { ...view.spin!, press: undefined } };
    // When / Then
    expect(withPressStop(view, null)).toBe(view);
    expect(withPressStop(stopped, { ...stop, index: 0 })).toBe(stopped);
    expect(withPressStop(once, stop)).toBe(once);
  });
});

/**
 * @requirements #458 E6（押して止めるでも、24 人を超えたら回せない）
 */
describe('押して止める: 24 人を超えたとき', () => {
  const idle = { hasSpin: false, stopped: false, landed: false, pressedHere: false, operable: true };

  it('Given 回す前で 25 人 / When 主ボタンと一言を決める / Then 押せず、外す案内', () => {
    expect(pressButtonOf({ ...idle, poolCount: 25 })).toEqual({ label: SPIN_BUTTON, disabled: true, stop: false });
    expect(pressCaptionOf({ phase: 'idle', stop: null, winnerName: null, poolCount: 25 })).toEqual({
      text: '回せるのは 24 人までなので、チェックを外してください',
      hidden: '',
    });
    expect(TOO_MANY_TEXT).toBe('回せるのは 24 人までなので、チェックを外してください');
  });

  it('Given 回す前で 24 人 / When 主ボタンと一言を決める / Then 押せて、通常の案内', () => {
    expect(pressButtonOf({ ...idle, poolCount: 24 }).disabled).toBe(false);
    expect(pressCaptionOf({ phase: 'idle', stop: null, winnerName: null, poolCount: 24 }).text).toBe(PRESS_IDLE);
  });

  it('Given 止まって寄せ終えたあとで 25 人 / When 主ボタンを決める / Then 次は回せない', () => {
    expect(pressButtonOf({ hasSpin: true, stopped: true, landed: true, pressedHere: false, poolCount: 25, operable: true }).disabled).toBe(true);
    expect(pressButtonOf({ hasSpin: true, stopped: true, landed: true, pressedHere: false, poolCount: 24, operable: true }).disabled).toBe(false);
  });

  it('Given 回っている最中で 25 人 / When 主ボタンを決める / Then 止めるは押せる', () => {
    expect(pressButtonOf({ hasSpin: true, stopped: false, landed: false, pressedHere: false, poolCount: 25, operable: true })).toEqual({ label: STOP_BUTTON, disabled: false, stop: true });
  });
});
