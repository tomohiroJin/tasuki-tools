/**
 * 受け手ごとの投影（#406）。匿名は「サーバーが送らない」ことで守る（設計 §6）。
 *
 * - 開く前: 他人の札は載せない（席は `played` だけ）。`yourCard` は見る人自身の札だけ
 * - 匿名で開いた後: 山は枚数だけ。`names` の鍵も `yourCard` も持たない
 * - 名前つきで開いた後: 山に出した人の名前を載せる。`yourCard` は持たない（型で取りこぼしを無くす）
 * - 開いた後の山は回の札から数える（席は名簿どおりに変わっても、山は変わらない）
 */
import { METHODS, type CardId, type MethodId, type Visibility } from "./methods.js";
import type { CheckinState } from "./types.js";

export interface SeatInput {
  readonly id: string;
  readonly name: string;
  /** この道具に在席しているか */
  readonly present: boolean;
}

export interface SeatView {
  readonly id: string;
  readonly name: string;
  readonly played: boolean;
}

export interface PileView {
  readonly card: CardId;
  readonly count: number;
  /** 名前つきで開いた後だけ（匿名では鍵ごと持たない） */
  readonly names?: readonly string[];
}

interface RoundHead {
  readonly seq: number;
  readonly method: MethodId;
  readonly visibility: Visibility;
  readonly locked: boolean;
  readonly seats: readonly SeatView[];
}

export type RoundView =
  | (RoundHead & {
      readonly status: "open";
      readonly playedCount: number;
      readonly playerCount: number;
      readonly yourCard: CardId | null;
    })
  | (RoundHead & { readonly status: "revealed"; readonly piles: readonly PileView[] });

export interface CheckinView {
  readonly you: string;
  readonly spectating: boolean;
  readonly spectatorCount: number;
  readonly round: RoundView | null;
}

/** 札を出す人 ＝ 在席かつ見学でない人（seats の並び） */
export function playersOf(s: CheckinState, seats: readonly SeatInput[]): string[] {
  return seats.filter((x) => x.present && !s.spectators.has(x.id)).map((x) => x.id);
}

export function toView(s: CheckinState, viewerId: string, seats: readonly SeatInput[]): CheckinView {
  const base = {
    you: viewerId,
    spectating: s.spectators.has(viewerId),
    spectatorCount: seats.filter((x) => x.present && s.spectators.has(x.id)).length,
  };
  const r = s.round;
  if (r === null) return { ...base, round: null };

  const players = playersOf(s, seats);
  const seatViews: SeatView[] = seats
    .filter((x) => players.includes(x.id) || r.cards.has(x.id))
    .map((x) => ({ id: x.id, name: x.name, played: r.cards.has(x.id) }));
  const head: RoundHead = {
    seq: r.seq,
    method: r.method,
    visibility: r.visibility,
    locked: r.cards.size > 0,
    seats: seatViews,
  };

  if (r.status === "open") {
    return {
      ...base,
      round: {
        ...head,
        status: "open",
        playedCount: players.filter((id) => r.cards.has(id)).length,
        playerCount: players.length,
        yourCard: r.cards.get(viewerId) ?? null,
      },
    };
  }

  // **開いた回は結果を凍らせる**: 山は回の札から数え、席や seats 入力に依存させない。
  // 名簿から外れた人で山が減ると、前後のフレームの差で札が分かる（匿名の漏れ）。
  // 名前の並びは開いた時点の席の順（`recordRevealedNames` が写した順）で固め、写していない人は席の順、
  // どちらにも居ない人は最後（札を出した順）。外れた人で並びが動くと、それも差として読めてしまう
  const seatName = new Map(seats.map((x) => [x.id, x.name] as const));
  const holderOrder = [
    ...new Set([
      ...[...(r.names?.keys() ?? [])].filter((id) => r.cards.has(id)),
      ...seats.filter((x) => r.cards.has(x.id)).map((x) => x.id),
      ...r.cards.keys(),
    ]),
  ];
  const piles: PileView[] = METHODS[r.method].cards.map((card) => {
    const holders = holderOrder.filter((id) => r.cards.get(id) === card);
    if (r.visibility === "anonymous") return { card, count: holders.length };
    // 名簿に居る人はいまの名前、外れた人は開いた時点の名前。どちらも引けない人は names に入れない
    const names = holders.flatMap((id) => {
      const name = seatName.get(id) ?? r.names?.get(id);
      return name === undefined ? [] : [name];
    });
    return { card, count: holders.length, names };
  });
  return { ...base, round: { ...head, status: "revealed", piles } };
}
