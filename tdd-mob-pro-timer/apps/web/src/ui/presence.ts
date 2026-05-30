/**
 * 在室状況の表示ヘルパー
 * 色のみで状態を伝えないよう、テキストラベルを提供する（WCAG 1.4.1）
 */

import type { Participant } from "@tdd-mob/core";

export type Presence = Participant["presence"];

const LABELS: Record<Presence, string> = {
  online: "オンライン",
  idle: "離席",
  offline: "オフライン",
};

export function presenceLabel(p: Presence): string {
  return LABELS[p];
}

/** 在室状況に対応するセマンティックカラーの Tailwind クラス（ドット用） */
export function presenceDotClass(p: Presence): string {
  return {
    online: "bg-presence-online",
    idle: "bg-presence-idle",
    offline: "bg-presence-offline",
  }[p];
}
