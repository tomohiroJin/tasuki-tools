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
import { MAX_DISPLAY_NAME, MAX_ROOM_NAME } from "@tdd-mob/core/aggregate";

interface SetupProps {
  /** 入力された自分の名前（と任意のルーム名）でルームを作成する。 */
  onCreateRoom: (displayName: string, roomName?: string) => void;
}

export function Setup({ onCreateRoom }: SetupProps) {
  // 前回の名前を既定として復元する（FR-054）。
  const saved = loadPreferences();
  const [name, setName] = useState(saved?.displayName ?? "");
  const [roomName, setRoomName] = useState("");

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
    onCreateRoom(trimmed, roomName.trim() || undefined);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-8">
      {/* ブランドヘッダー（計器の機材名としての刻印＋型番ライン） */}
      <header className="text-center">
        <p className="instrument-label mb-2 text-[var(--signal)]">Mob Chronometer</p>
        <h1 className="brand-title font-black text-[var(--bone)]">
          TDD Mob Pro Timer
        </h1>
        <p className="text-[var(--bone-muted)] mt-2 text-sm md:text-base">
          モブプロ × TDD でチーム駆動開発
        </p>
        {/* 初回の一言（R5-2）。気軽に始められることを伝える。 */}
        <p className="mt-2 text-xs text-[var(--bone-subtle)]">
          ルームを作って共有するだけ。アカウント登録は不要です。
        </p>
      </header>

      <Card>
        <label htmlFor="display-name" className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)] mb-3">
          <UserRound className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
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
          maxLength={MAX_DISPLAY_NAME}
          className="w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-4 py-3 text-[var(--bone)] text-lg outline-none focus:border-[var(--signal)] transition-colors"
        />
        <label htmlFor="room-name" className="mt-4 block text-sm font-semibold text-[var(--bone)] mb-2">
          ルーム名（任意）
        </label>
        <input
          id="room-name"
          aria-label="ルーム名"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="例: 朝会モブ（未入力ならランダムなコード）"
          maxLength={MAX_ROOM_NAME}
          className="w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-4 py-2.5 text-[var(--bone)] outline-none focus:border-[var(--signal)] transition-colors"
        />
        <PrimaryButton onClick={handleCreate} disabled={!canProceed} className="w-full mt-4 text-lg py-3">
          <span className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            ルームを作る
          </span>
        </PrimaryButton>
        <p className="mt-3 text-center text-xs text-[var(--bone-subtle)]">
          言語・難易度・お題・交代間隔は次のロビー画面で決められます。
        </p>
      </Card>
    </div>
  );
}
