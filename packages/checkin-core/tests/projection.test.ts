import { describe, expect, it } from "vitest";
import {
  chooseMethod,
  playCard,
  reveal,
  setSpectator,
  setVisibility,
  playersOf,
  toView,
  type CheckinState,
  type SeatInput,
} from "../src/index.js";
import { a, b, c, empty } from "./support/fixtures.js";

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
  let s = chooseMethod(empty, "weather");
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
    let s = chooseMethod(empty, "weather");
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
    const s = chooseMethod(empty, "weather");
    const r = openRound(toView(s, a, seats));
    expect(r.yourCard).toBeNull();
    expect(r.locked).toBe(false);
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
    let s = chooseMethod(empty, "weather");
    s = play(s, c, "sunny");
    s = play(s, a, "sunny");
    s = play(s, b, "rain");
    const r = revealedRound(toView(doReveal(s), b, seats));
    expect(r.piles.find((p) => p.card === "sunny")).toEqual({ card: "sunny", count: 2, names: ["アキラ", "チカ"] });
    expect(r.piles.find((p) => p.card === "rain")).toEqual({ card: "rain", count: 1, names: ["ベス"] });
    expect("yourCard" in r).toBe(false);
  });

  it("0 枚の札も count: 0 で残り、並びはやり方の札の順", () => {
    let s = chooseMethod(empty, "weather");
    s = play(s, a, "thunder");
    const r = revealedRound(toView(doReveal(s), a, seats));
    expect(r.piles).toEqual([
      { card: "sunny", count: 0, names: [] },
      { card: "cloudy", count: 0, names: [] },
      { card: "rain", count: 0, names: [] },
      { card: "thunder", count: 1, names: ["アキラ"] },
    ]);
  });

  it("seats に無い人の札は count にも names にも入らない（基準は seats 入力）", () => {
    let s = chooseMethod(empty, "weather");
    s = play(s, "ghost", "sunny");
    s = play(s, a, "sunny");
    const r = revealedRound(toView(doReveal(s), a, seats));
    expect(r.piles[0]).toEqual({ card: "sunny", count: 1, names: ["アキラ"] });
    expect(r.seats.map((x) => x.id)).toEqual([a, b, c]);
  });

  it("開いた後の seats は seats 入力の並びのまま・played は札の有無だけ（札の順に並べ替えない）", () => {
    // 札の順（sunny < rain < thunder）と席の順（a, b, c）が食い違う: a=thunder b=sunny c=rain
    let s = chooseMethod(empty, "weather");
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
    const half = doReveal(play(chooseMethod(empty, "weather"), b, "rain"));
    expect(revealedRound(toView(half, a, seats)).seats.map((x) => x.played)).toEqual([false, true, false]);
  });
});

describe("toView: 見学者", () => {
  it("spectating: true・yourCard: null。spectatorCount が数える", () => {
    let s = chooseMethod(empty, "weather");
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
    const s = setSpectator(chooseMethod(empty, "weather"), "d", true);
    expect(toView(s, a, [...seats, { id: "d", name: "D", present: false }]).spectatorCount).toBe(0);
  });
});
