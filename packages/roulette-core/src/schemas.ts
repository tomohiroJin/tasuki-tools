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
import { MAX_GUESTS } from "./limits.js";

const idStr = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const entrySchema = v.object({ id: v.string(), name: v.string() });

// **余計なフィールドは拒む**（`v.strictObject`）。`docs/adr/0011` 決定 2 S3 の MUST
// 「未知 type・余剰フィールド・サイズ超過は即拒否」。新しいコマンドには古いクライアントが
// 居ないので、厳しい側から始める（`room.check` と同じ理由）。
export const RouletteCommandSchema = v.variant("command", [
  v.strictObject({ command: v.literal("roulette.spin") }),
  v.strictObject({ command: v.literal("roulette.include"), id: idStr, included: v.boolean() }),
  // 名前の長さは**ここで縛らない**（`room.join` の `displayName` と同じ扱い・`room-core/src/wire.ts`）。
  // 上限は表示名の規約（`apps/tasuki-sync/src/application/display-name-rule.ts`）が正規化の前後で課す。
  // 境界に別の狭い上限を置くと、`room.join` では通る名前（前後の空白を含むなど）がここだけで落ちる。
  // 巨大入力は接続層のメッセージの大きさの上限が先に落とす。
  v.strictObject({ command: v.literal("roulette.guest.add"), name: v.string() }),
  // 束の大きさは境界で縛る（名前の規約の前に巨大な配列を落とす）。各名前の長さは縛らない（`guest.add` と同じ）。
  v.strictObject({
    command: v.literal("roulette.guest.addMany"),
    names: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(MAX_GUESTS)),
  }),
  v.strictObject({ command: v.literal("roulette.guest.remove"), id: idStr }),
  v.strictObject({ command: v.literal("roulette.cycle.reset") }),
  // 選ぶ人数（#401 spec M2）。**範囲（1〜MAX_PICK の整数）はここで縛らない**: ドメインの `setPickCount` が
  // `INVALID_PICK_COUNT` で拒む（`guest.add` の名前と同じ線引き。境界でも縛ると、そのコードを返す経路が無くなる）。
  v.strictObject({ command: v.literal("roulette.pick.set"), count: v.number() }),
  // 決め方（#401 順番に回す T1）。値は列挙で縛る（ドメインに範囲の外を返すコードが無い）
  v.strictObject({ command: v.literal("roulette.mode.set"), mode: v.picklist(["once", "order", "press"]) }),
  v.strictObject({ command: v.literal("roulette.order.reset") }),
  // 押して止める（#401 押して止める P3・P4）。位置の範囲はドメインの `stopPress` が `ROULETTE_STOP_INVALID` で見る
  v.strictObject({ command: v.literal("roulette.stop"), seq: v.number(), index: v.number(), settle: v.number() }),
]);
export type RouletteCommand = v.InferOutput<typeof RouletteCommandSchema>;

// 受けるフレームは**非 strict**（サーバーが項目を足しても古い web がフレームごと捨てない・
// `room-core/src/wire.ts` の規律）。
// `pickCount`・`picks` は #401 で足した。**古いサーバーは載せない**ので省略可にする（web が 1 人ぶんとして読む）。
const pickSchema = v.object({ index: v.number(), settle: v.number() });

// `mode`・`order`・`turn` は #401 順番に回すで足した。古いサーバーは載せない
const RouletteViewSchema = v.object({
  pickCount: v.optional(v.number()),
  mode: v.optional(v.picklist(["once", "order", "press"])),
  order: v.optional(v.nullable(v.object({ done: v.array(entrySchema), finished: v.boolean() }))),
  excluded: v.array(v.string()),
  guests: v.array(entrySchema),
  // 古い画面が必須で読むので残す。サーバーは常に空の配列で送る（#427）
  drawn: v.array(v.string()),
  spin: v.nullable(
    v.object({
      seq: v.number(),
      wheel: v.array(entrySchema),
      winnerIndex: v.number(),
      settle: v.number(),
      picks: v.optional(v.array(pickSchema)),
      turn: v.optional(v.number()),
      press: v.optional(
        v.object({
          p0: v.number(),
          rate: v.number(),
          stop: v.nullable(v.object({ index: v.number(), settle: v.number(), by: v.nullable(v.string()), atMs: v.number() })),
        }),
      ),
      // 変わった止まり方（#420）。名前は列挙で縛らない（新しいサーバーの知らない名前でフレームごと捨てない）
      stopStyle: v.optional(v.string()),
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

const RouletteErrorCodeSchema = v.picklist(ROULETTE_ERROR_CODES);

export const RouletteErrorFrameSchema = v.object({
  type: v.literal("error"),
  code: RouletteErrorCodeSchema,
  message: v.string(),
});
