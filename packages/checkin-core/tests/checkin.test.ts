import { describe, expect, it } from "vitest";
import {
  METHODS,
  applyAutoReveal,
  chooseMethod,
  drawMethod,
  playAgain,
  playCard,
  prune,
  reveal,
  setSpectator,
  setVisibility,
  type CheckinState,
  type MethodId,
} from "../src/index.js";
import { a, b, c, empty } from "./support/fixtures.js";

const unwrap = (r: { isOk(): boolean; _unsafeUnwrap(): CheckinState }): CheckinState => r._unsafeUnwrap();
const roundOf = (s: CheckinState) => {
  if (s.round === null) throw new Error("回が無い");
  return s.round;
};
const play = (s: CheckinState, participantId: string, card: string): CheckinState =>
  unwrap(playCard(s, { participantId, seq: roundOf(s).seq, card }));

describe("chooseMethod", () => {
  it("新しい回を始める（seq は lastSeq+1・既定の公開の仕方・open・札なし）", () => {
    const s = chooseMethod(empty, "weather");
    expect(s.round).toEqual({ seq: 1, method: "weather", visibility: "named", status: "open", cards: new Map() });
    expect(s.lastSeq).toBe(1);
    expect(chooseMethod(s, "energy").round).toMatchObject({ seq: 2, method: "energy", visibility: "anonymous" });
  });

  it("前の回の札を捨て、公開の仕方は既定に戻る（判断 8）〈m499〉", () => {
    let s = chooseMethod(empty, "roti");
    s = unwrap(setVisibility(s, { seq: 1, visibility: "named" }));
    s = play(s, a, "3");
    const next = chooseMethod(s, "roti");
    expect(next.round).toMatchObject({ seq: 2, visibility: "anonymous", status: "open" });
    expect(roundOf(next).cards.size).toBe(0);
  });
});

describe("drawMethod", () => {
  const record = (value: number) => {
    const calls: number[] = [];
    return { calls, fn: (n: number) => (calls.push(n), value === -1 ? n - 1 : value) };
  };

  it("いまのやり方を除いた 4 つから選ぶ。0 番目も n-1 番目も weather ではない（E2）〈m501〉", () => {
    const base = chooseMethod(empty, "weather");
    for (const v of [0, -1]) {
      const r = record(v);
      const s = drawMethod(base, "checkin", r.fn)._unsafeUnwrap();
      expect(r.calls).toEqual([4]);
      expect(roundOf(s).method).not.toBe("weather");
      expect(METHODS[roundOf(s).method].side).toBe("checkin");
      expect(roundOf(s).seq).toBe(2);
    }
  });

  it("いまのやり方が反対側なら 5 つ全部が候補", () => {
    const r = record(0);
    drawMethod(chooseMethod(empty, "roti"), "checkin", r.fn)._unsafeUnwrap();
    expect(r.calls).toEqual([5]);
  });

  it("回が無いときも 5 つ全部が候補。0 番目は側の先頭", () => {
    const r = record(0);
    const s = drawMethod(empty, "checkout", r.fn)._unsafeUnwrap();
    expect(r.calls).toEqual([5]);
    expect(roundOf(s).method).toBe("roti");
  });

  it("[0, n) の整数でない乱数は CHECKIN_INVALID_RANDOM", () => {
    const base = chooseMethod(empty, "weather");
    for (const v of [4, 1.5, -1, Number.NaN]) {
      const r = drawMethod(base, "checkin", () => v);
      expect(r._unsafeUnwrapErr()).toEqual({ code: "CHECKIN_INVALID_RANDOM" });
    }
  });
});

