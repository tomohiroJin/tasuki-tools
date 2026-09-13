/**
 * 復帰の組にまつわる timer 側の判断（Issue #24。保存先は #95 S4b、置き場は S5b で変わった）。
 *
 * ⚠ **保存そのものは `@tasuki/sync-client` が持つ**（#95 S5b）。ハブ・timer・poker の
 * 3 つが同じ鍵（`tasuki:resume:<コード>`）を読み書きするので、写しを 3 つに増やす前に
 * 規約ごと寄せた。ここに残るのは **timer の画面の判断**（{@link shouldResumeOnLoad}）だけである。
 *
 * WS の自動再接続後と、参加用 URL を開き直したときに、利用者の操作なしで
 * `room.join`（resumeToken 付き）を送るため、自分の参加者情報を保持する。
 *
 */

import type { ResumeIdentity } from "@tasuki/sync-client";

/**
 * ページ読み込み時に、参加画面を出さずそのまま復帰してよいかを判定する（#76 F-3）。
 *
 * 保存済みの組が URL のルームと一致するなら、それは「同じ人が同じ部屋に戻ってきた」ことに
 * 他ならない。**`localStorage` へ移った S4b 以降は、同じタブの再読込だけでなく
 * タブを閉じて開き直した場合・別タブで開いた場合もここを通る**（R16）。
 *
 * 一致を要求するのは、前のルームの情報が残った状態で別の招待リンクを開いたときに、
 * 勝手に前のルームへ引き戻さないため。**鍵がルーム別になった今も残す** ——
 * 呼び出し側は URL のコードで読むので通常は一致するが、この判定が
 * 「保存値を信じてよい最小条件」（トークンと表示名が揃っている）も兼ねている。
 */
export function shouldResumeOnLoad(
  saved: ResumeIdentity | null,
  codeFromUrl: string | null,
): saved is ResumeIdentity {
  if (saved === null || codeFromUrl === null) return false;
  if (saved.code !== codeFromUrl) return false;
  return saved.resumeToken.length > 0 && saved.displayName.length > 0;
}
