/**
 * ルーム画面の判断（#370 で `pages/RoomPage.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 */
import {
  cardKey,
  findSpread,
  judgeAgreement,
  judgeAllBreak,
  judgeNearAgreement,
  unanimousStreak,
  type Card,
  type ParticipantView,
  type RoomStateMessage,
  type SpreadEnd,
} from '@tasuki/poker-core';
import type { ConnectionStatus } from '@tasuki/sync-client';
import { streakSub, type ResultsEffect } from './effect-copy';

type RoundStatus = RoomStateMessage['round']['status'];

/**
 * 公開を投票中から見届けたか（#348 のレビュー）。
 *
 * 席の札が CSS の transition でめくれるのは、投票中の札が描かれていて、それが公開に変わったときだけ。
 * 再読み込み・途中入室・再接続で最初から公開済みで描くと、札はめくれずに表で出る。
 * 集計を最後の札のめくりの後まで待たせるのも、この同じ条件のときだけにする。
 *
 * @param previous 前の描画のラウンドの状態（状態がまだ無ければ undefined）
 */
export function revealedLiveAfter(previous: RoundStatus | undefined, next: RoundStatus | undefined): boolean {
  return previous === 'voting' && next === 'revealed';
}

/** 公開後の票を席の札へ渡す表（投票中は null）。席の数は小さいので、描画ごとに作ってよい。 */
export function revealedVoteMap(round: RoomStateMessage['round']): ReadonlyMap<string, Card> | null {
  return round.status === 'revealed' ? new Map(round.votes.map((v) => [v.participantId, v.card])) : null;
}

/**
 * 席の札を持つ席か（#419）。投票者は常に持つ。見学者は持たないが、開票後に票が残っていれば札を見せる
 * （集計に入っている札を隠さない）。席の一覧の描画と `--seat-order`・`--seat-count` の数えはこの 1 つに従う。
 */
export function holdsSeatCard(p: ParticipantView, votes: ReadonlyMap<string, Card> | null): boolean {
  return !p.spectator || votes?.has(p.id) === true;
}

/** 札を持つ席の数（結果の待ち `--seat-count` に渡す）。 */
export function seatCardCount(participants: readonly ParticipantView[], votes: ReadonlyMap<string, Card> | null): number {
  return participants.filter((p) => holdsSeatCard(p, votes)).length;
}

/** 切断・再接続中か。操作を受け付けない（送信しても届かないため）。 */
export function isOffline(status: ConnectionStatus): boolean {
  return status !== 'open';
}

/**
 * 開票の演出（#639・#670）。出さないなら null。**開票の瞬間の名簿で一度だけ呼ぶ**（画面は公開へ移った描画で決めて持つ。
 * 開票の後の入退室・切断で種類を変えない）。優先は 全員休憩 > 全員同じ > 大きく割れた > ほぼ同じ > 全員バラバラ > 全員の投票完了
 * （設計 `docs/superpowers/specs/2026-11-27-cutin-design.md` §3）。
 *
 * - 休憩・一致・バラバラ・ほぼ同じの判定は `poker-core` の `judgeAllBreak`・`judgeAgreement`・`judgeNearAgreement`（人数の下限つき）、
 *   割れは `findSpread`（3 段以上）。割れの促し（`spreadPromptOf`）と同じことを言う割れを、バラバラ・ほぼ同じより先に出す。
 *   なお数字の札が 3 枚以上すべて違えば必ず 3 段以上離れる（札の並びは 8 段）ので、数字だけの回の「バラバラ」は割れに先を越される
 * - 全員の投票完了（'complete'）: 接続中の投票者（見学者を除く）が 2 人以上で、全員が票を出して開票された。
 *   **全員が出すとサーバーは自動で開票する（FR-008）ので、「全員が出した・まだ開票していない」状態は wire に無い。**
 *   開票と同時に届いた状態から導く。手動で先に開票した（出していない人が居る）ときは出さない
 */
export function resultsEffectOf(
  round: RoomStateMessage['round'],
  participants: readonly ParticipantView[],
): ResultsEffect | null {
  if (round.status !== 'revealed') return null;
  // どの演出も、開票の瞬間に票を持つ全員（接続中で見学でない）が出していた回だけ。手動で先に開票した回は出さない
  const voted = new Set(round.votes.map((v) => v.participantId));
  const voters = participants.filter((p) => p.connected && !p.spectator);
  if (voters.length < 2 || !voters.every((p) => voted.has(p.id))) return null;
  // 一致・バラバラは卓に見える全票で判定する（切断した人の票も札として卓に見え、統計・割れの促しにも入る。帯は札の事実と合わせる）
  if (judgeAllBreak(round.votes)) return 'break';
  const agreement = judgeAgreement(round.votes);
  if (agreement === 'unanimous') return 'unanimous';
  if (findSpread(round.votes) !== null) return 'split';
  if (judgeNearAgreement(round.votes)) return 'near';
  return agreement ?? 'complete';
}

/**
 * 連続の添え書き「N 回続けて」（#670）。**開票の瞬間に一度だけ呼ぶ**（画面は帯と一緒に持ち、開票の後の記録の変化で変えない）。
 * 全員同じで、見積もりの記録が「記録する」で、記録の末尾から数えた連続が 2 以上のときだけ。
 * 記録しない間は出さない（画面ごとの見届けで数えると、途中入室の人とずれる）。記録は全員の画面が同じものを持つので、同じ数が出る。
 * `recording` が無い（古いサーバー）は「記録する」と読む。
 */
export function streakSubOf(effect: ResultsEffect | null, estimate: RoomStateMessage['estimate']): string | null {
  if (effect !== 'unanimous' || estimate === undefined || estimate.recording === false) return null;
  const streak = unanimousStreak(estimate.log);
  return streak >= 2 ? streakSub(streak) : null;
}

/**
 * 公開済みの今の票が、見届けた公開の票の中に収まるか（#639）。同じ回の中で票は減りうる（退出で票が消える）が、
 * 増えたり札が変わったりはしない。収まらなければ別の回の公開済みが投票中を挟まず届いたので、見届けた帯は外す。
 */
export function sameRevealRound(seen: ReadonlyMap<string, Card>, round: RoomStateMessage['round']): boolean {
  if (round.status !== 'revealed') return false;
  return round.votes.every((v) => {
    const card = seen.get(v.participantId);
    return card !== undefined && cardKey(card) === cardKey(v.card);
  });
}

/** 割れた見積もりの片側（札と、それを出した人の表示名）。 */
export type SpreadPromptEnd = { card: SpreadEnd['card']; names: readonly string[] };
export type SpreadPrompt = { high: SpreadPromptEnd; low: SpreadPromptEnd };

/**
 * 見積もりが割れたとき、最大と最小を出した人の表示名（#405・FR-010a）。割れていなければ null。
 *
 * 名簿に居ない人（票を出した後に抜けた）の名前は出さない。片側の名前が 1 人も引けないなら、
 * 誰に聞けばよいかを示せないので促し自体を出さない。
 */
export function spreadPromptOf(
  round: RoomStateMessage['round'],
  participants: readonly ParticipantView[],
): SpreadPrompt | null {
  if (round.status !== 'revealed') return null;
  const spread = findSpread(round.votes);
  if (spread === null) return null;
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const toPrompt = (end: SpreadEnd): SpreadPromptEnd => ({
    card: end.card,
    names: end.participantIds.flatMap((id) => nameOf.get(id) ?? []),
  });
  const high = toPrompt(spread.high);
  const low = toPrompt(spread.low);
  if (high.names.length === 0 || low.names.length === 0) return null;
  return { high, low };
}
