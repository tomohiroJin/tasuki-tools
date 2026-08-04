/**
 * rotation（参加者IDの配列・D6b）を表示名へ写すヘルパ。
 *
 * 同定は識別子で、表示は名前で行う。この境界を1箇所に閉じ込めることで、
 * 「表示名で rotation を照合して同名の別人を取り違える」という Issue #22 の
 * 主要な欠陥が画面側で再発しないようにする。
 */

import type { Participant } from "@tasuki/timer-core";
import { participantLabel } from "./participant-label.js";

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
}

/**
 * rotation を「識別子＋表示名」の配列へ写す。
 *
 * 表示名だけの配列にしないのは、React の key や行の同定に識別子が要るためである。
 * 表示名は同名参加者で衝突しうるので、key に使うと同名の行同士が入れ替わったときに
 * DOM が取り違えられる（強調やアニメーションが別人の行に付く）。
 *
 * 対応する参加者が居ない ID は表示名が空文字になるが、サーバーが退出時に rotation からも
 * 外すため通常は発生しない。
 */
export function rotationMembers(
  rotation: readonly string[],
  participants: readonly Participant[],
): RotationMember[] {
  const names = new Map(participants.map((p) => [p.participantId, p.displayName]));
  return rotation.map((participantId) => {
    const displayName = names.get(participantId) ?? "";
    return {
      participantId,
      displayName,
      label: participantLabel(displayName, participantId, participants),
    };
  });
}
