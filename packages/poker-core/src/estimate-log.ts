// 見積もりの記録（#93）。開票のたびに 1 行を足し、同じアイテムの再投票を 1 つの束にまとめる。
//
// **参加者を持たない。** 行は「どのカードが何枚出たか」だけを持つ（匿名）。
// すべて純関数で、入力を書き換えず新しい値を返す（憲法原則 IV）。
import { err, ok, type Result } from 'neverthrow';
import { FIBONACCI_DECK, cardKey, type Card, type NumberCardValue } from './deck.js';

/** アイテム名の長さの上限（境界が見る。ここでは切らない） */
export const MAX_ESTIMATE_ITEM = 120;
/** 記録の行の総数の上限。超えたら古い行から落とす */
export const MAX_ESTIMATE_ENTRIES = 100;

export interface CardCount {
  card: Card;
  count: number;
}

/** 1 回の開票。attempt は束の中での通し番号（1 始まり） */
export interface EstimateEntry {
  attempt: number;
  at: number;
  item: string;
  counts: CardCount[];
}

/** 同じアイテムの再投票をまとめた束。open の間は見積もり中でポイントを付けられない */
export interface EstimateGroup {
  id: number;
  points: NumberCardValue | null;
  open: boolean;
  entries: EstimateEntry[];
}

/** groups は古い順。nextId は束の ID の採番（上限で束が消えても戻らない） */
export interface EstimateLog {
  nextId: number;
  groups: EstimateGroup[];
}

export type EstimateLogError = { code: 'estimate-not-found' } | { code: 'estimate-open' };

export const EMPTY_ESTIMATE_LOG: EstimateLog = { nextId: 1, groups: [] };

/** デッキ上の位置。デッキに無いカードは末尾へ回す */
const DECK_ORDER: ReadonlyMap<string, number> = new Map(
  FIBONACCI_DECK.map((card, index) => [cardKey(card), index]),
);

/** 票を枚数に畳む。誰が出したかは残さない。並びはデッキの順 */
export function countCards(cards: readonly Card[]): CardCount[] {
  const byKey = new Map<string, CardCount>();
  for (const card of cards) {
    const key = cardKey(card);
    const found = byKey.get(key);
    if (found) found.count += 1;
    else byKey.set(key, { card, count: 1 });
  }
  const rank = (c: CardCount): number => DECK_ORDER.get(cardKey(c.card)) ?? Number.MAX_SAFE_INTEGER;
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

/** 総数が上限を超える間、先頭の束の先頭の行を落とし、空になった束を消す */
function trimToLimit(groups: EstimateGroup[]): EstimateGroup[] {
  let rest = groups;
  let total = rest.reduce((sum, g) => sum + g.entries.length, 0);
  while (total > MAX_ESTIMATE_ENTRIES && rest.length > 0) {
    const [head, ...tail] = rest;
    const entries = head!.entries.slice(1);
    rest = entries.length === 0 ? tail : [{ ...head!, entries }, ...tail];
    total -= 1;
  }
  return rest;
}

/** 開票を 1 行足す。末尾の束が open ならそこへ、無ければ新しい束を作る */
export function recordReveal(
  log: EstimateLog,
  item: string,
  cards: readonly Card[],
  at: number,
): EstimateLog {
  const last = log.groups[log.groups.length - 1];
  const counts = countCards(cards);
  let nextId = log.nextId;
  let groups: EstimateGroup[];
  if (last?.open) {
    const entry: EstimateEntry = {
      attempt: (last.entries[last.entries.length - 1]?.attempt ?? 0) + 1,
      at,
      item,
      counts,
    };
    groups = [...log.groups.slice(0, -1), { ...last, entries: [...last.entries, entry] }];
  } else {
    const group: EstimateGroup = {
      id: nextId,
      points: null,
      open: true,
      entries: [{ attempt: 1, at, item, counts }],
    };
    nextId += 1;
    groups = [...log.groups, group];
  }
  return { nextId, groups: trimToLimit(groups) };
}

/** 末尾の open の束を閉じてポイントを付ける。open の束が無ければ log をそのまま返す */
export function closeOpenGroup(log: EstimateLog, points: NumberCardValue | null): EstimateLog {
  const last = log.groups[log.groups.length - 1];
  if (!last?.open) return log;
  return {
    ...log,
    groups: [...log.groups.slice(0, -1), { ...last, open: false, points }],
  };
}

/** 閉じた束のポイントを直す（null で消す）。open の束は見積もり中なので付けられない */
export function setGroupPoints(
  log: EstimateLog,
  id: number,
  points: NumberCardValue | null,
): Result<EstimateLog, EstimateLogError> {
  const index = log.groups.findIndex((g) => g.id === id);
  const target = log.groups[index];
  if (!target) return err({ code: 'estimate-not-found' });
  if (target.open) return err({ code: 'estimate-open' });
  const groups = log.groups.map((g, i) => (i === index ? { ...g, points } : g));
  return ok({ ...log, groups });
}
