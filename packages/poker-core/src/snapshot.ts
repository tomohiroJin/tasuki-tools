// 受信者別スナップショット投影（research R1）
// 秘匿はここで構造的に保証する: token は常に除外、voting 中の他者票は hasVoted のみ（SC-004）
//
// **#95 S4a で入力が「ルーム」から「ラウンド＋名簿の断片」の 2 つになった。**
// wire（`room-state` の形）は変えていない —— 組み立てる材料の出所が変わっただけである。
import type { CardTable } from './card-table.js';
import { compareHands, evaluateHand } from './hand-rank.js';
import type { EstimateView, RoomStateMessage, TableView, VoteView } from './protocol.js';
import type { Round, VoterView } from './round.js';
import { computeStats } from './stats.js';

/**
 * 名簿の断片（`room-state` の participants に要るぶんだけ）。
 *
 * **`@tasuki/room-core` を import しない**（理由は `round.ts` の `VoterView` と同じ）。
 * `name` は room-core の `displayName`、`connected` は `presence !== "offline"` に対応し、
 * 変換はアプリ層が行う。**トークンは受け取らない** —— 受け取らなければ漏らせない。
 *
 * **{@link VoterView}（自動公開の判定が要る最小面）を継承する。** 同じ「名簿の断片」を
 * 2 つ定義して互いを指さない状態を避けるため、`id` / `connected` の定義は `round.ts` 側
 * 1 つに寄せてある。継承の向きが逆（`Pick<ParticipantFragment, ...>`）だと
 * `round.ts` → `snapshot.ts` の逆向きの辺が増えるので、上位集合のこちらを派生側にした。
 */
export interface ParticipantFragment extends VoterView {
  name: string;
}

/**
 * 受信者に依存しない共有部分（参加者一覧・ラウンド・集計）を 1 回だけ構築し、
 * 受信者ごとの差分（you / yourVote）だけを組み立てるビルダーを返す。
 * ルーム全体への配信（broadcast）で集計や投影を受信者数ぶん再計算しないための入口
 */
export function createSnapshotBuilder(
  roomId: string,
  round: Round,
  participants: readonly ParticipantFragment[],
): (viewerId: string) => RoomStateMessage {
  const views = participants.map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    hasVoted: round.votes.has(p.id),
    spectator: round.spectators.has(p.id),
  }));

  const roundView: RoomStateMessage['round'] = (() => {
    if (round.status === 'voting') {
      // voting 中: 他者の選択値はいかなるフィールドにも含めない（FR-006）
      return { status: 'voting' as const };
    }
    const votes: VoteView[] = [...round.votes.entries()].map(([participantId, card]) => ({
      participantId,
      card,
    }));
    return { status: 'revealed' as const, votes, stats: computeStats(votes.map((v) => v.card)) };
  })();

  // 記録は受信者に依存しない。束の item は最後の行の item、行の item は載せない
  const estimate: EstimateView = {
    item: round.item,
    recording: round.recording,
    log: round.log.groups.map((g) => ({
      id: g.id,
      // `?? ''` は届かない（trimToLimit が空の束を消すので entries は常に 1 行以上）
      item: g.entries[g.entries.length - 1]?.item ?? '',
      points: g.points,
      open: g.open,
      entries: g.entries.map((e) => ({ attempt: e.attempt, at: e.at, counts: e.counts })),
    })),
  };

  const table = round.table.seats.length === 0 ? null : sharedTableView(round.table);

  return (viewerId) => {
    const hand = round.table.hands.get(viewerId);
    return {
      type: 'room-state',
      roomId,
      you: viewerId,
      participants: views,
      round: roundView,
      yourVote: round.votes.get(viewerId) ?? null,
      estimate,
      // 席が空なら載せない（#403・設計 D6）。手は受信者の分だけを足す
      ...(table && { table: { ...table, yourHand: hand === undefined ? null : [...hand] } }),
    };
  };
}

/**
 * テーブルの受信者に依存しない部分（#403・設計 §6.3）。
 *
 * **見せる前の手はここに載せない**（T-4）。他の人について届くのは席に着いていることだけで、
 * 手は {@link createSnapshotBuilder} が受信者本人の分だけを `yourHand` に足す。
 * 見せたあとは全員の手・役・いちばん強い手の持ち主（同点なら全員）を載せる。
 */
function sharedTableView(table: CardTable): Omit<TableView, 'yourHand'> {
  if (table.status !== 'shown') return { status: table.status, seats: [...table.seats], hands: [], winners: [] };
  const hands = [...table.hands.entries()].map(([participantId, cards]) => ({
    participantId,
    cards: [...cards],
    value: evaluateHand(cards),
  }));
  const best = hands.reduce<(typeof hands)[number] | undefined>(
    (top, h) => (top === undefined || compareHands(h.value, top.value) > 0 ? h : top),
    undefined,
  );
  return {
    status: 'shown',
    seats: [...table.seats],
    hands: hands.map(({ participantId, cards, value }) => ({ participantId, cards, category: value.category })),
    winners: best === undefined ? [] : hands.filter((h) => compareHands(h.value, best.value) === 0).map((h) => h.participantId),
  };
}
