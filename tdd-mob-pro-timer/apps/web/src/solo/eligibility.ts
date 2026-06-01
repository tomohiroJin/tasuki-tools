/**
 * @deprecated ソロモードは v2 で非推奨化（入口閉鎖・App から未参照）。共有ルーム一本に統一。当面テスト維持のため残置。
 *
 * ソロモードのドライバー対象外（driverEligible=false）算出
 * 項目2/4: 共有時の handlers と同じ「離脱中の参加者を交代対象から外す」を、
 * App ローカルのロスター差分から再現する。
 *
 * engine の rotation は config.members 順（先頭が members、proxies は engine には無い）。
 * soloRosterMembers の非代理メンバーは rotation と index が 1:1 に対応するため、
 * 名前照合ではなく index で対象外を判定する（改名されても participantId は index 安定）。
 */

import type { SoloMember } from "./roster.js";

/**
 * 離脱中（skips に participantId が含まれる）メンバーが占める rotation インデックス集合を返す。
 * 代理（isProxy）は engine の driver rotation に含まれないため対象外計算から除外する。
 * @param members soloRosterMembers の出力（先頭から rotation 順に並ぶ非代理メンバー＋代理）
 * @param skips 一時離脱中の participantId 集合
 */
export function computeSoloIneligibleIndices(
  members: SoloMember[],
  skips: Set<string>,
): Set<number> {
  const set = new Set<number>();
  members.forEach((m, i) => {
    if (m.isProxy) return;
    if (skips.has(m.participantId)) set.add(i);
  });
  return set;
}
