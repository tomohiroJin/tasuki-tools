/**
 * decideSnapshotIntents の意図と順序を固定する（#167 E4）。
 *
 * App.tsx の handleRoom（88 行・分岐 7 個）から判断だけを抜き出した純粋関数。
 * 副作用（sessionStorage・WS 送信・IndexedDB）は同期フックが意図を見て起こす。
 *
 * **順序が振る舞いである。** 同じ snapshot に対する送信の並びが変わると、
 * サーバー側の処理順も変わりうる。配列の順をそのまま固定する。
 *
 * @requirements #167（#72 E4）EARS 1・EARS 3
 */
import { describe, it, expect } from "vitest";
import { decideSnapshotIntents, type SnapshotContext } from "../../src/sync/snapshot-intents.js";
import { aRoomView } from "../support/room-view.js";
import type { Room } from "@tasuki/timer-core";

const SELF = "host-p";

function baseCtx(overrides: Partial<SnapshotContext> = {}): SnapshotContext {
  return {
    participantId: SELF,
    pendingResume: null,
    resumeDisplayName: "",
    pendingDriverJoin: false,
    isCreator: false,
    problemRequested: false,
    recordSaved: false,
    generatingProblem: false,
    endType: "complete",
    now: 1_000,
    ...overrides,
  };
}

const problem = {
  title: "お題",
  description: "説明",
  requirements: [],
  exampleTest: "",
  hints: [],
  source: "fallback" as const,
};

function kinds(room: Room, ctx: SnapshotContext, prev: Room | null = null): string[] {
  return decideSnapshotIntents(prev, room, ctx).map((i) => i.kind);
}

describe("decideSnapshotIntents: 画面遷移（EARS 1）", () => {
  it.each([
    ["setup", "lobby"],
    ["ready", "lobby"],
    ["session", "session"],
    ["celebration", "celebration"],
  ])("phase=%s なら screen=%s へ遷移する", (phase, screen) => {
    // Given
    const room = aRoomView({ phase: phase as Room["phase"] });
    // When
    const intents = decideSnapshotIntents(null, room, baseCtx());
    // Then
    expect(intents).toContainEqual({ kind: "set-screen", screen });
  });

  it("どの snapshot でも set-screen は必ず 1 度出る", () => {
    // Given
    const room = aRoomView({ phase: "ready" });
    // When
    const setScreens = decideSnapshotIntents(null, room, baseCtx()).filter(
      (i) => i.kind === "set-screen",
    );
    // Then
    expect(setScreens).toHaveLength(1);
  });
});

describe("decideSnapshotIntents: 復帰情報の保存", () => {
  it("保留中の resumeToken があれば、今来た snapshot の code と組んで保存する", () => {
    // Given
    const room = aRoomView({ code: "ROOM01" });
    const ctx = baseCtx({
      pendingResume: { participantId: SELF, resumeToken: "rt" },
      resumeDisplayName: "Host",
    });
    // When / Then（decideSnapshotIntents の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(decideSnapshotIntents(null, room, ctx)).toContainEqual({
      kind: "save-resume",
      identity: { code: "ROOM01", participantId: SELF, resumeToken: "rt", displayName: "Host" },
    });
  });

  it("保留が無ければ保存しない（毎 snapshot で書き込まない）", () => {
    const room = aRoomView({ code: "ROOM01" });
    expect(kinds(room, baseCtx())).not.toContain("save-resume");
  });
});

describe("decideSnapshotIntents: 参加時ドライバー宣言", () => {
  it("自分が参加者に現れたら宣言を降ろし、輪に居なければ加入する", () => {
    // Given
    const room = aRoomView({ session: { rotation: ["other"], currentIndex: 0 } });
    // When
    const intents = decideSnapshotIntents(null, room, baseCtx({ pendingDriverJoin: true }));
    // Then
    expect(intents.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["consume-driver-join", "join-rotation"]),
    );
  });

  it("既に輪に居るなら宣言だけ降ろして加入は送らない", () => {
    // Given
    const room = aRoomView({ session: { rotation: [SELF], currentIndex: 0 } });
    // When
    const k = kinds(room, baseCtx({ pendingDriverJoin: true }));
    // Then
    expect(k).toContain("consume-driver-join");
    expect(k).not.toContain("join-rotation");
  });

  it("自分がまだ参加者に現れていないなら宣言を降ろさない", () => {
    const room = aRoomView({ participants: [] });
    expect(kinds(room, baseCtx({ pendingDriverJoin: true }))).not.toContain("consume-driver-join");
  });
});

