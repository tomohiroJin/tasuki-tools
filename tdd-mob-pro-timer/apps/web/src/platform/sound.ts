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

/** 指定 AudioContext に音列をスケジュールする。suspended なら resume を待ってから行う。 */
export async function scheduleTones(
  ctx: AudioContext,
  freqs: number[],
  volume: number,
  opts: { type?: OscillatorType; gap?: number; gain?: number } = {},
): Promise<void> {
  const { type = "sine", gap = 0.14, gain = 0.5 } = opts;
  const peak = Math.max(0.0001, gain * volume);
  try {
    // 交代間隔中に自動 suspend された場合、resume 完了を待ってからスケジュールしないと無音になる（#1）。
    if (ctx.state === "suspended") await ctx.resume();
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
    /* 自動再生制限・未対応・resume 失敗は無視 */
  }
}

/** 任意の音列を共有コンテキストで鳴らす（fire-and-forget）。 */
function playTones(
  freqs: number[],
  volume: number,
  opts: { type?: OscillatorType; gap?: number; gain?: number } = {},
): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  void scheduleTones(ctx, freqs, volume, opts);
}

/** カウントダウン音の周波数（3段階・低→高、Issue #3）。段階1=交代から遠い/段階3=交代直前。 */
export const COUNTDOWN_STAGE_FREQS: readonly [number, number, number] = [660, 880, 1108];

/**
 * 残り秒数(currentSeconds)と予告秒数(thresholdSeconds)から、カウントダウン音の段階(1〜3)を判定する。
 * thresholdSeconds を3等分し、交代に近い（残りが少ない）区間ほど高い段階を返す（Issue #3）。
 */
export function computeCountdownStage(currentSeconds: number, thresholdSeconds: number): 1 | 2 | 3 {
  const segment = thresholdSeconds / 3;
  if (currentSeconds <= segment) return 3;
  if (currentSeconds <= segment * 2) return 2;
  return 1;
}

/** 交代前カウントダウン中に毎秒鳴らす短いビープ音（fire-and-forget）。stage 省略時は段階1（低）。 */
export function playCountdownTick(volume: number, stage: 1 | 2 | 3 = 1): void {
  playTones([COUNTDOWN_STAGE_FREQS[stage - 1]], volume, { gap: 0.12, gain: 0.35 });
}

/** 1 つのチャイム定義。play は音量(0–1)を受け取る。 */
export interface Chime {
  id: string;
  label: string;
  isReady: boolean;
  play(volume: number): void;
}

/** 音声ファイルを音量付きで再生（失敗は黙って無視）。 */
function playFile(src: string, volume: number): void {
  if (typeof Audio === "undefined") return;
  try {
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, volume));
    void a.play().catch(() => {});
  } catch {
    /* 無視 */
  }
}

/** 同梱音源の URL（vite の base path に追従）。 */
const soundUrl = (name: string): string => `${import.meta.env.BASE_URL}sounds/${name}.mp3`;

/** 選択可能なチャイム。department を先頭・既定とし初期6種。ファイル系は下の registerFileChimes で追加（voice 2種で計8種）。 */
export const CHIMES: Chime[] = [
  { id: "department", label: "呼び出しチャイム", isReady: true, play: (v) => playFile(soundUrl("department"), v) },
  { id: "melody", label: "メロディ", isReady: true, play: (v) => playFile(soundUrl("melody"), v) },
  { id: "sustained", label: "持続トーン", isReady: true, play: (v) => playFile(soundUrl("sustained"), v) },
  { id: "chime-up", label: "上昇 2 音", isReady: true, play: (v) => playTones([660, 990], v) },
  { id: "chime-down", label: "下降 2 音", isReady: true, play: (v) => playTones([990, 660], v) },
  { id: "bell", label: "ベル", isReady: true, play: (v) => playFile(soundUrl("bell"), v) },
];

// TTS 音声アナウンス（AivisSpeech 生成・public/sounds に同梱）。
registerFileChimes([
  { id: "voice-male", label: "音声（男声）", isReady: true, play: (v) => playFile(soundUrl("voice-male"), v) },
  { id: "voice-female", label: "音声（女声）", isReady: true, play: (v) => playFile(soundUrl("voice-female"), v) },
]);

/** soundId に対応するチャイムを鳴らす。未知 id は既定 department にフォールバック。 */
export function playChime(soundId: string, volume: number = DEFAULT_VOLUME): void {
  const chime = CHIMES.find((c) => c.id === soundId && c.isReady)
    ?? CHIMES.find((c) => c.id === "department");
  chime?.play(volume);
}

/** @deprecated playChime("department", DEFAULT_VOLUME) を使う。既存呼び出し互換のため残置。 */
export function playSwitchChime(): void {
  playChime("department", DEFAULT_VOLUME);
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
