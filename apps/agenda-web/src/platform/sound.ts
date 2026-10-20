/**
 * 時打ちの音（#429 spec §4.7 判断 J14）。
 *
 * **timer-web の写し（`apps/timer-web/src/platform/sound.ts` の `installAudioUnlock`・`scheduleTones`）。
 * 3 つ目の利用者が来たら共通化を検討する**（原則 X: 2 つ目までは写す）。写したのは解錠と音列の予約だけで、
 * チャイムの一覧・音量の設定・振動・読み上げは持たない。
 *
 * 単一の AudioContext を遅延生成して再利用し、利用者の操作で resume（解錠）する。解錠には操作が要るので、
 * 操作しない画面（映しているだけ・途中で入っただけ）は鳴らない。だから「音あり」を押すことが解錠を兼ねる。
 */

type AudioCtor = typeof AudioContext;

/** 時打ちの音量（timer の既定と同じ） */
const STRIKE_VOLUME = 0.6;
/** 懐中時計の時打ち: 高い音から 5 度下へ 2 打（E6 → A5）。余韻を長めに取る */
const STRIKE_FREQS = [1318.5, 880];
const STRIKE_GAP_SEC = 0.42;
const STRIKE_GAIN = 0.45;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
}

/** 単一 AudioContext（遅延生成・再利用） */
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

/** いま（利用者の操作の中で）解錠する。「音あり」を押したときに呼ぶ */
export function unlockAudio(): void {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

/** 初回の利用者の操作で解錠する。冪等。進める画面を開いたときに呼ぶ */
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = (): void => {
    unlockAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);
}

/** 指定 AudioContext に音列を予約する。suspended なら resume を待ってから行う */
export async function scheduleTones(
  ctx: AudioContext,
  freqs: number[],
  volume: number,
  opts: { type?: OscillatorType; gap?: number; gain?: number } = {},
): Promise<void> {
  const { type = 'sine', gap = 0.14, gain = 0.5 } = opts;
  const peak = Math.max(0.0001, gain * volume);
  try {
    // 自動で suspend された場合、resume 完了を待ってから予約しないと無音になる（timer #1）
    if (ctx.state === 'suspended') await ctx.resume();
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
    /* 自動再生の制限・未対応・resume の失敗は無視する */
  }
}

/** 時間切れの時打ちを 1 回鳴らす（fire-and-forget） */
export function playStrike(): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  void scheduleTones(ctx, STRIKE_FREQS, STRIKE_VOLUME, { type: 'triangle', gap: STRIKE_GAP_SEC, gain: STRIKE_GAIN });
}
