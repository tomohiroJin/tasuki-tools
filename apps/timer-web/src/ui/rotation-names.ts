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
  /**
   * その席の人が **timer の画面に居ない**か（#95 S5a・S5c）。
   *
   * 真なら表示名は `config.members` から補っている。サーバーはこの席をドライバーから
   * 外すので（`computeIneligibleIndices`・D21）、**順番は回らない**。画面がこの理由を
   * 示せないと、利用者には「誰の番か分からないまま飛ばされる枠」に見える。
   *
   * 代理（`isPlaceholder`）は一覧に載るので常に偽である。対面に居る実在の人を表し、
   * ドライバーも回る。
   */
  isAway: boolean;
}

/**
 * rotation を「識別子＋表示名」の配列へ写す。
 *
 * 表示名だけの配列にしないのは、React の key や行の同定に識別子が要るためである。
 * 表示名は同名参加者で衝突しうるので、key に使うと同名の行同士が入れ替わったときに
 * DOM が取り違えられる（強調やアニメーションが別人の行に付く）。
 *
 * ## 名前の引き先が 2 つある理由（#95 S5a・S5c）
 *
 * かつてここには「対応する参加者が居ない ID は表示名が空文字になるが、サーバーが退出時に
 * rotation からも外すため通常は発生しない」と書いてあった。**S5a でこの前提が崩れた。**
 * `participants` は timer の在席者に絞って送られるようになり（選択画面や poker に居る人は
 * 載らない）、一方で**名簿からは誰も消えず、輪の席も表示名も残る**（R7）。S5c で
 * 「選択画面へ戻る」導線が付いたので、誰でもこの状態に到達できる。
 *
 * サーバーは**絞っていない名簿**から `config.members`（rotation と同じ順の表示名）を
 * 組んでいる（`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の
 * `rotationDisplayNames`）。`participants` から引けなかった席はそこから補い、{@link
 * RotationMember.isAway} を立てる。
 *
 * ⚠ **`memberNames` との対応づけは添字しかない。** 表示名の配列なので識別子を持たず、
 * wire の型（`SessionConfig`）も `RoomSchema` も rotation との長さの一致を要求していない。
 * ずれた配列から引くと**別人の名前を席に貼る**という最悪の壊れ方をするので、
 * **長さが一致するときだけ**添字で引き、違えば S5a 以前と同じ空文字へ落とす。
 */
export function rotationMembers(
  rotation: readonly string[],
  participants: readonly Participant[],
  memberNames: readonly string[] = [],
): RotationMember[] {
  const names = new Map(participants.map((p) => [p.participantId, p.displayName]));
  // 添字で対応づけてよいのは長さが一致するときだけ（上の注記）。
  const fallbackNames = memberNames.length === rotation.length ? memberNames : [];
  return rotation.map((participantId, index) => {
    const presentName = names.get(participantId);
    const displayName = presentName ?? fallbackNames[index] ?? "";
    return {
      participantId,
      displayName,
      label: participantLabel(displayName, participantId, participants),
      isAway: presentName === undefined,
    };
  });
}
