/**
 * 席（サーバーが組む交代の輪の1枠・#276 D2）を表示用ビューへ写すヘルパ。
 *
 * 同定は識別子で、表示は名前で行う。この境界を1箇所に閉じ込めることで、
 * 「表示名で rotation を照合して同名の別人を取り違える」という Issue #22 の
 * 主要な欠陥が画面側で再発しないようにする。
 */

import type { Seat, SeatSkipReason } from "@tasuki/timer-core";
import { labelPool, participantLabel, type LabelParticipant } from "./participant-label.js";

/** rotation 1枠分の表示用ビュー。識別子・表示名・呼び名を対にして持つ。 */
export interface RotationMember {
  participantId: string;
  /** 素の表示名。頭文字アバターなど「名前そのもの」が要る場所で使う。 */
  displayName: string;
  /**
   * 画面に出す呼び名。同名が並ぶときだけ識別子が付く（`participant-label.ts`）。
   *
   * 現ドライバー・次・ナビ・交代順ストリップは、これを使わないと同名2名が
   * どちらも「Bob」と出て「次は誰か」が判別できない（実機検証で判明）。
   */
  label: string;
  /**
   * その席が飛ばされる理由（`Seat.skipReason`・#276 D3）。null は「次の交代で番が回る」。
   *
   * サーバーが `computeIneligibleIndices`（D21）でドライバーから外した席にだけ付く。
   * 画面がこの理由を示せないと、利用者には「誰の番か分からないまま飛ばされる枠」に見える。
   * 理由を 3 種類に出し分けるのはこの関数の仕事ではない（各表示コンポーネント側で扱う）。
   */
  skipReason: SeatSkipReason | null;
}

/**
 * 席の配列を「識別子＋表示名＋呼び名」の配列へ写す。
 *
 * **席はサーバーが組む。** `Seat.displayName` は絞っていない名簿（在席者に限らない）
 * から引かれており、`config.members` の添字対応で名前を補う経路はここには無い
 * （その経路は席の側・`buildTimerSnapshotRoom` に畳まれた）。
 *
 * 呼び名の判定対象プールは `labelPool`（`participant-label.ts`）に1つだけ置く。
 * ここで別に和集合を組むと、一覧側の呼び出し口（`RosterPanel.tsx` 等）と規則が
 * ずれたときに検出できない（敵対的レビュー #276 指摘1）。
 *
 * 表示名だけの配列にしないのは、React の key や行の同定に識別子が要るためである。
 * 表示名は同名参加者で衝突しうるので、key に使うと同名の行同士が入れ替わったときに
 * DOM が取り違えられる（強調やアニメーションが別人の行に付く）。
 */
export function rotationMembers(
  seats: readonly Seat[],
  participants: readonly LabelParticipant[],
): RotationMember[] {
  const pool = labelPool(seats, participants);

  return seats.map((s) => ({
    participantId: s.id,
    displayName: s.displayName,
    label: participantLabel(s.displayName, s.id, pool),
    skipReason: s.skipReason,
  }));
}
