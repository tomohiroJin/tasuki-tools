// 投票ラウンド（data-model「Round 状態機械」）。**#95 S4a で Round が集約ルートになった。**
//
// 名簿（誰が居るか・接続中か）は `@tasuki/room-core` が持ち、ここには持ち込まない。
// voting → revealed の遷移と投票操作。すべて純関数 + Result 型（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card, NumberCardValue } from './deck.js';
import {
  EMPTY_ESTIMATE_LOG,
  closeOpenGroup,
  recordReveal,
  setGroupPoints,
  type EstimateLog,
} from './estimate-log.js';

export interface Round {
  status: 'voting' | 'revealed';
  /** participantId → 選択カード */
  votes: Map<string, Card>;
  /** いま見積もっているアイテム名（空なら未設定）。長さの上限は境界が見る */
  item: string;
  /** 開票ごとの記録（#93） */
  log: EstimateLog;
}

export type RoundError =
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'revote' | 'next-item' }
  | { code: 'estimate-not-found' }
  | { code: 'estimate-open' };

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
  return { status: 'voting', votes: new Map(), item: '', log: EMPTY_ESTIMATE_LOG };
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
export function applyAutoReveal(round: Round, voters: readonly VoterView[], now: number): Round {
  if (!shouldAutoReveal(round, voters)) return round;
  return revealed(round, now);
}

/** revealed へ移し、票が 1 枚以上あればその時点の item と票の枚数を記録へ 1 行足す（記録は公開の瞬間にだけ増える） */
function revealed(round: Round, now: number): Round {
  // 票が 0 枚の開票は行にしない（空の行と、あとで「ポイントなし」で閉じる空の束が残るだけ）。開票自体は行う
  const log =
    round.votes.size === 0
      ? round.log
      : recordReveal(round.log, round.item, [...round.votes.values()], now);
  return { ...round, status: 'revealed', log };
}

/**
 * 手動公開（FR-009）。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * **在室確認はしない** —— 在室性は接続の束縛が担保する既存設計であり、
 * 在席（設計正本 D14・D21）で見直すのは S4b（#246）である（S4a では振る舞いを変えない）。
 * `actorId` は呼び出し元が `RoomAction`（`(round, participantId) => Result<Round, RoundError>`。
 * 実体は `apps/tasuki-sync/src/application/poker-commit-room-action.ts`）として渡す都合上、
 * 引数の形を保つためだけに残る。
 */
export function revealBy(round: Round, _actorId: string, now: number): Result<Round, RoundError> {
  if (round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  return ok(revealed(round, now));
}

/**
 * 再投票（FR-011）。全票をリセットして voting に戻す。item と記録（open の束）は残す
 * —— 同じアイテムの 2 回目の開票が同じ束に足される。在室確認をしない理由は {@link revealBy} と同じ。
 */
export function revote(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.status !== 'revealed') {
    return err({ code: 'not-revealed', op: 'revote' });
  }
  return ok({ ...round, status: 'voting' as const, votes: new Map() });
}

/**
 * 次のアイテムへ（#93）。open の束を閉じて points を付け、item を空にして voting に戻す。
 * points が null なら「ポイントを付けずに次へ」。
 */
export function nextItem(
  round: Round,
  _actorId: string,
  points: NumberCardValue | null,
): Result<Round, RoundError> {
  if (round.status !== 'revealed') {
    return err({ code: 'not-revealed', op: 'next-item' });
  }
  return ok({
    ...round,
    status: 'voting' as const,
    votes: new Map(),
    item: '',
    log: closeOpenGroup(round.log, points),
  });
}

// 制御文字・書式文字（双方向制御を含む）・Default_Ignorable。room-core の display-name.ts はこれに
// NFKC とラベル記号の除去を足した、より厳しい兄弟（アイテム名にはそこまで要らない）
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * アイテム名を設定する。不可視文字を除いて前後の空白を削る。長さの上限は境界（ワイヤの検証）が見る。
 * 開票後（revealed）は、いま見ている開票の行（束の最後の行）の名前にも写す —— 束の見出しが追う。
 * 投票中は log に触れない。閉じた束は変えない。
 */
export function setItem(round: Round, item: string): Round {
  const next = item.replace(INVISIBLE_CHARS, '').trim();
  if (round.status !== 'revealed') return { ...round, item: next };
  const last = round.log.groups[round.log.groups.length - 1];
  const entry = last?.entries[last.entries.length - 1];
  if (!last?.open || !entry) return { ...round, item: next };
  const groups = [
    ...round.log.groups.slice(0, -1),
    { ...last, entries: [...last.entries.slice(0, -1), { ...entry, item: next }] },
  ];
  return { ...round, item: next, log: { ...round.log, groups } };
}

/** 閉じた束のポイントを直す（null で消す）。失敗は {@link setGroupPoints} のエラーをそのまま返す */
export function setPoints(
  round: Round,
  groupId: number,
  points: NumberCardValue | null,
): Result<Round, RoundError> {
  return setGroupPoints(round.log, groupId, points).map((log) => ({ ...round, log }));
}

/**
 * 退出した人の票を捨てる（R8）。**#95 S5b で呼び出し元と一緒に戻した。**
 *
 * S4a でも一度実装したが、当時は**到達経路が無かった** —— 入口ごとの門により 1 つの
 * ルームは timer か poker のどちらか一方の状態しか持たず、名簿から人を消す
 * `participant.remove` は timer 専用コマンドだったからである。S5b で門を廃止し、
 * **1 つのルームが両ツールの状態を持てるようになった**ので経路が生まれた
 * （`apps/tasuki-sync/src/application/command-handlers/participant-remove.ts`）。
 *
 * 票を残すと、名簿に居ない人の票が公開時の集計へ混ざる。**status は変えない** ——
 * 捨てた結果で自動公開が立つかは `applyAutoReveal` が別に判定する（呼び出し側で続けて呼ぶ）。
 * 居ない人の ID を渡しても壊れない（何も起きない）。
 */
export function discardVote(round: Round, voterId: string): Round {
  if (!round.votes.has(voterId)) return round;
  const votes = new Map(round.votes);
  votes.delete(voterId);
  return { ...round, votes };
}
