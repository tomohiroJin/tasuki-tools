/**
 * rotation（参加者IDの配列・D6b）を表示名へ写すヘルパ。
 *
 * 同定は識別子で、表示は名前で行う。この境界を1箇所に閉じ込めることで、
 * 「表示名で rotation を照合して同名の別人を取り違える」という Issue #22 の
 * 主要な欠陥が画面側で再発しないようにする。
 */

import type { Participant } from "@tdd-mob/core";

/**
 * rotation の各要素（参加者ID）を表示名へ写す。
 * 対応する参加者が居ない ID は空文字になるが、サーバーが退出時に rotation からも
 * 外すため通常は発生しない。
 */
export function rotationDisplayNames(
  rotation: readonly string[],
  participants: readonly Participant[],
): string[] {
  const names = new Map(participants.map((p) => [p.participantId, p.displayName]));
  return rotation.map((participantId) => names.get(participantId) ?? "");
}
