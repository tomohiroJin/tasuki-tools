/**
 * ロビーのセッション設定パネル（UX 再設計）
 * 言語/難易度/交代間隔 + 詳細設定(ナビゲーター/強い交代通知/休憩リマインダ) を host が決める。
 * 変更は onChange(patch) で通知し、呼び出し側が config.set を送る。
 * canEdit=false（観覧者・非ホスト）では現在値を読み取り表示する。
 */

import React from "react";
import { Settings2, Languages, ChevronDown, Dices } from "lucide-react";
import { VALID_INTERVAL_MINUTES, type IntervalMinutes } from "@tdd-mob/core/aggregate";
import type { SessionConfig } from "@tdd-mob/core";
import { GhostButton, SectionHeader } from "../primitives.js";

const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Java",
  "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift",
];
const DIFFICULTIES = [
  { value: "easy", label: "初級" },
  { value: "medium", label: "中級" },
  { value: "hard", label: "上級" },
];
/** 休憩リマインダ ON 時の既定の周回間隔。0 は OFF。 */
const DEFAULT_BREAK_EVERY_ROTATIONS = 4;

const SELECT_CLASS =
  "w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-white " +
  "outline-none focus:border-fuchsia-400 transition-colors";

interface ConfigPanelProps {
  config: SessionConfig;
  canEdit: boolean;
  onChange: (patch: Partial<SessionConfig>) => void;
}

function difficultyLabel(value: string): string {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? value;
}

export function ConfigPanel({ config, canEdit, onChange }: ConfigPanelProps) {
  if (!canEdit) {
    return (
      <div className="text-sm text-white/70">
        <SectionHeader icon={Languages} color="text-cyan-400" title="セッション設定" />
        <p>
          {config.language}・{difficultyLabel(config.difficulty)}・{config.intervalMinutes}分
        </p>
      </div>
    );
  }

  const navigatorEnabled = config.navigatorEnabled === true;
  const assertiveSwitch = config.assertiveSwitch === true;
  const breakOn = (config.breakEveryRotations ?? 0) >= 1;

  // 言語・難易度をランダムに決める（③ 復活）。迷ったとき用。
  const randomize = () => {
    const lang = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)] ?? config.language;
    const diff = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)]?.value ?? config.difficulty;
    onChange({ language: lang, difficulty: diff });
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Languages}
        color="text-cyan-400"
        title="セッション設定"
        right={
          <GhostButton onClick={randomize} aria-label="設定をランダムに決める" className="text-sm">
            <span className="flex items-center gap-1.5"><Dices className="w-4 h-4" /> ランダム</span>
          </GhostButton>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cfg-language" className="text-sm text-white/60 block mb-2">言語</label>
          <select
            id="cfg-language"
            value={config.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className={SELECT_CLASS}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} className="bg-slate-900">{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cfg-difficulty" className="text-sm text-white/60 block mb-2">難易度</label>
          <select
            id="cfg-difficulty"
            value={config.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value })}
            className={SELECT_CLASS}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value} className="bg-slate-900">{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="text-sm text-white/60 mb-2">交代間隔</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="交代間隔">
          {VALID_INTERVAL_MINUTES.map((min: IntervalMinutes) => {
            const selected = config.intervalMinutes === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ intervalMinutes: min })}
                className={`px-4 py-2.5 rounded-xl font-bold transition-all ${
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
        <p className="mt-2 text-xs text-white/60">推奨は 5〜10 分。短いほど集中と学習が高まります。</p>
      </div>

      {/* 詳細設定（オプション3点・既定 OFF）。最初は折りたたみ。 */}
      <details className="rounded-xl bg-white/5 border border-white/10">
        <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium text-white">
          <Settings2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          詳細設定
          <ChevronDown className="w-4 h-4 ml-auto text-white/60" aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-4 pb-4">
          <Toggle
            checked={navigatorEnabled}
            onChange={(v) => onChange({ navigatorEnabled: v })}
            label="ナビゲーター役を明示する"
            hint="次の人をナビゲーター（指示役）として強調表示します。"
          />
          <Toggle
            checked={assertiveSwitch}
            onChange={(v) => onChange({ assertiveSwitch: v })}
            label="強い交代通知"
            hint="交代の瞬間に全画面で割り込み、見落としを防ぎます。"
          />
          <Toggle
            checked={breakOn}
            onChange={(v) => onChange({ breakEveryRotations: v ? DEFAULT_BREAK_EVERY_ROTATIONS : 0 })}
            label={`休憩リマインダ（${DEFAULT_BREAK_EVERY_ROTATIONS}巡ごと）`}
            hint="長時間セッションで定期的に休憩を提案します。"
          />
        </div>
      </details>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}

function Toggle({ checked, onChange, label, hint }: ToggleProps) {
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
        <span className="block text-xs text-white/60">{hint}</span>
      </span>
    </label>
  );
}
