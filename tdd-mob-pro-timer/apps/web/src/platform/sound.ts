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
    // 音ごとに独立した gain を持たせ、各音のエンベロープが干渉しないようにする。
    [660, 990].forEach((freq, i) => {
      const start = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.start(start);
      osc.stop(start + 0.12);
    });
    closeContextSoon(ctx);
  } catch {
    /* 自動再生制限・未対応は無視 */
  }
}

/** 再生後にコンテキストを閉じる（リーク防止）。失敗は無視。 */
function closeContextSoon(ctx: AudioContext): void {
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
