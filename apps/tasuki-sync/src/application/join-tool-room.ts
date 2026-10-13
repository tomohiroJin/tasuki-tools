/**
 * ツールの入口（hub・topic・roulette）から来た `room.join` の流れ（#366）。
 *
 * 3 つの入口は同じ流れを写して持っていた（入口を足すたびに前のハンドラから写した）。違うのは次の 3 つだけで、
 * 引数で受ける。
 *
 * - ツール ID（ハブは「どのツールでもない」`TOOL_HUB`）
 * - 返事を送る口（ハブは `hub.sendTo`、お題とルーレットはそれぞれの `send`）
 * - 参加の後に本人へ送る 1 通（いまのお題・いまのルーレットの状態）
 *
 * **timer の `room.join` はここを通らない。** timer の状態を作り、snapshot を返すので流れが違う
 * （`command-handlers/room-join.ts`）。参加の判定そのもの（レート制限・合言葉の関門・復帰）は、全ての入口で
 * `join-room.ts` を通る。入口ごとに送るフレームは `test/live-ws.join-entries.test.ts` が固定している。
 */
import type { HubCommand, HubServerMsg, ToolId } from "@tasuki/room-core";
import { CONNECTION_ERROR_TEXT } from "./connection-errors.js";
import { applyDisplayNameRule, INVALID_DISPLAY_NAME_MESSAGE } from "./display-name-rule.js";
import { joinFailureMessage, joinRoom, type JoinRoomDeps, type JoinRoomOutcome } from "./join-room.js";
import { findRoomByConnId } from "./room-lookup.js";
import { saveRoster, type SaveRosterDeps } from "./save-roster.js";

/** 参加の返事。成功（`room.joined`）か失敗（`error`）。**どちらもハブと同じ形**で返す。 */
export type JoinReply = Extract<HubServerMsg, { type: "room.joined" | "error" }>;

export interface JoinToolRoomInput {
  connId: string;
  cmd: Extract<HubCommand, { command: "room.join" }>;
  /** この接続が宣言しているツール。ハブは `TOOL_HUB`（`null`） */
  tool: ToolId | null;
  /** 本人へ返事を送る口 */
  reply: (msg: JoinReply) => void;
  /** 参加できたとき、名簿を保管して配った後に呼ぶ（本人へいまの状態を 1 通送る） */
  afterJoin: (outcome: JoinRoomOutcome) => void;
}

export function joinToolRoom(deps: JoinRoomDeps & SaveRosterDeps, input: JoinToolRoomInput): void {
  const { connId, cmd, reply } = input;

  // 既にどこかのルームに居る接続からの 2 度目の参加は拒み、何も変えない（同じルームでも別のルームでも）。
  // 通すと 1 本のソケットが 2 つのルームに載り（または 2 人の参加者が同じ接続を持ち）、切断の片付けが
  // 片方しか外さず、幽霊の参加者が残ってルームが回収されなくなる（#91 PR 3 Task 5 の特徴づけで実測）。
  // 正規の画面からは届かない（改造したクライアントだけ）ので、形の不正なコマンドと同じ文言で突き返す。
  if (findRoomByConnId(deps.store, connId) !== undefined) {
    reply({ type: "error", code: "INVALID_COMMAND", message: CONNECTION_ERROR_TEXT.INVALID_COMMAND });
    return;
  }

  // 表示名は名簿の規約で正規化する。見えない文字だけの名前や上限を超える名前は拒む。
  const applied = applyDisplayNameRule(cmd.displayName);
  if (applied.isErr()) {
    reply({ type: "error", code: "INVALID_COMMAND", message: INVALID_DISPLAY_NAME_MESSAGE });
    return;
  }

  const joined = joinRoom(deps, {
    connId,
    code: cmd.code,
    displayName: applied.value,
    tool: input.tool,
    ...(cmd.resumeToken !== undefined ? { resumeToken: cmd.resumeToken } : {}),
    ...(cmd.passphrase !== undefined ? { passphrase: cmd.passphrase } : {}),
  });
  if (joined.isErr()) {
    // ハブは「存在しないルーム」と「合言葉が要るルーム」を区別して返す（合言葉を送れる入口なので、
    // 意図された開示である。区別させないのは合言葉を送れない入口＝poker の側の規律）。
    reply({ type: "error", code: joined.error, message: joinFailureMessage(joined.error) });
    return;
  }

  // 復帰でも新規でも、本人には復帰の組を返す（ハブは `localStorage` にこれを持つ。D12）。
  const { participantId, resumeToken, membership } = joined.value;
  reply({ type: "room.joined", code: cmd.code, participantId, resumeToken });
  // 保管と配信は対にする（`save-roster.ts`）。この接続が在席に載ったことは玄関にも届く。
  saveRoster(deps, membership);
  input.afterJoin(joined.value);
}
