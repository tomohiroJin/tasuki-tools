/**
 * セットアップ画面（参考デザイン準拠：没入型ダークステージ）
 * FR-001/002/003/053/054
 *
 * グラデーションタイトル＋glass カード（言語難易度／メンバー／交代間隔）で構成し、
 * 「お題を生成して開始」で共有ルームを作成する。設定は端末に保存し再訪時に復元する。
 */

import React, { useState } from "react";
import { Code, Users, Timer, Sparkles, AlertTriangle, Settings2 } from "lucide-react";
import {
  VALID_INTERVAL_MINUTES,
  MIN_MEMBERS,
  MAX_MEMBERS,
  type IntervalMinutes,
} from "@tdd-mob/core/aggregate";
import type { SessionConfig } from "@tdd-mob/core";
import { Card, PrimaryButton, SectionHeader } from "./primitives.js";
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

/** 休憩リマインダ ON 時の既定の周回間隔（§9.1）。N 巡ごとに休憩を提案する。 */
const DEFAULT_BREAK_EVERY_ROTATIONS = 4;

interface SetupProps {
  onCreateRoom: (config: SessionConfig) => void;
}

interface OptionToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}

/** チェックボックス + 説明文の 1 行オプション。色だけに依存せずラベルで意味を伝える。 */
function OptionToggle({ checked, onChange, label, hint }: OptionToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-fuchsia-500"
      />
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/40">{hint}</span>
      </span>
    </label>
  );
}

const SELECT_CLASS =
  "w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-white " +
  "outline-none focus:border-fuchsia-400 transition-colors";

