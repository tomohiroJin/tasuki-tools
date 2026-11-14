/**
 * 生テキストを受けるツールの表（#591。`ws-adapter.ts` の `options.<tool>`・`rawTextChannel` の並び・
 * `send*` / `broadcast*` の 2 メソッドずつを、ここの 1 つの表から導くために置いた）。
 *
 * 生テキストを受けるのは、timer と poker 以外の全部（ハブ・お題・ルーレット・進行タイマー・チェックイン）。
 * timer は接続層で `CommandSchema` を通した値を渡し、poker は接続そのものを渡す（形が違うので
 * `WsAdapter` が個別に持つ）。
 *
 * **道具を足すときにここへ足すのは {@link RawToolFrames} の 1 行である。** 一覧（`application/tool-id.ts`）に
 * 道具を足して、ここへ行を足し忘れると {@link RAW_TOOL_IDS} の代入で型検査が落ちる。
 */
import type { HubServerMsg } from "@tasuki/room-core";
import { TOOL_IDS } from "../../application/tool-id.js";
import type { AgendaOwnFrame, AgendaServerMsg } from "../../ports/agenda-server-msg.js";
import type { CheckinOwnFrame, CheckinServerMsg } from "../../ports/checkin-server-msg.js";
import type { RouletteOwnFrame, RouletteServerMsg } from "../../ports/roulette-server-msg.js";
import type { TopicOwnFrame, TopicServerMsg } from "../../ports/topic-server-msg.js";

/**
 * 行ごとに 2 つの型を持つ。
 *
 * - `own`: **その受け口が自分で返すエラーフレームの型**。広い `*ServerMsg` ではなく狭い `*OwnFrame`（#91 R18）。
 *   `TopicServerMsg` は `HubServerMsg` を合併しており、その `error` は `code: string`（無制約）なので、
 *   契約に無いコードでも通ってしまう。ルーレットほかも同じ理由で `*OwnFrame`。
 * - `out`: その道具の接続へ送れるフレームの型。**ハブ・timer・poker の接続へも配るもの**（お題）があるため
 *   `own` より広い。{@link RawToolOutbound} の `send` / `broadcast` が受ける。
 * - 全員へ同じものを送る口（`broadcast`）を持つかは、実行時にも読める値 {@link RAW_BROADCAST} が決める（型も実行時の形も同じ値から導く）。
 */
export interface RawToolFrames {
  hub: { own: HubServerMsg; out: HubServerMsg };
  topic: { own: TopicOwnFrame; out: TopicServerMsg };
  roulette: { own: RouletteOwnFrame; out: RouletteServerMsg };
  agenda: { own: AgendaOwnFrame; out: AgendaServerMsg };
  checkin: { own: CheckinOwnFrame; out: CheckinServerMsg };
}

/**
 * 全員へ同じものを送る口（`broadcast`）を持つか。**型と実行時の形（`WsAdapter#to`）の両方がこの 1 つの値から導かれる。**
 * チェックインは受け手ごとに中身が違う（匿名を送らないことで守る）ので、全員へ同じものを送る口は**作らない**（#406）。
 * 鍵の過不足は {@link RawToolFrames} の鍵と照合される（道具を足して書き忘れると型検査が落ちる）。
 */
export const RAW_BROADCAST = {
  hub: true,
  topic: true,
  roulette: true,
  agenda: true,
  checkin: false,
} as const satisfies Record<keyof RawToolFrames, boolean>;

/** 生テキストを受けるツールの識別子（表の鍵）。 */
export type RawToolId = keyof RawToolFrames;

/** 生テキストを渡すメッセージ層。**パース前の文字列を渡す。** 境界の検証はメッセージ層に置き、接続層は経路とサイズだけを見る。 */
export interface RawMessageHandler {
  handleMessage(connId: string, raw: string): Promise<void>;
}

/** ツールごとの生テキストのメッセージ層。 */
export type RawHandlers = { readonly [T in RawToolId]: RawMessageHandler };

/**
 * 生テキストを受けるツールの一覧。`hub`（`?tool=` 無し）に、一覧（`TOOL_IDS`）から timer と poker を除いたもの。
 * 一覧に道具が増えて {@link RawToolFrames} に行が無いと、この代入が型検査で落ちる。
 */
export const RAW_TOOL_IDS: readonly RawToolId[] = [
  "hub",
  ...TOOL_IDS.filter((id): id is Exclude<typeof id, "timer" | "poker"> => id !== "timer" && id !== "poker"),
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
