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
  const [members, setMembers] = useState<string[]>(["Alice", "Bob"]);
  const [newMember, setNewMember] = useState("");
  const [language, setLanguage] = useState("TypeScript");
  const [difficulty, setDifficulty] = useState("easy");
  const [interval, setInterval] = useState<IntervalMinutes>(5);
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

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-fg">TDD Mob Pro Timer</h1>
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
        <Button intent="primary" className="flex-1" onClick={() => onCreateRoom(buildConfig())}>
          ルームを作成
        </Button>
      </div>
    </div>
  );
}
