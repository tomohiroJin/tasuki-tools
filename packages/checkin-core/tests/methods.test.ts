import { describe, expect, it } from "vitest";
import { METHOD_IDS, METHODS, methodsOf } from "../src/methods.js";

describe("METHODS（やり方の表）", () => {
  it("14 種のやり方を持つ（各側 7 つ）", () => {
    expect(METHOD_IDS).toHaveLength(14);
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
    });
  });

  it("既定が匿名なのは energy・expectation・roti・next-meeting・understanding だけ", () => {
    const anon = METHOD_IDS.filter((m) => METHODS[m].defaultVisibility === "anonymous");
    expect(anon).toEqual(["energy", "expectation", "roti", "next-meeting", "understanding"]);
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

describe("methodsOf", () => {
  it("checkin は weather〜mood-start の 7 つ（METHOD_IDS の並び）", () => {
    expect(methodsOf("checkin")).toEqual([
      "weather",
      "energy",
      "focus",
      "takeaway-goal",
      "role",
      "expectation",
      "mood-start",
    ]);
  });

  it("checkout は roti〜understanding の 7 つ", () => {
    expect(methodsOf("checkout")).toEqual([
      "roti",
      "takeaway-done",
      "best-part",
      "mood",
      "next-meeting",
      "weather-end",
      "understanding",
    ]);
  });
});
