/**
 * うちわけの接続の境界スキーマ（#476）。
 *
 * **うちわけのコマンドはここにしか無い。** 他のツールのスキーマに含めないことが
 * 「うちわけを操作できるのは track の接続だけ」の仕組みそのものである。
 * **コマンドに、誰が操作したかを表す項目は無い**（`v.strictObject` が余計な項目を拒むので、足しても通らない。設計 §6）。
 * **エラーコードは文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。文言は `error-messages.ts`。
 */
import * as v from "valibot";
import { TRACK_DOMAIN_ERROR_CODES } from "./errors.js";
import { hasControlChars } from "./label.js";
import { BACK_MINUTES, MAX_LABEL_INPUT, MAX_POSITION_MS } from "./limits.js";
import type { SegmentKind, UndoKind } from "./types.js";

/**
 * 作業名（正規化の前）。ここでは粗い上限と制御文字だけを見る。
 * 正規化した後の長さ（`MAX_LABEL`）はドメインが見て `TRACK_INVALID_LABEL` で返す（上限を画面に言える形で拒む）。
 */
const labelStr = v.pipe(
  v.string(),
  v.maxLength(MAX_LABEL_INPUT),
  v.check((s) => !hasControlChars(s), "label must not contain control characters"),
);

const kind = v.picklist(["work", "break"]);
const backMin = v.optional(v.picklist(BACK_MINUTES));
const segmentId = v.pipe(v.string(), v.minLength(1), v.maxLength(16));
/** 時刻軸の位置。整数の ms。桁外れの値は境界で落とす（範囲の判定はドメインが「いま」を基準に行う） */
const positionMs = v.pipe(v.number(), v.integer(), v.minValue(-MAX_POSITION_MS), v.maxValue(MAX_POSITION_MS));

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST。
export const TrackCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("track.start"), label: labelStr, kind, backMin }),
  v.strictObject({ command: v.literal("track.stop"), backMin }),
  v.strictObject({ command: v.literal("track.undo"), rev: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
  v.strictObject({ command: v.literal("track.segment.set"), id: segmentId, label: labelStr, kind }),
  v.strictObject({ command: v.literal("track.segment.adjust"), id: segmentId, edge: v.picklist(["start", "end"]), atMs: positionMs }),
  v.strictObject({ command: v.literal("track.segment.split"), id: segmentId, atMs: positionMs, label: labelStr, kind }),
  v.strictObject({ command: v.literal("track.segment.insert"), startMs: positionMs, endMs: positionMs, label: labelStr, kind }),
  v.strictObject({ command: v.literal("track.segment.remove"), id: segmentId }),
  v.strictObject({ command: v.literal("track.pin"), label: labelStr, pinned: v.boolean() }),
  v.strictObject({ command: v.literal("track.offer.dismiss") }),
  v.strictObject({ command: v.literal("track.clear") }),
  v.strictObject({ command: v.literal("track.sync") }),
]);
export type TrackCommand = v.InferOutput<typeof TrackCommandSchema>;

/**
 * フレームの種類は**開いた文字列**で受ける（agenda の `onTimeout` と同じ理由）。新しいサーバーが種類を足しても、
 * 古い web がフレームごと捨てて画面が止まらないように。知らない種類は作業として読む（合計に入る側へ倒す）。
 */
const frameKind = v.pipe(
  v.string(),
  v.transform((s): SegmentKind => (s === "break" ? "break" : "work")),
);
const frameUndoKind = v.pipe(
  v.string(),
  v.transform((s): UndoKind => (s === "stop" || s === "clear" ? s : "start")),
);

// 受けるフレームは**非 strict**（サーバーが項目を足しても古い web がフレームごと捨てない）。後から足す項目は任意にする。
const segmentViewSchema = v.object({
  id: v.string(),
  kind: frameKind,
  label: v.string(),
  startMs: v.number(),
  endMs: v.nullable(v.number()),
  autoClosed: v.optional(v.boolean(), false),
});

const TrackViewSchema = v.object({
  epochWallMs: v.number(),
  nowMs: v.number(),
  segments: v.array(segmentViewSchema),
  pinned: v.optional(v.array(v.string()), []),
  rev: v.number(),
  undo: v.optional(v.nullable(v.object({ rev: v.number(), kind: frameUndoKind, remainingMs: v.number() })), null),
  resumeOffer: v.optional(v.boolean(), false),
});

export const TrackFrameSchema = v.object({
  type: v.literal("track"),
  state: TrackViewSchema,
});

/** ドメインのコード ＋ 接続層の共通のコード（agenda の共通部分と同じ並び） */
export const TRACK_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "MESSAGE_TOO_LARGE",
  "INTERNAL_ERROR",
  ...TRACK_DOMAIN_ERROR_CODES,
] as const;
export type TrackErrorCode = (typeof TRACK_ERROR_CODES)[number];

export const TrackErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: v.picklist(TRACK_ERROR_CODES),
  message: v.string(),
});
