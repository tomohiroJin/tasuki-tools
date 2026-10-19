import { describe, expect, it } from "vitest";
import {
  INITIAL_AGENDA_STATE,
  advanceIfDue,
  deadlineOf,
  extend,
  next,
  pause,
  replaceScenario,
  reset,
  resume,
  setSkipped,
  start,
  toView,
} from "../src/agenda.js";
import type { AgendaState } from "../src/types.js";
import { kptInput } from "./support/fixtures.js";

/** 成功値を取り出す（失敗なら落とす） */
function must(r: { isOk(): boolean; _unsafeUnwrap(): AgendaState }): AgendaState {
  return r._unsafeUnwrap();
}
const idle = (): AgendaState => must(replaceScenario(INITIAL_AGENDA_STATE, kptInput));
const running = (now = 1000): AgendaState => must(start(idle(), now));
const paused = (): AgendaState => must(pause(running(1000), 4000));
const finished = (): AgendaState => {
  let s = running(0);
  for (let i = 1; i <= 5; i++) s = must(next(s, { stepId: `s-${i}`, now: i * 1000 }));
  return s;
};
const codeOf = (r: { isErr(): boolean; _unsafeUnwrapErr(): { code: string } }) => r._unsafeUnwrapErr().code;

describe("INITIAL_AGENDA_STATE", () => {
  it("idle・空の状態である", () => {
    expect(INITIAL_AGENDA_STATE.phase).toBe("idle");
    expect(INITIAL_AGENDA_STATE.steps).toEqual([]);
    expect(INITIAL_AGENDA_STATE.currentId).toBeNull();
  });
});

describe("replaceScenario", () => {
  it("idle では展開して置き換える", () => {
    const s = idle();
    expect(s.phase).toBe("idle");
    expect(s.title).toBe("KPT のふりかえり");
    expect(s.steps.map((x) => x.id)).toEqual(["s-1", "s-2", "s-3", "s-4", "s-5"]);
  });
  it("running 中は AGENDA_IN_PROGRESS（m437）", () => {
    expect(codeOf(replaceScenario(running(), kptInput))).toBe("AGENDA_IN_PROGRESS");
  });
  it("paused 中は AGENDA_IN_PROGRESS", () => {
    expect(codeOf(replaceScenario(paused(), kptInput))).toBe("AGENDA_IN_PROGRESS");
  });
  it("finished は AGENDA_FINISHED", () => {
    expect(codeOf(replaceScenario(finished(), kptInput))).toBe("AGENDA_FINISHED");
  });
  it("区切りが空なら INVALID_SCENARIO", () => {
    expect(codeOf(replaceScenario(INITIAL_AGENDA_STATE, { title: "x", steps: [] }))).toBe("INVALID_SCENARIO");
  });
});

describe("start", () => {
  it("idle から最初の区切りで running になる", () => {
    const s = running(1234);
    expect(s).toMatchObject({
      phase: "running",
      currentId: "s-1",
      startedAt: 1234,
      stepStartedAt: 1234,
      runningSince: 1234,
      accumulatedMs: 0,
    });
  });
  it("区切りが 0 なら AGENDA_EMPTY", () => {
    expect(codeOf(start(INITIAL_AGENDA_STATE, 0))).toBe("AGENDA_EMPTY");
  });
  it.each([
    ["running", running],
    ["paused", paused],
    ["finished", finished],
  ])("%s は AGENDA_ALREADY_STARTED", (_n, make) => {
    expect(codeOf(start(make(), 9))).toBe("AGENDA_ALREADY_STARTED");
  });
});

