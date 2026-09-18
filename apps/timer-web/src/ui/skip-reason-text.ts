/**
 * 席の番が回らない理由の見せ方（#276 D11）。
 *
 * **色ではなく文字で示す**（WCAG 1.4.1）。文言は自己ホスト書体の base 層に収まる字だけで
 * 書くこと —— 外れた字が 1 つあるだけで ext 層（約 210KB）を引く（`packages/ui/README.md`）。
 * **「見送り」は使えない**（「送」が base 層に無い。#276 で実測）。既存語彙の「離脱中」
 * （`RosterPanel`）と「接続中 / 再接続中…」（`StatusStrip`）の系列に揃えてある。
 *
 * `reason` は輪の他の席向け、`current` は**その人がいま運転しているとき**の言い方。
 * 現ドライバーに「順番は回りません」と言うと嘘になる。
 *
 * `RotationLineup.tsx` に置かず独立モジュールにしたのは、Task 7 で `TeamOrbit.tsx` が
 * この表を取り込むため。`RotationLineup` から export すると兄弟コンポーネント同士が
 * 依存し合う形になり、依存の向きが不自然になる（制御側の裁定）。
 */
export const SKIP_TEXT = {
  "stood-down": {
    label: "離脱中",
    reason: "一時離脱中のため、ドライバーの順番は回りません",
    current: "一時離脱中です",
  },
  away: {
    label: "別の画面",
    reason: "別の画面を見ているため、ドライバーの順番は回りません",
    current: "別の画面を見ています",
  },
  disconnected: {
    label: "未接続",
    reason: "接続が切れているため、ドライバーの順番は回りません",
    current: "接続が切れています",
  },
} as const;
