/**
 * 時間切れの合図を出すかの判定（#429 spec §4.4・§4.7）。
 */
import { describe, expect, it } from 'vitest';
import { crossedZero } from '../src/timeout-signal';
import { Driver, MIN } from './support/agenda-states';

/**
 * @requirements #429 spec §4.7（途中で入った・再接続した画面では過去の 0 に鳴らさない）・J20（延長のあと再び 0 で鳴らす）
 */
describe('時間切れの合図', () => {
  it('最初の描画（prev が null）では、残りが −5 秒でも鳴らさない（m444）', () => {
    const v = new Driver([5]).view(5 * MIN + 5000);
    expect(crossedZero(null, v)).toBe(false);
  });

  it('同じステップで残りが正から 0 へ移ったら鳴らす', () => {
    const d = new Driver([5, 5]);
    expect(crossedZero(d.view(5 * MIN - 100), d.view(5 * MIN))).toBe(true);
    expect(crossedZero(d.view(5 * MIN - 100), d.view(5 * MIN + 2000))).toBe(true);
  });

  it('正のまま・負のままでは鳴らさない', () => {
    const d = new Driver([5, 5]);
    expect(crossedZero(d.view(1 * MIN), d.view(2 * MIN))).toBe(false);
    expect(crossedZero(d.view(6 * MIN), d.view(7 * MIN))).toBe(false);
  });

  it('延長で正に戻ってから再び 0 に達したら、もう一度鳴らす（J20）', () => {
    const d = new Driver([5, 5]);
    const over = d.view(6 * MIN);
    d.extend(3, 6 * MIN);
    const back = d.view(6 * MIN);
    expect(crossedZero(over, back)).toBe(false);
    expect(crossedZero(d.view(8 * MIN - 1), d.view(8 * MIN))).toBe(true);
  });

  it('ステップが変わった直後は鳴らさない（前のステップの側で鳴らす）', () => {
    const d = new Driver([5, 1]);
    const before = d.view(5 * MIN - 100);
    d.next(5 * MIN - 50);
    // 新しいステップは 1 分。手元の時計が 2 分進めたとしても、変わった直後の 1 回では鳴らさない
    expect(crossedZero(before, d.view(7 * MIN))).toBe(false);
  });

  it('終了へ移ったときも鳴らさない', () => {
    const d = new Driver([5]);
    const before = d.view(5 * MIN - 100);
    d.next(5 * MIN - 50);
    expect(crossedZero(before, d.view(5 * MIN))).toBe(false);
  });
});
