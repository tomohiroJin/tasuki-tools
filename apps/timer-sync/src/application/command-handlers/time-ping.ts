/**
 * `time.ping` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleTimePing` を
 * そのまま移動し、参照していたクロージャ変数（`clock`/`broadcaster`）を
 * `deps` 引数として明示化した。
 */

import { ok, type Result } from "neverthrow";
import type { ErrorCode } from "@tasuki/timer-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";

export interface TimePingDeps {
  clock: Clock;
  broadcaster: Broadcaster;
}

export function createTimePingHandler(deps: TimePingDeps) {
  const { clock, broadcaster } = deps;

  /** time.ping — 状態を変えずにサーバー時刻を返す（FR-007, SC-001） */
  return async function handleTimePing(
    connId: string,
    // 受信形を型として残すが、応答はサーバー時刻のみで clientTime は使わない
    // （往復遅延の推定はクライアント側が送信時刻と突き合わせて行う）。
    _cmd: { command: "time.ping"; clientTime: number },
  ): Promise<Result<undefined, ErrorCode>> {
    broadcaster.sendTo(connId, {
      type: "time.pong",
      serverTime: clock.now(),
    });
    return ok(undefined);
  };
}
