/**
 * 生テキストを受けるツールの表（#591。`ws-adapter.ts` の `options.<tool>`・`rawTextChannel` の並び・
 * `send*` / `broadcast*` の 2 メソッドずつを、ここの表から導くために置いた）。
 *
 * 生テキストを受けるのは、timer と poker 以外の全部（ハブ・お題・ルーレット・進行タイマー・チェックイン）。
 * timer は接続層で `CommandSchema` を通した値を渡し、poker は接続そのものを渡す（形が違うので
 * `WsAdapter` が個別に持つ）。
 *
 * ## 表と鍵の網羅
 *
 * 鍵の集合 {@link RawToolId} は**一覧（`application/tool-id.ts` の `TOOL_IDS`）から導く**
 * （`hub` + 一覧から timer・poker を除いたもの）。表（{@link RawToolFrames}・{@link RAW_BROADCAST}）は
 * この集合と**両向きに**照合される —— 行が足りなければ型検査が落ち（`extends Record<RawToolId, …>`・
 * `satisfies Record<RawToolId, …>`）、余計な行があっても落ちる（{@link NoExtraRawToolFrames}・`satisfies` の余剰検査）。
 * 実行時の並び（{@link RAW_TOOL_IDS}）は同じ一覧から作り、値の側は `test/ws/raw-tools.test.ts` がリテラルで固定する。
 *
 * ## 生テキストの道具を足すとき（手順の正本はここ）
 *
 *   1. `application/tool-id.ts` の `TOOL_IDS` へ足す（`?tool=` の許可リスト・`Protocol`・お題の配信先が追従する）
 *   2. この表: {@link RawToolFrames} に 1 行、{@link RAW_BROADCAST} に 1 行（受け手ごとに中身が違うなら false）
 *   3. `application/log/vocabulary.ts` の `PROTOCOL_LOG_NAMES` に 1 行（ログの語彙。型が足し忘れを落とす）
 *   4. `assembly/<道具>.ts` を作る（保管・配信・ハンドラ・猶予・破棄。`destroy` と `close` を返す）
 *   5. `create-sync-server.ts` へ、`ToolParts` の 1 行・`assembleXxx` の呼び出し・`parts` への 1 行・`raw:` の 1 行・破棄の束への 1 行
 *   6. `scripts/audit-assembly-wiring.mjs` の `parts` へ 1 行（`audit-assembly-wiring.test.mjs` が `assembly/` の実体と照合する）
 *   7. 玄関・E2E・監査の許可リスト（アプリの外。`tool-id.ts` の docstring を参照）
 */
import type { HubServerMsg } from "@tasuki/room-core";
import { TOOL_IDS, type KnownToolId } from "../../application/tool-id.js";
import type { AgendaOwnFrame, AgendaServerMsg } from "../../ports/agenda-server-msg.js";
import type { CheckinOwnFrame, CheckinServerMsg } from "../../ports/checkin-server-msg.js";
import type { RouletteOwnFrame, RouletteServerMsg } from "../../ports/roulette-server-msg.js";
import type { TopicOwnFrame, TopicServerMsg } from "../../ports/topic-server-msg.js";

/**
 * 型だけの断言に使う: `T` が `never` でなければ（余計なものが残っていれば）型検査が落ちる。
 * 実行時には何も残らない（`export type` で未使用の警告も避ける）。
 */
export type AssertNever<T extends never> = T;

/** 生テキストを受けるツールの識別子。一覧から導く（`hub` + 一覧から timer・poker を除いたもの）。 */
export type RawToolId = "hub" | Exclude<KnownToolId, "timer" | "poker">;

/**
 * 行ごとに 2 つの型を持つ。
 *
 * - `own`: **その受け口が自分で返すエラーフレームの型**。広い `*ServerMsg` ではなく狭い `*OwnFrame`（#91 R18）。
 *   `TopicServerMsg` は `HubServerMsg` を合併しており、その `error` は `code: string`（無制約）なので、
 *   契約に無いコードでも通ってしまう。ルーレットほかも同じ理由で `*OwnFrame`。
 * - `out`: その道具の接続へ送れるフレームの型。**ハブ・timer・poker の接続へも配るもの**（お題）があるため
 *   `own` より広い。{@link RawToolOutbound} の `send` / `broadcast` が受ける。
 *
 * 全員へ同じものを送る口（`broadcast`）を持つかは {@link RAW_BROADCAST} が決める。
 * **`extends Record<RawToolId, …>` が足りない行を、{@link NoExtraRawToolFrames} が余計な行を落とす。**
 */
