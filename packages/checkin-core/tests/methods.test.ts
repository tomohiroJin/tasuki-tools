import { describe, expect, it } from "vitest";
import { GROUP_IDS, METHOD_GROUPS, METHOD_IDS, METHODS, SIDES, groupsOf, methodsOf } from "../src/methods.js";

describe("METHODS（やり方の表）", () => {
  it("26 種のやり方を持つ（各側 13。#635 で各側 6 つ足した）", () => {
    expect(METHOD_IDS).toHaveLength(26);
    expect(Object.keys(METHODS).sort()).toEqual([...METHOD_IDS].sort());
  });

  it("side・札の並び・既定の公開の仕方が設計どおり", () => {
    expect(METHODS).toEqual({
      weather: { side: "checkin", cards: ["sunny", "cloudy", "rain", "thunder"], defaultVisibility: "named" },
      energy: { side: "checkin", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      focus: { side: "checkin", cards: ["20", "50", "80", "100"], defaultVisibility: "named" },
      "takeaway-goal": { side: "checkin", cards: ["decide", "learn", "discuss", "listen"], defaultVisibility: "named" },
      role: { side: "checkin", cards: ["listener", "questioner", "summarizer", "energizer"], defaultVisibility: "named" },
      expectation: { side: "checkin", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      "mood-start": { side: "checkin", cards: ["eager", "calm", "sleepy", "restless"], defaultVisibility: "named" },
      roti: { side: "checkout", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      "takeaway-done": { side: "checkout", cards: ["yes", "half", "no"], defaultVisibility: "named" },
      "best-part": { side: "checkout", cards: ["decided", "talked", "learned", "nothing"], defaultVisibility: "named" },
      mood: { side: "checkout", cards: ["clear", "foggy", "tired", "excited"], defaultVisibility: "named" },
      "next-meeting": { side: "checkout", cards: ["keep", "shorter", "fewer", "skip"], defaultVisibility: "anonymous" },
      "weather-end": { side: "checkout", cards: ["sunny", "cloudy", "rain", "thunder"], defaultVisibility: "named" },
      understanding: { side: "checkout", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      readiness: { side: "checkin", cards: ["ready", "mostly", "later", "not-yet"], defaultVisibility: "named" },
      busyness: { side: "checkin", cards: ["roomy", "normal", "packed", "overflow"], defaultVisibility: "anonymous" },
      "talk-wish": { side: "checkin", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      battery: { side: "checkin", cards: ["full", "half", "low", "empty"], defaultVisibility: "anonymous" },
      clarity: { side: "checkin", cards: ["both", "purpose", "unclear"], defaultVisibility: "anonymous" },
      worry: { side: "checkin", cards: ["none", "some", "big"], defaultVisibility: "anonymous" },
      agreement: { side: "checkout", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous" },
      "next-step": { side: "checkout", cards: ["clear", "mostly", "vague", "unknown"], defaultVisibility: "named" },
      voice: { side: "checkout", cards: ["plenty", "some", "none"], defaultVisibility: "anonymous" },
      pace: { side: "checkout", cards: ["fast", "right", "slow"], defaultVisibility: "anonymous" },
      fatigue: { side: "checkout", cards: ["fine", "bit", "very"], defaultVisibility: "anonymous" },
      message: { side: "checkout", cards: ["now", "later", "none"], defaultVisibility: "named" },
    });
  });

  it("既定が匿名のやり方（#635 の 12 のうち名前つきは readiness・next-step・message だけ）", () => {
    const anon = METHOD_IDS.filter((m) => METHODS[m].defaultVisibility === "anonymous");
    expect(anon).toEqual([
      "energy",
      "expectation",
      "roti",
      "next-meeting",
      "understanding",
      "busyness",
      "talk-wish",
      "battery",
      "clarity",
      "worry",
      "agreement",
      "voice",
      "pace",
      "fatigue",
    ]);
  });

  it("札の ID は 1〜16 字で、やり方の中で重複せず、枚数は 3〜5", () => {
    for (const m of METHOD_IDS) {
      const { cards } = METHODS[m];
      expect(cards.length).toBeGreaterThanOrEqual(3);
      expect(cards.length).toBeLessThanOrEqual(5);
      expect(new Set(cards).size).toBe(cards.length);
      for (const c of cards) {
        expect(c.length).toBeGreaterThanOrEqual(1);
        expect(c.length).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe("METHOD_GROUPS（小見出し・#635）", () => {
  it("各側の小見出しは 3 つで、その側のやり方を過不足なく 1 回ずつ含む（足し忘れたやり方は選択画面に出ない）", () => {
    for (const side of SIDES) {
      const groups = groupsOf(side);
      expect(groups, side).toHaveLength(3);
      const listed = groups.flatMap((g) => METHOD_GROUPS[g].methods);
      expect(new Set(listed).size, `${side} に重複が無い`).toBe(listed.length);
      expect([...listed].sort()).toEqual([...methodsOf(side)].sort());
    }
  });

  it("小見出しのやり方は、小見出しと同じ側に属する。小見出しは 2 つ以上のやり方を持つ（いまのやり方を除いても引ける）", () => {
    for (const g of GROUP_IDS) {
      const { side, methods } = METHOD_GROUPS[g];
      expect(methods.length, g).toBeGreaterThanOrEqual(2);
      for (const m of methods) expect(METHODS[m].side, `${g}/${m}`).toBe(side);
    }
  });

  it("小見出しの並び（選択画面の順）", () => {
    expect(groupsOf("checkin")).toEqual(["checkin-mood", "checkin-focus", "checkin-stance"]);
    expect(groupsOf("checkout")).toEqual(["checkout-value", "checkout-mood", "checkout-next"]);
    expect(METHOD_GROUPS["checkin-focus"].methods).toEqual(["focus", "readiness", "clarity"]);
  });
});

describe("methodsOf", () => {
  it("checkin は weather〜mood-start の 7 つと #635 の 6 つ（METHOD_IDS の並び）", () => {
    expect(methodsOf("checkin")).toEqual([
      "weather",
      "energy",
      "focus",
      "takeaway-goal",
      "role",
      "expectation",
      "mood-start",
      "readiness",
      "busyness",
      "talk-wish",
      "battery",
      "clarity",
      "worry",
    ]);
  });

  it("checkout は roti〜understanding の 7 つと #635 の 6 つ", () => {
    expect(methodsOf("checkout")).toEqual([
      "roti",
      "takeaway-done",
      "best-part",
      "mood",
      "next-meeting",
      "weather-end",
      "understanding",
      "agreement",
      "next-step",
      "voice",
      "pace",
      "fatigue",
      "message",
    ]);
  });
});
