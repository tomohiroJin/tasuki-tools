import { describe, expect, it } from "vitest";
import {
  METHOD_IDS,
  METHODS,
  applyAutoReveal,
  chooseMethod,
  playAgain,
  playCard,
  playersOf,
  reveal,
  setSpectator,
  setVisibility,
  toView,
  type CheckinState,
  type SeatInput,
} from "../src/index.js";
import { empty } from "./support/fixtures.js";

/** 種つきの線形合同法（依存を足さない） */
const lcg = (seed: number) => {
  let x = seed >>> 0;
  return (n: number): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return Math.floor((x / 2 ** 32) * n);
  };
};

// ID と名前は札の ID と部分一致しない形にする。echo は在席でない席、ghost は seats に居ない人
const seats: SeatInput[] = [
  { id: "p-alpha", name: "name-alpha", present: true },
  { id: "p-bravo", name: "name-bravo", present: true },
  { id: "p-echo", name: "name-echo", present: false },
  { id: "p-charlie", name: "name-charlie", present: true },
  { id: "p-delta", name: "name-delta", present: true },
];
const actors = [...seats.map((s) => s.id), "p-ghost"];
const viewers = [...actors, "p-outsider"];

/** JSON の値として完全一致で探す（"1" が "p-1" に当たらないように） */
const hasValue = (node: unknown, v: string): boolean => JSON.stringify(node).includes(JSON.stringify(v));
const mentions = (node: unknown, seat: SeatInput): boolean => hasValue(node, seat.id) || hasValue(node, seat.name);

/** 投影の中の「要素」（席の要素・山の要素）。結びつきは同じ要素に同居したときに成立する */
const elementsOf = (round: NonNullable<ReturnType<typeof toView>["round"]>): unknown[] =>
  round.status === "revealed" ? [...round.seats, ...round.piles] : [...round.seats, { yourCard: round.yourCard }];

const step = (s: CheckinState, rnd: (n: number) => number): CheckinState => {
  const seq = s.round?.seq ?? 0;
  const who = actors[rnd(actors.length)]!;
  const pick = rnd(100);
  const ok = (r: { isOk(): boolean; _unsafeUnwrap(): CheckinState }): CheckinState => (r.isOk() ? r._unsafeUnwrap() : s);
  // 回の始めに 50% で匿名へ（札が付く前なので変えられる）
  const startedAnon = (n: CheckinState): CheckinState =>
    rnd(2) === 0 ? ok(setVisibility(n, { seq: n.round?.seq ?? 0, visibility: "anonymous" })) : n;
  if (pick < 4) return startedAnon(chooseMethod(s, METHOD_IDS[rnd(METHOD_IDS.length)]!));
  if (pick < 62) {
    if (s.round === null) return startedAnon(chooseMethod(s, METHOD_IDS[rnd(METHOD_IDS.length)]!));
    const cards = METHODS[s.round.method].cards;
    return ok(playCard(s, { participantId: who, seq, card: cards[rnd(cards.length)]! }));
  }
  if (pick < 72) return setSpectator(s, who, rnd(3) === 0);
  if (pick < 78) return ok(setVisibility(s, { seq, visibility: rnd(2) === 0 ? "named" : "anonymous" }));
  if (pick < 86) return ok(reveal(s, { seq }));
  if (pick < 90) return startedAnon(ok(playAgain(s, { seq })));
  return applyAutoReveal(s, playersOf(s, seats));
};

/** 数万回呼ぶので、一致している間は expect を通さない（不一致のときだけ expect で詳細を出す） */
const is = (actual: unknown, expected: unknown, msg: string): void => {
  if (!Object.is(actual, expected)) expect(actual, msg).toBe(expected);
};
const same = (actual: unknown, expected: unknown, msg: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) expect(actual, msg).toEqual(expected);
};

const reach = { anonRevealedMulti: 0, namedRevealedMulti: 0, openMulti: 0, checks: 0 };

