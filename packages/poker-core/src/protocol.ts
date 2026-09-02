// WS メッセージプロトコル（contracts/ws-protocol.md の実装。契約の単一情報源）
// 境界での検証は Valibot、結果は neverthrow の Result（憲法原則 IV）
import * as v from 'valibot';
import { type Result } from 'neverthrow';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { NUMBER_CARD_VALUES, type Card } from './deck';
import { NAME_MAX_LENGTH } from './room';

// --- スキーマ ---

// **カードだけは strictObject のまま**（#216・docs/poker/adr/0004 決定 2）。
//
// カードは**値の集合そのものが契約**である。新しい `kind`（T シャツサイズ・#92）を
// 足しても `v.variant` が枝を知らないので落とす —— **緩めても前方互換にならない。**
// 得るものが無いのに、`vote`（クライアント→サーバー）と共有している以上、
// 緩めれば**外部入力の検証まで緩む。**
const CardSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('number'), value: v.picklist(NUMBER_CARD_VALUES) }),
  v.strictObject({ kind: v.literal('question') }),
  v.strictObject({ kind: v.literal('coffee') }),
]);

// 名前ルールは room.ts の NAME_MAX_LENGTH が単一情報源
const NameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(NAME_MAX_LENGTH));

// 公開しない（parseClientMessage が唯一の入口であり、外からもテストからも取り込まれない。#182 で index の列挙から外し、#223 で宣言の export も落とした）。
const ClientMessageSchema = v.variant('type', [
  v.strictObject({ type: v.literal('create-room'), name: NameSchema }),
  v.strictObject({
    type: v.literal('join-room'),
    roomId: v.string(),
    name: NameSchema,
    token: v.optional(v.string()),
  }),
  // 参加する前にルームの生死だけを尋ねる（#76 J-1）。
  // 死んだ招待リンクでも参加フォームが出てしまい、名前を入れて送信するまで
  // 分からなかった。読み取りだけで、参加状態には触れない。
  v.strictObject({ type: v.literal('check-room'), roomId: v.string() }),
  v.strictObject({ type: v.literal('vote'), card: CardSchema }),
  v.strictObject({ type: v.literal('reveal') }),
  v.strictObject({ type: v.literal('next-round') }),
]);

export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>;

