/**
 * ルーレットの接続の境界スキーマ(#94・原則 IV)。
 *
 * **ルーレットのコマンドはここにしか無い。** ハブ・timer・poker・お題のスキーマに含めないことが、
 * 「ルーレットを操作できるのはルーレットの接続だけ」(spec R11)の仕組みそのものである。
 *
 * **エラーコードは文言を持たない**(`scripts/audit-domain-error-shape.mjs`)。
 * 文言は同じパッケージの `error-messages.ts` が持つ。
 */
import * as v from "valibot";
import { ROULETTE_ERROR_CODES } from "./errors.js";

const idStr = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const entrySchema = v.object({ id: v.string(), name: v.string() });

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST
// 「未知 type・余剰フィールド・サイズ超過は即拒否」。新しいコマンドには古いクライアントが
// 居ないので、厳しい側から始める（`room.check` と同じ理由）。
export const RouletteCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("roulette.spin") }),
  v.strictObject({ command: v.literal("roulette.include"), id: idStr, included: v.boolean() }),
  // 正規化と 24 字の上限は表示名の規約（同期サーバー）が持つ。ここは巨大入力を落とすだけ。
  v.strictObject({ command: v.literal("roulette.guest.add"), name: v.pipe(v.string(), v.maxLength(64)) }),
  v.strictObject({ command: v.literal("roulette.guest.remove"), id: idStr }),
  v.strictObject({ command: v.literal("roulette.cycle.reset") }),
]);
export type RouletteCommand = v.InferOutput<typeof RouletteCommandSchema>;

// 受けるフレームは**非 strict**（サーバーが項目を足しても古い web がフレームごと捨てない・
// `room-core/src/wire.ts` の規律）。
export const RouletteViewSchema = v.object({
  excluded: v.array(v.string()),
  guests: v.array(entrySchema),
  drawn: v.array(v.string()),
  spin: v.nullable(
    v.object({
      seq: v.number(),
      wheel: v.array(entrySchema),
      winnerIndex: v.number(),
      settle: v.number(),
      spunBy: v.string(),
      durationMs: v.number(),
      elapsedMs: v.number(),
    }),
  ),
});

export const RouletteFrameSchema = v.object({
  type: v.literal("roulette"),
  state: RouletteViewSchema,
});

export const RouletteErrorCodeSchema = v.picklist(ROULETTE_ERROR_CODES);

export const RouletteErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: RouletteErrorCodeSchema,
  message: v.string(),
});
