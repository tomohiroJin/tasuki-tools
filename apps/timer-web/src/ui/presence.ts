/**
 * 在室状況の表示ヘルパー
 * 色のみで状態を伝えないよう、テキストラベルを提供する（WCAG 1.4.1）
 */

import type { Participant } from "@tasuki/timer-core";

export type Presence = Participant["presence"];

const LABELS: Record<Presence, string> = {
  online: "オンライン",
  idle: "離席",
  offline: "オフライン",
};

export function presenceLabel(p: Presence): string {
  return LABELS[p];
}

/** 在室状況に対応するセマンティックカラーの Tailwind クラス（ドット用・背景色） */
export function presenceDotClass(p: Presence): string {
  return {
    online: "bg-presence-online",
    idle: "bg-presence-idle",
    offline: "bg-presence-offline",
  }[p];
}

/** 在室状況に対応するセマンティックカラーの Tailwind クラス（テキスト用・文字色）。
 *  presenceDotClass の文字列置換に頼らず専用関数として持つことで、片方の実装変更で
 *  静かに壊れるのを防ぐ。トークン（presence-*）は dot と同じ色を指す。 */
export function presenceTextClass(p: Presence): string {
  return {
    online: "text-presence-online",
    idle: "text-presence-idle",
    offline: "text-presence-offline",
  }[p];
}
