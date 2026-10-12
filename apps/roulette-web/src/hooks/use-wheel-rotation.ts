/**
 * 円盤の回転（#94 PR 3・spec §6.4・§6.5）。
 *
 * - **新しい `seq` を受けたときだけ回し始める。** 同じ `seq` の再描画では回し直さない
 * - 開始角は**その画面がいま見せている角度**（0° へ戻さない）。止まる角度の 360° の剰余は開始角に
 *   依らない（`finalAngle`）ので、どの画面も同じ席で止まる
 * - 経過は同期フックが持つ**基準の組**（`receivedAt` と `spin.elapsedMs`）から出す
 * - **終わりは rAF に頼らない。** 残り時間の `setTimeout` で必ず止める（裏のタブ・ヘッドレスでは rAF が
 *   止まる）。rAF は見た目を進めるだけ。timer と rAF は回転が替わる・アンマウントで必ず消す
 * - 動きを減らす設定では**回さずに最終の角度へ置く**（rAF の回転は CSS の一括の手当ての外なので JS が止める）
 * - 止まったら、札が見えていなければ寄せる（見えていれば動かさない）
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RouletteView } from '@tasuki/roulette-core';
import { angleAt, finalAngle } from '../wheel-motion';

type Spin = NonNullable<RouletteView['spin']>;

export interface WheelRotation {
  /** 回転子の角度 */
  angle: number;
  /** 回っている（止まる前に、受け取った回転がある） */
  spinning: boolean;
  /** 止まった（当たりの席と札の表を出してよい） */
  settled: boolean;
  /** 回転ごとに固定した指し針の位置（止まった後は渡された値に追従する） */
  pointerDeg: number;
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

interface Anim {
  seq: number;
  startDeg: number;
  pointerDeg: number;
  /** この画面が回っている途中（または回し始め）で受け取ったか。終わった後に入った画面は寄せない */
  fresh: boolean;
}

export function useWheelRotation(input: {
  spin: Spin | null;
  receivedAt: number;
  reducedMotion: boolean;
  /** いまの並びの指し針の位置（回っている間は回し始めの値を使い続ける） */
  pointerDeg: number;
  card: RefObject<HTMLElement | null>;
  dock: RefObject<HTMLElement | null>;
}): WheelRotation {
  const { spin, receivedAt, reducedMotion, pointerDeg, card, dock } = input;
  const [now, setNow] = useState(() => performance.now());
  const [endedSeq, setEndedSeq] = useState<number | null>(null);
  const shown = useRef(0);
  const anim = useRef<Anim | null>(null);
  const scrolledSeq = useRef<number | null>(null);

  // 新しい seq: 開始角と指し針の位置をその時点で固定する（同じ seq では作り直さない）
  if (spin !== null && anim.current?.seq !== spin.seq) {
    anim.current = {
      seq: spin.seq,
      startDeg: mod(shown.current, 360),
      pointerDeg,
      fresh: spin.elapsedMs < spin.durationMs,
    };
  }

  let angle = shown.current;
  let settled = false;
  if (spin !== null && anim.current !== null) {
    const a = anim.current;
    const n = spin.wheel.length;
    // 受け取った直後に古い「いま」を使うと経過が負になる。基準の組より前には戻さない
    const elapsed = Math.min(spin.durationMs, Math.max(0, spin.elapsedMs + (Math.max(now, receivedAt) - receivedAt)));
    settled = reducedMotion || elapsed >= spin.durationMs || endedSeq === spin.seq;
    angle = settled
      ? finalAngle(n, spin.winnerIndex, spin.settle, pointerDeg, a.startDeg)
      : angleAt(elapsed, spin.durationMs, n, spin.winnerIndex, spin.settle, a.pointerDeg, a.startDeg);
  }
  shown.current = angle;
  const spinning = spin !== null && !settled;

  const seq = spin?.seq ?? null;
  const durationMs = spin?.durationMs ?? 0;
  const elapsedMs = spin?.elapsedMs ?? 0;

  // 終わりの保証。回転が替わる・アンマウントで消す（前の回転の timer が今の回転を止めない）
  useEffect(() => {
    if (seq === null || reducedMotion) return;
    const remaining = durationMs - elapsedMs - (performance.now() - receivedAt);
    const timer = setTimeout(() => setEndedSeq(seq), Math.max(0, remaining) + 30);
    return () => clearTimeout(timer);
  }, [seq, durationMs, elapsedMs, receivedAt, reducedMotion]);

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

  return { angle, spinning, settled, pointerDeg: settled || anim.current === null ? pointerDeg : anim.current.pointerDeg };
}
