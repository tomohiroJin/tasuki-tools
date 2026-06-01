/**
 * ソロモードのドライバー対象外（driverEligible=false）算出
 * 項目2: 共有時の handlers.computeIneligibleIndices と同じ「表示名で rotation に突き合わせる」
 * 方式を、App ローカルのロスター差分（soloRosterRef）から再現する。
 */

/** ソロのロスター差分（離脱・改名済みの代理名）の最小ビュー */
export interface SoloEligibilityRoster {
  /** ホストの participantId（既定 "solo"） */
  hostId: string;
  /** 改名を反映済みのホスト表示名（rotation 内のホスト名と一致する想定） */
  hostName: string;
  /** 一時離脱中の participantId 集合 */
  skips: Set<string>;
  /** 代理 participantId → 改名を反映済みの表示名 */
  proxyNames: Record<string, string>;
}

/**
 * rotation（表示名配列）に対して、離脱中の参加者名が占めるインデックス集合を返す。
 * @param rotation エンジンの rotation（表示名配列）
 * @param roster ロスター差分
 */
export function computeSoloIneligibleIndices(
  rotation: string[],
  roster: SoloEligibilityRoster,
): Set<number> {
  const ineligibleNames = new Set<string>();
  if (roster.skips.has(roster.hostId)) {
    ineligibleNames.add(roster.hostName);
  }
  for (const [pid, name] of Object.entries(roster.proxyNames)) {
    if (roster.skips.has(pid)) ineligibleNames.add(name);
  }

  const set = new Set<number>();
  rotation.forEach((name, i) => {
    if (ineligibleNames.has(name)) set.add(i);
  });
  return set;
}
