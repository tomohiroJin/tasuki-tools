/**
 * ホスト交代の通知メッセージを算出する純粋関数（R2-4）。
 *
 * snapshot に常に載る hostParticipantId の「直前値→現在値」の変化を見て、
 * 明示移譲・自動委譲の双方を 1 経路で検知する（新 signal は使わない）。
 * 初回（prev 未定義）や変化なしは null（＝通知しない）。
 */
import type { Room } from "@tdd-mob/core";

export function hostChangeMessage(
  prevHostId: string | undefined,
  room: Room,
  myParticipantId: string,
): string | null {
  const current = room.hostParticipantId;
  if (prevHostId === undefined || prevHostId === current) return null;
  if (current === myParticipantId) return "あなたがホストになりました。";
  const name = room.participants.find((p) => p.participantId === current)?.displayName ?? "";
  return `ホストが ${name} さんに移りました。`;
}
