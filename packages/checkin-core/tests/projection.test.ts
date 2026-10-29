import { describe, expect, it } from "vitest";
import {
  playCard,
  reveal,
  setSpectator,
  setVisibility,
  playersOf,
  prune,
  recordRevealedNames,
  toView,
  type CheckinState,
  type SeatInput,
} from "../src/index.js";
import { a, b, c, choose, empty } from "./support/fixtures.js";

const seats: SeatInput[] = [
  { id: a, name: "アキラ", present: true },
  { id: b, name: "ベス", present: true },
  { id: c, name: "チカ", present: true },
];
const unwrap = (r: { _unsafeUnwrap(): CheckinState }): CheckinState => r._unsafeUnwrap();
const play = (s: CheckinState, id: string, card: string): CheckinState =>
  unwrap(playCard(s, { participantId: id, seq: s.round?.seq ?? 0, card }));
const openRound = (view: ReturnType<typeof toView>) => {
  if (view.round === null || view.round.status !== "open") throw new Error("open ではない");
  return view.round;
};
const revealedRound = (view: ReturnType<typeof toView>) => {
  if (view.round === null || view.round.status !== "revealed") throw new Error("revealed ではない");
  return view.round;
};
const doReveal = (s: CheckinState): CheckinState => unwrap(reveal(s, { seq: s.round?.seq ?? 0 }));

/** weather・named: a=sunny b=rain c=thunder */
const threePlayed = (visibility: "named" | "anonymous"): CheckinState => {
  let s = choose(empty, "weather");
  s = unwrap(setVisibility(s, { seq: 1, visibility }));
  // 札が付くと公開の仕方は変えられないので、先に決めてから出す
  s = play(s, a, "sunny");
  s = play(s, b, "rain");
  return play(s, c, "thunder");
};

describe("playersOf", () => {
  it("在席かつ見学でない人を seats の並びで返す", () => {
    const s = setSpectator(empty, b, true);
    const input: SeatInput[] = [...seats, { id: "d", name: "D", present: false }];
    expect(playersOf(s, input)).toEqual([a, c]);
  });
});

describe("toView: 開く前", () => {
  it("他人の札の ID がどこにも現れない。yourCard は自分の札だけ・他の席は played だけ（E5）〈m495〉", () => {
    let s = choose(empty, "weather");
    s = play(s, a, "sunny");
    s = play(s, b, "rain");
    s = play(s, c, "thunder");
    const v = toView(s, a, seats);
    const r = openRound(v);
    expect(r.yourCard).toBe("sunny");
    expect(r.playedCount).toBe(3);
    expect(r.playerCount).toBe(3);
    expect(r.locked).toBe(true);
    expect(r.seats).toEqual([
      { id: a, name: "アキラ", played: true },
      { id: b, name: "ベス", played: true },
      { id: c, name: "チカ", played: true },
    ]);
    const text = JSON.stringify(v);
    for (const other of ["rain", "thunder"]) expect(text).not.toContain(other);
    // 自分の札は yourCard の 1 か所だけ
    expect(text.match(/sunny/g)).toHaveLength(1);
  });

  it("まだ出していなければ yourCard は null・札が無ければ locked は false", () => {
    const s = choose(empty, "weather");
    const r = openRound(toView(s, a, seats));
    expect(r.yourCard).toBeNull();
    expect(r.locked).toBe(false);
  });

  it("札が 0 枚でも開いた後は locked（公開の仕方はもう変えられない）", () => {
    const v = toView(doReveal(choose(empty, "weather")), a, seats);
    expect(v.round?.locked).toBe(true);
  });

  it("回が無ければ round は null", () => {
    expect(toView(empty, a, seats)).toEqual({ you: a, spectating: false, spectatorCount: 0, round: null });
  });
});

