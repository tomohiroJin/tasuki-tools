/**
 * 参加画面（?room= リンクからの参加・UX 再設計）
 * リンクで来た人が「名前を入れてモブに参加」する 1 画面。ゲスト自動参加は廃止。
 * 参加後は editor（ドライバー候補）として参加者一覧に並ぶ（ローテーション加入は別操作）。
 */

import React, { useState } from "react";
import { LogIn, UserRound, KeyRound } from "lucide-react";
import { Card, PrimaryButton } from "./primitives.js";
import { savePreferences, loadPreferences } from "../prefs/local-prefs.js";
import { MAX_DISPLAY_NAME } from "@tasuki/timer-core/aggregate";

interface JoinProps {
  code: string;
  // パスフレーズは任意（未設定ルームでは空文字のまま渡す）。
  // mode: ドライバーとして参加するか見学で参加するかを必須選択（Task 14）。
  onJoin: (displayName: string, passphrase: string, mode: "driver" | "spectator") => void;
}

export function Join({ code, onJoin }: JoinProps) {
  const saved = loadPreferences();
  const [name, setName] = useState(saved?.displayName ?? "");
  // ルームにパスフレーズが設定されている場合のみ必要な任意入力（FR R4-2）。
  const [passphrase, setPassphrase] = useState("");
  // 参加方法の選択（null = 未選択。必須選択のため参加ボタンは null の間は無効）。
  const [mode, setMode] = useState<"driver" | "spectator" | null>(null);

  const trimmed = name.trim();
  const canJoin = trimmed.length > 0 && mode !== null;

  const handleJoin = () => {
    if (!canJoin) return;
    // 次回の既定にするため名前を保存する（FR-053）。他の設定は既存値を引き継ぐ。
    savePreferences({
      displayName: trimmed,
      language: saved?.language ?? "TypeScript",
      difficulty: saved?.difficulty ?? "easy",
      members: saved?.members?.length ? saved.members : [trimmed],
      intervalMinutes: saved?.intervalMinutes ?? 7,
    });
    // mode は canJoin が true の時点で null でないことが保証される。
    onJoin(trimmed, passphrase.trim(), mode!);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-8">
      <header className="text-center">
        <p className="instrument-label mb-2 text-[var(--signal)]">Join Session</p>
        <h1 className="brand-title font-black text-[var(--bone)]">
          モブに参加
        </h1>
        <p className="text-[var(--bone-muted)] mt-2 text-sm">
          ルーム <span className="tabular font-bold text-[var(--signal)]">{code}</span> に参加します
        </p>
      </header>

      <Card>
        <label htmlFor="join-name" className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)] mb-3">
          <UserRound className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          あなたの名前
        </label>
        <input
          id="join-name"
          aria-label="あなたの名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleJoin();
          }}
          placeholder="例: Bob"
          autoFocus
          maxLength={MAX_DISPLAY_NAME}
          className="w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-4 py-3 text-[var(--bone)] text-lg outline-none focus:border-[var(--signal)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
        />
        <label htmlFor="join-passphrase" className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)] mt-4 mb-3">
          <KeyRound className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          パスフレーズ（設定されている場合）
        </label>
        <input
          id="join-passphrase"
          aria-label="パスフレーズ（設定されている場合）"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleJoin();
          }}
          placeholder="未設定なら空のままで OK"
          className="w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-4 py-3 text-[var(--bone)] text-lg outline-none focus:border-[var(--signal)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
        />
        {/* 参加方法の必須選択（Task 14）: ドライバーとして参加するか見学のみかを先に決める */}
        <fieldset className="mt-4">
          <legend className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)] mb-2">
            どう参加しますか？
          </legend>
          <div className="flex gap-2" role="radiogroup" aria-label="参加方法">
            <label
              className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                mode === "driver"
                  ? "border-[var(--signal)] bg-[rgba(255,74,46,0.12)]"
                  : "border-[var(--hairline-strong)] bg-[var(--panel-2)]"
              }`}
            >
              <input
                type="radio"
                name="join-mode"
                className="sr-only"
                aria-label="ドライバーとして参加"
                checked={mode === "driver"}
                onChange={() => setMode("driver")}
              />
              ドライバーとして参加
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                mode === "spectator"
                  ? "border-[var(--signal)] bg-[rgba(255,74,46,0.12)]"
                  : "border-[var(--hairline-strong)] bg-[var(--panel-2)]"
              }`}
            >
              <input
                type="radio"
                name="join-mode"
                className="sr-only"
                aria-label="見学で参加"
                checked={mode === "spectator"}
                onChange={() => setMode("spectator")}
              />
              見学で参加
            </label>
          </div>
          {mode === null && (
            <p className="mt-1 text-xs text-[var(--bone-subtle)]">参加方法を選んでください。</p>
          )}
        </fieldset>
        <PrimaryButton onClick={handleJoin} disabled={!canJoin} className="w-full mt-4 text-lg py-3">
          <span className="flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" aria-hidden="true" />
            モブに参加
          </span>
        </PrimaryButton>
        <p className="mt-3 text-center text-xs text-[var(--bone-subtle)]">
          ドライバーは後から加入/離脱できます
        </p>
      </Card>
    </div>
  );
}
