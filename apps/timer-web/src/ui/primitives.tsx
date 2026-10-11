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
export function Stage({ page, children }: { page: "prose" | "default" | "wide"; children: React.ReactNode }) {
  return (
    <div className="instrument-stage stage">
      {/* 器は部品層の `.ui-page`（#316）。段（`prose` 40rem・`default` 72rem・`wide` 96rem）は画面の用途で
          呼び出し側が選ぶ（既定値は置かない。新しい画面を足す人に段を選ばせる）。`stage-inner` は timer の
          計器の縦の余白と重なりの基準だけを持つ。timer は `<main>` ではなくこの `<div>` に器を当てる
          （`<main>` は各画面が持つ）。縦の余白は計器の都合で `.stage-inner` が器の `padding-block` を上書きする。
          `className` は `audit-timer-classes` が読めるよう、枝ごとの文字列リテラルで書く。 */}
      <div
        className={
          page === "wide"
            ? "ui-page ui-page--wide stage-inner"
            : page === "prose"
              ? "ui-page ui-page--prose stage-inner"
              : "ui-page stage-inner"
        }
      >
        {children}
      </div>
    </div>
  );
}

/** 計器パネルの四隅に置く小さなコーナーティック（盤面の位置決めマーク）。装飾なので aria-hidden。 */
function CornerTicks() {
  return (
    <>
      <span className="corner-tick corner-tick-tl" aria-hidden="true" />
      <span className="corner-tick corner-tick-tr" aria-hidden="true" />
      <span className="corner-tick corner-tick-bl" aria-hidden="true" />
      <span className="corner-tick corner-tick-br" aria-hidden="true" />
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
      className={`meter-panel ${className}`}
    >
      <CornerTicks />
      {children}
    </div>
  );
}

/** カード見出し（アイコン＋計器ラベル、右に補助操作）。タイトルは大文字トラッキングの刻印調。 */
export function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div className="section-header-lead">
        <Icon className="section-header-icon" />
        <h2 className="section-header-title">{title}</h2>
      </div>
      {right}
    </div>
  );
}