describe("toView: 匿名で開いた後", () => {
  it("names の鍵が無く、piles に ID も名前も現れない（E6）〈m496〉", () => {
    const s = doReveal(threePlayed("anonymous"));
    for (const viewer of [a, b, c, "outsider"]) {
      const r = revealedRound(toView(s, viewer, seats));
      for (const pile of r.piles) expect("names" in pile).toBe(false);
      const text = JSON.stringify(r.piles);
      // 1 字の ID が "card" 等に当たらないよう、JSON の文字列値として探す
      for (const secret of [a, b, c, "アキラ", "ベス", "チカ"]) expect(text).not.toContain(JSON.stringify(secret));
    }
  });

  it("yourCard の鍵を持たない（判断 7）〈m497〉", () => {
    const s = doReveal(threePlayed("anonymous"));
    const r = revealedRound(toView(s, a, seats));
    expect("yourCard" in r).toBe(false);
  });
});

describe("toView: 名前つきで開いた後", () => {
  it("山の names が出した人の名前を席の並びで持つ（E8）。yourCard は持たない", () => {
    let s = choose(empty, "weather");
    s = play(s, c, "sunny");
    s = play(s, a, "sunny");
    s = play(s, b, "rain");
    const r = revealedRound(toView(doReveal(s), b, seats));
    expect(r.piles.find((p) => p.card === "sunny")).toEqual({ card: "sunny", count: 2, names: ["アキラ", "チカ"] });
    expect(r.piles.find((p) => p.card === "rain")).toEqual({ card: "rain", count: 1, names: ["ベス"] });
    expect("yourCard" in r).toBe(false);
  });

  it("0 枚の札も count: 0 で残り、並びはやり方の札の順", () => {
    let s = choose(empty, "weather");
    s = play(s, a, "thunder");
    const r = revealedRound(toView(doReveal(s), a, seats));
    expect(r.piles).toEqual([
      { card: "sunny", count: 0, names: [] },
      { card: "cloudy", count: 0, names: [] },
      { card: "rain", count: 0, names: [] },
      { card: "thunder", count: 1, names: ["アキラ"] },
    ]);
  });

  it("開いた回の count は回の札から数え、seats 入力に依存しない。名前を引けない人は names に入らない", () => {
    let s = choose(empty, "weather");
    s = play(s, "ghost", "sunny");
    s = play(s, a, "sunny");
    const r = revealedRound(toView(doReveal(s), a, seats));
    expect(r.piles[0]).toEqual({ card: "sunny", count: 2, names: ["アキラ"] });
    // 席は名簿（seats 入力）どおり
    expect(r.seats.map((x) => x.id)).toEqual([a, b, c]);
  });

  it("開いた後の seats は seats 入力の並びのまま・played は札の有無だけ（札の順に並べ替えない）", () => {
    // 札の順（sunny < rain < thunder）と席の順（a, b, c）が食い違う: a=thunder b=sunny c=rain
    let s = choose(empty, "weather");
    s = play(s, a, "thunder");
    s = play(s, b, "sunny");
    s = play(s, c, "rain");
    for (const visibility of ["named", "anonymous"] as const) {
      const t = visibility === "named" ? s : { ...s, round: { ...s.round!, visibility } };
      const r = revealedRound(toView(doReveal(t), a, seats));
      expect(r.seats).toEqual([
        { id: a, name: "アキラ", played: true },
        { id: b, name: "ベス", played: true },
        { id: c, name: "チカ", played: true },
      ]);
    }
    // 出していない人は played: false のまま
    const half = doReveal(play(choose(empty, "weather"), b, "rain"));
    expect(revealedRound(toView(half, a, seats)).seats.map((x) => x.played)).toEqual([false, true, false]);
  });
});

