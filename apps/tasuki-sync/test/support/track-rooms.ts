/**
 * うちわけの試験の土台。接続のある人・無い人の数だけを指定して名簿を組む。
 */
import type { Room } from "@tasuki/room-core";

/** `online` 人は玄関の接続を 1 本ずつ持ち、`offline` 人は接続を持たない（名簿には残る）。 */
export function roomWith(code: string, counts: { online: number; offline?: number }): Room {
  const online = Array.from({ length: counts.online }, (_, i) => ({
    id: `on-${i}`,
    displayName: `在席${i}`,
    connections: new Map<string, string | null>([[`conn-${i}`, null]]),
    joinedAt: 0,
  }));
  const offline = Array.from({ length: counts.offline ?? 0 }, (_, i) => ({
    id: `off-${i}`,
    displayName: `不在${i}`,
    connections: new Map<string, string | null>(),
    joinedAt: 0,
  }));
  return { code, createdAt: 0, participants: [...online, ...offline] };
}