describe("next", () => {
  it("idle は AGENDA_NOT_STARTED", () => {
    expect(codeOf(next(idle(), { stepId: "s-1", now: 0 }))).toBe("AGENDA_NOT_STARTED");
  });
  it("running で進む。終えた区切りの所要は now - stepStartedAt", () => {
    const s = must(next(running(1000), { stepId: "s-1", now: 4000 }));
    expect(s.currentId).toBe("s-2");
    expect(s.steps[0]!.spentMs).toBe(3000);
    expect(s).toMatchObject({ phase: "running", stepStartedAt: 4000, runningSince: 4000, accumulatedMs: 0 });
  });
  it("一時停止を含めた所要になる（J5）", () => {
    const s = must(next(paused(), { stepId: "s-1", now: 9000 }));
    expect(s.steps[0]!.spentMs).toBe(8000);
  });
  it("2 回目の next を同じ stepId で送ると同じ参照（m430）", () => {
    const a = must(next(running(), { stepId: "s-1", now: 2000 }));
    const b = must(next(a, { stepId: "s-1", now: 2100 }));
    expect(b).toBe(a);
    expect(b.currentId).toBe("s-2");
  });
  it("ID 違いは同じ参照", () => {
    const s = running();
    expect(must(next(s, { stepId: "s-3", now: 5000 }))).toBe(s);
  });
  it("paused で next すると次は running で始まる（m435）", () => {
    const s = must(next(paused(), { stepId: "s-1", now: 9000 }));
    expect(s.phase).toBe("running");
    expect(s.runningSince).toBe(9000);
    expect(s.stepStartedAt).toBe(9000);
  });
  it("paused で ID 違いの next は同じ参照", () => {
    const s = paused();
    expect(must(next(s, { stepId: "s-2", now: 9000 }))).toBe(s);
  });
  it("飛ばした区切りを通り過ぎ、その spentMs は 0 になる", () => {
    let s = setSkipped(running(0), { stepId: "s-2", skipped: true })._unsafeUnwrap();
    s = must(next(s, { stepId: "s-1", now: 1000 }));
    expect(s.currentId).toBe("s-3");
    expect(s.steps[1]!.spentMs).toBe(0);
  });
  it("残りをすべて飛ばした後の next で finished", () => {
    let s = running(0);
    for (const id of ["s-2", "s-3", "s-4", "s-5"]) s = must(setSkipped(s, { stepId: id, skipped: true }));
    s = must(next(s, { stepId: "s-1", now: 5000 }));
    expect(s).toMatchObject({ phase: "finished", currentId: null, runningSince: null, finishedAtMs: 5000 });
    expect(s.steps.map((x) => x.spentMs)).toEqual([5000, 0, 0, 0, 0]);
  });
  it("最後で next すると finished。finishedAtMs = now - startedAt", () => {
    const s = finished();
    expect(s.phase).toBe("finished");
    expect(s.finishedAtMs).toBe(5000);
  });
  it("finished は同じ参照", () => {
    const s = finished();
    expect(must(next(s, { stepId: "s-5", now: 9999 }))).toBe(s);
  });
});

describe("pause / resume", () => {
  it("idle は AGENDA_NOT_STARTED", () => {
    expect(codeOf(pause(idle(), 0))).toBe("AGENDA_NOT_STARTED");
    expect(codeOf(resume(idle(), 0))).toBe("AGENDA_NOT_STARTED");
  });
  it("running の pause で積算し paused へ", () => {
    const s = paused();
    expect(s).toMatchObject({ phase: "paused", accumulatedMs: 3000, runningSince: null });
  });
  it("一時停止を重ねると計時の積算が足し合わさる", () => {
    let s = running(1000);
    s = must(pause(s, 4000));
    s = must(resume(s, 7000));
    s = must(pause(s, 9000));
    expect(s.accumulatedMs).toBe(5000);
  });
  it("paused の resume で running へ", () => {
    const s = must(resume(paused(), 7000));
    expect(s).toMatchObject({ phase: "running", runningSince: 7000, accumulatedMs: 3000 });
  });
  it("running の resume は同じ参照", () => {
    const s = running();
    expect(must(resume(s, 2000))).toBe(s);
  });
  it("paused の pause は同じ参照", () => {
    const s = paused();
    expect(must(pause(s, 9000))).toBe(s);
  });
  it("finished はどちらも同じ参照", () => {
    const s = finished();
    expect(must(pause(s, 1))).toBe(s);
    expect(must(resume(s, 1))).toBe(s);
  });
});

describe("extend", () => {
  it("idle は AGENDA_NOT_STARTED", () => {
    expect(codeOf(extend(idle(), { stepId: "s-1", minutes: 3, now: 0 }))).toBe("AGENDA_NOT_STARTED");
  });
  it("running で足す", () => {
    const s = must(extend(running(), { stepId: "s-1", minutes: 3, now: 2000 }));
    expect(s.steps[0]!.extensionSec).toBe(180);
  });
  it("paused でも足せる", () => {
    const s = must(extend(paused(), { stepId: "s-1", minutes: 1, now: 5000 }));
    expect(s.steps[0]!.extensionSec).toBe(60);
  });
  it("同じ stepId に 3 分を 2 回で 360 秒（J7）", () => {
    let s = running();
    s = must(extend(s, { stepId: "s-1", minutes: 3, now: 2000 }));
    s = must(extend(s, { stepId: "s-1", minutes: 3, now: 2100 }));
    expect(s.steps[0]!.extensionSec).toBe(360);
  });
  it("ID 違いは何も変えない（m434）", () => {
    const s = running();
    expect(must(extend(s, { stepId: "s-2", minutes: 3, now: 2000 }))).toBe(s);
  });
  it("finished は同じ参照", () => {
    const s = finished();
    expect(must(extend(s, { stepId: "s-5", minutes: 3, now: 9 }))).toBe(s);
  });
  it("持ち時間が 14400 秒を超えると STEP_BUDGET_EXCEEDED", () => {
    // 14340 + 120 = 14460 秒は超える
    const big = must(
      replaceScenario(INITIAL_AGENDA_STATE, { title: "t", steps: [{ name: "a", durationSec: 14340, onTimeout: "wait" }] }),
    );
    const s = must(start(big, 0));
    expect(codeOf(extend(s, { stepId: "s-1", minutes: 2, now: 1 }))).toBe("STEP_BUDGET_EXCEEDED");
  });
  it("ちょうど 14400 秒は通る", () => {
    const big = must(
      replaceScenario(INITIAL_AGENDA_STATE, { title: "t", steps: [{ name: "a", durationSec: 14340, onTimeout: "wait" }] }),
    );
    const s = must(start(big, 0));
    expect(must(extend(s, { stepId: "s-1", minutes: 1, now: 1 })).steps[0]!.extensionSec).toBe(60);
  });
});

