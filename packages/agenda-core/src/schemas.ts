/**
 * 進行タイマーの接続の境界スキーマ（#429）。
 *
 * **進行タイマーのコマンドはここにしか無い。** 他のツールのスキーマに含めないことが
 * 「進行タイマーを操作できるのは agenda の接続だけ」の仕組みそのものである。
 * **エラーコードは文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。文言は `error-messages.ts`。
 */
import * as v from "valibot";
import { AGENDA_DOMAIN_ERROR_CODES } from "./errors.js";
import {
  EXTEND_MINUTES,
  MAX_ITEMS,
  MAX_SCENARIO_TITLE,
  MAX_STEP_NAME,
  MAX_TOTAL_SEC,
  STEP_SEC_GRANULARITY,
  STEP_SEC_MAX,
  STEP_SEC_MIN,
} from "./limits.js";

/** C0 制御文字と DEL */
// eslint-disable-next-line no-control-regex -- 制御文字を拒むのが目的
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const stepNameStr = v.pipe(
  v.string(),
  v.maxLength(MAX_STEP_NAME),
  v.check((s) => s.trim().length > 0, "step name must not be blank"),
  v.check((s) => !CONTROL_CHARS.test(s), "step name must not contain control characters"),
);

// 会の名前は空を許す
const scenarioTitleStr = v.pipe(
  v.string(),
  v.maxLength(MAX_SCENARIO_TITLE),
  v.check((s) => !CONTROL_CHARS.test(s), "title must not contain control characters"),
);

const timeoutBehavior = v.picklist(["wait", "advance"]);

export const StepInputSchema = v.strictObject({
  name: stepNameStr,
  durationSec: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(STEP_SEC_MIN),
    v.maxValue(STEP_SEC_MAX),
    v.check((n) => n % STEP_SEC_GRANULARITY === 0, "durationSec must be a multiple of the granularity"),
  ),
  onTimeout: timeoutBehavior,
});

export const ScenarioInputSchema = v.strictObject({
  title: scenarioTitleStr,
  steps: v.pipe(
    v.array(StepInputSchema),
    v.minLength(1),
    v.maxLength(MAX_ITEMS),
    v.check((steps) => steps.reduce((sum, s) => sum + s.durationSec, 0) <= MAX_TOTAL_SEC, "total duration too long"),
  ),
});

const stepIdStr = v.pipe(v.string(), v.minLength(1), v.maxLength(16));

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST。
export const AgendaCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("agenda.scenario.set"), scenario: ScenarioInputSchema }),
  v.strictObject({ command: v.literal("agenda.start") }),
  v.strictObject({ command: v.literal("agenda.next"), stepId: stepIdStr }),
  v.strictObject({ command: v.literal("agenda.pause") }),
  v.strictObject({ command: v.literal("agenda.resume") }),
  v.strictObject({
    command: v.literal("agenda.extend"),
    stepId: stepIdStr,
    minutes: v.picklist(EXTEND_MINUTES),
  }),
  v.strictObject({ command: v.literal("agenda.skip"), stepId: stepIdStr, skipped: v.boolean() }),
  v.strictObject({ command: v.literal("agenda.reset") }),
  v.strictObject({ command: v.literal("agenda.sync") }),
]);
export type AgendaCommand = v.InferOutput<typeof AgendaCommandSchema>;

/**
 * フレームの時間切れの振る舞いは**開いた文字列**で受ける（最終レビュー M-2・ADR 0027）。新しいサーバーが振る舞いを
 * 足しても、古い web がフレームごと捨てて盤が止まらないように。知らない値は「押すまで待つ」として読む
 * （画面が勝手に進めたり鳴らしたりしない側へ倒す）。コマンドとシナリオの入力は列挙のまま。
 */
const frameTimeoutBehavior = v.pipe(
  v.string(),
  v.transform((s): "wait" | "advance" => (s === "advance" ? "advance" : "wait")),
);

// 受けるフレームは**非 strict**（サーバーが項目を足しても古い web がフレームごと捨てない）。
const stepViewSchema = v.object({
  id: v.string(),
  name: v.string(),
  durationSec: v.number(),
  onTimeout: frameTimeoutBehavior,
  skipped: v.boolean(),
  extensionSec: v.number(),
  spentMs: v.nullable(v.number()),
});

const AgendaViewSchema = v.object({
  phase: v.picklist(["idle", "running", "paused", "finished"]),
  title: v.string(),
  steps: v.array(stepViewSchema),
  currentId: v.nullable(v.string()),
  runElapsedMs: v.number(),
  stepTimerMs: v.number(),
  stepSpentMs: v.number(),
});

export const AgendaFrameSchema = v.object({
  type: v.literal("agenda"),
  state: AgendaViewSchema,
});

/** ドメインのコード ＋ 接続層の共通のコード（ルーレットの共通部分と同じ並び） */
export const AGENDA_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "MESSAGE_TOO_LARGE",
  "INTERNAL_ERROR",
  ...AGENDA_DOMAIN_ERROR_CODES,
] as const;
export type AgendaErrorCode = (typeof AGENDA_ERROR_CODES)[number];

export const AgendaErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: v.picklist(AGENDA_ERROR_CODES),
  message: v.string(),
});
