/**
 * ロビーのお題設定パネル（言語/難易度/ランダム言語プール）。ConfigPanel から分割（v2.9）。
 * problemEnabled=false（お題なし）のときは言語/難易度/プールを出さない。canEdit=false は読み取り表示。
 */
import React, { useState } from "react";
import { Languages, ChevronDown, Dices } from "lucide-react";
import type { SessionConfig } from "@tasuki/timer-core";
import { GhostButton, SectionHeader } from "../primitives.js";
import {
  loadRandomLanguagePool,
  saveRandomLanguagePool,
} from "../../prefs/local-prefs.js";

const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Java",
  "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift",
];
const DIFFICULTIES = [
  { value: "easy", label: "初級" },
  { value: "medium", label: "中級" },
  { value: "hard", label: "上級" },
];

const SELECT_CLASS =
  "w-full rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-3 py-2.5 text-[var(--bone)] " +
  "outline-none focus:border-[var(--signal)] transition-colors " +
  "focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]";

interface ProblemConfigPanelProps {
  config: SessionConfig;
  canEdit: boolean;
  onChange: (patch: Partial<SessionConfig>) => void;
  problemEnabled: boolean;
}

function difficultyLabel(value: string): string {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? value;
}

export function ProblemConfigPanel({ config, canEdit, onChange, problemEnabled }: ProblemConfigPanelProps) {
  // ランダム対象の言語プール（ホストローカル永続）。チップで増減する。
  // ※ Rules of Hooks: 早期 return より前で必ず呼ぶ。
  const [pool, setPool] = useState<string[]>(() => loadRandomLanguagePool());

  if (!canEdit) {
    return (
      <div className="text-sm text-[var(--bone-muted)]">
        <SectionHeader icon={Languages} color="text-[var(--signal)]" title="お題の設定" />
        {problemEnabled ? (
          <p>{config.language}・{difficultyLabel(config.difficulty)}</p>
        ) : (
          <p className="text-[var(--bone-subtle)]">お題なし</p>
        )}
      </div>
    );
  }

  if (!problemEnabled) {
    return (
      <div>
        <SectionHeader icon={Languages} color="text-[var(--signal)]" title="お題の設定" />
        <p className="text-sm text-[var(--bone-subtle)]">お題なしのため、言語・難易度の設定はありません。</p>
      </div>
    );
  }

  const togglePoolLang = (lang: string) => {
    setPool((prev) => {
      const next = prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang];
      saveRandomLanguagePool(next);
      return next;
    });
  };

  // 言語のみをプールから一様ランダムに選ぶ。プール空なら何もしない。
  const randomizeLanguage = () => {
    if (pool.length === 0) return;
    const lang = pool[Math.floor(Math.random() * pool.length)];
    if (lang) onChange({ language: lang });
  };

  // 難易度のみを一様ランダムに選ぶ。
  const randomizeDifficulty = () => {
    const d = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
    if (d) onChange({ difficulty: d.value });
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon={Languages} color="text-[var(--signal)]" title="お題の設定" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="cfg-language" className="instrument-label">言語</label>
            <GhostButton onClick={randomizeLanguage} aria-label="言語をランダムに選ぶ" className="text-xs px-2 py-1">
              <span className="flex items-center gap-1"><Dices className="w-3.5 h-3.5" aria-hidden="true" /> ランダム</span>
            </GhostButton>
          </div>
          <select
            id="cfg-language"
            value={config.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className={SELECT_CLASS}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} className="bg-[var(--panel)]">{l}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="cfg-difficulty" className="instrument-label">難易度</label>
            <GhostButton onClick={randomizeDifficulty} aria-label="難易度をランダムに選ぶ" className="text-xs px-2 py-1">
              <span className="flex items-center gap-1"><Dices className="w-3.5 h-3.5" aria-hidden="true" /> ランダム</span>
            </GhostButton>
          </div>
          <select
            id="cfg-difficulty"
            value={config.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value })}
            className={SELECT_CLASS}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value} className="bg-[var(--panel)]">{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ランダム対象の言語プール。既定は常用言語。閉じておく。 */}
      <details className="rounded-md bg-[var(--panel-2)] border border-[var(--hairline)]">
        <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--bone)]">
          <Dices className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          ランダム対象の言語
          <ChevronDown className="w-4 h-4 ml-auto text-[var(--bone-subtle)]" aria-hidden="true" />
        </summary>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {LANGUAGES.map((l) => {
            const on = pool.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                aria-label={on ? `ランダム対象から ${l} を外す` : `ランダム対象に ${l} を入れる`}
                onClick={() => togglePoolLang(l)}
                className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-[var(--signal)] text-[#160603] border-[var(--signal)]"
                    : "bg-[var(--panel-2)] text-[var(--bone-muted)] border-[var(--hairline)] hover:bg-[#252934]"
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
