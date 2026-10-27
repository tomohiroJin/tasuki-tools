import { describe, expect, it } from "vitest";
import {
  METHOD_IDS,
  METHODS,
  applyAutoReveal,
  chooseMethod,
  playAgain,
  playCard,
  reveal,
  setSpectator,
  setVisibility,
  toView,
  playersOf,
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

// 札の ID と衝突しない、長めの ID と名前（部分一致の偽陽性を避ける）
const seats: SeatInput[] = ["p-alpha", "p-bravo", "p-charlie", "p-delta"].map((id) => ({
  id,
  name: `name-${id}`,
  present: true,
}));
const ids = seats.map((s) => s.id);

/** 札の文字列は JSON の値として完全一致で探す（"1" が "p-1" に当たらないように） */
const hasCardValue = (node: unknown, card: string): boolean => JSON.stringify(node).includes(JSON.stringify(card));
const mentions = (node: unknown, seat: SeatInput): boolean => {
  const text = JSON.stringify(node);
  return text.includes(seat.id) || text.includes(seat.name);
};

/** 投影の中の「要素」（席の要素・山の要素）を、それぞれ 1 つのまとまりとして列挙する */
const elements = (view: ReturnType<typeof toView>): unknown[] => {
  const r = view.round;
  if (r === null) return [];
  const out: unknown[] = [...r.seats];
  if (r.status === "revealed") out.push(...r.piles);
  else out.push({ yourCard: r.yourCard });
  return out;
};

describe("性質: 受け手 X の投影に他人の (ID, 札) の結びつきが現れない", () => {
  it("500 通りの操作列", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = lcg(seed);
      let s: CheckinState = empty;
      const steps = 3 + rnd(25);
      for (let i = 0; i < steps; i++) {
        const who = ids[rnd(ids.length)]!;
        const seq = s.round === null ? 0 : s.round.seq;
        switch (rnd(7)) {
          case 0:
            s = chooseMethod(s, METHOD_IDS[rnd(METHOD_IDS.length)]!);
            break;
          case 1:
          case 2: {
            if (s.round === null) break;
            const cards = METHODS[s.round.method].cards;
            const r = playCard(s, { participantId: who, seq, card: cards[rnd(cards.length)]! });
            if (r.isOk()) s = r.value;
            break;
          }
          case 3:
            s = setSpectator(s, who, rnd(2) === 0);
            break;
          case 4: {
            const r = setVisibility(s, { seq, visibility: rnd(2) === 0 ? "named" : "anonymous" });
            if (r.isOk()) s = r.value;
            break;
          }
          case 5: {
            const r = reveal(s, { seq });
            if (r.isOk()) s = r.value;
            break;
          }
          default: {
            if (rnd(2) === 0) {
              const r = playAgain(s, { seq });
              if (r.isOk()) s = r.value;
            } else s = applyAutoReveal(s, playersOf(s, seats));
          }
        }
      }

      const round = s.round;
      for (const viewer of [...ids, "outsider"]) {
        const view = toView(s, viewer, seats);
        if (round === null) continue;
        const namedRevealed = round.status === "revealed" && round.visibility === "named";
        // オラクル: 状態だけから「現れてはいけない (ID, 札)」を作る（投影は使わない）
        for (const [holder, card] of round.cards) {
          if (holder === viewer) continue;
          const seat = seats.find((x) => x.id === holder);
          if (seat === undefined) continue;
          // 開く前: 他人の札の値は、それが誰の札でもどこにも現れない（自分の札と同じ値でない限り）
          if (round.status === "open") {
            const ownCard = round.cards.get(viewer);
            if (ownCard !== card) {
              // 札の値そのものが他人にしか無い → どこにも出てはならない（キー名との偶然一致を除くため値の形で探す）
              expect(hasCardValue(view.round, card), `seed ${seed} open leak ${holder}:${card}`).toBe(false);
            }
            continue;
          }
          // 開いた後: 結びつき（同じ要素に ID/名前 と 札 が同居）が許されるのは名前つきの names だけ
          if (namedRevealed) {
            const r = view.round;
            if (r === null || r.status !== "revealed") throw new Error("unreachable");
            // 名前つきでも、holder の名前は holder の札の山にだけ入る
            for (const pile of r.piles) {
              const inNames = (pile.names ?? []).includes(seat.name);
              expect(inNames, `seed ${seed} named ${holder}`).toBe(pile.card === card);
            }
            // ID は決して載らない
            expect(JSON.stringify(r.piles)).not.toContain(JSON.stringify(holder));
            continue;
          }
          // 匿名で開いた後: 山の要素は ID・名前を持たない。席の要素は札を持たない
          for (const el of elements(view)) {
            expect(mentions(el, seat) && hasCardValue(el, card), `seed ${seed} anon ${holder}:${card}`).toBe(false);
          }
          expect(JSON.stringify((view.round as { piles: unknown }).piles), `seed ${seed}`).not.toContain(seat.name);
          expect(JSON.stringify((view.round as { piles: unknown }).piles)).not.toContain(JSON.stringify(seat.id));
          expect("yourCard" in (view.round as object), `seed ${seed} yourCard`).toBe(false);
        }
        // 全状態で: 席の要素は札の値を持たない（played だけ）
        for (const seatView of view.round?.seats ?? []) {
          expect(Object.keys(seatView).sort()).toEqual(["id", "name", "played"]);
        }
      }
    }
  });
});