describe("toView: 開いた回は結果を凍らせる（名簿から外れても山が変わらない）", () => {
  /** 開いた後に b が名簿から外れたときの、残った人の seats 入力 */
  const withoutB = seats.filter((x) => x.id !== b);
  /** 開いた（名前を写した）後に b が名簿から外れたときの状態 */
  const leaveAfterReveal = (s: CheckinState): CheckinState => prune(recordRevealedNames(doReveal(s), seats), new Set([a, c]));

  it("匿名: 開いた後に 1 人が名簿から外れても、全員の山が変わらない（前後の差で札が分からない）〈m520〉", () => {
    let s = choose(empty, "energy");
    s = play(play(play(s, a, "3"), b, "1"), c, "3");
    const before = doReveal(s);
    const after = leaveAfterReveal(s);
    for (const viewer of [a, c, "outsider"]) {
      const pilesBefore = revealedRound(toView(before, viewer, seats)).piles;
      const pilesAfter = revealedRound(toView(after, viewer, withoutB)).piles;
      expect(pilesAfter).toEqual(pilesBefore);
      expect(pilesAfter.find((p) => p.card === "1")).toEqual({ card: "1", count: 1 });
      // 席は名簿どおり（外れた人は並ばない）
      expect(revealedRound(toView(after, viewer, withoutB)).seats.map((x) => x.id)).toEqual([a, c]);
    }
  });

  it("名前つき: 開いた後に 1 人が名簿から外れても、山の count と names が変わらない〈m520〉", () => {
    let s = choose(empty, "weather");
    s = play(play(play(s, a, "sunny"), b, "rain"), c, "sunny");
    const pilesBefore = revealedRound(toView(doReveal(s), a, seats)).piles;
    const pilesAfter = revealedRound(toView(leaveAfterReveal(s), a, withoutB)).piles;
    expect(pilesAfter).toEqual(pilesBefore);
    expect(pilesAfter.find((p) => p.card === "rain")).toEqual({ card: "rain", count: 1, names: ["ベス"] });
  });

  it("recordRevealedNames は名前つきで開いた回にだけ写し、足すものが無ければ同じ参照", () => {
    const open = play(choose(empty, "weather"), a, "sunny");
    expect(recordRevealedNames(open, seats)).toBe(open);
    const named = recordRevealedNames(doReveal(open), seats);
    expect(named.round?.names).toEqual(new Map([[a, "アキラ"]]));
    expect(recordRevealedNames(named, seats)).toBe(named);
    // 匿名の回には名前を持たせない（サーバーの中でも結びつきを作らない）
    const anon = doReveal(play(choose(empty, "energy"), a, "1"));
    expect(recordRevealedNames(anon, seats)).toBe(anon);
  });
});

describe("toView: 札を出した後に切断した人", () => {
  it("playedCount と playerCount は在席の札を出す人だけで数え、切断した人の札は数えない（席には札の持ち主として並ぶ）", () => {
    // Given: a・b が出し、c はまだ。その後 b が切断した（名簿には居るが在席でない札の持ち主）
    let s = choose(empty, "weather");
    s = play(s, a, "sunny");
    s = play(s, b, "rain");
    const withBGone: SeatInput[] = seats.map((x) => (x.id === b ? { ...x, present: false } : x));

    // When
    const r = openRound(toView(s, a, withBGone));

    // Then: 札は 2 枚あるが、在席の札を出す人（a・c）のうち出したのは a だけ
    expect(r.playedCount).toBe(1);
    expect(r.playerCount).toBe(2);
    expect(r.seats.map((x) => [x.id, x.played])).toEqual([
      [a, true],
      [b, true],
      [c, false],
    ]);
  });
});

describe("toView: 見学者", () => {
  it("spectating: true・yourCard: null。spectatorCount が数える", () => {
    let s = choose(empty, "weather");
    s = setSpectator(s, c, true);
    s = play(s, a, "sunny");
    const v = toView(s, c, seats);
    expect(v.spectating).toBe(true);
    expect(v.spectatorCount).toBe(1);
    const r = openRound(v);
    expect(r.yourCard).toBeNull();
    expect(r.playerCount).toBe(2);
    expect(r.playedCount).toBe(1);
    // 見学者は札を持たないので席には並ばない
    expect(r.seats.map((x) => x.id)).toEqual([a, b]);
  });

  it("在席でない見学者は数えない", () => {
    const s = setSpectator(choose(empty, "weather"), "d", true);
    expect(toView(s, a, [...seats, { id: "d", name: "D", present: false }]).spectatorCount).toBe(0);
  });
});
