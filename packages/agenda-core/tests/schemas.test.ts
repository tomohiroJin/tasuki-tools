import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  AGENDA_ERROR_CODES,
  AgendaCommandSchema,
  AgendaErrorFrameSchema,
  AgendaFrameSchema,
  ScenarioInputSchema,
  hasControlChars,
} from "../src/index.js";

const step = (over: Record<string, unknown> = {}) => ({ name: "a", durationSec: 300, onTimeout: "wait", ...over });
const scenario = (over: Record<string, unknown> = {}) => ({ title: "会", steps: [step()], ...over });
const ok = (schema: Parameters<typeof v.safeParse>[0], x: unknown) => v.safeParse(schema, x).success;

describe("ScenarioInputSchema の回数", () => {
  const sc = (rounds: unknown, steps: unknown[]) => ({ title: "会", rounds, steps });
  const min = (n: number, sec = 60) => Array.from({ length: n }, () => step({ durationSec: sec }));
  it.each([
    ["回数の省略", { title: "会", steps: [step()] }],
    ["回数 1", sc(1, [step()])],
    ["回数 30", sc(30, [step({ durationSec: 60 })])],
    ["展開後 60 区切り（3 区切り × 20 回）", sc(20, min(3))],
    ["展開後 180 分（1 区切り 6 分 × 30 回）", sc(30, [step({ durationSec: 360 })])],
  ])("通る: %s", (_n, x) => {
    expect(ok(ScenarioInputSchema, x)).toBe(true);
  });
  it.each([
    ["回数 0", sc(0, [step()])],
    ["回数 31", sc(31, [step({ durationSec: 60 })])],
    ["回数 1.5", sc(1.5, [step()])],
    ["回数が文字列", sc("2", [step()])],
    ["展開後 61 区切り以上（4 区切り × 16 回）（m454）", sc(16, min(4))],
    ["展開後 181 分以上（7 分 × 26 回）（m453）", sc(26, [step({ durationSec: 420 })])],
  ])("拒む: %s", (_n, x) => {
    expect(ok(ScenarioInputSchema, x)).toBe(false);
  });
  it("回数つきでも回数なしでも set を受け、知らないキーは拒む", () => {
    expect(ok(AgendaCommandSchema, { command: "agenda.scenario.set", scenario: scenario({ rounds: 2 }) })).toBe(true);
    expect(ok(AgendaCommandSchema, { command: "agenda.scenario.set", scenario: scenario() })).toBe(true);
    expect(ok(AgendaCommandSchema, { command: "agenda.scenario.set", scenario: scenario({ repeat: 2 }) })).toBe(false);
  });
});

describe("AgendaFrameSchema の回数", () => {
  const frame = (state: Record<string, unknown>, stepOver: Record<string, unknown> = {}) => ({
    type: "agenda",
    state: {
      phase: "idle",
      title: "",
      steps: [{ id: "s-1", name: "a", durationSec: 60, onTimeout: "wait", skipped: false, extensionSec: 0, spentMs: null, ...stepOver }],
      currentId: null,
      runElapsedMs: 0,
      stepTimerMs: 0,
      stepSpentMs: 0,
      ...state,
    },
  });
  it("回数も回も無い第 1 段の形を受け、1 として読む", () => {
    const r = v.parse(AgendaFrameSchema, frame({}));
    expect(r.state.rounds).toBe(1);
    expect(r.state.steps[0]!.round).toBe(1);
  });
  it("回数と回はそのまま出る", () => {
    const r = v.parse(AgendaFrameSchema, frame({ rounds: 3 }, { round: 2 }));
    expect(r.state.rounds).toBe(3);
    expect(r.state.steps[0]!.round).toBe(2);
  });
});

describe("AgendaCommandSchema", () => {
  const valid = [
    { command: "agenda.scenario.set", scenario: scenario() },
    { command: "agenda.start" },
    { command: "agenda.next", stepId: "s-1" },
    { command: "agenda.pause" },
    { command: "agenda.resume" },
    { command: "agenda.extend", stepId: "s-1", minutes: 3 },
    { command: "agenda.skip", stepId: "s-1", skipped: true },
    { command: "agenda.reset" },
    { command: "agenda.sync" },
  ];
  it.each(valid)("通る: $command", (cmd) => {
    expect(ok(AgendaCommandSchema, cmd)).toBe(true);
  });

  it("余剰の項目は落ちる", () => {
    expect(ok(AgendaCommandSchema, { command: "agenda.start", x: 1 })).toBe(false);
    expect(ok(AgendaCommandSchema, { command: "agenda.next", stepId: "s-1", x: 1 })).toBe(false);
  });

  it("extend の minutes は 1・3・5 だけ", () => {
    for (const minutes of [1, 3, 5]) expect(ok(AgendaCommandSchema, { command: "agenda.extend", stepId: "s-1", minutes })).toBe(true);
    expect(ok(AgendaCommandSchema, { command: "agenda.extend", stepId: "s-1", minutes: 2 })).toBe(false);
  });

  it("stepId は 1〜16 字", () => {
    expect(ok(AgendaCommandSchema, { command: "agenda.next", stepId: "" })).toBe(false);
    expect(ok(AgendaCommandSchema, { command: "agenda.next", stepId: "x".repeat(16) })).toBe(true);
    expect(ok(AgendaCommandSchema, { command: "agenda.next", stepId: "x".repeat(17) })).toBe(false);
  });
});

