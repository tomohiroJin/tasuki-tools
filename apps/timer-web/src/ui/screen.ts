/**
 * room.phase から表示画面を導出する純粋関数
 * 3回目レビュー: 共有セッションで全参加者が phase に追従するようにする（FR-001）
 */

import type { RoomPhase } from "@tasuki/timer-core";

export type Screen = "setup" | "lobby" | "session" | "celebration";

/**
 * サーバー権威の phase を、表示すべき画面に対応付ける。
 * setup/ready はロビー（開始前の待機・お題プレビュー）、
 * session はセッション、celebration は完成画面。
 */
export function screenForPhase(phase: RoomPhase): Screen {
  switch (phase) {
    case "setup":
    case "ready":
      return "lobby";
    case "session":
      return "session";
    case "celebration":
      return "celebration";
  }
}
