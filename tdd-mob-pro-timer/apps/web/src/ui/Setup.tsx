/**
 * セットアップ画面
 * T058: FR-001, FR-009, FR-010 ＋ デザインシステム適用
 */

import React, { useState } from "react";
import {
  VALID_INTERVAL_MINUTES,
  MIN_MEMBERS,
  MAX_MEMBERS,
  type IntervalMinutes,
} from "@tdd-mob/core/aggregate";
import type { SessionConfig } from "@tdd-mob/core";
import { Button } from "./components/Button.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { savePreferences, loadPreferences } from "../prefs/local-prefs.js";

const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Java",
  "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift",
];

const DIFFICULTIES = [
  { value: "easy", label: "初級" },
  { value: "medium", label: "中級" },
  { value: "hard", label: "上級" },
];

interface SetupProps {
  onCreateRoom: (config: SessionConfig) => void;
}

const SELECT_CLASS =
  "w-full min-h-11 rounded-md border border-line bg-surface px-3 text-fg " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Setup({ onCreateRoom }: SetupProps) {
  // 前回保存した設定を既定として復元する（FR-054）。未保存なら標準既定。
  const saved = loadPreferences();
  const savedInterval = VALID_INTERVAL_MINUTES.includes(
    saved?.intervalMinutes as IntervalMinutes,
  )
    ? (saved!.intervalMinutes as IntervalMinutes)
    : (5 as IntervalMinutes);

  const [members, setMembers] = useState<string[]>(
    saved?.members?.length ? saved.members : ["Alice", "Bob"],
  );
  const [newMember, setNewMember] = useState("");
  const [language, setLanguage] = useState(saved?.language ?? "TypeScript");
  const [difficulty, setDifficulty] = useState(saved?.difficulty ?? "easy");
  const [interval, setInterval] = useState<IntervalMinutes>(savedInterval);
  const [error, setError] = useState("");

  const addMember = () => {
    const trimmed = newMember.trim();
    if (!trimmed) return setError("名前を入力してください");
    if (members.includes(trimmed)) return setError("この名前はすでに使われています");
    if (members.length >= MAX_MEMBERS) return setError(`メンバーは最大${MAX_MEMBERS}人までです`);
    setMembers([...members, trimmed]);
    setNewMember("");
    setError("");
  };

  const removeMember = (index: number) => {
    if (members.length <= MIN_MEMBERS) return setError(`メンバーは最低${MIN_MEMBERS}人必要です`);
    setMembers(members.filter((_, i) => i !== index));
    setError("");
  };

  const buildConfig = (): SessionConfig => ({
    language,
    difficulty,
    members,
    intervalMinutes: interval,
  });

  /** ルーム作成。作成前に現在の設定を端末へ保存し、次回の既定にする（FR-053）。 */
  const handleCreate = () => {
    savePreferences({
      displayName: members[0] ?? "",
      language,
      difficulty,
      members,
      intervalMinutes: interval,
    });
    onCreateRoom(buildConfig());
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      {/* ブランドヘッダー（R2）。他フェーズ（ステージ）と視覚言語を繋ぐため、
          アクセントのマーク＋サブタイトルで第一印象に基調を与える。 */}
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="flex items-center gap-2 text-xl font-bold text-fg">
            <span
              aria-hidden="true"
              className="inline-block h-5 w-1.5 rounded-full bg-accent"
            />
            TDD Mob Pro Timer
          </h1>
          <p className="text-sm text-fg-subtle">モブプロの TDD 交代タイマー</p>
        </div>
        <ThemeToggle />
      </header>

      {/* 言語 */}
      <div>
        <label className="mb-1 block text-sm font-medium text-fg" htmlFor="language">
          言語
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={SELECT_CLASS}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* 難易度 */}
      <div>
        <label className="mb-1 block text-sm font-medium text-fg" htmlFor="difficulty">
          難易度
        </label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className={SELECT_CLASS}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* 交代間隔（セグメント） */}
      <div>
        <span className="mb-1 block text-sm font-medium text-fg">交代間隔</span>
        <div className="flex gap-2" role="group" aria-label="交代間隔">
          {VALID_INTERVAL_MINUTES.map((min: IntervalMinutes) => {
            const selected = interval === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={selected}
                onClick={() => setInterval(min)}
                className={`min-h-11 flex-1 rounded-md border text-sm font-medium
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${
                    selected
                      ? "border-primary bg-primary text-on-primary"
                      : "border-line bg-surface text-fg"
                  }`}
              >
                {min}分
              </button>
            );
          })}
        </div>
      </div>

      {/* メンバー */}
      <div>
        <span className="mb-1 block text-sm font-medium text-fg">
          メンバー ({members.length}/{MAX_MEMBERS})
        </span>
        <div className="mb-2 flex gap-2">
          <input
            type="text"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
            placeholder="名前を入力"
            aria-label="新しいメンバー名"
            className="min-h-11 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="md" onClick={addMember}>追加</Button>
        </div>
        <ul className="space-y-1">
          {members.map((m, i) => (
            <li
              key={m}
              className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-fg"
            >
              <span>{m}</span>
              <button
                type="button"
                onClick={() => removeMember(i)}
                aria-label={`${m}を削除`}
                className="flex h-9 w-9 items-center justify-center rounded-md text-danger hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="mt-1 text-sm text-danger" role="alert">{error}</p>
        )}
      </div>

      {/* アクション（ソロ練習は v2 で非推奨化し入口を閉鎖。共有ルーム一本に統一） */}
      <div className="flex gap-3">
        <Button intent="primary" className="flex-1" onClick={handleCreate}>
          ルームを作成
        </Button>
      </div>
    </div>
  );
}