describe("playCard", () => {
  it("回が無ければ CHECKIN_NO_ROUND", () => {
    expect(playCard(empty, { participantId: a, seq: 1, card: "sunny" })._unsafeUnwrapErr().code).toBe("CHECKIN_NO_ROUND");
  });

  it("札を出せる。出し直すと最後の札だけが残る（E10）〈m502〉", () => {
    let s = chooseMethod(empty, "weather");
    s = play(s, a, "sunny");
    s = play(s, a, "rain");
    expect([...roundOf(s).cards]).toEqual([[a, "rain"]]);
  });

  it("同じ札の出し直しは同じ参照", () => {
    const s = play(chooseMethod(empty, "weather"), a, "sunny");
    expect(playCard(s, { participantId: a, seq: 1, card: "sunny" })._unsafeUnwrap()).toBe(s);
  });

  it("やり方に無い札は CHECKIN_CARD_UNKNOWN", () => {
    const s = chooseMethod(empty, "weather");
    expect(playCard(s, { participantId: a, seq: 1, card: "1" })._unsafeUnwrapErr().code).toBe("CHECKIN_CARD_UNKNOWN");
  });

  it("見学者は CHECKIN_SPECTATING", () => {
    const s = setSpectator(chooseMethod(empty, "weather"), a, true);
    expect(playCard(s, { participantId: a, seq: 1, card: "sunny" })._unsafeUnwrapErr().code).toBe("CHECKIN_SPECTATING");
  });

  it("開いた後は CHECKIN_REVEALED", () => {
    const s = unwrap(reveal(chooseMethod(empty, "weather"), { seq: 1 }));
    expect(playCard(s, { participantId: a, seq: 1, card: "sunny" })._unsafeUnwrapErr().code).toBe("CHECKIN_REVEALED");
  });

  it("古い seq は同じ参照〈m503〉", () => {
    const s = chooseMethod(chooseMethod(empty, "weather"), "weather");
    expect(playCard(s, { participantId: a, seq: 1, card: "sunny" })._unsafeUnwrap()).toBe(s);
  });
});

describe("setVisibility", () => {
  it("回が無ければ CHECKIN_NO_ROUND", () => {
    expect(setVisibility(empty, { seq: 1, visibility: "named" })._unsafeUnwrapErr().code).toBe("CHECKIN_NO_ROUND");
  });

  it("出す前は変えられる。同じ値なら同じ参照", () => {
    const s = chooseMethod(empty, "weather");
    const t = unwrap(setVisibility(s, { seq: 1, visibility: "anonymous" }));
    expect(roundOf(t).visibility).toBe("anonymous");
    expect(unwrap(setVisibility(t, { seq: 1, visibility: "anonymous" }))).toBe(t);
  });

  it("1 人が出した後は CHECKIN_VISIBILITY_LOCKED（開いた後も）（E7）〈m498〉", () => {
    const s = play(chooseMethod(empty, "weather"), a, "sunny");
    expect(setVisibility(s, { seq: 1, visibility: "anonymous" })._unsafeUnwrapErr().code).toBe("CHECKIN_VISIBILITY_LOCKED");
    const r = unwrap(reveal(s, { seq: 1 }));
    expect(setVisibility(r, { seq: 1, visibility: "anonymous" })._unsafeUnwrapErr().code).toBe("CHECKIN_VISIBILITY_LOCKED");
  });

  it("古い seq は同じ参照〈m503〉", () => {
    const s = chooseMethod(chooseMethod(empty, "weather"), "weather");
    expect(setVisibility(s, { seq: 1, visibility: "anonymous" })._unsafeUnwrap()).toBe(s);
  });
});

describe("reveal", () => {
  it("回が無ければ CHECKIN_NO_ROUND", () => {
    expect(reveal(empty, { seq: 1 })._unsafeUnwrapErr().code).toBe("CHECKIN_NO_ROUND");
  });

  it("open → revealed。開いていれば同じ参照", () => {
    const s = unwrap(reveal(chooseMethod(empty, "weather"), { seq: 1 }));
    expect(roundOf(s).status).toBe("revealed");
    expect(unwrap(reveal(s, { seq: 1 }))).toBe(s);
  });

  it("古い seq は同じ参照〈m503〉", () => {
    const s = chooseMethod(chooseMethod(empty, "weather"), "weather");
    expect(unwrap(reveal(s, { seq: 1 }))).toBe(s);
    expect(roundOf(s).status).toBe("open");
  });
});

describe("playAgain", () => {
  it("回が無ければ CHECKIN_NO_ROUND", () => {
    expect(playAgain(empty, { seq: 1 })._unsafeUnwrapErr().code).toBe("CHECKIN_NO_ROUND");
  });

  it("名前つきに切り替えて 1 枚出した roti も、もう一回で匿名・札なしの新しい回（判断 8）〈m499〉", () => {
    let s = chooseMethod(empty, "roti");
    s = unwrap(setVisibility(s, { seq: 1, visibility: "named" }));
    s = play(s, a, "4");
    s = unwrap(reveal(s, { seq: 1 }));
    const next = unwrap(playAgain(s, { seq: 1 }));
    expect(next.round).toMatchObject({ seq: 2, method: "roti", visibility: "anonymous", status: "open" });
    expect(roundOf(next).cards.size).toBe(0);
  });

  it("古い seq は同じ参照〈m503〉", () => {
    const s = chooseMethod(chooseMethod(empty, "weather"), "weather");
    expect(unwrap(playAgain(s, { seq: 1 }))).toBe(s);
  });
});