describe("ScenarioInputSchema", () => {
  it("通る: 名前 40 字・会の名前が空・合計ちょうど 10800 秒", () => {
    expect(ok(ScenarioInputSchema, scenario({ steps: [step({ name: "あ".repeat(40) })] }))).toBe(true);
    expect(ok(ScenarioInputSchema, scenario({ title: "" }))).toBe(true);
    expect(ok(ScenarioInputSchema, scenario({ steps: [step({ durationSec: 7200 }), step({ durationSec: 3600 })] }))).toBe(true);
  });

  it.each([
    ["21 項目", scenario({ steps: Array.from({ length: 21 }, () => step({ durationSec: 60 })) })],
    ["0 項目", scenario({ steps: [] })],
    ["名前 41 字", scenario({ steps: [step({ name: "あ".repeat(41) })] })],
    ["名前が空白だけ", scenario({ steps: [step({ name: "  　".slice(0, 2) })] })],
    ["名前が空", scenario({ steps: [step({ name: "" })] })],
    ["名前に改行", scenario({ steps: [step({ name: "a\nb" })] })],
    ["名前にタブ", scenario({ steps: [step({ name: "a\tb" })] })],
    ["名前に DEL", scenario({ steps: [step({ name: "a\u007fb" })] })],
    ["会の名前 61 字", scenario({ title: "あ".repeat(61) })],
    ["会の名前に改行", scenario({ title: "a\nb" })],
    ["59 秒", scenario({ steps: [step({ durationSec: 59 })] })],
    ["7260 秒", scenario({ steps: [step({ durationSec: 7260 })] })],
    ["90 秒", scenario({ steps: [step({ durationSec: 90 })] })],
    ["onTimeout が不正", scenario({ steps: [step({ onTimeout: "x" })] })],
    ["合計 10860 秒", scenario({ steps: [step({ durationSec: 7200 }), step({ durationSec: 3660 })] })],
  ])("落ちる: %s", (_n, input) => {
    expect(ok(ScenarioInputSchema, input)).toBe(false);
  });
});

describe("フレーム", () => {
  const view = {
    phase: "idle",
    title: "",
    steps: [{ id: "s-1", name: "a", durationSec: 60, onTimeout: "wait", skipped: false, extensionSec: 0, spentMs: null }],
    currentId: null,
    runElapsedMs: 0,
    stepTimerMs: 0,
    stepSpentMs: 0,
  };
  it("項目を足しても通る（非 strict）", () => {
    expect(ok(AgendaFrameSchema, { type: "agenda", state: view })).toBe(true);
    expect(ok(AgendaFrameSchema, { type: "agenda", extra: 1, state: { ...view, future: 1, steps: [{ ...view.steps[0], more: 1 }] } })).toBe(true);
  });
  it("知らない時間切れの振る舞い（新しいサーバーが足した値）でもフレームを捨てず、「押すまで待つ」として読む（最終レビュー M-2）", () => {
    const r = v.safeParse(AgendaFrameSchema, { type: "agenda", state: { ...view, steps: [{ ...view.steps[0], onTimeout: "future" }] } });
    expect(r.success).toBe(true);
    expect(r.success && r.output.state.steps[0]?.onTimeout).toBe("wait");
    const adv = v.safeParse(AgendaFrameSchema, { type: "agenda", state: { ...view, steps: [{ ...view.steps[0], onTimeout: "advance" }] } });
    expect(adv.success && adv.output.state.steps[0]?.onTimeout).toBe("advance");
  });
  it("コマンドの時間切れの振る舞いは列挙のまま（知らない値は拒む）", () => {
    expect(ok(AgendaCommandSchema, { command: "agenda.scenario.set", scenario: scenario({ steps: [step({ onTimeout: "future" })] }) })).toBe(false);
  });
  it("不正な state は落ちる", () => {
    expect(ok(AgendaFrameSchema, { type: "agenda", state: { ...view, phase: "x" } })).toBe(false);
  });
  it("エラーフレームはコードを列挙で縛る", () => {
    expect(ok(AgendaErrorFrameSchema, { type: "error", code: "RATE_LIMITED", message: "m" })).toBe(true);
    expect(ok(AgendaErrorFrameSchema, { type: "error", code: "NOPE", message: "m" })).toBe(false);
    expect(AGENDA_ERROR_CODES.slice(0, 6)).toEqual([
      "INVALID_JSON", "INVALID_COMMAND", "NOT_IN_ROOM", "RATE_LIMITED", "MESSAGE_TOO_LARGE", "INTERNAL_ERROR",
    ]);
  });
});

describe("hasControlChars（画面の検証と境界のスキーマが同じ規則を使う）", () => {
  it.each(["a\u0000b", "\t", "改\n行", "\u001F", "\u007F"])("制御文字を含む: %j", (s) => {
    expect(hasControlChars(s)).toBe(true);
  });

  it.each(["", "ふりかえり", "a b", "\u0080"])("含まない: %j", (s) => {
    expect(hasControlChars(s)).toBe(false);
  });
});
