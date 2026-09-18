/**
 * 席（サーバーが組む交代の輪の1枠・#276 D2）を表示用ビューへ写すヘルパ。
 *
 * 同定は識別子で、表示は名前で行う。この境界を1箇所に閉じ込めることで、
 * 「表示名で rotation を照合して同名の別人を取り違える」という Issue #22 の
 * 主要な欠陥が画面側で再発しないようにする。
 */

import type { Seat, SeatSkipReason } from "@tasuki/timer-core";
import { participantLabel, type LabelParticipant } from "./participant-label.js";

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
 * 呼び名の判定対象は **`seats` と `participants` の和集合**（id で重複排除）。
 * 片方だけでは足りない —— `seats` だけだと輪の外の見学者との同名を取りこぼし
 * （見学者は席を持たない）、`participants` だけだと離席者どうしの同名を取りこぼす
 * （`participants` は timer の在席者に絞られており、離席した席の相方が乗らない・R5/R6）。
 *
 * 表示名だけの配列にしないのは、React の key や行の同定に識別子が要るためである。
 * 表示名は同名参加者で衝突しうるので、key に使うと同名の行同士が入れ替わったときに
 * DOM が取り違えられる（強調やアニメーションが別人の行に付く）。
 */
export function rotationMembers(
  seats: readonly Seat[],
  participants: readonly LabelParticipant[],
): RotationMember[] {
  // 呼び名の判定対象は「同じ画面に並ぶ人」全員（#276 D9）。
  // seats だけだと輪の外の見学者との同名を取りこぼし、participants だけだと
  // 離席者どうしの同名を取りこぼす（S5a で participants が在席で絞られたため）。
  const byId = new Map<string, LabelParticipant>();
  for (const s of seats) byId.set(s.id, { participantId: s.id, displayName: s.displayName });
  for (const p of participants) if (!byId.has(p.participantId)) byId.set(p.participantId, p);
  const pool = [...byId.values()];

  return seats.map((s) => ({
    participantId: s.id,
    displayName: s.displayName,
    label: participantLabel(s.displayName, s.id, pool),
    skipReason: s.skipReason,
  }));
}
