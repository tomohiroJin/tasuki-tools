/**
 * clockOffset 推定
 * T042: FR-007, SC-001
 * time.ping を複数回送り、round-trip 補正 + 中央値で offset を推定する
 */

export interface PingSample {
  clientSend: number;
  serverTime: number;
  clientReceive: number;
}

/**
 * 複数の ping サンプルから clockOffset を中央値で推定する
 * clockOffset = サーバー時刻 - クライアント時刻
 */
export function estimateClockOffset(samples: PingSample[]): number {
  if (samples.length === 0) return 0;

  const offsets = samples.map(({ clientSend, serverTime, clientReceive }) => {
    const roundTrip = clientReceive - clientSend;
    const latency = roundTrip / 2;
    return serverTime - (clientSend + latency);
  });

  // 中央値
  const sorted = [...offsets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
