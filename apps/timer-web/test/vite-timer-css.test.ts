import { describe, expect, it } from "vitest";
import { stripTimerLayer, timerCssPlugin, timerCssSwitches } from "../vite-timer-css.js";

describe("timerCssSwitches", () => {
  it("Given 変数なし / Then どちらも偽", () => {
    expect(timerCssSwitches({})).toEqual({ unlayered: false, unminified: false });
  });
  it("Given '1' / Then 真（'true' や '0' は偽）", () => {
    expect(timerCssSwitches({ TASUKI_TIMER_UNLAYERED: "1", TASUKI_TIMER_CSS_UNMINIFIED: "1" })).toEqual({ unlayered: true, unminified: true });
    expect(timerCssSwitches({ TASUKI_TIMER_UNLAYERED: "true", TASUKI_TIMER_CSS_UNMINIFIED: "0" })).toEqual({ unlayered: false, unminified: false });
  });
});

describe("stripTimerLayer", () => {
  it("Given layer(timer) の @import が 2 本 / Then 2 本とも外し、件数 2 を返す", () => {
    const src = "@import './styles/base.css';\n@import './styles/primitives.css' layer(timer);\n@import \"./styles/lobby.css\" layer(timer);\n";
    expect(stripTimerLayer(src)).toEqual({
      code: "@import './styles/base.css';\n@import './styles/primitives.css';\n@import \"./styles/lobby.css\";\n",
      count: 2,
    });
  });
  it("Given 順序宣言の @layer の中の timer / Then 触らない（@import の layer() だけを外す）", () => {
    const src = "@layer theme, base, timer, components, utilities;\n";
    expect(stripTimerLayer(src)).toEqual({ code: src, count: 0 });
  });
});

describe("timerCssPlugin", () => {
  const transform = (env: NodeJS.ProcessEnv, code: string, id: string) => {
    const plugin = timerCssPlugin(env);
    const fn = plugin.transform as (code: string, id: string) => { code: string } | null;
    return fn.call({}, code, id);
  };
  it("Given 変数なし / Then 何もしない", () => {
    expect(transform({}, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/index.css")).toBeNull();
  });
  it("Given unlayered・入口の CSS / Then 外す", () => {
    expect(transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/index.css")).toEqual({ code: "@import './a.css';", map: null });
  });
  it("Given unlayered・外す箇所が 0 件 / Then 止める（普通のビルドを一時ビルドと取り違えない）", () => {
    expect(() => transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css';", "/x/apps/timer-web/src/index.css")).toThrow(/layer\(timer\)/);
  });
  it("Given unlayered・入口でない CSS / Then 触らない", () => {
    expect(transform({ TASUKI_TIMER_UNLAYERED: "1" }, "@import './a.css' layer(timer);", "/x/apps/timer-web/src/styles/lobby.css")).toBeNull();
  });
});
