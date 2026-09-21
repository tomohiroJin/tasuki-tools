/**
 * 端末に残っていた表示名を、名乗りの欄の既定として提示してよいか（#284・FR-053 / FR-054）。
 *
 * ## なぜ検めるのか
 *
 * 保存するのは玄関だけだが、**保管庫は誰でも書き換えられる**（原則 IV）。しかも
 * 「壊れた既定」は黙っては終わらない。実測した 3 つ:
 *
 * - **上限を超える値**: `maxLength` は**打ち込みしか止めない**。上限を超える初期値は
 *   そのまま送信でき、サーバーは探りを防ぐため理由を伏せた文言で弾く
 *   （`apps/tasuki-sync/src/application/display-name-rule.ts`）。利用者には直しようが無い
 * - **空白だけの値**: `required` は素通りするのに、画面の送信判定
 *   （`displayName.trim() === ''`）が黙って弾く。**ボタンが死んで見える**
 * - **幅を持たない文字だけの値**: `trim()` では落ちず、画面には何も見えないまま飛び、
 *   サーバーが `EmptyAfterNormalize` で弾く
 *
 * どれも EARS 3 が禁じている「壊れた保存値がエラーを見せる」に当たる。**提示する前に
 * 検め、提示できない値は空にする。**
 *
 * ## 規約は写さない
 *
 * 正規化と上限の**正本は `@tasuki/room-core`** であり、ここに置くのはその適用である
 * （`apps/tasuki-sync/.../display-name-rule.ts` と同じ立て付け）。**判定の権限は
 * サーバーにある** —— ここが見るのは「送れば弾かれると先に分かる値を、既定として
 * 差し出さない」ことだけで、通す・通さないの最終判断は境界が持つ。
 * 写経した数字をここへ書かない（上限を動かすと画面とテストが揃って古いまま緑になる）。
 *
 * **保管庫には触らない**（`docs/guides/architecture.md` の「web の純粋判断」層）。
 * 読み書きと鍵の綴りは同期フック（`use-hub-sync.ts`）が持つ。
 */
import {
  MAX_DISPLAY_NAME,
  MAX_NFKC_EXPANSION,
  normalizeDisplayName,
  rendersAsNothing,
} from '@tasuki/room-core';

/**
 * 既定として提示してよい表示名。提示できないなら空文字。
 *
 * **直せるものは直す。** 前後の空白のように正規化で整う値まで空にすると、利用者は
 * 理由も分からず名前を失う。直しても通らない値（正規化すると消える・上限を超える）
 * だけを空にする。
 *
 * 上限は**正本と同じく二段で課す**（`applyDisplayNameRule`）。
 *
 * - **前段（緩い）**: `MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION` を超える入力は、NFKC も
 *   ラベルの剥がしも走らせずに落とす。ここが描画フェーズであることが理由である ——
 *   保管庫は誰でも書き換えられるので、上限いっぱい（数 M 文字）の値を置ける。
 *   **この段を通す長さでの実測**（720 文字・1 万回の平均）は、普通の名前が 0.0005ms、
 *   素の詰め物が 0.030ms、ラベルの反復が 0.039ms、**入れ子を上限いっぱいに書いた形で
 *   0.96ms** である。段を外すと入力長に比例してここが伸びる
 * - **後段（厳密）**: 正規化の後に `MAX_DISPLAY_NAME` を課す。NFKC は 1 文字を最大
 *   `MAX_NFKC_EXPANSION` 文字へ広げるので、前段だけでは保存・配信される長さを保証できない
 *
 * **前段を正本と揃えるのは、2 箇所の判定を食い違わせないためでもある。** 片方にだけ
 * 段があると、「玄関は通すのにサーバーが弾く」値の帯ができる。
 */
export function usableDefaultDisplayName(stored: string): string {
  if (stored.length > MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION) return '';
  const normalized = normalizeDisplayName(stored);
  // **空文字だけを見ない**（#284 の 3 巡目）。ZWJ や U+FE0F 1 文字の保存値は
  // 長さ 1 で通り、欄は空に見えるのに送信でき、サーバーも弾かない。
  // 判定の正本は `@tasuki/room-core` に 1 つで、境界と同じものを使う。
  if (rendersAsNothing(normalized)) return '';
  if (normalized.length > MAX_DISPLAY_NAME) return '';
  return normalized;
}
