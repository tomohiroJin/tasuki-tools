/**
 * 没入型ステージ UI の共通プリミティブ（参考デザイン準拠）
 *
 * Stage（グラデ背景＋浮遊 orbs）・Card（glassmorphism）・各種ボタン・SectionHeader。
 * 全画面でこれらを使い、一貫した視覚言語（ダーク基調・glass・fuchsia/violet/cyan アクセント）を実現する。
 */

import React from "react";
import type { LucideIcon } from "lucide-react";

/** 背景の浮遊する光の玉（drift アニメ）。reduced-motion で静止する。 */
export function BackgroundOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-fuchsia-500/15 blur-3xl animate-drift-1" />
      <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-3xl animate-drift-2" />
      <div className="absolute top-1/3 right-1/4 w-[340px] h-[340px] rounded-full bg-violet-500/20 blur-3xl animate-drift-3" />
    </div>
  );
}

/** 全画面共通の舞台。ダークグラデ＋orbs＋中央寄せコンテナ（max-w-5xl）。 */
export function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-white relative">
      <BackgroundOrbs />
      <div className="relative max-w-5xl mx-auto px-4 py-8">{children}</div>
    </div>
  );
}

/** glassmorphism カード。 */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 ${className}`}
    >
      {children}
    </div>
  );
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

/** 主操作ボタン（fuchsia→violet グラデ＋発光）。 */
export function PrimaryButton({ children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-500 to-violet-500 hover:from-fuchsia-400 hover:to-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-fuchsia-500/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 副操作ボタン（glass）。 */
export function GhostButton({ children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-xl font-medium bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-all border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** アイコンのみの正方ボタン。 */
export function IconButton({
  children,
  title,
  className = "",
  ...rest
}: BtnProps & { title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** カード見出し（アイコン＋タイトル、右に補助操作）。 */
export function SectionHeader({
  icon: Icon,
  color,
  title,
  right,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="font-bold text-lg">{title}</h2>
      </div>
      {right}
    </div>
  );
}