/** 1 つの状態をすべての受け手について検査する。オラクルは投影を使わず状態から作る */
const checkState = (s: CheckinState, label: string): void => {
  const round = s.round;
  if (round === null) return;
  const cardsInSeats = [...round.cards].filter(([id]) => seats.some((x) => x.id === id));
  // 期待する席: 札を出す人 ∪ 札を持つ人、seats 入力の並び・played は札の有無だけ
  const expectedSeats = seats
    .filter((x) => (x.present && !s.spectators.has(x.id)) || round.cards.has(x.id))
    .map((x) => ({ id: x.id, name: x.name, played: round.cards.has(x.id) }));

  for (const viewer of viewers) {
    const view = toView(s, viewer, seats);
    const r = view.round;
    if (r === null) throw new Error(`${label}: round が無い`);
    reach.checks++;
    same(r.seats, expectedSeats, `${label} seats`);
    for (const sv of r.seats) same(Object.keys(sv).sort(), ["id", "name", "played"], `${label} seat keys`);

    const others = cardsInSeats.filter(([id]) => id !== viewer);
    if (others.length >= 2) {
      if (round.status === "open") reach.openMulti++;
      else if (round.visibility === "anonymous") reach.anonRevealedMulti++;
      else reach.namedRevealedMulti++;
    }

    for (const [holder, card] of others) {
      const seat = seats.find((x) => x.id === holder)!;
      if (round.status === "open") {
        // 自分の札と同じ値でない限り、他人の札の値は投影のどこにも現れない
        if (round.cards.get(viewer) !== card) is(hasValue(view, card), false, `${label} open ${holder}:${card}`);
        continue;
      }
      if (r.status !== "revealed") throw new Error("unreachable");
      is("yourCard" in r, false, `${label} yourCard`);
      if (round.visibility === "named") {
        // 結びつきが許されるのは names だけ。名前は自分の札の山にだけ入る
        for (const pile of r.piles) {
          is((pile.names ?? []).includes(seat.name), pile.card === card, `${label} named ${holder}`);
        }
        is(JSON.stringify(r.piles).includes(JSON.stringify(holder)), false, `${label} id in piles`);
        continue;
      }
      // 匿名: どの要素にも (ID または名前) と 札 が同居せず、山は names の鍵を持たない
      for (const el of elementsOf(r)) {
        is(mentions(el, seat) && hasValue(el, card), false, `${label} anon ${holder}:${card}`);
      }
      for (const pile of r.piles) is("names" in pile, false, `${label} names key`);
      is(mentions(r.piles, seat), false, `${label} piles identity`);
    }

    // 山の count は seats 入力に居る人の札だけを数え、並びはやり方の札の順
    if (r.status === "revealed") {
      same(r.piles.map((p) => p.card), METHODS[round.method].cards, `${label} order`);
      for (const pile of r.piles) {
        is(pile.count, cardsInSeats.filter(([, c]) => c === pile.card).length, `${label} count ${pile.card}`);
      }
    }
  }
};

describe("性質: 受け手 X の投影に他人の (ID, 札) の結びつきが現れない", () => {
  // 単独では 0.5 秒だが、全パッケージの試験を並べて流すと 10 倍遅くなり既定の 5 秒を超える。時間の上限だけを緩める
  it("500 通りの操作列の各手順の後で検査し、値が分かれる局面に十分届く（到達の下限）", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = lcg(seed);
      let s: CheckinState = empty;
      const steps = 10 + rnd(30);
      for (let i = 0; i < steps; i++) {
        s = step(s, rnd);
        checkState(s, `seed ${seed} step ${i}`);
      }
    }
    // 同じ it の中で集計を読む（別の it の副作用に頼らないので、単独で流しても壊れない）
    expect(reach.anonRevealedMulti).toBeGreaterThanOrEqual(100);
    expect(reach.namedRevealedMulti).toBeGreaterThanOrEqual(100);
    expect(reach.openMulti).toBeGreaterThanOrEqual(100);
  }, 60_000);
});