export interface RawToolFrames extends Record<RawToolId, { own: unknown; out: unknown }> {
  hub: { own: HubServerMsg; out: HubServerMsg };
  topic: { own: TopicOwnFrame; out: TopicServerMsg };
  roulette: { own: RouletteOwnFrame; out: RouletteServerMsg };
  agenda: { own: AgendaOwnFrame; out: AgendaServerMsg };
  checkin: { own: CheckinOwnFrame; out: CheckinServerMsg };
}

/** 表に、一覧から導いた鍵に無い行が残っていないこと（型だけの断言）。 */
export type NoExtraRawToolFrames = AssertNever<Exclude<keyof RawToolFrames, RawToolId>>;

/**
 * 全員へ同じものを送る口（`broadcast`）を持つか。**型と実行時の形（`WsAdapter#to`）の両方がこの 1 つの値から導かれる。**
 * チェックインは受け手ごとに中身が違う（匿名を送らないことで守る）ので、全員へ同じものを送る口は**作らない**（#406）。
 * 鍵の過不足は `satisfies Record<RawToolId, boolean>` が両向きに落とす（リテラルへの余剰検査を含む）。
 */
export const RAW_BROADCAST = {
  hub: true,
  topic: true,
  roulette: true,
  agenda: true,
  checkin: false,
} as const satisfies Record<RawToolId, boolean>;

/** 生テキストを渡すメッセージ層。**パース前の文字列を渡す。** 境界の検証はメッセージ層に置き、接続層は経路とサイズだけを見る。 */
export interface RawMessageHandler {
  handleMessage(connId: string, raw: string): Promise<void>;
}

/** ツールごとの生テキストのメッセージ層。 */
export type RawHandlers = { readonly [T in RawToolId]: RawMessageHandler };

/**
 * 生テキストを受けるツールの一覧（実行時の並び）。`hub`（`?tool=` 無し）に、一覧（`TOOL_IDS`）から timer と poker を除いたもの。
 * 型は {@link RawToolId}（同じ一覧から導いた集合）。
 */
export const RAW_TOOL_IDS: readonly RawToolId[] = [
  "hub",
  ...TOOL_IDS.filter((id): id is Exclude<KnownToolId, "timer" | "poker"> => id !== "timer" && id !== "poker"),
];

/** 1 つのツールの接続へ送る口。 */
export type RawToolOutbound<T extends RawToolId> = {
  /** 1 本へ送る。接続が無い・OPEN でなければ黙って飛ばす。 */
  send(connId: string, data: RawToolFrames[T]["out"]): void;
} & ((typeof RAW_BROADCAST)[T] extends true
  ? {
      /** 宛先の接続へ一斉に送る。知らない接続 ID は黙って飛ばす。 */
      broadcast(connIds: string[], data: RawToolFrames[T]["out"]): void;
    }
  : unknown);

/** ツールごとの送る口（`WsAdapter#to`）。 */
export type RawOutbound = { readonly [T in RawToolId]: RawToolOutbound<T> };

/**
 * 鍵ごとに値を作って、鍵の集合 {@link RawToolId} で型づけした表にする。
 * 鍵は {@link RAW_TOOL_IDS}（一覧から作る）だけなので、型と実行時の鍵は一致する（値の側は `raw-tools.test.ts` が固定する）。
 */
export function mapRawTools<V>(make: (id: RawToolId) => V): Readonly<Record<RawToolId, V>> {
  return Object.fromEntries(RAW_TOOL_IDS.map((id) => [id, make(id)])) as Record<RawToolId, V>;
}

/**
 * 送る口の実行時の形を作る。`send` は全ツール、`broadcast` は {@link RAW_BROADCAST} が true のツールだけに付ける。
 *
 * ⚠ **ここに `as RawOutbound` が 1 つ残る。** 鍵ごとに型が違う（`RawToolOutbound<T>` が T で変わる）ので、
 * 値を作る側の型検査は鍵ごとの形までは届かない。実行時の形（`broadcast` の有無）は
 * `test/ws/raw-tools.test.ts`（旗の表と口の一致）と変異 m1628 が守る。
 */
export function makeRawOutbound(
  send: (id: RawToolId) => (connId: string, data: never) => void,
  broadcast: (id: RawToolId) => (connIds: string[], data: never) => void,
): RawOutbound {
  return mapRawTools((id) =>
    RAW_BROADCAST[id] ? { send: send(id), broadcast: broadcast(id) } : { send: send(id) },
  ) as unknown as RawOutbound;
}
