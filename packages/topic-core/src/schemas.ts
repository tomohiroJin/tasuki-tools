/**
 * お題の接続の境界スキーマ(#91・原則 IV)。
 *
 * **お題のコマンドはここにしか無い。** ハブ・timer・poker のスキーマに含めないことが、
 * 「お題を変えられるのはお題ツールの接続だけ」(spec T4)の仕組みそのものである。
 * 共通の処理(`handlers.ts`)にツール別の可否判定を戻さない(#95 S5b で撤去済み)。
 *
 * **エラーコードは文言を持たない**(`scripts/audit-domain-error-shape.mjs`)。
 * 文言は同じパッケージの `error-messages.ts` が持つ。
 */
import * as v from "valibot";
import { DIFFICULTIES, LANGUAGES, MAX_AI_UNLOCK_KEY, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "./limits.js";

/**
 * 空白だけのタイトルを拒む(見出しが空の札が全員の画面に出る)。
 *
 * `validate.ts` へ export する(AI 由来の下書きの検証で同じ制約を使い回すため)。
 * **`index.ts` からは公開しない**(`scripts/audit-*` の公開契約の検査が
 * 「自分しか使わない公開記号」を数える)。
 */
export const titleStr = v.pipe(
  v.string(),
  v.maxLength(MAX_TOPIC_TITLE),
  v.check((s) => s.trim().length > 0, "title must not be blank"),
);
export const bodyStr = v.pipe(v.string(), v.maxLength(MAX_TOPIC_BODY));

export const TopicSchema = v.object({
  title: titleStr,
  body: bodyStr,
  source: v.picklist(["manual", "ai", "fallback"]),
});

export const TopicStateSchema = v.object({
  topic: v.nullable(TopicSchema),
  generating: v.boolean(),
  degraded: v.boolean(),
  aiUnlocked: v.boolean(),
});

export const TopicFrameSchema = v.object({
  type: v.literal("topic"),
  state: TopicStateSchema,
});

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST
// 「未知 type・余剰フィールド・サイズ超過は即拒否」。poker と `room.check` は既に揃えてある
// （`packages/room-core/src/wire.ts` の注釈）。`v.object` は未知キーを黙って落として通す。
export const TopicCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("topic.set"), title: titleStr, body: bodyStr }),
  v.strictObject({ command: v.literal("topic.clear") }),
  v.strictObject({
    command: v.literal("topic.generate"),
    mode: v.picklist(["ai", "fallback"]),
    // `docs/adr/0012` D10 の列挙検証。**ここを `v.string()` に戻すと、プロンプトへ
    // 任意の文字列が届く**(2026-08-13 に持ち出し経路が本番で成立した入口)。
    language: v.picklist(LANGUAGES),
    difficulty: v.picklist(DIFFICULTIES),
  }),
  v.strictObject({
    command: v.literal("ai.unlock"),
    // 空文字は合言葉として無効(timer-core の AiUnlockCommand と同じ)。
    key: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_AI_UNLOCK_KEY)),
  }),
]);
export type TopicCommand = v.InferOutput<typeof TopicCommandSchema>;

export const TOPIC_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "AI_UNLOCK_FAILED",
  "GENERATION_COOLDOWN",
  "MESSAGE_TOO_LARGE",
  // 接続層(ws-adapter.ts)がハンドラの同期例外・reject を隔離した結果を伝えるコード。
  // 文言は接続層の INTERNAL_ERROR_TEXT と同じにする(error-messages.ts)。
  "INTERNAL_ERROR",
] as const;
export const TopicErrorCodeSchema = v.picklist(TOPIC_ERROR_CODES);
export type TopicErrorCode = (typeof TOPIC_ERROR_CODES)[number];

export const TopicErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: TopicErrorCodeSchema,
  message: v.string(),
});
