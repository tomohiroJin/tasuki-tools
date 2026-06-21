/**
 * 交代通知の個人設定ポップオーバー（StatusStrip の歯車から開く）。
 * ルーム設定 assertiveSwitch とは独立。ON/OFF・通知音選択・試聴・OS通知 ON/OFF を提供し、
 * 変更は即 localStorage へ保存する（次回フック読み込み時に反映）。
 */

import React, { useEffect, useRef, useState } from "react";
import { Settings, Volume2 } from "lucide-react";
import {
  loadNotifyPreferences,
  saveNotifyPreferences,
  type NotifyPreferences,
} from "../../prefs/local-prefs.js";
import { CHIMES, playChime } from "../../platform/sound.js";
import { requestNotificationPermission } from "../../platform/notify.js";
import { useFocusTrap } from "../useFocusTrap.js";

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

  const update = (patch: Partial<NotifyPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifyPreferences(next);
    return next;
  };

  const toggleEnabled = async () => {
    const next = update({ enabled: !prefs.enabled });
    if (next.enabled && next.osNotify) {
      const granted = await requestNotificationPermission();
      setOsDenied(!granted);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="通知設定"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--bone-subtle)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="交代通知の設定"
          className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] p-3 text-sm text-[var(--bone)] shadow-lg"
        >
          {/* ON/OFF トグル（role="switch" + aria-checked で a11y 準拠） */}
          <label className="flex items-center justify-between gap-2">
            <span>交代を音で知らせる</span>
            <button
              type="button"
              role="switch"
              aria-label="交代を音で知らせる"
              aria-checked={prefs.enabled}
              onClick={() => void toggleEnabled()}
              className={`h-5 w-9 rounded-full transition-colors ${prefs.enabled ? "bg-[var(--signal)]" : "bg-[var(--panel-2)]"}`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition-transform ${prefs.enabled ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </label>

          {/* 通知音セレクト＋試聴ボタン */}
          <div className="mt-3">
            <label htmlFor="notify-sound" className="instrument-label">
              通知音
            </label>
            <div className="mt-1 flex gap-2">
              <select
                id="notify-sound"
                aria-label="通知音"
                value={prefs.soundId}
                onChange={(e) => update({ soundId: e.target.value })}
                className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--bone)]"
              >
                {CHIMES.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.isReady}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="試聴"
                onClick={() => playChime(prefs.soundId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--hairline)] text-[var(--bone-muted)] hover:bg-[var(--panel-2)]"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* OS 通知トグル */}
          <label className="mt-3 flex items-center justify-between gap-2">
            <span>背面タブで OS 通知</span>
            <input
              type="checkbox"
              aria-label="背面タブで OS 通知"
              checked={prefs.osNotify}
              onChange={(e) => update({ osNotify: e.target.checked })}
            />
          </label>
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
