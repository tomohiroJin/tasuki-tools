/**
 * 押して止めるときの円盤の位置（#401 押して止める spec §3・P2・P3）。
 *
 * - 回っている間は、サーバーと同じ式（`pressPositionAt`）で、受け取った経過から位置を出す。全画面が同じ時刻に同じ席を指す
 * - **この画面で押したら、その場で止める**（サーバーの返事を待たない）。送るのは描いていた位置そのもの（見えた人と送った人を同じにする）
 * - 止まった位置が届いたとき:
 *   - この画面の押下が採られた → 押した位置のまま（動かない＝嘘が無い）
 *   - ほかの人の押下・30 秒の自動の停止 → 勢いのまま前へ進み、止まった位置で減速して止まる（戻らない）
 *   - 止まった後にこの画面を開いた → 止まった位置に置く
 * - 寄せ終わったら `landed`。札・一言・真鍮の席はこれで同じ瞬間に切り替える（画面が局面にする）
 * - 位置は席の単位で、指し針の位置に依らない。角度は舞台が並びの指し針から出す（`pressAngleOf`）
 */
import { useEffect, useRef, useState } from 'react';
import { pressPositionAt, pressStopOf, type PressStop, type RouletteView } from '@tasuki/roulette-core';
import { glideMsOf, glideSeatsOf, seatAt } from '../press-view';
import { elapsedOf } from '../roulette-view';

type Spin = NonNullable<RouletteView['spin']>;

export interface PressMotion {
  /** 指し針が指している位置（席の単位）。押して止める回転でなければ null */
  position: number | null;
  /** 止まったところ（押した位置か、30 秒の自動の停止） */
  stop: PressStop | null;
  /** 止まって寄せ終わった */
  landed: boolean;
  /** この画面で押して、返事を待っている */
  pressedHere: boolean;
  /** 押す。送る値（回転・席・席の中の位置）を返す。押せないときは null */
  press: () => { seq: number; index: number; settle: number } | null;
}

interface Local {
  seq: number;
  position: number;
  index: number;
  settle: number;
}

interface Glide {
  seq: number;
  from: number;
  to: number;
  at: number;
  ms: number;
}

/**
 * `nowMs` は画面の時計（`useNowMs`）。30 秒の自動の停止の時刻にも描き直されるので、rAF が止まっていても止まり切る。
 */
export function usePressMotion(input: { spin: Spin | null; receivedAt: number; nowMs: number }): PressMotion {
  const { spin, receivedAt, nowMs } = input;
  const [now, setNow] = useState(() => performance.now());
  const shown = useRef(0);
  const local = useRef<Local | null>(null);
  const glide = useRef<Glide | null>(null);
  /** 回っているところを見た回転（止まった後に開いた画面は寄せない） */
  const sawRunning = useRef<number | null>(null);

  const press = spin?.press;
  const n = spin?.wheel.length ?? 0;
  const seq = spin?.seq ?? null;
  const t = Math.max(now, receivedAt, nowMs);

  let position: number | null = null;
  let stop: PressStop | null = null;
  let landed = true;
  if (spin !== null && press !== undefined && n > 0) {
    const elapsed = elapsedOf(spin, receivedAt, t);
    stop = pressStopOf(spin, elapsed);
    const mine = local.current?.seq === spin.seq ? local.current : null;
    if (stop === null) {
      sawRunning.current = spin.seq;
      position = mine !== null ? mine.position : pressPositionAt(spin, elapsed);
      landed = false;
    } else if (mine !== null && mine.index === stop.index && Math.abs(mine.settle - stop.settle) < 1e-6) {
      position = mine.position;
    } else if (sawRunning.current !== spin.seq) {
      position = stop.index + stop.settle;
    } else {
      if (glide.current?.seq !== spin.seq) {
        const from = shown.current;
        const seats = glideSeatsOf(from, stop.index + stop.settle, n, press.rate);
        glide.current = { seq: spin.seq, from, to: from - seats, at: t, ms: glideMsOf(seats, press.rate) };
      }
      const g = glide.current;
      const k = Math.min(1, (t - g.at) / g.ms);
      position = g.from + (g.to - g.from) * (1 - Math.pow(1 - k, 3));
      landed = k >= 1;
    }
    shown.current = position;
  }
  const pressedHere = stop === null && seq !== null && local.current?.seq === seq;
  const moving = position !== null && !landed;
  const stopped = stop !== null;

  // 回っている間・寄せている間は毎フレーム描く。寄せの終わりは timer でも描き直す（裏のタブで rAF が止まっても止まり切る）
  useEffect(() => {
    if (!moving) return;
    let raf = 0;
    const tick = (): void => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const g = glide.current;
    const timer = g !== null && g.seq === seq ? setTimeout(() => setNow(performance.now()), g.ms + 30) : undefined;
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [moving, seq, stopped]);

  const pressNow = (): { seq: number; index: number; settle: number } | null => {
    if (spin === null || press === undefined || n === 0 || stop !== null || pressedHere) return null;
    const p = shown.current;
    const { index, settle } = seatAt(p, n);
    local.current = { seq: spin.seq, position: p, index, settle };
    setNow(performance.now());
    return { seq: spin.seq, index, settle };
  };

  return { position, stop, landed, pressedHere, press: pressNow };
}
