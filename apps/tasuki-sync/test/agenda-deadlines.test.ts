/**
 * 進行タイマーの期限の予約（#429）。偽の単調時計と偽の TimerPort で、時間を手で進める。
 */

import { describe, it, expect } from "bun:test";
import { makeAgendaDeadlines, type TimerPort } from "../src/application/agenda-deadlines.js";
import { Scheduler } from "../src/application/schedule.js";
import { FakeClock } from "../src/adapters/system-clock.js";

/** 偽の単調時計と偽のタイマー。`advance` で時計と待ちを同時に進める。 */
function fakeWorld() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const waits: number[] = [];
  const timer: TimerPort<number> = {
    set(fn, ms) {
      waits.push(ms);
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(handle) {
      pending.delete(handle);
    },
  };
  const advance = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const next = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined) break;
      pending.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = target;
  };
  return { clock: { now: () => now }, timer, advance, waits, pendingCount: () => pending.size };
}

/**
 * @requirements #429
 */
describe("makeAgendaDeadlines", () => {
  it("期限ちょうどに 1 回だけ呼ぶ", () => {
    const w = fakeWorld();
    const d = makeAgendaDeadlines(w);
    const due: string[] = [];
    d.arm("R", 500, (c) => due.push(c));
    w.advance(499);
    expect(due).toEqual([]);
    w.advance(1);
    expect(due).toEqual(["R"]);
    w.advance(5000);
    expect(due).toEqual(["R"]);
  });

  it("上書きすると前の予約は呼ばれない", () => {
    const w = fakeWorld();
    const d = makeAgendaDeadlines(w);
    const due: string[] = [];
    d.arm("R", 500, () => due.push("old"));
    d.arm("R", 900, () => due.push("new"));
    w.advance(1000);
    expect(due).toEqual(["new"]);
  });

  it("clear の後は呼ばれない。clearAll は全ルームを止める", () => {
    const w = fakeWorld();
    const d = makeAgendaDeadlines(w);
    const due: string[] = [];
    d.arm("A", 100, () => due.push("A"));
    d.arm("B", 100, () => due.push("B"));
    d.arm("C", 100, () => due.push("C"));
    d.clear("A");
    d.clearAll();
    w.advance(1000);
    expect(due).toEqual([]);
    expect(w.pendingCount()).toBe(0);
  });

  it("長い期限は 1000ms 刻みで待ち直し、期限に呼ぶ", () => {
    const w = fakeWorld();
    const d = makeAgendaDeadlines(w);
    const due: string[] = [];
    d.arm("R", 2500, () => due.push("R"));
    w.advance(2499);
    expect(due).toEqual([]);
    w.advance(1);
    expect(due).toEqual(["R"]);
    expect(w.waits).toEqual([1000, 1000, 500]);
  });

  it("期限が過去なら即座に呼ぶ", () => {
    const w = fakeWorld();
    w.advance(100);
    const d = makeAgendaDeadlines(w);
    const due: string[] = [];
    d.arm("R", 50, () => due.push("R"));
    expect(due).toEqual(["R"]);
  });

  it("同じルームコードで timer の Scheduler に予約しても agenda の予約は消えない", () => {
    const w = fakeWorld();
    const d = makeAgendaDeadlines(w);
    const scheduler = new Scheduler(new FakeClock(0));
    const due: string[] = [];
    d.arm("R", 500, () => due.push("R"));
    scheduler.schedule("R", 60, () => {});
    scheduler.clear("R");
    scheduler.clearAll();
    w.advance(500);
    expect(due).toEqual(["R"]);
  });
});

/**
 * ハンドルが `undefined` の TimerPort（`TimerPort<undefined>`）でも、解除が効くこと（#596）。
 * ハンドルの値で「予約が有るか」を決めると、値が `undefined` の予約は解除も表からの削除もされない。
 */
describe("makeAgendaDeadlines: ハンドルが undefined の TimerPort", () => {
  it("WHEN set が undefined を返す THE clear SHALL それでも TimerPort.clear を呼び、待ちを止める", () => {
    let now = 0;
    const pending: Array<() => void> = [];
    let clears = 0;
    const timer: TimerPort<undefined> = {
      set: (fn) => {
        pending.push(fn);
        return undefined;
      },
      clear: () => {
        clears += 1;
        pending.length = 0;
      },
    };
    const d = makeAgendaDeadlines({ clock: { now: () => now }, timer });
    const due: string[] = [];
    d.arm("R", 500, (c) => due.push(c));
    expect(pending.length).toBe(1);

    d.clear("R");

    expect(clears).toBe(1);
    expect(pending.length).toBe(0);
    d.clear("R"); // 表からも消えている（2 回目は何もしない）
    expect(clears).toBe(1);
    now = 1000;
    expect(due).toEqual([]);
  });
});
