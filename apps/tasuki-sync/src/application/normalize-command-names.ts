/**
 * 境界で表示名を正規化・検証する（#95 S4b）。
 *
 * ## なぜアプリケーション層に居るのか
 *
 * S4a まで、この仕事は timer の wire スキーマ（`packages/timer-core/src/schemas.ts` の
 * `displayNameStr`）が valibot の `transform` で行っていた。そのために **`timer-core` が
 * `@tasuki/room-core` を取り込んでいた** —— 期限つきの一時依存として記録されていたもの
 * （`docs/adr/0017` 決定 4・設計正本 D17）。
 *
 * **表示名の規約はメンバーシップ文脈のものであって、モブタイマーのものではない。**
 * 規約（正規化の規則と上限）は `@tasuki/room-core` に残したまま、それを**適用する場所**を
 * ここへ移した。合成ルート（`apps/tasuki-sync`）は両方の文脈に依存してよい唯一の層である
 * （D2・D3）。
 *
 * ## 境界は 1 箇所（`adapters/ws-adapter.ts`）
 *
 * 呼ぶのはパース直後の 1 箇所だけである。**入口ごとに正規化の有無が違うと必ずどこかが
 * 抜ける** —— 実機で `room.join` だけが素通りし、`"  Bob  "` が画面上 `"Bob"` と
 * 見分けの付かない別人として並んだ事故がある（S4a 以前の記録）。
 *
 * **失敗は既存の `INVALID_COMMAND` 経路へ合流させる。** 同じ「コマンドの形が不正」という
 * 答えであり、正規化の前後で利用者が受け取るフレーム（コード・文言）は 1 バイトも
 * 変わらない。呼び出し側がそれを担う。
 *
 * ⚠ **単体テストからハンドラを直接呼ぶ経路はここを通らない。** それは S4a 以前も同じで
 * （valibot も境界にしか無かった）、`handleCommand` に正規化を足すと今度は「境界が 2 つ」に
 * なる。実経路が生きていることは `test/live-ws.display-name.test.ts` が見る。
 */

import { err, ok, type Result } from "neverthrow";
import { MAX_DISPLAY_NAME, MAX_NFKC_EXPANSION, normalizeDisplayName } from "@tasuki/room-core";
import type { Command } from "@tasuki/timer-core";

/**
 * 表示名を運ぶコマンド。**この一覧が正本である。**
 *
 * wire スキーマ側に `displayName` を持つ枝を足したら、ここへも足すこと ——
 * 足し忘れると**その入口だけが正規化を通らない**。`Command` の判別可能 union から
 * 機械的に導けそうに見えるが、型から「表示名という意味の項目」は決められない
 * （`code` や `key` と区別が付かない）ので、宣言で持つ。
 */
const COMMANDS_WITH_DISPLAY_NAME = [
  "room.create",
  "room.join",
  "participant.addProxy",
  "participant.rename",
] as const;

/** 正規化の失敗理由。呼び出し側はこれを 1 つの wire エラーへ畳む。 */
export type DisplayNameRejection = "EmptyAfterNormalize" | "TooLong";

/**
 * コマンドが運ぶ表示名を正規形へ直す。
 *
 * 表示名を持たないコマンドは**引数そのものを返す**（写しを作らない）。
 *
 * 上限は正規化の前後で二重に課す。
 *
 * - 前（緩い・`MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION`）: 明らかな巨大入力を NFKC の
 *   計算より手前で弾く
 * - 後（厳密・`MAX_DISPLAY_NAME`）: **実際に保存・配信される長さ**を保証する。
 *   NFKC は 1 文字を最大 18 文字へ展開しうるので（U+FDFA `ﷺ`）、前段だけだと
 *   40 文字の入力が 720 文字として保存され、全参加者へ配信・描画される
 */
export function normalizeCommandNames(cmd: Command): Result<Command, DisplayNameRejection> {
  if (!hasDisplayName(cmd)) return ok(cmd);

  const raw = cmd.displayName;
  // 前段（緩い上限）。NFKC を走らせる前に落とす。
  if (raw.length > MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION) return err("TooLong");

  const displayName = normalizeDisplayName(raw);
  if (displayName.length === 0) return err("EmptyAfterNormalize");
  // 後段（厳密な上限）。保存・配信される値に対して効かなければ意味がない。
  if (displayName.length > MAX_DISPLAY_NAME) return err("TooLong");

  return ok({ ...cmd, displayName });
}

/** そのコマンドが表示名を運ぶか（運ぶなら型を絞る）。 */
function hasDisplayName(cmd: Command): cmd is Command & { displayName: string } {
  return (COMMANDS_WITH_DISPLAY_NAME as readonly string[]).includes(cmd.command);
}
