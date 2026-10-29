/**
 * 押して止めるときの画面の判断（#401 押して止める spec §3・§4）。React にも I/O にも依存しない。
 *
 * 円盤の位置（席の単位・`pressPositionAt`）は指し針の位置に依らない。並び（縦積み / 横並び）が違う画面どうしでも、
 * **指し針から見て同じ席**を同じ時刻に指す。角度は `pressAngleOf` で、その画面の指し針の位置から出す。
 */
import { MAX_WHEEL, pressStopOf, type PressStop, type RouletteView } from '@tasuki/roulette-core';
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
} from './copy';
import { elapsedOf } from './roulette-view';

type Spin = NonNullable<RouletteView['spin']>;

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** 止まったところ（押した位置か、30 秒の自動の停止）。押して止める回転でない・まだ回っているなら null */
export function pressStopOfView(spin: Spin | null, receivedAt: number, nowMs: number): PressStop | null {
  if (spin === null || spin.press === undefined) return null;
  return pressStopOf(spin, elapsedOf(spin, receivedAt, nowMs));
}

/**
 * 止まった位置を回転に書き込んだ形（当たりの席と `picks`）。30 秒の自動の停止はサーバーが配り直さない（時計を持たない）ので、
 * 画面が同じ式で出した止まりを書き込み、札・真鍮の席・一覧を 1 人の結果として読めるようにする。止まっていなければ同じ参照
 */
export function withPressStop(view: RouletteView, stop: PressStop | null): RouletteView {
  const spin = view.spin;
  if (spin === null || spin.press === undefined || stop === null) return view;
  if (spin.press.stop !== null) return view;
  return {
    ...view,
    spin: { ...spin, winnerIndex: stop.index, settle: stop.settle, picks: [{ index: stop.index, settle: stop.settle }], press: { ...spin.press, stop } },
  };
}

/** 位置（席の単位）を、その画面の指し針から見た円盤の角度にする。位置が 1 減るごとに 1 席ぶん時計回りに進む */
export function pressAngleOf(position: number, n: number, pointerDeg: number): number {
  return n === 0 ? 0 : pointerDeg - position * (360 / n);
}

/** 位置を席の番号と席の中の位置に分ける（押した画面が送る値） */
export function seatAt(position: number, n: number): { index: number; settle: number } {
  const p = mod(position, n);
  const index = Math.min(n - 1, Math.floor(p));
  return { index, settle: Math.min(Math.max(p - index, 0), 1 - 1e-9) };
}

/** 寄せる距離（前へ進む席の数）。短すぎて急に止まって見えるなら 1 周足す（spec P3） */
export function glideSeatsOf(from: number, target: number, n: number, rate: number): number {
  const d = mod(mod(from, n) - target, n);
  return d < rate * 0.25 ? d + n : d;
}

/** 寄せる時間（ms）。勢い（席/秒）を保って 3 次の減速で止まる長さ。0.35〜1.6 秒 */
export function glideMsOf(seats: number, rate: number): number {
  return Math.min(1600, Math.max(350, ((3 * seats) / rate) * 1000));
}

/** 一言（`role="status"`）。止まった後は誰が止めたかを見せ、決まった人は読み上げにだけ足す（`hidden`） */
export function pressCaptionOf(input: {
  phase: 'idle' | 'spinning' | 'settled';
  stop: PressStop | null;
  winnerName: string | null;
  poolCount: number;
}): { text: string; hidden: string } {
  const { phase, stop, winnerName, poolCount } = input;
  if (phase === 'settled' && stop !== null && winnerName !== null) {
    return { text: stop.by === null ? PRESS_AUTO_TEXT : pressStoppedText(stop.by), hidden: pressDecidedText(winnerName) };
  }
  if (phase === 'spinning') return { text: PRESS_SPINNING, hidden: '' };
  return { text: poolCount < 2 ? TOO_FEW_TEXT : poolCount > MAX_WHEEL ? TOO_MANY_TEXT : PRESS_IDLE, hidden: '' };
}

/**
 * 主ボタン。回っている間は「止める」（**誰でも押せる**・spec 利用者の決定）。この画面で押した後、サーバーの返事までは押せない。
 * 止まって寄せ終わるまでは次を回せない。
 */
export function pressButtonOf(input: {
  hasSpin: boolean;
  stopped: boolean;
  landed: boolean;
  pressedHere: boolean;
  poolCount: number;
  operable: boolean;
}): { label: string; disabled: boolean; stop: boolean } {
  const { hasSpin, stopped, landed, pressedHere, poolCount, operable } = input;
  if (hasSpin && !stopped) return { label: STOP_BUTTON, disabled: !operable || pressedHere, stop: true };
  return { label: hasSpin ? SPIN_AGAIN_BUTTON : SPIN_BUTTON, disabled: !operable || poolCount < 2 || poolCount > MAX_WHEEL || (hasSpin && !landed), stop: false };
}
