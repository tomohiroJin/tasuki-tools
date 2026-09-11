// 投票ラウンド（data-model「Round 状態機械」）。**#95 S4a で Round が集約ルートになった。**
//
// 名簿（誰が居るか・接続中か）は `@tasuki/room-core` が持ち、ここには持ち込まない。
// voting → revealed の遷移と投票操作。すべて純関数 + Result 型（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card } from './deck';

export interface Round {
  status: 'voting' | 'revealed';
  /** participantId → 選択カード */
  votes: Map<string, Card>;
}

export type RoundError =
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'next-round' };

/**
 * 名簿の断片（自動公開の判定に要るぶんだけ）。
 *
 * **`@tasuki/room-core` を import しない。** 依存方向の許可表
 * （`scripts/audit-dependency-direction.mjs`）は `packages/poker-core` に
 * `["@tasuki/protocol"]` しか許していない（設計正本 D2）。構造的部分型で受けるので、
 * 呼び出し側は room-core の `Participant` から必要な 2 つを写して渡せばよい。
 *
 * `connected` は room-core の `presence !== "offline"` に対応する（アプリ層が変換する）。
 *
 * **`snapshot.ts` の `ParticipantFragment` はこれを継承した上位集合である**
 * （＝名簿の断片の定義はこの 1 つで、こちらが最小面）。アプリ層は両方へ
 * `ParticipantFragment[]` を渡してよい。
 */
export interface VoterView {
  id: string;
  connected: boolean;
}

/** 新しいラウンド（voting・票なし）。ルーム作成時にアプリ層が呼ぶ（FR-001）。 */
export function createRound(): Round {
  return { status: 'voting', votes: new Map() };
}

/** 投票（公開前は上書き可。FR-005〜007） */
export function castVote(round: Round, voterId: string, card: Card): Result<Round, RoundError> {
  if (round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'vote' });
  }
  const votes = new Map(round.votes);
  votes.set(voterId, card);
  return ok({ ...round, votes });
}

/**
 * 自動公開の判定: 接続中の在室者（途中参加者を含む）が全員投票済み（FR-008, Clarification Q3）。
 *
 * **接続中が 0 人なら立たない。** `every` は空集合で真になるので、この番人が無いと
 * 「名簿を渡し忘れた／空の名簿しか渡さない」テストが常に緑になる（設計正本 §6.4）。
 */
export function shouldAutoReveal(round: Round, voters: readonly VoterView[]): boolean {
  if (round.status !== 'voting') return false;
  const connected = voters.filter((v) => v.connected);
  return connected.length > 0 && connected.every((v) => round.votes.has(v.id));
}

/** 条件成立時のみ revealed へ遷移させる（不成立ならそのまま返す） */
export function applyAutoReveal(round: Round, voters: readonly VoterView[]): Round {
  if (!shouldAutoReveal(round, voters)) return round;
  return { ...round, status: 'revealed' };
}

/**
 * 手動公開（FR-009）。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * **在室確認はしない** —— 在室性は接続の束縛が担保する既存設計であり、
 * 在席（設計正本 D14・D21）で見直すのは S4b（#246）である（S4a では振る舞いを変えない）。
 * `actorId` は呼び出し元が `RoomAction`（`(round, participantId) => Result<Round, RoundError>`。
 * 実体は `apps/tasuki-sync/src/poker/application/commit-room-action.ts`）として渡す都合上、
 * 引数の形を保つためだけに残る。
 */
export function revealBy(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  return ok({ ...round, status: 'revealed' as const });
}

/**
 * 再投票・次ラウンドの開始（FR-011）。ドメイン上は同一操作で、ラベルは UI の責務。
 * 全票をリセットして voting に戻す。在室確認をしない理由は {@link revealBy} と同じ。
 */
export function nextRound(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.status !== 'revealed') {
    return err({ code: 'not-revealed', op: 'next-round' });
  }
  return ok({ status: 'voting' as const, votes: new Map() });
}

// ⚠ かつてここに `discardVote`（退出した人の票を捨てる・R8）があった。#95 S4a で
// 実装したが、**呼び出し元が 1 つも生まれなかった**。入口ごとの門（`application/tool-gate.ts`）
// により 1 つのルームは timer か poker のどちらか一方の状態しか持たず、名簿から人を消す
// `participant.remove` は timer 専用コマンドなので、**poker の票を持つ人が名簿から消える
// 経路が存在しない**。到達経路の無い値を置くのは憲法 原則 X（抽象は実需があるときだけ）に
// 反し、`scripts/audit-structure.mjs` の SC-039③ が実際にそれを検出した。
// **S5 で「ルームから退出する」ユースケース（設計正本 §6.2 の R8 = `leaveRoom`）を作るときに、
// 呼び出し元と一緒に足し直す。** 実装は 5 行（`votes` を写して 1 件消すだけ）である。
