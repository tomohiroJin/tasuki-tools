/**
 * 名簿の振り分けと並べ方（#370。`RosterPanel.tsx` から出した純粋関数）。並べ方は移す前のまま。
 */
import { describe, expect, it } from "vitest";
import { splitRoster } from "../../src/ui/roster-order.js";

const people = ["a", "b", "c", "w1", "w2"].map((participantId) => ({ participantId }));

describe("splitRoster", () => {
  it("輪の人はいまの人から巡回順に、輪の外の人は元の順に並べる", () => {
    const { drivers, watchers } = splitRoster(people, ["c", "a", "b"], "a");
    expect(drivers.map((p) => p.participantId)).toEqual(["a", "b", "c"]);
    expect(watchers.map((p) => p.participantId)).toEqual(["w1", "w2"]);
  });

  it("いまの人が輪に居なければ、輪の人は元の順のまま", () => {
    const { drivers } = splitRoster(people, ["c", "a", "b"], "");
    expect(drivers.map((p) => p.participantId)).toEqual(["a", "b", "c"]);
  });

  it("輪が無ければ全員が見学", () => {
    expect(splitRoster(people, undefined, "a")).toEqual({ drivers: [], watchers: people });
  });

  it("輪が空なら全員が見学", () => {
    expect(splitRoster(people, [], "a")).toEqual({ drivers: [], watchers: people });
  });
});
