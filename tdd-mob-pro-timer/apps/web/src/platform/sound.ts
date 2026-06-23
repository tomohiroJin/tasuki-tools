/**
 * 交代チャイムと振動。
 *
 * 単一の AudioContext を遅延生成して再利用し、初回ユーザー操作で resume（unlock）する。
 * これによりタイマー発火（ユーザー操作でない）からでも自動再生ポリシーに阻まれず鳴る。
 * 音量は呼び出し側（個人設定）から渡す。
 */

type AudioCtor = typeof AudioContext;

export const DEFAULT_VOLUME = 0.6;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

/** 単一 AudioContext（遅延生成・再利用）。 */
let sharedCtx: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioCtor();
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/** 初回ユーザー操作で AudioContext を resume（unlock）。冪等。App 起動時に呼ぶ。 */
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

/** 任意の音列を共有コンテキストで鳴らす（失敗は黙って無視）。 */
function playTones(
  freqs: number[],
  volume: number,
  opts: { type?: OscillatorType; gap?: number; gain?: number } = {},
): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  const { type = "sine", gap = 0.14, gain = 0.5 } = opts;
  const peak = Math.max(0.0001, gain * volume);
  try {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const start = now + i * gap;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + gap - 0.01);
      osc.start(start);
      osc.stop(start + gap);
    });
  } catch {
    /* 自動再生制限・未対応は無視 */
  }
}

/** 1 つのチャイム定義。play は音量(0–1)を受け取る。 */
export interface Chime {
  id: string;
  label: string;
  isReady: boolean;
  play(volume: number): void;
}

/** 選択可能なチャイム（合成3種。ファイル3種は別途追加）。 */
export const CHIMES: Chime[] = [
  { id: "chime-up", label: "上昇 2 音", isReady: true, play: (v) => playTones([660, 990], v) },
  { id: "chime-down", label: "下降 2 音", isReady: true, play: (v) => playTones([990, 660], v) },
  { id: "soft", label: "ソフト", isReady: true, play: (v) => playTones([523], v, { gap: 0.2, gain: 0.3 }) },
];

/** soundId に対応するチャイムを鳴らす。未知 id は既定 chime-up にフォールバック。 */
export function playChime(soundId: string, volume: number = DEFAULT_VOLUME): void {
  const chime = CHIMES.find((c) => c.id === soundId && c.isReady)
    ?? CHIMES.find((c) => c.id === "chime-up");
  chime?.play(volume);
}

/** @deprecated playChime("chime-up", DEFAULT_VOLUME) を使う。既存呼び出し互換のため残置。 */
export function playSwitchChime(): void {
  playChime("chime-up", DEFAULT_VOLUME);
}

/** モバイル振動（対応端末のみ）。 */
export function vibrateSwitch(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      /* 無視 */
    }
  }
}

/** ファイル系チャイムを registry に追加する（Task 3 で実体を渡す）。 */
export function registerFileChimes(entries: Chime[]): void {
  for (const e of entries) {
    if (!CHIMES.some((c) => c.id === e.id)) CHIMES.push(e);
  }
}
