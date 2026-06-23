/**
 * 交代通知の個人設定ポップオーバー（StatusStrip の「🔔 通知」ボタンから開く）。
 * ルーム設定 assertiveSwitch とは独立。load/save/permission/外側クリックをここで担い、
 * 表示は NotifySettingsPanel に委譲する。
 */

import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import {
  loadNotifyPreferences,
  saveNotifyPreferences,
  type NotifyPreferences,
} from "../../prefs/local-prefs.js";
import { playChime } from "../../platform/sound.js";
import { requestPermissionIfEnabling } from "../../platform/notify.js";
import { useFocusTrap } from "../useFocusTrap.js";
import { NotifySettingsPanel } from "./NotifySettingsPanel.js";

export function NotifySettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPreferences>(() => loadNotifyPreferences());
  const [osDenied, setOsDenied] = useState(false);
  // containerRef はボタン＋パネル全体を包むラッパー（外側クリック判定に使用）。
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // useFocusTrap はオブジェクト引数形式（ブリーフの位置引数想定とは異なる実際の型）。
  useFocusTrap({ open, containerRef: panelRef, onClose: () => setOpen(false) });

  // 外側クリックでパネルを閉じる。
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  /**
   * 設定を更新し保存する。enabled が true になった場合は OS 通知許可を要求する。
   * NotifySettingsPanel の onChange に直接渡す。
   */
  const handleChange = async (patch: Partial<NotifyPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifyPreferences(next);
    // enabled が ON になった（かつ osNotify が有効）ときに OS 通知許可を要求。
    const granted = await requestPermissionIfEnabling(patch, next);
    if (granted !== null) setOsDenied(!granted);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* ラベル付きトリガーボタン（Bell アイコン + 「通知」テキスト） */}
      <button
        type="button"
        aria-label="通知設定"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--bone-muted)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" /> 通知
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="交代通知の設定"
          className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] p-3 text-sm text-[var(--bone)] shadow-lg"
        >
          <NotifySettingsPanel
            prefs={prefs}
            onChange={(patch) => void handleChange(patch)}
            onPreview={() => playChime(prefs.soundId, prefs.volume)}
          />
          {osDenied && (
            <p className="mt-2 text-xs text-amber-300">
              OS 通知は許可されていません（音と振動は有効）。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