describe("setSkipped", () => {
  it("idle は AGENDA_NOT_STARTED", () => {
    expect(codeOf(setSkipped(idle(), { stepId: "s-2", skipped: true }))).toBe("AGENDA_NOT_STARTED");
  });
  it("finished は AGENDA_FINISHED", () => {
    expect(codeOf(setSkipped(finished(), { stepId: "s-2", skipped: true }))).toBe("AGENDA_FINISHED");
  });
  it("まだのステップを飛ばし、戻せる", () => {
    const a = must(setSkipped(running(), { stepId: "s-3", skipped: true }));
    expect(a.steps[2]!.skipped).toBe(true);
    const b = must(setSkipped(a, { stepId: "s-3", skipped: false }));
    expect(b.steps[2]!.skipped).toBe(false);
  });
  it("paused でも同じ", () => {
    expect(must(setSkipped(paused(), { stepId: "s-3", skipped: true })).steps[2]!.skipped).toBe(true);
  });
  it("いまの区切りは STEP_NOT_SKIPPABLE", () => {
    expect(codeOf(setSkipped(running(), { stepId: "s-1", skipped: true }))).toBe("STEP_NOT_SKIPPABLE");
  });
  it("済みの区切りは STEP_NOT_SKIPPABLE", () => {
    const s = must(next(running(), { stepId: "s-1", now: 2000 }));
    expect(codeOf(setSkipped(s, { stepId: "s-1", skipped: true }))).toBe("STEP_NOT_SKIPPABLE");
  });
  it("無い ID は STEP_NOT_FOUND", () => {
    expect(codeOf(setSkipped(running(), { stepId: "s-99", skipped: true }))).toBe("STEP_NOT_FOUND");
  });
  it("変化がなければ同じ参照", () => {
    const s = running();
    expect(must(setSkipped(s, { stepId: "s-3", skipped: false }))).toBe(s);
  });
});

describe("reset", () => {
  it("idle は同じ参照", () => {
    const s = idle();
    expect(must(reset(s))).toBe(s);
  });
  it("空の初期状態も同じ参照", () => {
    expect(must(reset(INITIAL_AGENDA_STATE))).toBe(INITIAL_AGENDA_STATE);
  });
  it.each([
    ["running", running],
    ["paused", paused],
    ["finished", finished],
  ])("%s から idle へ。延長・飛ばし・所要を消し、シナリオは残す", (_n, make) => {
    let s = make();
    if (s.phase !== "finished") {
      s = must(extend(s, { stepId: "s-1", minutes: 3, now: 5000 }));
      s = must(setSkipped(s, { stepId: "s-3", skipped: true }));
    }
    const r = must(reset(s));
    expect(r.phase).toBe("idle");
    expect(r.title).toBe("KPT のふりかえり");
    expect(r.steps).toEqual(idle().steps);
    expect(r).toMatchObject({ currentId: null, startedAt: null, stepStartedAt: null, runningSince: null, accumulatedMs: 0, finishedAtMs: null });
  });
});

const advancing = (): AgendaState =>
  must(
    replaceScenario(INITIAL_AGENDA_STATE, {
      title: "自動",
      steps: [
        { name: "A", durationSec: 60, onTimeout: "advance" },
        { name: "B", durationSec: 60, onTimeout: "advance" },
        { name: "C", durationSec: 60, onTimeout: "wait" },
      ],
    }),
  );

