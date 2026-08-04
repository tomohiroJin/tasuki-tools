/**
 * 交代前カウントダウン予告音のフック（Issue #2）。
 *
 * 残り秒数(secondsLeft)が個人設定の予告秒数(thresholdSeconds)以下になったら、
 * 整数秒が変わるたびに 1 回だけ、方式(mode)に応じてトーン音または音声読み上げを鳴らす（Issue #5）。
 *
 * running=false（room.clock.running）のときは何もしない。一時停止（evolveSessionPaused）は
 * 必ず freezeRunningClock で running を false にし、休憩(onBreak)は v2.10 で UI/コマンドが
 * 撤去済みの dormant フィールドで実質常に false のため、running 単独で
 * 「一時停止中でも休憩中でもなく走行中」を過不足なく判定できる。
 */

import { useEffect, useRef } from "react";
import { playCountdownTick, playCountdownVoice, computeCountdownStage } from "../platform/sound.js";

export interface CountdownTickOptions {
  /** 個人設定: カウントダウン予告音を鳴らすか。 */
  enabled: boolean;
  /** 予告を開始する残り秒数のしきい値。 */
  thresholdSeconds: number;
  /** 再生音量(0–1)。 */
  volume: number;
  /** カウントダウンの方式。"tone"=トーン音（既定・Issue #3の3段階変化）、"voice"=数字読み上げ（Issue #5）。 */
  mode: "tone" | "voice";
  /** mode: "voice" のときに使う話者。 */
  voiceId: "voice-male" | "voice-female";
}

export function useCountdownTick(
  secondsLeft: number,
  running: boolean,
  opts: CountdownTickOptions,
): void {
  const lastFiredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      lastFiredRef.current = null;
      return;
    }
    const current = Math.ceil(secondsLeft);
    if (
      opts.enabled &&
      current > 0 &&
      current <= opts.thresholdSeconds &&
      lastFiredRef.current !== current
    ) {
      lastFiredRef.current = current;
      if (opts.mode === "voice") {
        playCountdownVoice(current, opts.voiceId, opts.volume);
      } else {
        const stage = computeCountdownStage(current, opts.thresholdSeconds);
        playCountdownTick(opts.volume, stage);
      }
    }
  }, [secondsLeft, running, opts.enabled, opts.thresholdSeconds, opts.volume, opts.mode, opts.voiceId]);
}
