/**
 * 交代チャイムと振動（§9.1「強い交代通知」の付随フィードバック）
 *
 * Web Audio で短い 2 音チャイムを鳴らす。AudioContext が無い環境では何もしない。
 * モバイルでは振動も併用（iOS Safari は vibrate を無視するため音と併用が前提）。
 */

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

/** 再生後にコンテキストを閉じる（リーク防止）。失敗は無視。 */
function closeContextSoon(ctx: AudioContext): void {
  setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 400);
}

/** 任意の上昇/下降/単音列を鳴らす汎用合成音（失敗は黙って無視）。 */
function playTones(freqs: number[], opts: { type?: OscillatorType; gap?: number; gain?: number } = {}): void {
  const Ctor = getAudioCtor();
  if (!Ctor) return;
  const { type = "sine", gap = 0.12, gain = 0.18 } = opts;
  try {
    const ctx = new Ctor();
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
      g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + gap - 0.01);
      osc.start(start);
      osc.stop(start + gap);
    });
    closeContextSoon(ctx);
  } catch {
    /* 自動再生制限・未対応は無視 */
  }
}

/** 音声ファイルを再生（失敗は黙って無視）。アセット未配置でも例外にしない。 */
function playFile(src: string): void {
  if (typeof Audio === "undefined") return;
  try {
    const a = new Audio(src);
    a.volume = 0.6;
    void a.play().catch(() => {});
  } catch {
    /* 無視 */
  }
}

/** 1 つのチャイム定義。 */
export interface Chime {
  id: string;
  label: string;
  /** 再生可能か（音声ファイル系はアセット配置後に true）。 */
  isReady: boolean;
  play(): void;
}

/** 音声ファイル系チャイムが利用可能か。アセット配置時に true へ変更する。 */
const VOICE_ASSET_READY = false;

/** 選択可能なチャイム（全 5 種：合成 4＋ファイル 1）。 */
export const CHIMES: Chime[] = [
  { id: "chime-up", label: "上昇 2 音", isReady: true, play: () => playTones([660, 990]) },
  { id: "chime-down", label: "下降 2 音", isReady: true, play: () => playTones([990, 660]) },
  { id: "bell", label: "ベル", isReady: true, play: () => playTones([880, 880], { gap: 0.22, gain: 0.14 }) },
  { id: "soft", label: "ソフト", isReady: true, play: () => playTones([523], { gap: 0.18, gain: 0.08 }) },
  { id: "voice", label: VOICE_ASSET_READY ? "ボイス" : "ボイス（準備中）", isReady: VOICE_ASSET_READY, play: () => playFile("/sounds/voice.mp3") },
];

/** soundId に対応するチャイムを鳴らす。未知 id は既定 chime-up にフォールバック。 */
export function playChime(soundId: string): void {
  const chime = CHIMES.find((c) => c.id === soundId && c.isReady)
    ?? CHIMES.find((c) => c.id === "chime-up");
  chime?.play();
}

/** @deprecated playChime("chime-up") を使う。既存呼び出し互換のため残置。 */
export function playSwitchChime(): void {
  playChime("chime-up");
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
