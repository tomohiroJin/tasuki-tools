/**
 * お題の生成にまつわる表示を決める純関数（#283）。
 *
 * **材料はサーバーが送る帳簿（`Room.problemGeneration`）だけである。**
 *
 * かつてここには `shouldClearGenerating` があり、前後の snapshot のお題の内容
 * （title / source）が変わったかで「生成が終わった」を推測していた。その推測は
 * **2 通りに破れる** ——
 *
 * - 作り直しで**同じお題が選ばれる**と差分が出ない（`pickFallback` は候補から選ぶ）。
 *   降ろす経路が成立せず、押した人だけが安全弁の 65 秒まで固まった
 * - 途中から繋ぎ直した端末は**前の snapshot を持たない**ので、差分をそもそも問えない
 *
 * ⚠ **ここに内容差分を戻さないこと。** 帳簿が無い snapshot（配布の窓で旧サーバーが
 * 送るもの）では「出さない」へ倒す。推測で埋めると #283 が閉じた穴がそのまま開く。
 */
import type { Room } from "@tasuki/timer-core";

/** サーバーがいまお題を作り直しているか（EARS 1・EARS 2）。 */
export function isGeneratingProblem(room: Room | null): boolean {
  return room?.problemGeneration?.active === true;
}

/**
 * 「AI で作れなかったので定型にした」という断り書きを出すか（EARS 3）。
 *
 * **この断りは、いま画面に載っているお題についてのものである。**
 * サーバーの印（`degraded`）が降りるのは次の依頼のときだけなので、印だけを見ると
 * **利用者が自分で貼り付けた／編集したお題にまで**「AI で作れませんでした」が付く
 * （レビュー指摘 2）。印が語れるのは**サーバーが確定したそのお題がそのまま
 * 載っている間**だけなので、載っているお題の側も見る。
 *
 * ⚠ **ここに「お題の内容が変わったか」を持ち込まないこと。** 見るのは
 * 「人の手が入ったか」（`edited`）であって、前の snapshot との差分ではない ——
 * 差分に戻すと #283 が閉じた穴がそのまま開く。
 */
export function showsFallbackNotice(room: Room | null): boolean {
  if (room === null) return false;
  const generation = room.problemGeneration;
  if (generation === undefined) return false;
  // 走っている最中に結末を言うと、そのあと AI で作れた場合に嘘になる。
  if (generation.active) return false;
  if (!generation.degraded) return false;
  // 断るべきお題がもう無い（完了画面からロビーへ戻ると落ちる・#273）。
  if (room.problem === null) return false;
  // 利用者が手で書き換えた以上、もうサーバーが選んだお題ではない。
  return room.problem.edited !== true;
}
