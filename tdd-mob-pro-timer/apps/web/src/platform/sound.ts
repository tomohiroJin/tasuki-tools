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

/** 短い上昇 2 音のチャイムを鳴らす（失敗は黙って無視）。 */
export function playSwitchChime(): void {
  const Ctor = getAudioCtor();
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.connect(ctx.destination);
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      osc.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.start(start);
      osc.stop(start + 0.12);
    });
    osc_close(ctx);
  } catch {
    /* 自動再生制限・未対応は無視 */
  }
}

/** 再生後にコンテキストを閉じる（リーク防止）。失敗は無視。 */
function osc_close(ctx: AudioContext): void {
  setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 400);
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
