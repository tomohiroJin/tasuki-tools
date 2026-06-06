/**
 * 強い交代通知（§9.1 assertiveSwitch）のロジックを担うカスタムフック。
 *
 * currentIndex の変化を「交代」と見なし、assertiveSwitch が ON のときだけ
 * 全画面オーバーレイ用の名前をセットし、音＋振動で割り込む。
 * オーバーレイは一定時間で自動消滅する。検知と自動消滅の effect を分離することで、
 * 表示中に driverName だけ変化しても自動消滅が妨げられない（レビュー #2）。
 */

import { useEffect, useRef, useState } from "react";
import { playSwitchChime, vibrateSwitch } from "../platform/sound.js";

/** オーバーレイの自動消滅までの時間(ms)。 */
const SWITCH_ALERT_MS = 2500;

export interface SwitchAlertState {
  /** 表示中の新ドライバー名。null なら非表示。 */
  switchAlertName: string | null;
  /** オーバーレイを手動で閉じる。 */
  dismissSwitchAlert: () => void;
}

export function useSwitchAlert(
  currentIndex: number,
  assertiveSwitch: boolean,
  currentDriverName: string,
): SwitchAlertState {
  const [name, setName] = useState<string | null>(null);
  const prevIndexRef = useRef(currentIndex);

  // 交代検知: currentIndex が変わり、かつ assertiveSwitch が ON のときだけ割り込む。
  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = currentIndex;
    if (prev === currentIndex) return;
    if (!assertiveSwitch) return;
    setName(currentDriverName);
    playSwitchChime();
    vibrateSwitch();
  }, [currentIndex, assertiveSwitch, currentDriverName]);

  // 自動消滅は表示状態だけに依存させる（検知 effect と分離・レビュー #2）。
  useEffect(() => {
    if (!name) return;
    const id = setTimeout(() => setName(null), SWITCH_ALERT_MS);
    return () => clearTimeout(id);
  }, [name]);

  return { switchAlertName: name, dismissSwitchAlert: () => setName(null) };
}
