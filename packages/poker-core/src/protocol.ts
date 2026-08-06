// WS メッセージプロトコル（contracts/ws-protocol.md の実装。契約の単一情報源）
// 境界での検証は Valibot、結果は neverthrow の Result（憲法原則 IV）
import * as v from 'valibot';
import { type Result } from 'neverthrow';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { NUMBER_CARD_VALUES, type Card } from './deck';
import { NAME_MAX_LENGTH } from './room';

// --- スキーマ ---

const CardSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('number'), value: v.picklist(NUMBER_CARD_VALUES) }),
  v.strictObject({ kind: v.literal('question') }),
  v.strictObject({ kind: v.literal('coffee') }),
]);

// 名前ルールは room.ts の NAME_MAX_LENGTH が単一情報源
const NameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(NAME_MAX_LENGTH));

export const ClientMessageSchema = v.variant('type', [
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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const ParticipantViewSchema = v.strictObject({
  id: v.string(),
  name: v.string(),
  isHost: v.boolean(),
  connected: v.boolean(),
  hasVoted: v.boolean(),
});

const StatsSchema = v.strictObject({
  average: v.nullable(v.number()),
  modes: v.array(CardSchema),
});

const RoundViewSchema = v.variant('status', [
  v.strictObject({ status: v.literal('voting') }),
  v.strictObject({
    status: v.literal('revealed'),
    votes: v.array(v.strictObject({ participantId: v.string(), card: CardSchema })),
    stats: StatsSchema,
  }),
]);

export const ServerMessageSchema = v.variant('type', [
  v.strictObject({
    type: v.literal('joined'),
    roomId: v.string(),
    participantId: v.string(),
    token: v.string(),
  }),
  v.strictObject({
    type: v.literal('room-state'),
    roomId: v.string(),
    you: v.string(),
    participants: v.array(ParticipantViewSchema),
    round: RoundViewSchema,
    yourVote: v.nullable(CardSchema),
  }),
  v.strictObject({
    type: v.literal('error'),
    code: v.picklist(ERROR_CODES),
    message: v.string(),
  }),
]);

export type ServerMessage = v.InferOutput<typeof ServerMessageSchema>;
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