describe("deadlineOf", () => {
  it("running では計時が持ち時間に達する時刻", () => {
    expect(deadlineOf(running(1000))).toBe(1000 + 300_000);
  });
  it("延長を含み、一時停止で積算した分を引く", () => {
    let s = running(0);
    s = must(pause(s, 100_000));
    s = must(resume(s, 500_000));
    s = must(extend(s, { stepId: "s-1", minutes: 3, now: 500_000 }));
    expect(deadlineOf(s)).toBe(500_000 + 300_000 + 180_000 - 100_000);
  });
  it.each([
    ["idle", idle],
    ["paused", paused],
    ["finished", finished],
  ])("%s は null", (_n, make) => {
    expect(deadlineOf(make())).toBeNull();
  });
});

describe("advanceIfDue", () => {
  it("advance のステップは期限ちょうどで次へ。次の始まりは期限（発火時刻ではない）（m433）", () => {
    const s = must(start(advancing(), 0));
    const r = advanceIfDue(s, 60_000 + 900);
    expect(r.currentId).toBe("s-2");
    expect(r.stepStartedAt).toBe(60_000);
    expect(r.runningSince).toBe(60_000);
    expect(r.steps[0]!.spentMs).toBe(60_000);
  });
  it("飛ばした区切りを跨ぐ: A（advance）→ B（飛ばし）→ C は、C が期限で始まり、B の所要は 0", () => {
    let s = must(
      replaceScenario(INITIAL_AGENDA_STATE, {
        title: "t",
        steps: [
          { name: "A", durationSec: 60, onTimeout: "advance" },
          { name: "B", durationSec: 60, onTimeout: "wait" },
          { name: "C", durationSec: 60, onTimeout: "wait" },
        ],
      }),
    );
    s = must(start(s, 0));
    s = must(setSkipped(s, { stepId: "s-2", skipped: true }));
    const r = advanceIfDue(s, 60_000 + 900);
    expect(r.currentId).toBe("s-3");
    expect(r.stepStartedAt).toBe(60_000);
    expect(r.steps[0]!.spentMs).toBe(60_000);
    expect(r.steps[1]!.spentMs).toBe(0);
  });
  it("期限前は同じ参照", () => {
    const s = must(start(advancing(), 0));
    expect(advanceIfDue(s, 59_999)).toBe(s);
  });
  it("次も期限を過ぎていれば繰り返す。最後が wait なら止まる", () => {
    const s = must(start(advancing(), 0));
    const r = advanceIfDue(s, 500_000);
    expect(r.currentId).toBe("s-3");
    expect(r.stepStartedAt).toBe(120_000);
    expect(r.steps.map((x) => x.spentMs)).toEqual([60_000, 60_000, null]);
  });
  it("最後のステップが advance なら期限で終了し、終了の経過は期限で確定する", () => {
    let s = must(
      replaceScenario(INITIAL_AGENDA_STATE, { title: "t", steps: [{ name: "A", durationSec: 60, onTimeout: "advance" }] }),
    );
    s = must(start(s, 1000));
    const r = advanceIfDue(s, 99_999);
    expect(r.phase).toBe("finished");
    expect(r.finishedAtMs).toBe(60_000);
  });
  it("wait のステップは期限を過ぎても同じ参照", () => {
    const s = running(0);
    expect(advanceIfDue(s, 10_000_000)).toBe(s);
  });
  it("paused・idle・finished は同じ参照", () => {
    for (const s of [idle(), paused(), finished()]) expect(advanceIfDue(s, 10_000_000)).toBe(s);
  });
});

describe("toView", () => {
  it("経過は now から計算する", () => {
    const s = must(pause(running(1000), 4000));
    expect(toView(s, 10_000)).toMatchObject({ phase: "paused", runElapsedMs: 9000, stepTimerMs: 3000, stepSpentMs: 9000 });
    const r = must(resume(s, 6000));
    expect(toView(r, 10_000)).toMatchObject({ runElapsedMs: 9000, stepTimerMs: 3000 + 4000, stepSpentMs: 9000 });
  });
  it("idle はすべて 0", () => {
    expect(toView(idle(), 99_999)).toMatchObject({ runElapsedMs: 0, stepTimerMs: 0, stepSpentMs: 0 });
  });
  it("finished は確定値と 0", () => {
    expect(toView(finished(), 99_999)).toMatchObject({ phase: "finished", runElapsedMs: 5000, stepTimerMs: 0, stepSpentMs: 0 });
  });
  it("単調時計の値を出力に持たない", () => {
    const keys = Object.keys(toView(running(1000), 2000));
    for (const k of ["startedAt", "stepStartedAt", "runningSince", "accumulatedMs", "finishedAtMs"]) expect(keys).not.toContain(k);
    expect(keys.sort()).toEqual(["currentId", "phase", "runElapsedMs", "steps", "stepSpentMs", "stepTimerMs", "title"].sort());
  });
});
