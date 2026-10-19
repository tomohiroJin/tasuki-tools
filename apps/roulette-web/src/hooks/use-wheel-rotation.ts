/**
 * 円盤の回転（#94 PR 3・spec §6.4・§6.5）。
 *
 * - **止まったかはこのフックで決めない。** 画面（`RouletteRoom`）が `phaseOf` で 1 か所で決めた局面を
 *   `settled` で受ける。札・当たりの席・結果の一言が同じ瞬間に切り替わる（円盤が自前の
 *   時計で先に止まると、札は当たりを見せているのに一言はまだ回している、と食い違った）。終わりの
 *   保証（rAF に頼らない残り時間の timer）も画面の側にある（`useNowMs`）
 * - **新しい `seq` を受けたときだけ回し始める。** 同じ `seq` の再描画では回し直さない
 * - 開始角は**その画面がいま見せている角度**（0° へ戻さない）。止まる角度の 360° の剰余は開始角に
 *   依らない（`finalAngle`）ので、どの画面も同じ席で止まる
 * - 経過は局面と同じ純粋関数 `elapsedOf` で、同期フックが持つ**基準の組**（`receivedAt` と `spin.elapsedMs`）から出す
 * - rAF は見た目（角度）を進めるだけ。止まった・回転が替わった・アンマウントで消す。回っている間の角度は
 *   `durationMs` で頭打ちになり、`finalAngle` と同じ値なので、局面が「止まった」に変わる瞬間に跳ばない
 * - 動きを減らす設定では局面が受け取った直後から「止まった」なので、回さずに最終の角度へ置き、rAF も
 *   動かさない（rAF の回転は CSS の一括の手当ての外なので JS が止める）
 * - 指し針の位置は並び（`useStageLayout`）から来る。並びは回っている間は変わらないので、回転の途中で
 *   指し針が動くことは無い
 * - 止まったら、札が見えていなければ寄せる（見えていれば動かさない）
 * - 変わった止まり方（#420・`spin.stopStyle`）は 1 人目の回転の描き方だけを変える。止まる角度は同じなので、
 *   局面が「止まった」に変わる瞬間に跳ばない（動きを減らす設定では局面が先に止まるので描かない）
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RouletteView } from '@tasuki/roulette-core';
import { elapsedOf, picksOf } from '../roulette-view';
import { angleAtPicks, finalAngleOfPicks } from '../wheel-motion';

type Spin = NonNullable<RouletteView['spin']>;

export interface WheelRotation {
  /** 回転子の角度 */
  angle: number;
  /** 回っている（止まる前に、受け取った回転がある） */
  spinning: boolean;
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

interface Anim {
  seq: number;
  startDeg: number;
  /** この画面が回っている途中（または回し始め）で受け取ったか。終わった後に入った画面は寄せない */
  fresh: boolean;
}

export function useWheelRotation(input: {
  spin: Spin | null;
  receivedAt: number;
  /** 画面の局面が「止まった」か（`phaseOf`。動きを減らす設定では受け取った直後から真） */
  settled: boolean;
  reducedMotion: boolean;
  /** いまの並びの指し針の位置 */
  pointerDeg: number;
  card: RefObject<HTMLElement | null>;
  dock: RefObject<HTMLElement | null>;
}): WheelRotation {
  const { spin, receivedAt, settled, reducedMotion, pointerDeg, card, dock } = input;
  const [now, setNow] = useState(() => performance.now());
  const shown = useRef(0);
  const anim = useRef<Anim | null>(null);
  const scrolledSeq = useRef<number | null>(null);

  // 新しい seq: 開始角をその時点で固定する（同じ seq では作り直さない）
  if (spin !== null && anim.current?.seq !== spin.seq) {
    anim.current = {
      seq: spin.seq,
      startDeg: mod(shown.current, 360),
      fresh: spin.elapsedMs < spin.durationMs,
    };
  }

  let angle = shown.current;
  if (spin !== null && anim.current !== null) {
    const a = anim.current;
    const n = spin.wheel.length;
    // 2 人以上は 1 人ずつ続けて止まる（#401）。1 人なら #94 の angleAt / finalAngle と同じ値
    const picks = picksOf(spin);
    // 受け取った直後に古い「いま」を使うと経過が負になる。基準の組より前には戻さない
    angle = settled
      ? finalAngleOfPicks(picks, n, pointerDeg, a.startDeg)
      : angleAtPicks(elapsedOf(spin, receivedAt, Math.max(now, receivedAt)), picks, n, pointerDeg, a.startDeg, spin.stopStyle);
  }
  shown.current = angle;
  const spinning = spin !== null && !settled;
  const seq = spin?.seq ?? null;

  // 見た目を進める rAF。止まったら・回転が替わったら・アンマウントで止める
  useEffect(() => {
    if (!spinning) return;
    let raf = 0;
    const tick = (): void => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, seq]);

  // 止まったら、札が見えていなければ寄せる（受け取ったときに終わっていた画面は寄せない）
  useEffect(() => {
    if (!settled || seq === null || anim.current?.seq !== seq || !anim.current.fresh) return;
    if (scrolledSeq.current === seq) return;
    scrolledSeq.current = seq;
    const el = card.current;
    if (el === null || typeof el.scrollIntoView !== 'function') return;
    const rect = el.getBoundingClientRect();
    const dockTop = dock.current?.getBoundingClientRect().top ?? window.innerHeight;
    const bottomLimit = Math.min(window.innerHeight, dockTop);
    if (rect.top >= 0 && rect.bottom <= bottomLimit) return;
    el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [settled, seq, reducedMotion, card, dock]);

  return { angle, spinning };
}
