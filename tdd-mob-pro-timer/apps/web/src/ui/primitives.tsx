/**
 * 計器（Mob Chronometer）UI の共通プリミティブ
 *
 * 夜のコックピットの精密計器をモチーフにした視覚言語:
 * - Stage（ほぼ黒の盤面＋製図グリッド＋グレイン＋ビネット。地は index.css の .instrument-stage）
 * - Card（計器パネル: ヘアライン枠＋コーナーティック＋内側の僅かな立ち上がり）
 * - 主操作はシグナル朱、副操作はスチール枠のゴースト
 * 全画面でこれらを使い、単一アクセント（朱）と等幅刻印で一貫した「計測器」感を出す。
 */

import React from "react";
import type { LucideIcon } from "lucide-react";

/** 全画面共通の舞台。計器盤面（grid+grain+vignette は CSS の ::before/::after）＋中央寄せコンテナ。 */
export function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="instrument-stage text-[var(--bone)]">
      {/* PC を主役にするため広めに。Setup/Join/Summary は内側で max-w-md 等を維持。 */}
      <div className="relative max-w-6xl mx-auto px-4 py-10 md:py-12">{children}</div>
    </div>
  );
}

/** 計器パネルの四隅に置く小さなコーナーティック（盤面の位置決めマーク）。装飾なので aria-hidden。 */
function CornerTicks() {
  const base = "pointer-events-none absolute h-2.5 w-2.5";
  const c = "border-[rgba(236,232,220,0.22)]";
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t ${c}`} aria-hidden="true" />
      <span className={`${base} right-2 top-2 border-r border-t ${c}`} aria-hidden="true" />
      <span className={`${base} left-2 bottom-2 border-l border-b ${c}`} aria-hidden="true" />
      <span className={`${base} right-2 bottom-2 border-r border-b ${c}`} aria-hidden="true" />
    </>
  );
}

/** 計器パネル。ヘアライン枠＋四隅ティック＋上端の僅かな立ち上がり（盤面のベゼル）。 */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-6 md:p-7 shadow-[inset_0_1px_0_rgba(236,232,220,0.05),0_10px_30px_rgba(0,0,0,0.5)] ${className}`}
    >
      <CornerTicks />
      {children}
    </div>
  );
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

/** 主操作ボタン（シグナル朱・実体ボタン＝計測開始/確定の唯一の朱）。 */
export function PrimaryButton({ children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center px-6 py-3 rounded-md font-bold tracking-wide text-[#160603] bg-[var(--signal)] hover:bg-[#ff6147] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_0_1px_rgba(255,74,46,0.5),0_6px_20px_var(--signal-glow)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 副操作ボタン（スチール枠のゴースト）。 */
export function GhostButton({ children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center px-4 py-2 min-h-[44px] sm:min-h-0 rounded-md font-medium text-[var(--bone)] bg-[var(--panel-2)] hover:bg-[#252934] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 border border-[var(--hairline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] ${className}`}
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
      className={`w-11 h-11 sm:w-9 sm:h-9 rounded-md bg-[var(--panel-2)] hover:bg-[#252934] flex items-center justify-center text-[var(--bone-muted)] transition-all border border-[var(--hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** カード見出し（アイコン＋計器ラベル、右に補助操作）。タイトルは大文字トラッキングの刻印調。 */
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
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${color}`} />
        <h2 className="font-bold text-base tracking-wide text-[var(--bone)]">{title}</h2>
      </div>
      {right}
    </div>
  );
}
