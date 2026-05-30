/**
 * Broadcaster ポート — 参加者へのメッセージ配信
 */

import type { ServerMsg, Room } from "@tdd-mob/core";

export interface Broadcaster {
  /** ルームの全参加者（接続中）へスナップショットを配信する */
  broadcastSnapshot(roomCode: string, room: Room): void;

  /** 特定の接続へメッセージを送信する */
  sendTo(connId: string, msg: ServerMsg): void;

  /** ルームの全参加者へシグナルを送信する */
  broadcastSignal(roomCode: string, msg: ServerMsg): void;
}