describe("setSpectator", () => {
  it("同じ状態への切り替えは同じ参照", () => {
    expect(setSpectator(empty, a, false)).toBe(empty);
    const s = setSpectator(empty, a, true);
    expect(setSpectator(s, a, true)).toBe(s);
  });

  it("回が無くても見学へ移れる。戻れる", () => {
    const s = setSpectator(empty, a, true);
    expect(s.spectators.has(a)).toBe(true);
    expect(setSpectator(s, a, false).spectators.has(a)).toBe(false);
  });

  it("open で見学へ移ると札を捨てる（他の人の札は残る）", () => {
    let s = chooseMethod(empty, "weather");
    s = play(play(s, a, "sunny"), b, "rain");
    s = setSpectator(s, a, true);
    expect([...roundOf(s).cards]).toEqual([[b, "rain"]]);
  });

  it("札を持たない人が見学へ移っても札の Map は同じ", () => {
    const s = play(chooseMethod(empty, "weather"), b, "rain");
    expect(roundOf(setSpectator(s, a, true)).cards).toBe(roundOf(s).cards);
  });

  it("開いた後に見学へ移っても札は残る", () => {
    let s = play(chooseMethod(empty, "weather"), a, "sunny");
    s = unwrap(reveal(s, { seq: 1 }));
    s = setSpectator(s, a, true);
    expect(roundOf(s).cards.get(a)).toBe("sunny");
  });
});

describe("prune", () => {
  it("名簿に居ない人の札と見学を落とす", () => {
    let s = chooseMethod(empty, "weather");
    s = play(play(s, a, "sunny"), b, "rain");
    s = setSpectator(setSpectator(s, c, true), "z", true);
    const t = prune(s, new Set([a, c]));
    expect([...roundOf(t).cards.keys()]).toEqual([a]);
    expect([...t.spectators]).toEqual([c]);
  });

  it("見学だけ落ちる場合・回が無い場合も落とす", () => {
    const s = setSpectator(empty, "z", true);
    expect(prune(s, new Set([a])).spectators.size).toBe(0);
    const t = setSpectator(play(chooseMethod(empty, "weather"), a, "sunny"), "z", true);
    const u = prune(t, new Set([a]));
    expect(roundOf(u).cards).toBe(roundOf(t).cards);
    expect(u.spectators.size).toBe(0);
  });

  it("名簿に居る人（切断しても残る）は落とさず、何も落ちなければ同じ参照", () => {
    let s = play(chooseMethod(empty, "weather"), a, "sunny");
    s = setSpectator(s, b, true);
    expect(prune(s, new Set([a, b]))).toBe(s);
    expect(prune(empty, new Set())).toBe(empty);
  });
});

describe("applyAutoReveal", () => {
  const room = (method: MethodId = "weather") => chooseMethod(empty, method);

  it("全員が出したときだけ開く", () => {
    const s = play(play(room(), a, "sunny"), b, "rain");
    expect(roundOf(applyAutoReveal(s, [a, b])).status).toBe("revealed");
    expect(applyAutoReveal(s, [a, b, c])).toBe(s);
  });

  it("見学者は分母に入らない（E9）〈m500〉", () => {
    let s = setSpectator(room(), c, true);
    s = play(play(s, a, "sunny"), b, "rain");
    expect(roundOf(applyAutoReveal(s, [a, b])).status).toBe("revealed");
  });

  it("players が空なら開かない（every の空集合の罠）", () => {
    const s = room();
    expect(applyAutoReveal(s, [])).toBe(s);
  });

  it("回が無い・開いた後は同じ参照", () => {
    expect(applyAutoReveal(empty, [a])).toBe(empty);
    const s = unwrap(reveal(play(room(), a, "sunny"), { seq: 1 }));
    expect(applyAutoReveal(s, [a])).toBe(s);
  });
});
