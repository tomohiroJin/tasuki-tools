/**
 * サーバーメッセージの純粋な振り分け
 * T055(フロント): FR-025, FR-026
 * WebSocket に依存しないため単体テスト可能。client.ts から利用する。
 */

import * as v from "valibot";
import { ServerMsgSchema } from "@tasuki/timer-core";
import type { Room } from "@tasuki/timer-core";
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
 *
 * **契約（`ServerMsgSchema`）に通してから振り分ける（#181・憲法 原則 IV）。**
 * ここは以前 `JSON.parse(...) as ServerMsg` という型アサーションだけで、
 * 防いでいたのは `JSON.parse` の例外だけだった。**JSON として読めることと、
 * 契約を満たすことは別である。** 形の違う JSON は素通りし、`msg.room` の
 * キャストを通って壊れた値がそのまま画面の状態になっていた。
 *
 * 落ちたフレームは黙って捨てる。逆方向（クライアント → サーバー）が
 * `ws-adapter.ts` で `parseBoundaryMessage(CommandSchema, ...)` を通すのと対になる。
 */
export function dispatchServerMessage(
  raw: unknown,
  cb: ServerMessageCallbacks,
): void {
  let json: unknown;
  try {
    json = JSON.parse(raw as string);
  } catch {
    return;
  }

  const parsed = v.safeParse(ServerMsgSchema, json);
  if (!parsed.success) return;
  const msg = parsed.output;

  switch (msg.type) {
    case "snapshot":
      // **このキャストは検証済みの値に対するものになった（#181）。** 以前は生の
      // `JSON.parse` の結果を素通しさせていたが、いまは `ServerMsgSchema` を
      // 通った値だけがここへ来る。
      //
      // それでも外せない。`tsconfig` の `exactOptionalPropertyTypes: true` の下では、
      // スキーマが推論する任意項目は `T | undefined` になり、`Room` 側の
      // `T`（値が無いなら key ごと無い）へ代入できないため（実測: 外すと
      // `config.navigatorEnabled` で TS2379）。**形の検査はもう済んでいて、
      // 残っているのは任意項目の表し方の違いだけである。**
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
