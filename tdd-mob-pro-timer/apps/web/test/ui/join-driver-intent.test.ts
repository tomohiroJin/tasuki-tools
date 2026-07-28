import { describe, it, expect } from "vitest";
import { shouldAutoJoinRotation } from "../../src/ui/join-driver-intent.js";

describe("shouldAutoJoinRotation", () => {
  it("driver 宣言があり、自分がまだ rotation 外なら true", () => {
    expect(shouldAutoJoinRotation({ participantId: "pid-bob", rotation: ["pid-alice"] })).toBe(true);
  });
  it("既に rotation 内なら false（二重 add しない）", () => {
    expect(shouldAutoJoinRotation({ participantId: "pid-bob", rotation: ["pid-alice", "pid-bob"] })).toBe(false);
  });
  it("participantId が未確定なら false", () => {
    expect(shouldAutoJoinRotation({ participantId: null, rotation: ["pid-alice"] })).toBe(false);
  });
  it("同名の別人が輪に居ても、自分の ID が無ければ true（表示名では判定しない）", () => {
    // 同名参加者の取り違えを防ぐ回帰テスト（D6b）。
    expect(shouldAutoJoinRotation({ participantId: "pid-bob-2", rotation: ["pid-bob-1"] })).toBe(true);
  });
});
