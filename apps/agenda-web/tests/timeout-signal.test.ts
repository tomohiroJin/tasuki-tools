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
    d.extend(3);
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

/**
 * 「自動で次へ」の時間切れ（最終レビュー I-1）。手元の時計はサーバーより片道の遅れの分だけ遅れるので、
 * 手元で 0 をまたぐ描画より先に「次へ移った」フレームが届く。前のステップの所要が持ち時間ちょうどで確定したことで、
 * 時間切れで移ったと見分ける。
 */
describe('自動で次へ移ったときの合図', () => {
  it('残りが正のまま、次のステップへ自動で移ったフレームを受けたら鳴らす', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    const before = d.view(1 * MIN - 30);
    d.tick(1 * MIN + 20);
    expect(crossedZero(before, d.view(1 * MIN + 20))).toBe(true);
  });

  it('最後のステップが自動で終了へ移ったフレームを受けたら鳴らす', () => {
    const d = new Driver([1], undefined, 'advance');
    const before = d.view(1 * MIN - 30);
    d.tick(1 * MIN + 20);
    const after = d.view(1 * MIN + 20);
    expect(after.phase).toBe('finished');
    expect(crossedZero(before, after)).toBe(true);
  });

  it('一時停止を挟んだステップでも、自動で移ったら鳴らす（所要には一時停止が入る）', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    d.pause(10_000).resume(40_000);
    const before = d.view(1 * MIN + 30_000 - 30);
    d.tick(1 * MIN + 30_000 + 20);
    expect(crossedZero(before, d.view(1 * MIN + 30_000 + 20))).toBe(true);
  });

  it('延長したステップでも、延長後の持ち時間で自動で移ったら鳴らす', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    d.extend(1);
    const before = d.view(2 * MIN - 30);
    d.tick(2 * MIN + 20);
    expect(crossedZero(before, d.view(2 * MIN + 20))).toBe(true);
  });

  it('「自動で次へ」のステップでも、持ち時間の前に「次へ」を押したら鳴らさない', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    const before = d.view(1 * MIN - 5000);
    d.next(1 * MIN - 4000);
    expect(crossedZero(before, d.view(1 * MIN - 3000))).toBe(false);
    const last = new Driver([1], undefined, 'advance');
    const lastBefore = last.view(30_000);
    last.next(31_000);
    expect(crossedZero(lastBefore, last.view(31_000))).toBe(false);
  });

  it('手元で 0 をまたいで鳴らし済みなら、自動で移ったフレームでもう一度は鳴らさない', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    const crossed = d.view(1 * MIN);
    expect(crossedZero(d.view(1 * MIN - 30), crossed)).toBe(true);
    d.tick(1 * MIN + 20);
    expect(crossedZero(crossed, d.view(1 * MIN + 20))).toBe(false);
  });

  it('「押すまで待つ」のステップを押して移ったときは、所要が持ち時間と同じでも鳴らさない', () => {
    const d = new Driver([1, 2]);
    const before = d.view(1 * MIN - 30);
    d.next(1 * MIN);
    expect(crossedZero(before, d.view(1 * MIN + 20))).toBe(false);
  });

  it('最初の描画（prev が null）が自動で移った直後のフレームでも鳴らさない', () => {
    const d = new Driver([1, 2], undefined, 'advance');
    d.tick(1 * MIN + 20);
    expect(crossedZero(null, d.view(1 * MIN + 20))).toBe(false);
  });
});
