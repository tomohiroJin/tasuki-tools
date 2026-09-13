/**
 * 見え方が紛らわしい表示名に識別子を添える（#95 S5a・R13）。
 *
 * 判定は `@tasuki/room-core` の {@link nameSkeleton} に任せる —— 同じ規則を写すと、
 * サーバーが正規化の規約を直したときに画面だけが古い判定を続ける。
 * timer 側（`apps/timer-web/src/ui/participant-label.ts`）も同じ関数を使っている。
 */
import { nameSkeleton } from '@tasuki/room-core';

export interface LabelParticipant {
  readonly participantId: string;
  readonly displayName: string;
}

/**
 * 同じ見え方の人が他に居れば、識別子の頭 4 文字を添えた名前を返す。
 *
 * **自分だけが該当する場合は添えない**（1 人しか居ない名前に識別子は要らない）。
 */
export function labelFor(
  participant: LabelParticipant,
  everyone: readonly LabelParticipant[],
): string {
  const skeleton = nameSkeleton(participant.displayName);
  const lookAlike = everyone.filter((p) => nameSkeleton(p.displayName) === skeleton);
  if (lookAlike.length <= 1) return participant.displayName;
  return `${participant.displayName}（${participant.participantId.slice(0, 4)}）`;
}
