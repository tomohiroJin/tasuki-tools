// 隠しモードのテーブル（#403・設計 §6.1）。5 枚を配って「せーので見せる」だけのポーカー。
//
// **見積もりの状態とは混ぜない**（設計 D5）。`Round.table` に別の部分として持ち、投票・公開・記録・見学の
// どれとも互いに変えない。乱数は注入する（憲法 原則 VI）。
import { err, ok, type Result } from 'neverthrow';
import { FULL_DECK, type PlayingCard } from './playing-card.js';

/** 1 人に配る枚数 */
export const HAND_SIZE = 5;
/** 席の上限。52 枚で 5 枚ずつ配れるのは 10 人まで（T-9） */
export const TABLE_MAX_SEATS = 10;

export interface CardTable {
  /** 着いた参加者 ID（着いた順） */
  seats: readonly string[];
  status: 'idle' | 'dealt' | 'shown';
  /** 参加者 ID → 手。配った時点で着いていた人だけが持つ */
  hands: ReadonlyMap<string, readonly PlayingCard[]>;
}

export type TableError =
  | { code: 'table-not-seated' }
  | { code: 'table-in-play' }
  | { code: 'table-no-hand' }
  | { code: 'table-full' };

/** `[0, n)` の整数を返す乱数 */
export type RandomInt = (n: number) => number;

export const EMPTY_TABLE: CardTable = { seats: [], status: 'idle', hands: new Map() };

/** 席に着く（T-1・T-9）。着いている人がもう一度着いても入力と同じ値を返す */
export function seatAt(table: CardTable, participantId: string): Result<CardTable, TableError> {
  if (table.seats.includes(participantId)) return ok(table);
  if (table.seats.length >= TABLE_MAX_SEATS) return err({ code: 'table-full' });
  return ok({ ...table, seats: [...table.seats, participantId] });
}

/**
 * 席を離れる（T-10・T-11）。その人の手も捨てる。席が空になったら最初の状態へ戻し、
 * 手を持つ人が居なくなったら配る前へ戻す（見せる手が無いまま「配られている」に留めない）。
 * 着いていない人を渡しても入力と同じ値を返す。
 */
export function leaveTable(table: CardTable, participantId: string): CardTable {
  if (!table.seats.includes(participantId)) return table;
  const seats = table.seats.filter((id) => id !== participantId);
  if (seats.length === 0) return EMPTY_TABLE;
  const hands = new Map(table.hands);
  hands.delete(participantId);
  return { seats, status: hands.size === 0 ? 'idle' : table.status, hands };
}

/** 52 枚を切り、席の順に 5 枚ずつ配る（T-3）。配られている間は配り直さない（T-6） */
export function dealTable(
  table: CardTable,
  actorId: string,
  randomInt: RandomInt,
): Result<CardTable, TableError> {
  if (!table.seats.includes(actorId)) return err({ code: 'table-not-seated' });
  if (table.status === 'dealt') return err({ code: 'table-in-play' });
  const deck = shuffle([...FULL_DECK], randomInt);
  const hands = new Map(
    table.seats.map((id, i) => [id, deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)] as const),
  );
  return ok({ ...table, status: 'dealt', hands });
}

/** 全員の手を開く（T-5）。配られていなければ開くものが無い（T-7） */
export function showTable(table: CardTable, actorId: string): Result<CardTable, TableError> {
  if (!table.seats.includes(actorId)) return err({ code: 'table-not-seated' });
  if (table.status !== 'dealt') return err({ code: 'table-no-hand' });
  return ok({ ...table, status: 'shown' });
}

/** Fisher–Yates（その場で並べ替えて返す） */
function shuffle<T>(arr: T[], randomInt: RandomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
