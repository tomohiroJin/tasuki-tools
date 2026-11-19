/**
 * 名簿（room-core）→ ハブの wire（`RosterRoom`）を組む（#95 S5a・D16）。
 *
 * **文脈が出会う場所はアプリケーション層だけ**という規律を、ハブ側でも守る。
 * `timer-snapshot-dto.ts` が名簿＋timer を合成するのに対し、ここは名簿だけを写す ——
 * ハブはタイマーの状態も票も知らない（`docs/adr/0017` の文脈分割）。
 *
 * **代理（`isPlaceholder`）は載せない。** 代理は timer のローテーション上の席であって
 * 名簿の人ではなく、選択画面が示すのは「いま繋いでいる人」だからである。
 */
import { presenceOf, type Room as MembershipRoom, type RosterRoom } from "@tasuki/room-core";

/**
 * その人がいま居るツールを、接続の宣言から重複なく集める（宣言順）。
 *
 * ハブだけに居る人（宣言が `null` の接続しか持たない人）は空配列になる。
 */
function toolsOf(connections: ReadonlyMap<string, string | null>): string[] {
  const tools: string[] = [];
  for (const declared of connections.values()) {
    if (declared !== null && !tools.includes(declared)) tools.push(declared);
  }
  return tools;
}

/**
 * @param passphraseProtected そのルームに合言葉が付いているか（#638）。**平文は渡さない・載せない。**
 *   正本は `token-store.ts` の保管で、名簿（`membership`）は持たない（名簿は復帰の組と同じく合言葉を知らない）。
 *   玄関の設定の口が「設定中」と映すための印である。
 */
export function buildRoster(membership: MembershipRoom, passphraseProtected: boolean): RosterRoom {
  return {
    code: membership.code,
    passphraseProtected,
    participants: membership.participants.map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      presence: presenceOf(p),
      tools: toolsOf(p.connections),
    })),
  };
}
