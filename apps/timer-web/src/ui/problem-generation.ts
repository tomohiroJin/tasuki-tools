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
 * **生成中は出さない。** 走っている最中に結末を言うと、そのあと AI で作れた場合に
 * 嘘になる（縮退の印は AI を試みて落ちた時点で立ち、確定まで持ち越される）。
 */
export function showsFallbackNotice(room: Room | null): boolean {
  const generation = room?.problemGeneration;
  if (generation === undefined) return false;
  return !generation.active && generation.degraded;
}
