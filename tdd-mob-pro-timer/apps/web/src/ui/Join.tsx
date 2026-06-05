/**
 * 参加画面（?room= リンクからの参加・UX 再設計）
 * リンクで来た人が「名前を入れてモブに参加」する 1 画面。ゲスト自動参加は廃止。
 * 参加後は editor（ドライバー候補）として参加者一覧に並ぶ（ローテーション加入は別操作）。
 */

import React, { useState } from "react";
import { LogIn, UserRound } from "lucide-react";
import { Card, PrimaryButton } from "./primitives.js";
import { savePreferences, loadPreferences } from "../prefs/local-prefs.js";
import { MAX_DISPLAY_NAME } from "@tdd-mob/core/aggregate";

interface JoinProps {
  code: string;
  onJoin: (displayName: string) => void;
}

export function Join({ code, onJoin }: JoinProps) {
  const saved = loadPreferences();
  const [name, setName] = useState(saved?.displayName ?? "");

  const trimmed = name.trim();
  const canJoin = trimmed.length > 0;

  const handleJoin = () => {
    if (!canJoin) return;
    // 次回の既定にするため名前を保存する（FR-053）。他の設定は既存値を引き継ぐ。
    savePreferences({
      displayName: trimmed,
      language: saved?.language ?? "TypeScript",
      difficulty: saved?.difficulty ?? "easy",
      members: saved?.members?.length ? saved.members : [trimmed],
      intervalMinutes: saved?.intervalMinutes ?? 5,
    });
    onJoin(trimmed);
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
          className="w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-4 py-3 text-[var(--bone)] text-lg outline-none focus:border-[var(--signal)] transition-colors"
        />
        <PrimaryButton onClick={handleJoin} disabled={!canJoin} className="w-full mt-4 text-lg py-3">
          <span className="flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" />
            モブに参加
          </span>
        </PrimaryButton>
        <p className="mt-3 text-center text-xs text-[var(--bone-subtle)]">
          参加後は「ドライバーに加わる」で交代の輪に入れます。見学だけでも OK です。
        </p>
      </Card>
    </div>
  );
}
