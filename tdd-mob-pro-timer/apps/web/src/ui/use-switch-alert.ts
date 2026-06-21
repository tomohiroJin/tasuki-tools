/**
 * 交代通知ロジックを担うカスタムフック（§9.1 assertiveSwitch + 個人設定ゲート）。
 *
 * 2つの独立した軸でゲートを分離:
 * - 音/振動/OS通知 → 個人設定 `notify.enabled` でゲート（ルーム設定に依存しない）
 * - 全画面オーバーレイ → ルーム設定 `assertiveSwitch` でゲート
 *
 * オーバーレイは一定時間で自動消滅する。検知と自動消滅の effect を分離することで、
 * 表示中に driverName だけ変化しても自動消滅が妨げられない。
 */

import { useEffect, useRef, useState } from "react";
import { playChime, vibrateSwitch } from "../platform/sound.js";
import { notifyDriverChange } from "../platform/notify.js";
import type { NotifyPreferences } from "../prefs/local-prefs.js";

/** オーバーレイの自動消滅までの時間(ms)。 */
const SWITCH_ALERT_MS = 2500;

export interface SwitchAlertState {
  /** 表示中の新ドライバー名。null なら非表示。 */
  switchAlertName: string | null;
  /** オーバーレイを手動で閉じる。 */
  dismissSwitchAlert: () => void;
}

export interface SwitchAlertOptions {
  /** ルーム設定: 全画面オーバーレイ（視覚的割り込み）を出すか。 */
  assertiveSwitch: boolean;
  /** 個人設定: 音/振動/OS通知を出すか。 */
  notify: NotifyPreferences;
}

export function useSwitchAlert(
  currentIndex: number,
  currentDriverName: string,
  opts: SwitchAlertOptions,
): SwitchAlertState {
  const [name, setName] = useState<string | null>(null);
  const prevIndexRef = useRef(currentIndex);
  const { assertiveSwitch, notify } = opts;

  // 交代検知: currentIndex が変わったときに各軸を独立して処理する。
  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = currentIndex;
    if (prev === currentIndex) return;
    // 個人設定: 音/振動/OS通知（ルーム設定に依存しない背面通知）。
    if (notify.enabled) {
      playChime(notify.soundId);
      vibrateSwitch();
      if (notify.osNotify) notifyDriverChange(currentDriverName);
    }
    // ルーム設定: 全画面オーバーレイ（音とは独立）。
    if (assertiveSwitch) setName(currentDriverName);
  }, [currentIndex, assertiveSwitch, notify.enabled, notify.soundId, notify.osNotify, currentDriverName]);

  // 自動消滅は表示状態だけに依存させる（検知 effect と分離）。
  useEffect(() => {
    if (!name) return;
    const id = setTimeout(() => setName(null), SWITCH_ALERT_MS);
    return () => clearTimeout(id);
  }, [name]);

  return { switchAlertName: name, dismissSwitchAlert: () => setName(null) };
}
