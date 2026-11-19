/**
 * 会の始まりと終わりの札（#406）のやり方の表。
 *
 * **文言を持たない**。札の名前・説明は画面の `method-copy.ts` にあり、言い換えが core に波及しない。
 * 札の並びは設計 §3 の順（凡例・山の並びの正本）。
 */

export const SIDES = ["checkin", "checkout"] as const;
export type Side = (typeof SIDES)[number];

export const VISIBILITIES = ["named", "anonymous"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const METHOD_IDS = [
  "weather",
  "energy",
  "focus",
  "takeaway-goal",
  "role",
  "expectation",
  "mood-start",
  "roti",
  "takeaway-done",
  "best-part",
  "mood",
  "next-meeting",
  "weather-end",
  "understanding",
  // #635 で各側に 6 つ足した（末尾に足す。#465 と同じ）
  "readiness",
  "busyness",
  "talk-wish",
  "battery",
  "clarity",
  "worry",
  "agreement",
  "next-step",
  "voice",
  "pace",
  "fatigue",
  "message",
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

/**
 * #635 より前の画面が知っているやり方（`METHOD_IDS` の先頭 14）。
 * 古い画面は受けるフレームを `METHOD_IDS` の `picklist` で検めるので、知らないやり方の回のフレームを丸ごと捨てて止まる。
 * 古い画面が送る側のくじ（`checkin.method.draw`）は、ここからだけ引く（#635 の PR の敵対的検証 1）。
 * 古い画面が残らなくなったら、`checkin.method.draw` ごと外す。
 */
export const METHOD_IDS_BEFORE_635: readonly MethodId[] = METHOD_IDS.slice(0, 14);

/** 札の ID（1〜16 字）。やり方ごとの集合は `METHODS` が正本 */
export type CardId = string;

export interface MethodRule {
  readonly side: Side;
  readonly cards: readonly CardId[];
  readonly defaultVisibility: Visibility;
}

export const METHODS: Readonly<Record<MethodId, MethodRule>> = {
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
};

/**
 * 小見出し（#635）。各側のやり方を目的で 3 つに分ける。選択画面の並びと、小見出しから引くくじの候補の正本。
 * **文言を持たない**（小見出しの題は画面の `method-groups.ts`）。並びは選択画面の順。
 * 各側のやり方を過不足なく 1 回ずつ含むことは `tests/methods.test.ts` が守る。
 */
export const GROUP_IDS = [
  "checkin-mood",
  "checkin-focus",
  "checkin-stance",
  "checkout-value",
  "checkout-mood",
  "checkout-next",
] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export interface MethodGroup {
  readonly side: Side;
  readonly methods: readonly MethodId[];
}

export const METHOD_GROUPS: Readonly<Record<GroupId, MethodGroup>> = {
  "checkin-mood": { side: "checkin", methods: ["weather", "energy", "mood-start", "battery", "busyness", "worry"] },
  "checkin-focus": { side: "checkin", methods: ["focus", "readiness", "clarity"] },
  "checkin-stance": { side: "checkin", methods: ["takeaway-goal", "expectation", "role", "talk-wish"] },
  "checkout-value": { side: "checkout", methods: ["roti", "takeaway-done", "best-part", "understanding", "agreement"] },
  "checkout-mood": { side: "checkout", methods: ["mood", "weather-end", "fatigue"] },
  "checkout-next": { side: "checkout", methods: ["next-meeting", "pace", "voice", "next-step", "message"] },
};

/** 片側の小見出し（`GROUP_IDS` の並びのまま） */
export function groupsOf(side: Side): readonly GroupId[] {
  return GROUP_IDS.filter((g) => METHOD_GROUPS[g].side === side);
}

/** 片側のやり方（`METHOD_IDS` の並びのまま） */
export function methodsOf(side: Side): readonly MethodId[] {
  return METHOD_IDS.filter((m) => METHODS[m].side === side);
}