/** 重複しているメンバー名の index 集合 */
function duplicateIndices(members: string[]): Set<number> {
  const seen = new Map<string, number>();
  const dup = new Set<number>();
  members.forEach((m, i) => {
    const key = m.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) {
      dup.add(i);
      dup.add(seen.get(key)!);
    } else {
      seen.set(key, i);
    }
  });
  return dup;
}

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
  const [language, setLanguage] = useState(saved?.language ?? "TypeScript");
  const [difficulty, setDifficulty] = useState(saved?.difficulty ?? "easy");
  const [interval, setInterval] = useState<IntervalMinutes>(savedInterval);
  // v3.0 追加オプション（§9.1）。既定はすべて OFF（現行のソフトな挙動）。
  const [navigatorEnabled, setNavigatorEnabled] = useState(false);
  const [assertiveSwitch, setAssertiveSwitch] = useState(false);
  const [breakReminder, setBreakReminder] = useState(false);

  const dupes = duplicateIndices(members);
  const allFilled = members.every((m) => m.trim().length > 0);
  const canProceed = allFilled && dupes.size === 0;

  /** メンバー人数を増減する（MIN〜MAX に収める）。 */
  const setCount = (n: number) => {
    const count = Math.max(MIN_MEMBERS, Math.min(MAX_MEMBERS, n));
    const names = [...members];
    while (names.length < count) names.push(`Member ${names.length + 1}`);
    while (names.length > count) names.pop();
    setMembers(names);
  };
  const setName = (index: number, name: string) => {
    const next = [...members];
    next[index] = name;
    setMembers(next);
  };

  const buildConfig = (): SessionConfig => ({
    language,
    difficulty,
    members: members.map((m) => m.trim()),
    intervalMinutes: interval,
    // OFF のフラグは省略し、既定の挙動を維持する（config に余計なキーを乗せない）。
    ...(navigatorEnabled && { navigatorEnabled: true }),
    ...(assertiveSwitch && { assertiveSwitch: true }),
    ...(breakReminder && { breakEveryRotations: DEFAULT_BREAK_EVERY_ROTATIONS }),
  });

  /** ルーム作成。作成前に現在の設定を端末へ保存し、次回の既定にする（FR-053）。 */
  const handleCreate = () => {
    if (!canProceed) return;
    savePreferences({
      displayName: members[0]?.trim() ?? "",
      language,
      difficulty,
      members: members.map((m) => m.trim()),
      intervalMinutes: interval,
    });
    onCreateRoom(buildConfig());
  };

  return (
    <div className="space-y-6">
      {/* ブランドヘッダー（グラデーションタイトル） */}
      <header className="text-center mb-8">
        <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
          TDD Mob Pro Timer
        </h1>
        <p className="text-white/60 mt-2 text-sm md:text-base">
          モブプロ × TDD でチーム駆動開発
        </p>
      </header>

      {/* 言語 & 難易度 */}
      <Card>
        <SectionHeader icon={Code} color="text-fuchsia-400" title="言語 & 難易度" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="language" className="text-sm text-white/60 block mb-2">
              言語
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={SELECT_CLASS}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l} className="bg-slate-900">{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="difficulty" className="text-sm text-white/60 block mb-2">
              難易度
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className={SELECT_CLASS}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value} className="bg-slate-900">{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* メンバー（人数±と名前入力グリッド） */}
      <Card>
        <SectionHeader icon={Users} color="text-violet-400" title={`メンバー (${members.length}人)`} />
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setCount(members.length - 1)}
            aria-label="メンバーを減らす"
            className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-xl"
          >
            −
          </button>
          <span className="text-2xl font-bold w-12 text-center">{members.length}</span>
          <button
            type="button"
            onClick={() => setCount(members.length + 1)}
            aria-label="メンバーを増やす"
            className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-xl"
          >
            +
          </button>
          <span className="text-sm text-white/40 ml-2">({MIN_MEMBERS}〜{MAX_MEMBERS}人)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {members.map((name, i) => {
            const isDup = dupes.has(i);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-500 flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(i, e.target.value)}
                  placeholder={`Member ${i + 1}`}
                  aria-label={`メンバー${i + 1}の名前`}
                  className={`flex-1 bg-white/10 border rounded-lg px-3 py-2 outline-none min-w-0 text-white ${
                    isDup ? "border-red-500/60 focus:border-red-400" : "border-white/20 focus:border-fuchsia-400"
                  }`}
                />
              </div>
            );
          })}
        </div>
        {dupes.size > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-300" role="alert">
            <AlertTriangle className="w-4 h-4" />
            メンバー名が重複しています
          </div>
        )}
      </Card>

      {/* 交代間隔 */}
      <Card>
        <SectionHeader icon={Timer} color="text-cyan-400" title="交代間隔" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="交代間隔">
          {VALID_INTERVAL_MINUTES.map((min: IntervalMinutes) => {
            const selected = interval === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={selected}
                onClick={() => setInterval(min)}
                className={`px-5 py-3 rounded-xl font-bold transition-all ${
                  selected
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {min}分
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-white/40">
          推奨は 5〜10 分。短いほど集中と学習が高まります。
        </p>
      </Card>

      {/* v3.0 追加オプション（ナビゲーター役・強い交代通知・休憩リマインダ） */}
      <Card>
        <SectionHeader icon={Settings2} color="text-emerald-400" title="オプション" />
        <div className="space-y-3">
          <OptionToggle
            checked={navigatorEnabled}
            onChange={setNavigatorEnabled}
            label="ナビゲーター役を明示する"
            hint="次の人をナビゲーター（指示役）として強調表示します。"
          />
          <OptionToggle
            checked={assertiveSwitch}
            onChange={setAssertiveSwitch}
            label="強い交代通知"
            hint="交代の瞬間に全画面で割り込み、見落としを防ぎます。"
          />
          <OptionToggle
            checked={breakReminder}
            onChange={setBreakReminder}
            label={`休憩リマインダ（${DEFAULT_BREAK_EVERY_ROTATIONS}巡ごと）`}
            hint="長時間セッションで定期的に休憩を提案します。"
          />
        </div>
      </Card>

      {/* アクション（共有ルーム作成） */}
      <div className="flex justify-end">
        <PrimaryButton onClick={handleCreate} disabled={!canProceed} className="text-lg px-8 py-4">
          <span className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            ルームを作成
          </span>
        </PrimaryButton>
      </div>
    </div>
  );
}
