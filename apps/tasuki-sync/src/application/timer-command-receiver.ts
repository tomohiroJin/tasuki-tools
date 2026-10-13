/**
 * timer の受け口のアプリケーション側（#368 Task 2）。
 *
 * 接続層（`adapters/ws/tool-channel.ts` の timer の受け口）は、境界の検証（`CommandSchema`）を済ませた
 * コマンドを型のまま渡す。**表示名の正規化（業務の検証）はここで掛ける**。以前は接続層が掛けていたが、
 * アダプタは業務の判断を持たない（`docs/adr/0004`。アダプタの取り込み先は `test/adapter-imports.test.ts` が固定する）。
 *
 * **拒んだときのフレームは、スキーマ違反と同じ `INVALID_COMMAND`（同じ文言）である。** 正規化の置き場を
 * 動かしても、利用者が受け取るフレームは変わらない（`normalize-command-names.ts` の docstring）。
 * 返事は `await` より前に同期に送る（接続層に正規化があった頃と同じ順番）。
 */
import type { Command, ServerMsg } from "@tasuki/timer-core";
import { CONNECTION_ERROR_TEXT } from "./connection-errors.js";
import { normalizeCommandNames } from "./normalize-command-names.js";

export interface TimerCommandReceiverDeps {
  /** 送ってきた接続だけへ 1 通返す。 */
  reply(connId: string, msg: ServerMsg): void;
  /** 正規化を通ったコマンドの振り分け（在室の ping とハンドラ）。 */
  route(connId: string, cmd: Command): Promise<void>;
}

/** timer のコマンドを受け、表示名を正規化してから振り分けへ渡す関数を作る。 */
export function createTimerCommandReceiver(
  deps: TimerCommandReceiverDeps,
): (connId: string, cmd: Command) => Promise<void> {
  return async (connId, cmd) => {
    const normalized = normalizeCommandNames(cmd);
    if (normalized.isErr()) {
      deps.reply(connId, {
        type: "error",
        code: "INVALID_COMMAND",
        message: CONNECTION_ERROR_TEXT.INVALID_COMMAND,
      });
      return;
    }
    await deps.route(connId, normalized.value);
  };
}
