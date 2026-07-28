import { describe, it, expect } from "vitest";
import { computeRotationStatus } from "../../src/ui/rotation-status.js";

describe("computeRotationStatus", () => {
  const base = { rotation: ["Alice", "Bob", "Carol"], currentIndex: 0, intervalSeconds: 300, selfIndex: 2, isPaused: false };

  it("turnsAway は現在を 0 として循環する", () => {
    const r = computeRotationStatus(base);
    expect(r.members.map((m) => m.turnsAway)).toEqual([0, 1, 2]);
    expect(r.members[0]!.isCurrent).toBe(true);
    expect(r.members[1]!.isNext).toBe(true);
  });

  it("currentIndex が進むと turnsAway が回る", () => {
    const r = computeRotationStatus({ ...base, currentIndex: 1 });
    const byName = Object.fromEntries(r.members.map((m) => [m.name, m.turnsAway]));
    expect(byName).toEqual({ Bob: 0, Carol: 1, Alice: 2 });
  });

  it("自分の minutesAway は interval×turnsAway/60（停止中は null）", () => {
    const r = computeRotationStatus({ ...base, currentIndex: 0 });
    expect(r.self?.name).toBe("Carol");
    expect(r.self?.turnsAway).toBe(2);
    expect(r.self?.minutesAway).toBe(10); // 300s×2=600s=10分
    const paused = computeRotationStatus({ ...base, isPaused: true });
    expect(paused.self?.minutesAway).toBeNull();
  });

  it("自分が rotation 外なら self=null", () => {
    const r = computeRotationStatus({ ...base, selfIndex: -1 });
    expect(r.self).toBeNull();
  });

  it("空 rotation でも例外なく空配列を返す", () => {
    const r = computeRotationStatus({ ...base, rotation: [], currentIndex: 0 });
    expect(r.members).toEqual([]);
    expect(r.self).toBeNull();
  });
});
