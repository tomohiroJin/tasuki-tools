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
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

/** 札の ID（1〜16 字）。やり方ごとの集合は `METHODS` が正本 */
export type CardId = string;

export interface MethodRule {
  readonly side: Side;
  readonly cards: readonly CardId[];
  readonly defaultVisibility: Visibility;
  /** 札の顔が絵でなく数字のやり方（元気メーターなど）。開いた後の要約の言い方もこれで分かれる */
  readonly numeric: boolean;
}

export const METHODS: Readonly<Record<MethodId, MethodRule>> = {
  weather: { side: "checkin", cards: ["sunny", "cloudy", "rain", "thunder"], defaultVisibility: "named", numeric: false },
  energy: { side: "checkin", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous", numeric: true },
  focus: { side: "checkin", cards: ["20", "50", "80", "100"], defaultVisibility: "named", numeric: true },
  "takeaway-goal": { side: "checkin", cards: ["decide", "learn", "discuss", "listen"], defaultVisibility: "named", numeric: false },
  role: { side: "checkin", cards: ["listener", "questioner", "summarizer", "energizer"], defaultVisibility: "named", numeric: false },
  expectation: { side: "checkin", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous", numeric: true },
  "mood-start": { side: "checkin", cards: ["eager", "calm", "sleepy", "restless"], defaultVisibility: "named", numeric: false },
  roti: { side: "checkout", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous", numeric: true },
  "takeaway-done": { side: "checkout", cards: ["yes", "half", "no"], defaultVisibility: "named", numeric: false },
  "best-part": { side: "checkout", cards: ["decided", "talked", "learned", "nothing"], defaultVisibility: "named", numeric: false },
  mood: { side: "checkout", cards: ["clear", "foggy", "tired", "excited"], defaultVisibility: "named", numeric: false },
  "next-meeting": { side: "checkout", cards: ["keep", "shorter", "fewer", "skip"], defaultVisibility: "anonymous", numeric: false },
  "weather-end": { side: "checkout", cards: ["sunny", "cloudy", "rain", "thunder"], defaultVisibility: "named", numeric: false },
  understanding: { side: "checkout", cards: ["1", "2", "3", "4", "5"], defaultVisibility: "anonymous", numeric: true },
};

/** 片側のやり方（`METHOD_IDS` の並びのまま） */
export function methodsOf(side: Side): readonly MethodId[] {
  return METHOD_IDS.filter((m) => METHODS[m].side === side);
}
