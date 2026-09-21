/**
 * 表示名の規約を**入口をまたいで 1 つ**適用する（#95 S5b・#248）。
 *
 * 規約そのもの（正規化の規則と上限）は `@tasuki/room-core` にある。ここに置くのは
 * **その適用**である —— 合成ルート（`apps/tasuki-sync`）は両方の文脈に依存してよい
 * 唯一の層で、入口は 3 つ（timer・ハブ・poker）ある。
 *
 * ## なぜ 1 つに寄せたか
 *
 * S4a まで poker は自前の規約（`packages/poker-core/src/name.ts` の 24 文字）を持ち、
 * timer とハブは `MAX_DISPLAY_NAME`（40）を使っていた。**ハブで名乗った名前が poker へ
 * 届くのは S5b から**なので、食い違いはこの段で実害に変わる（40 文字で名乗った人が
 * poker の入口だけで弾かれる）。
 *
 * 実測でもう 1 つ出た。**S5a のハブの入口は上限も空判定も効いていなかった** ——
 * `hub-handlers.ts` が `normalizeDisplayName(raw) === null` を見ていたが、あの関数は
 * `string` しか返さない。空文字も 1000 文字も素通りしていた。適用が入口ごとに
 * 書かれている限り、この形の抜けは何度でも起きる。
 *
 * ## 上限は正規化の前後で二重に課す
 *
 * - 前（緩い・`MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION`）: 明らかな巨大入力を NFKC の
 *   計算より手前で落とす
 * - 後（厳密・`MAX_DISPLAY_NAME`）: **実際に保存・配信される長さ**を保証する。
 *   NFKC は 1 文字を最大 18 文字へ展開しうるので（U+FDFA `ﷺ`）、前段だけだと
 *   40 文字の入力が 720 文字として保存され、全参加者へ配信・描画される
 *
 * **拒否の返し方は入口ごとに違う**（timer は `INVALID_COMMAND`、poker は
 * `invalid-message`）。ここは理由だけを返し、wire への畳み方は各メッセージ層に残す。
 */

import { err, ok, type Result } from "neverthrow";
import {
  MAX_DISPLAY_NAME,
  MAX_NFKC_EXPANSION,
  normalizeDisplayName,
  rendersAsNothing,
} from "@tasuki/room-core";

/** 表示名が受け取れなかった理由。呼び出し側はこれを 1 つの wire エラーへ畳む。 */
export type DisplayNameRejection = "EmptyAfterNormalize" | "TooLong";

/**
 * 拒否を利用者へ伝える文言。**ハブと poker が共有する**（timer は自分の文言表を持つ）。
 *
 * 理由（長すぎる／空になった）で文言を分けない。分けると、名前の中身に応じて
 * 違う答えを返すことになり、入力の探りに使える手掛かりが増える。
 */
export const INVALID_DISPLAY_NAME_MESSAGE = "表示名の形式が正しくありません";

/**
 * 表示名を正規形へ直し、上限を課す。**保存・配信してよい値だけを返す。**
 */
export function applyDisplayNameRule(raw: string): Result<string, DisplayNameRejection> {
  // 前段（緩い上限）。NFKC を走らせる前に落とす。
  if (raw.length > MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION) return err("TooLong");

  const displayName = normalizeDisplayName(raw);
  // **長さだけを見ない**（#284 の 3 巡目）。ZWJ・U+FE0F・U+00AD などは正当な用途の
  // ために残すので、それ 1 文字だけの名前は「長さ 1」で通り、名簿に
  // **何も見えない行**が並ぶ。
  if (rendersAsNothing(displayName)) return err("EmptyAfterNormalize");
  // 後段（厳密な上限）。保存・配信される値に対して効かなければ意味がない。
  if (displayName.length > MAX_DISPLAY_NAME) return err("TooLong");

  return ok(displayName);
}
