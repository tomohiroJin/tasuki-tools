// WS メッセージプロトコル（contracts/ws-protocol.md の実装。契約の単一情報源）
// 境界での検証は Valibot、結果は neverthrow の Result（憲法原則 IV）
import * as v from 'valibot';
import { type Result } from 'neverthrow';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { NUMBER_CARD_VALUES, type Card } from './deck.js';
import { MAX_ESTIMATE_ITEM } from './estimate-log.js';
import { HAND_CATEGORIES } from './hand-rank.js';
import { RANKS, SUITS } from './playing-card.js';

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

// 表示名は**この層では形だけを見る**（#95 S5b）。
//
// 規約（正規化の規則と上限）は `@tasuki/room-core` にあり、適用はアプリケーション層
// （`apps/tasuki-sync/src/application/display-name-rule.ts`）が timer・ハブと共有して行う。
// poker が自前の上限（24）を持っていた S4a までは、**ハブで名乗った 40 文字の名前が
// poker の入口だけで弾かれた**。
//
// ⚠ **ここに上限を書き戻さないこと。** 書き戻すと上限の正本が 2 つになる
// （timer 側の `packages/timer-core/src/schemas.ts` が同じ理由で `v.string()` にしてある）。
// 巨大入力そのものは接続層のフレーム上限（`maxMessageBytes`）が先に弾く。
const NameSchema = v.string();

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
  // 'next-round' は古いクライアント向けに残す
  v.strictObject({ type: v.literal('next-round') }),
  // 見積もりの記録（#93）
  v.strictObject({
    type: v.literal('set-item'),
    item: v.pipe(v.string(), v.trim(), v.maxLength(MAX_ESTIMATE_ITEM)),
  }),
  v.strictObject({ type: v.literal('revote') }),
  v.strictObject({
    type: v.literal('next-item'),
    points: v.nullable(v.picklist(NUMBER_CARD_VALUES)),
  }),
  v.strictObject({
    type: v.literal('set-points'),
    groupId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    points: v.nullable(v.picklist(NUMBER_CARD_VALUES)),
  }),
  // 記録の切り替えと束の名前（#427）
  v.strictObject({ type: v.literal('set-recording'), recording: v.boolean() }),
  v.strictObject({
    type: v.literal('set-group-item'),
    groupId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    item: v.pipe(v.string(), v.trim(), v.maxLength(MAX_ESTIMATE_ITEM)),
  }),
  // 見学（#419）
  v.strictObject({ type: v.literal('set-spectator'), spectator: v.boolean() }),
  v.strictObject({
    type: v.literal('remove-participant'),
    participantId: v.pipe(v.string(), v.minLength(1)),
  }),
  // 隠しモードのテーブル（#403）。**札も順列も受け取らない** —— 配るのはサーバーである（設計 D4）
  v.strictObject({ type: v.literal('table-seat'), seated: v.boolean() }),
  v.strictObject({ type: v.literal('table-deal') }),
  v.strictObject({ type: v.literal('table-show') }),
]);

export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>;

export const ERROR_CODES = [
  'invalid-message',
  'room-not-found',
  'not-voting',
  'not-revealed',
  'not-joined',
  // 以下は接続・フレーム層の防御が返す（Issue #63）。利用者の入力ミスではなく
  // サーバー側の事情なので invalid-message には畳まない（案内の文言が変わる）。
  'message-too-large',
  'server-busy',
  // 入室失敗のレート制限（#103）。総当たりの緩和であり、利用者の入力ミスとは別物。
  'rate-limited',
  // 見積もりの記録（#93）
  'estimate-not-found',
  'estimate-open',
  // 見学（#419）
  'spectating',
  'participant-not-found',
  'not-removable',
  // 隠しモードのテーブル（#403）
  'table-not-seated',
  'table-in-play',
  'table-no-hand',
  'table-full',
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
  connected: v.boolean(),
  hasVoted: v.boolean(),
  // 古いサーバーは送らない（#419）。省略は投票者として読む
  spectator: v.optional(v.boolean(), false),
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

// 見積もりの記録（#93）。行の item は載せない（束の見出しが持つ）。束・行は古い順。
// 参加者 ID は載せない（匿名）。
const EstimateEntryViewSchema = v.object({
  attempt: v.number(),
  at: v.number(),
  counts: v.array(v.object({ card: CardSchema, count: v.number() })),
});

const EstimateGroupViewSchema = v.object({
  id: v.number(),
  item: v.string(),
  points: v.nullable(v.number()),
  open: v.boolean(),
  entries: v.array(EstimateEntryViewSchema),
});

const EstimateViewSchema = v.object({
  item: v.string(),
  log: v.array(EstimateGroupViewSchema),
  // 古いサーバーは送らない（#427）。省略は「記録する」と読む（従来の挙動）
  recording: v.optional(v.boolean(), true),
});

// 隠しモードのテーブル（#403・設計 §6.3）。**席が空のルームでは載らない**ので、普段の wire は変わらない。
// 札の値の集合は契約そのもの（`CardSchema` と同じ理由）なので、範囲外の数字・未知のスートは落とす。
const PlayingCardSchema = v.object({ suit: v.picklist(SUITS), rank: v.picklist(RANKS) });

const TableViewSchema = v.object({
  status: v.picklist(['idle', 'dealt', 'shown']),
  seats: v.array(v.string()),
  /** 受信者の手。席に着いていて手を持つときだけ値（見せる前の秘匿・T-4） */
  yourHand: v.nullable(v.array(PlayingCardSchema)),
  /** 見せたあとだけ中身がある */
  hands: v.array(
    v.object({
      participantId: v.string(),
      cards: v.array(PlayingCardSchema),
      category: v.picklist(HAND_CATEGORIES),
    }),
  ),
  winners: v.array(v.string()),
});

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
    // 新しい web が古いサーバーに当たっても通す（#93）
    estimate: v.optional(EstimateViewSchema),
    // 古いサーバーは送らない。新しいサーバーも席が空なら送らない（#403）
    table: v.optional(TableViewSchema),
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
export type EstimateView = NonNullable<RoomStateMessage['estimate']>;
export type EstimateGroupView = EstimateView['log'][number];
export type ParticipantView = v.InferOutput<typeof ParticipantViewSchema>;
export type RoundStats = v.InferOutput<typeof StatsSchema>;
export type VoteView = { participantId: string; card: Card };
export type TableView = v.InferOutput<typeof TableViewSchema>;

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
