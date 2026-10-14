/**
 * 名簿の振り分けと並べ方（#370 で `components/RosterPanel.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 *
 * 並べるだけで番号は出さないので、サーバーと食い違わない（2026-10-13 に確かめた）。
 */

/**
 * ドライバー（輪の中）と見学（輪の外）に分ける。
 *
 * - ドライバー: 現ドライバー起点の巡回順（現=0, 次=1, …）で並べる。交代のたびにリストが
 *   1つずつ繰り上がる自然な並びにする（v2.10 #4）。現ドライバーが輪に居なければ元の順のまま
 * - 見学: 元の相対順を保持する
 *
 * @param rotation ドライバーのローテーション順（`session.rotation`＝参加者IDの配列・D6b）。
 *   participants の配列位置と rotation の位置は一致しない
 */
export function splitRoster<P extends { participantId: string }>(
  participants: readonly P[],
  rotation: readonly string[] | undefined,
  currentDriverId: string,
): { drivers: P[]; watchers: P[] } {
  const inRot = (p: P) => (rotation ? rotation.includes(p.participantId) : false);
  const rotParts = participants.filter(inRot);
  const watchers = participants.filter((p) => !inRot(p));
  if (!rotation || rotation.length === 0) return { drivers: rotParts, watchers };
  const len = rotation.length;
  const curIdx = rotation.indexOf(currentDriverId);
  const turnOrder = (p: P): number => {
    const i = rotation.indexOf(p.participantId);
    if (i < 0 || curIdx < 0) return Number.MAX_SAFE_INTEGER;
    return (i - curIdx + len) % len;
  };
  return { drivers: [...rotParts].sort((a, b) => turnOrder(a) - turnOrder(b)), watchers };
}