describe("decideSnapshotIntents: お題", () => {
  it("作成者はロビーでお題が無ければ一度だけ依頼する", () => {
    // Given
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: null });
    // When
    const intents = decideSnapshotIntents(null, room, baseCtx({ isCreator: true }));
    // Then
    expect(intents).toContainEqual({ kind: "request-problem", requestId: "req-ROOM01-lobby" });
  });

  it("既に依頼済みなら送らない", () => {
    // Given
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: null });
    const ctx = baseCtx({ isCreator: true, problemRequested: true });
    // When / Then（kinds の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(kinds(room, ctx)).not.toContain("request-problem");
  });

  it("難易度が変わったら作成者が作り直しを依頼する（requestId に now が入る）", () => {
    // Given
    const prev = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });
    // When
    const intents = decideSnapshotIntents(prev, next, baseCtx({ isCreator: true, now: 42 }));
    // Then
    expect(intents).toContainEqual({ kind: "regenerate-problem", requestId: "req-ROOM01-cfg-42" });
  });

  it("別のルームの snapshot なら設定変更とみなさない", () => {
    // Given
    const prev = aRoomView({ code: "OTHER", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });
    // When / Then（kinds の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(kinds(next, baseCtx({ isCreator: true }), prev)).not.toContain("regenerate-problem");
  });

  it("生成中にお題の内容が変わったら生成中を解除する", () => {
    // Given
    const prev = aRoomView({ problem: null });
    const next = aRoomView({ problem });
    // When / Then（kinds の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(kinds(next, baseCtx({ generatingProblem: true }), prev)).toContain("clear-generating");
  });
});

describe("decideSnapshotIntents: 完成記録", () => {
  it("完成フェーズなら記録を作る", () => {
    // Given
    const room = aRoomView({ code: "ROOM01", phase: "celebration", problem });
    // When
    const intents = decideSnapshotIntents(null, room, baseCtx());
    const persist = intents.find((i) => i.kind === "persist-completion");
    // Then
    expect(persist).toBeDefined();
  });

  it("中断なら記録を作らない", () => {
    const room = aRoomView({ phase: "celebration", problem });
    expect(kinds(room, baseCtx({ endType: "abort" }))).not.toContain("persist-completion");
  });

  it("保存済みなら二度作らない", () => {
    const room = aRoomView({ phase: "celebration", problem });
    expect(kinds(room, baseCtx({ recordSaved: true }))).not.toContain("persist-completion");
  });

  it("お題が無ければ作らない", () => {
    const room = aRoomView({ phase: "celebration", problem: null });
    expect(kinds(room, baseCtx())).not.toContain("persist-completion");
  });
});

describe("decideSnapshotIntents: 順序（振る舞いそのもの）", () => {
  it("すべての意図が同時に立つとき、現行 handleRoom と同じ順で並ぶ", () => {
    // Given
    const prev = aRoomView({
      code: "ROOM01",
      phase: "ready",
      problem,
      config: { difficulty: "easy" },
    });
    const next = aRoomView({
      code: "ROOM01",
      phase: "celebration",
      problem: { ...problem, title: "新しいお題" },
      config: { difficulty: "hard" },
      session: { rotation: ["other"], currentIndex: 0 },
    });
    const ctx = baseCtx({
      pendingResume: { participantId: SELF, resumeToken: "rt" },
      resumeDisplayName: "Host",
      pendingDriverJoin: true,
      isCreator: true,
      generatingProblem: true,
    });
    // When / Then（decideSnapshotIntents の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(decideSnapshotIntents(prev, next, ctx).map((i) => i.kind)).toEqual([
      "save-resume",
      "consume-driver-join",
      "join-rotation",
      "clear-generating",
      "set-screen",
      "persist-completion",
    ]);
    // 注: celebration では request-problem / regenerate-problem は立たない
    // （どちらも phase が setup/ready のときだけ）。
  });

  it("phase=ready でお題が無い作成者の snapshot では、set-screen が request-problem より前に来る", () => {
    // 上のケースは celebration シナリオのため、set-screen とお題系 2 意図
    // （request-problem・regenerate-problem）の相対順を誰も見ていなかった。
    // set-screen（4番目）は request-problem（5番目）より先に配列へ積まれるはず。
    // Given
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: null });
    // When
    const intents = decideSnapshotIntents(null, room, baseCtx({ isCreator: true }));
    // Then
    expect(intents.map((i) => i.kind)).toEqual(["set-screen", "request-problem"]);
  });
});
