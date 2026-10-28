/**
 * 会の始まりと終わりの札の接続の境界スキーマ（#406）。
 *
 * **このツールのコマンドはここにしか無い。** 他のツールのスキーマに含めないことが
 * 「札を操作できるのは checkin の接続だけ」の仕組みそのものである。
 * **エラーコードは文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。文言は `error-messages.ts`。
 */
import * as v from "valibot";
import { CHECKIN_DOMAIN_ERROR_CODES } from "./errors.js";
import { METHOD_IDS, SIDES, VISIBILITIES } from "./methods.js";

/** 回の番号（1 から） */
const seqNum = v.pipe(v.number(), v.integer(), v.minValue(1));
/** 置き換える回の番号（やり方を選ぶ・引く）。回が無いときは 0 */
const replacedSeqNum = v.pipe(v.number(), v.integer(), v.minValue(0));
/** 札の ID（1〜16 字）。やり方に属する札かどうかはドメインが判定する */
const cardStr = v.pipe(v.string(), v.minLength(1), v.maxLength(16));

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST。
export const CheckinCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("checkin.method.choose"), seq: replacedSeqNum, method: v.picklist(METHOD_IDS) }),
  v.strictObject({ command: v.literal("checkin.method.draw"), seq: replacedSeqNum, side: v.picklist(SIDES) }),
  v.strictObject({ command: v.literal("checkin.card.play"), seq: seqNum, card: cardStr }),
  v.strictObject({
    command: v.literal("checkin.visibility.set"),
    seq: seqNum,
    visibility: v.picklist(VISIBILITIES),
  }),
  v.strictObject({ command: v.literal("checkin.reveal"), seq: seqNum }),
  v.strictObject({ command: v.literal("checkin.again"), seq: seqNum }),
  v.strictObject({ command: v.literal("checkin.spectator.set"), spectator: v.boolean() }),
]);
export type CheckinCommand = v.InferOutput<typeof CheckinCommandSchema>;

// 受けるフレームは**非 strict**（サーバーが項目を足しても古い web がフレームごと捨てない）。
const seatViewSchema = v.object({
  id: v.string(),
  name: v.string(),
  played: v.boolean(),
});

const pileViewSchema = v.object({
  card: v.string(),
  count: v.number(),
  names: v.optional(v.array(v.string())),
});

const roundHeadEntries = {
  seq: v.number(),
  method: v.picklist(METHOD_IDS),
  visibility: v.picklist(VISIBILITIES),
  locked: v.boolean(),
  seats: v.array(seatViewSchema),
};

const roundViewSchema = v.variant("status", [
  v.object({
    ...roundHeadEntries,
    status: v.literal("open"),
    playedCount: v.number(),
    playerCount: v.number(),
    yourCard: v.nullable(v.string()),
  }),
  v.object({
    ...roundHeadEntries,
    status: v.literal("revealed"),
    piles: v.array(pileViewSchema),
  }),
]);

const CheckinViewSchema = v.object({
  you: v.string(),
  spectating: v.boolean(),
  spectatorCount: v.number(),
  round: v.nullable(roundViewSchema),
});

export const CheckinFrameSchema = v.object({
  type: v.literal("checkin"),
  state: CheckinViewSchema,
});

/** ドメインのコード ＋ 接続層の共通のコード（agenda の共通部分と同じ並び） */
export const CHECKIN_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "MESSAGE_TOO_LARGE",
  "INTERNAL_ERROR",
  ...CHECKIN_DOMAIN_ERROR_CODES,
] as const;
export type CheckinErrorCode = (typeof CHECKIN_ERROR_CODES)[number];

export const CheckinErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: v.picklist(CHECKIN_ERROR_CODES),
  message: v.string(),
});