export const ERROR_CODES = [
  'invalid-message',
  'room-not-found',
  'not-host',
  'not-voting',
  'not-revealed',
  'not-joined',
  // 以下は接続・フレーム層の防御が返す（Issue #63）。利用者の入力ミスではなく
  // サーバー側の事情なので invalid-message には畳まない（案内の文言が変わる）。
  'message-too-large',
  'server-busy',
  // 入室失敗のレート制限（#103）。総当たりの緩和であり、利用者の入力ミスとは別物。
  'rate-limited',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * `code` が `ERROR_CODES` に載っているか（#214・docs/poker/adr/0003 決定 2）。
 *
 * 受信の契約は未知の `code` も通すようになったが、**画面が意味を知っているのは
 * `ERROR_CODES` に載っているものだけ**である。専用画面や自動再試行の分岐に入れてよいかを
 * ここで判定し、未知のものは境界で畳む。
 */
export function isKnownErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

// --- ここから下はサーバー→クライアント専用（#216・docs/poker/adr/0004 決定 1）---
//
// **`v.object` は宣言していないキーを出力から落とす。** 通しても画面へは運ばないので、
// 憲法 原則 IV（境界で検証する）は保たれる。`ClientMessageSchema` が使う入れ子は
// `NameSchema` と `CardSchema` だけなので、外部入力の厳格さには触れない。
const ParticipantViewSchema = v.object({
  id: v.string(),
  name: v.string(),
  isHost: v.boolean(),
  connected: v.boolean(),
  hasVoted: v.boolean(),
});

const StatsSchema = v.object({
  average: v.nullable(v.number()),
  modes: v.array(CardSchema),
});

const RoundViewSchema = v.variant('status', [
  v.object({ status: v.literal('voting') }),
  v.object({
    status: v.literal('revealed'),
    votes: v.array(v.object({ participantId: v.string(), card: CardSchema })),
    stats: StatsSchema,
  }),
]);

// 公開しない（parseServerMessage が唯一の入口であり、外からもテストからも取り込まれない。#182 で index の列挙から外し、#223 で宣言の export も落とした）。
const ServerMessageSchema = v.variant('type', [
  v.object({
    type: v.literal('joined'),
    roomId: v.string(),
    participantId: v.string(),
    token: v.string(),
  }),
  v.object({
    type: v.literal('room-state'),
    roomId: v.string(),
    you: v.string(),
    participants: v.array(ParticipantViewSchema),
    round: RoundViewSchema,
    yourVote: v.nullable(CardSchema),
  }),
  // **error だけは前方互換にする（#214・docs/poker/adr/0003 決定 1）。**
  //
  // `error` は消えたルームの案内（#76 J-1）と入室の自動再試行（#147）の**唯一の引き金**で、
  // 捨てるとどちらも起きない。サーバーが `code` を増やしても（#63・#103 で 2 度増えた）、
  // `error` に任意フィールドを足しても、古いバンドルがフレームごと捨ててはならない。
  //
  // - `v.object`: 宣言していないキーは**無視して落とす**（画面へは運ばない）
  // - 非空文字列: 未知の `code` も通す。意味を持たない空文字だけは通さない
  //
  // 未知の `code` を既知と取り違えないための畳み込みは `isKnownErrorCode()` が担う。
  // **joined / room-state も #216（adr/0004）で前方互換にした。**
  v.object({
    type: v.literal('error'),
    code: v.pipe(v.string(), v.minLength(1)),
    message: v.string(),
  }),
]);

export type ServerMessage = v.InferOutput<typeof ServerMessageSchema>;

/**
 * **サーバーが送ってよいメッセージ**（#214・docs/poker/adr/0003 決定 4）。
 *
 * 受信の契約（`ServerMessage`）は前方互換のため `code` を任意の非空文字列まで広げたが、
 * **送信側は `ERROR_CODES` に縛ったままにする。** 広く受けるのは古いバンドルを守るための
 * ものであって、サーバーが好き勝手に送ってよいという意味ではない。
 *
 * これが `ServerMessage` のままだと、`Broadcaster.sendTo` に渡す `code` の**綴り誤りが
 * 型検査を通る**（#214 の敵対的検証が実測した）。`handlers.ts` の
 * `sendError(code: ErrorCode, …)` だけが担保していて、ポートの型では担保されていなかった。
 */
export type OutboundServerMessage =
  | Exclude<ServerMessage, { type: 'error' }>
  | { type: 'error'; code: ErrorCode; message: string };
export type RoomStateMessage = Extract<ServerMessage, { type: 'room-state' }>;
export type ParticipantView = v.InferOutput<typeof ParticipantViewSchema>;
export type RoundStats = v.InferOutput<typeof StatsSchema>;
export type VoteView = { participantId: string; card: Card };

export type ProtocolError = { code: 'invalid-message'; message: string };

// --- パース関数 ---

/**
 * 境界のパースは @tasuki/protocol に一本化してある（timer の sync も同じものを使う）。
 * poker は JSON 不正とスキーマ不正を区別せず、どちらも invalid-message に畳む
 * （利用者に見せる文言だけを段に応じて変える）。
 */
function parseWith<TSchema extends v.GenericSchema>(
  schema: TSchema,
  raw: string,
): Result<v.InferOutput<TSchema>, ProtocolError> {
  return parseBoundaryMessage(schema, raw).mapErr(({ stage }) => ({
    code: 'invalid-message' as const,
    message: stage === 'json' ? 'JSON として解釈できません' : 'メッセージ形式が不正です',
  }));
}

/** 受信した生テキストを検証済み ClientMessage にする（sync の境界） */
export function parseClientMessage(raw: string): Result<ClientMessage, ProtocolError> {
  return parseWith(ClientMessageSchema, raw);
}

/** 受信した生テキストを検証済み ServerMessage にする（web の境界） */
export function parseServerMessage(raw: string): Result<ServerMessage, ProtocolError> {
  return parseWith(ServerMessageSchema, raw);
}
