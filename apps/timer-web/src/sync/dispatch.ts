/**
 * サーバーメッセージの純粋な振り分け
 * T055(フロント): FR-025, FR-026
 * WebSocket に依存しないため単体テスト可能。client.ts から利用する。
 */

import type { Room, ServerMsg } from "@tasuki/timer-core";
import type { Identity } from "./client.js";
import type { NoticeSignal } from "./notice-message.js";

export interface ServerMessageCallbacks {
  onRoom?: (room: Room) => void;
  onIdentity?: (identity: Identity) => void;
  onError?: (code: string, message: string) => void;
  /** need-problem 受信時（代表に選ばれたとき）に呼ばれる */
  onNeedProblem?: (requestId: string, deadlineMs: number) => void;
  /** time.pong 受信時。clockOffset 推定に使う */
  onTimePong?: (serverTime: number) => void;
  /** 交代シグナル（演出用） */
  onSwitchSignal?: (nextDriverName: string) => void;
  /** 破壊的操作の実行者を伝えるシグナル（Issue #22・FR-077）。文言化は呼び出し側が行う */
  onNotice?: (notice: NoticeSignal) => void;
}

/**
 * 受信した生メッセージを解析し、対応するコールバックへ振り分ける。
 * 不正な JSON は黙って無視する（境界の防御）。
 */
export function dispatchServerMessage(
  raw: unknown,
  cb: ServerMessageCallbacks,
): void {
  let msg: ServerMsg;
  try {
    msg = JSON.parse(raw as string) as ServerMsg;
  } catch {
    return;
  }

  switch (msg.type) {
    case "snapshot":
      cb.onRoom?.(msg.room as Room);
      break;
    case "room.created":
      cb.onIdentity?.({
        participantId: msg.participantId,
        resumeToken: msg.resumeToken,
        hostToken: msg.hostToken,
      });
      break;
    case "room.joined":
      cb.onIdentity?.({
        participantId: msg.participantId,
        resumeToken: msg.resumeToken,
      });
      break;
    case "error":
      cb.onError?.(msg.code, msg.message);
      break;
    case "signal":
      if (msg.signal === "need-problem") {
        cb.onNeedProblem?.(msg.requestId, msg.deadlineMs);
      } else if (msg.signal === "switch") {
        cb.onSwitchSignal?.(msg.nextDriverName);
      } else if (msg.signal === "notice") {
        cb.onNotice?.({
          action: msg.action,
          actorName: msg.actorName,
          actorParticipantId: msg.actorParticipantId,
          targetName: msg.targetName,
          targetParticipantId: msg.targetParticipantId,
        });
      }
      break;
    case "time.pong":
      cb.onTimePong?.(msg.serverTime);
      break;
  }
}
