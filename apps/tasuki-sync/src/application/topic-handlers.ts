/**
 * お題ツール（`?tool=topic`）のメッセージ層（#91・spec §5.3）。
 *
 * **お題を変えられるのはここだけである**（spec T4）。お題のコマンドはハブ・timer・poker の
 * スキーマに含めず、この接続の境界（`TopicCommandSchema`）にだけ置く。共通の処理
 * （`handlers.ts` の `handleRoomCommand`）にツール別の可否判定を戻さない。
 *
 * ## ルームへの入り方はハブと共有する
 *
 * 参加・復帰は `join-room.ts`（レート制限・合言葉の関門・復帰）を通し、表示名は
 * `display-name-rule.ts` を通す。**ここに写しを書かない**（`hub-handlers.ts` の冒頭と同じ理由 ——
 * 片方だけが直ると、合言葉を知らない人が保護ルームへ入れる）。
 * ルームは作らない（`room.create` は拒む）。ルームを作るのは玄関である。
 *
 * ## 守りは入室の入口と共有する
 *
 * `ai.unlock` の総当たり対策は、`room.join` と**同じゲートのインスタンス**に積算する
 * （配線が `handlers.rateLimitGate` を渡す）。このゲートを通るのは timer・ハブ・お題の入口で、
 * poker の入口は同じバケツの上に自分のゲートを持つ（`handlers.ts` の `rateLimiter` の注記）。
 * 手順は下の `handleAiUnlock` の docstring に書き下ろしてある。
 *
 * ## お題のタイトル・本文をログへ出さない
 *
 * 利用者の入力である（`docs/adr/0012`・E14）。このファイルはログを書かない。
 */
import * as v from "valibot";
import {
  HubCommandSchema,
  type HubCommand,
} from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import {
  clearTopic,
  setManualTopic,
  topicErrorMessageFor,
  TopicCommandSchema,
  unlockAi,
  type TopicCommand,
  type TopicErrorCode,
  type TopicState,
} from "@tasuki/topic-core";
import type { TopicStore } from "../ports/topic-store.js";
import type { TopicServerMsg } from "../ports/topic-server-msg.js";
import type { JoinRoomDeps } from "./join-room.js";
import type { SaveRosterDeps } from "./save-roster.js";
import type { TimerSeatBroadcastDeps } from "./timer-seat-broadcast.js";
import { constantTimeEqual } from "./secure-compare.js";
import { topicStateOrInitial, type TopicBroadcaster } from "./topic-broadcast.js";
import type { TopicGenerator } from "./topic-generation.js";
import { findRoomByToolConnection } from "./room-lookup.js";
import { joinToolRoom } from "./join-tool-room.js";
import { TOOL_TOPIC } from "./tool-id.js";
import { boundaryErrorCode } from "./connection-errors.js";

/**
 * お題の接続が受け取る言葉。**ハブの言葉（`room.join` のため）とお題のコマンドの和**である。
 *
 * ハブの言葉のうち `room.create` / `room.check` も境界は通るが、下の振り分けで拒む
 * （お題の接続はルームを作らない。生死の照会は名乗る前の玄関の仕事である）。
 */
const TopicConnectionMessageSchema = v.union([HubCommandSchema, TopicCommandSchema]);

export interface TopicHandlerDeps extends JoinRoomDeps, SaveRosterDeps, TimerSeatBroadcastDeps {
  topics: TopicStore;
  generator: Pick<TopicGenerator, "request" | "cancel">;
  broadcaster: TopicBroadcaster;
  send: (connId: string, msg: TopicServerMsg) => void;
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。 */
  aiUnlockKey?: string | undefined;
}

export interface TopicHandlers {
  /** お題の接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
}

export function makeTopicHandlers(deps: TopicHandlerDeps): TopicHandlers {
  const { topics, generator, broadcaster, send, rateLimitGate, aiUnlockKey } = deps;

  /** お題のコマンドの失敗。**文言は topic-core の文言表から引く**（ここに書かない）。 */
  function fail(connId: string, code: TopicErrorCode): void {
    send(connId, { type: "error", code, message: topicErrorMessageFor(code) });
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    // 参加の流れは hub・roulette と共有する（`join-tool-room.ts`）。timer の状態は保管しない ——
    // お題の接続は `TOOL_TIMER` ではないので、`joinRoom` は timer の状態を作りも変えもしない。
    // 参加の後に、いまのお題を本人へ 1 通（E4）。**お題の状態が無ければここで既定の状態を置く** ——
    // `TopicGenerator#request` は状態の無いルームでは何もしないので、置かないと作れない。
    joinToolRoom(deps, {
      connId,
      cmd,
      tool: TOOL_TOPIC,
      reply: (msg) => send(connId, msg),
      afterJoin: () => broadcaster.sendCurrent(connId, cmd.code),
    });
  }

