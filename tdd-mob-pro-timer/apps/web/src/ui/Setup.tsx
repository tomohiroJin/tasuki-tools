/**
 * セットアップ画面（名前だけ）
 * UX 再設計（2026-06-03 合意フロー）: 最初の画面は「自分の名前 → ルームを作る」だけに絞る。
 * 言語/難易度/交代間隔/オプション/お題はルーム作成後の Lobby で選ぶ（最初の画面で選びすぎない）。
 * FR-001/053/054
 */

import React, { useState } from "react";
import { Sparkles, UserRound } from "lucide-react";
import { Card, PrimaryButton } from "./primitives.js";
import { savePreferences, loadPreferences } from "../prefs/local-prefs.js";

interface SetupProps {
  /** 入力された自分の名前でルームを作成する。 */
  onCreateRoom: (displayName: string) => void;
}

export function Setup({ onCreateRoom }: SetupProps) {
  // 前回の名前を既定として復元する（FR-054）。
  const saved = loadPreferences();
  const [name, setName] = useState(saved?.displayName ?? "");

  const trimmed = name.trim();
  const canProceed = trimmed.length > 0;

  /** ルーム作成。作成前に名前を端末へ保存し次回の既定にする（FR-053）。
   *  言語/難易度/間隔は既存の保存値があれば引き継ぎ、無ければ Lobby 側の既定に委ねる。 */
  const handleCreate = () => {
    if (!canProceed) return;
    savePreferences({
      displayName: trimmed,
      language: saved?.language ?? "TypeScript",
      difficulty: saved?.difficulty ?? "easy",
      members: [trimmed],
      intervalMinutes: saved?.intervalMinutes ?? 5,
    });
    onCreateRoom(trimmed);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-8">
      {/* ブランドヘッダー（グラデーションタイトル） */}
      <header className="text-center">
        <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
          TDD Mob Pro Timer
        </h1>
        <p className="text-white/60 mt-2 text-sm md:text-base">
          モブプロ × TDD でチーム駆動開発
        </p>
      </header>

      <Card>
        <label htmlFor="display-name" className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
          <UserRound className="w-4 h-4 text-fuchsia-400" aria-hidden="true" />
          あなたの名前
        </label>
        <input
          id="display-name"
          aria-label="あなたの名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="例: Tomohiro"
          autoFocus
          className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-white text-lg outline-none focus:border-fuchsia-400 transition-colors"
        />
        <PrimaryButton onClick={handleCreate} disabled={!canProceed} className="w-full mt-4 text-lg py-3">
          <span className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            ルームを作る
          </span>
        </PrimaryButton>
        <p className="mt-3 text-center text-xs text-white/60">
          言語・難易度・お題・交代間隔は次のロビー画面で決められます。
        </p>
      </Card>
    </div>
  );
}