  /**
   * この接続が在席しているルームのコード。**名簿を引いて決める**（`presence.ts` と同じ引き方）。
   *
   * 接続がどのルームに居るかを別の表に持たない —— 表を 2 つ持つと、退出や破棄で片方だけが
   * 更新され、居ないルームのお題を変えられる。
   */
  function roomCodeOf(connId: string): string | undefined {
    // **お題の接続として在席しているルームだけを数える**（spec T4 の 2 段目）。1 段目は ws-adapter が
    // `?tool=topic` の接続だけをこのハンドラへ振り分けることで、ここはその振り分けが壊れたときの備え ——
    // 接続 ID だけで引くと、timer やハブの接続として在席している接続がお題を変えられてしまう。
    return findRoomByToolConnection(deps.store, connId, TOOL_TOPIC)?.code;
  }

  /** いまの状態を読む。無ければ既定の状態を置いてから返す（`topic-broadcast.ts` と同じ 1 つの関数）。 */
  function currentState(roomCode: string): TopicState {
    return topicStateOrInitial(topics, roomCode);
  }

  /** 保管してから配る（宛先は呼び出し時点の名簿から決まる。`topic-broadcast.ts`）。 */
  function commit(roomCode: string, state: TopicState): void {
    topics.put(roomCode, state);
    broadcaster.publish(roomCode);
  }

  /**
   * AI を合言葉で解錠する（在室者なら誰でも）。合言葉はサーバーの env（`AI_UNLOCK_KEY`）にだけあり、
   * お題の状態には解錠済みかどうかだけを載せる。手順:
   *
   * - **照合より前にレート判定する**（`room.join` と同じゲート・同じバケツ）。判定を後ろへ回すと、
   *   枠を使い切った後も照合の結果が返り、総当たりが止まらない
   * - **照合は定数時間で行う**（`secure-compare.ts` の `constantTimeEqual`）。`===` で比べると、
   *   一致した先頭の長さが応答時間に漏れ、1 文字ずつ当てられる
   * - 前後の空白は落としてから比べ、空の入力は照合せず不一致とする
   * - **失敗だけを積算する**（成功を積算すると、正しい合言葉を知る人の操作で枠が減る）。
   *   判定と積算を 1 つの分岐にまとめておくのは、この「失敗のときだけ」を崩さないため
   * - 時刻は単調時計（`MonotonicClock`・設計正本 D8）。ルームの会計の壁時計を渡してはいけない
   * - **存在を秘匿する**: 合言葉が未設定（AI 無効）でも、不一致と同じ `AI_UNLOCK_FAILED` を返す。
   *   区別できると、サーバーが AI を持っているかどうかを外から探れる
   */
  function handleAiUnlock(connId: string, roomCode: string, key: string): void {
    const rateNow = deps.monotonicClock.now();
    if (rateLimitGate.shouldReject(connId, rateNow)) {
      fail(connId, "RATE_LIMITED");
      return;
    }

    const provided = key.trim();
    const matched =
      aiUnlockKey !== undefined && provided !== "" && constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      rateLimitGate.consume(connId, rateNow);
      fail(connId, "AI_UNLOCK_FAILED");
      return;
    }

    commit(roomCode, unlockAi(currentState(roomCode)));
  }

  function handleTopicCommand(connId: string, cmd: TopicCommand): void {
    const roomCode = roomCodeOf(connId);
    if (roomCode === undefined) {
      fail(connId, "NOT_IN_ROOM");
      return;
    }

    switch (cmd.command) {
      case "topic.set":
        // 進行中の生成を先に止める（E11）。止めずに掲げると、あとから届いた生成の結果が
        // 利用者の掲げたお題を上書きしうる（生成側は自分の生成かどうかだけを見る）。
        generator.cancel(roomCode);
        commit(roomCode, setManualTopic(currentState(roomCode), { title: cmd.title, body: cmd.body }));
        return;
      case "topic.clear":
        generator.cancel(roomCode);
        commit(roomCode, clearTopic(currentState(roomCode)));
        return;
      case "topic.generate": {
        // 状態が無いルームでは生成器が何もしないので、先に既定の状態を置く。
        currentState(roomCode);
        // 中断と配信は生成器が持つ（クールダウンの判定を中断より先に行う順序ごと・E22）。
        const result = generator.request(roomCode, {
          mode: cmd.mode,
          language: cmd.language,
          difficulty: cmd.difficulty,
        });
        if (result === "cooldown") fail(connId, "GENERATION_COOLDOWN");
        return;
      }
      case "ai.unlock":
        handleAiUnlock(connId, roomCode, cmd.key);
        return;
    }
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      // 境界のパースは `@tasuki/protocol` に一本化してある（timer / poker / ハブと同じ入口）。
      const parsed = parseBoundaryMessage(TopicConnectionMessageSchema, raw);
      if (parsed.isErr()) {
        fail(connId, boundaryErrorCode(parsed.error.stage));
        return;
      }

      const cmd = parsed.value;
      if (cmd.command === "room.join") {
        handleJoin(connId, cmd);
        return;
      }
      // お題の接続はルームを作らず、生死も照会しない（どちらも玄関の仕事）。
      if (cmd.command === "room.create" || cmd.command === "room.check") {
        fail(connId, "INVALID_COMMAND");
        return;
      }
      handleTopicCommand(connId, cmd);
    },
  };
}
