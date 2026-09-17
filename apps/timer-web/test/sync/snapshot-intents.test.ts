/**
 * decideSnapshotIntents の意図と順序を固定する（#167 E4）。
 *
 * App.tsx の handleRoom（88 行・分岐 7 個）から判断だけを抜き出した純粋関数。
 * 副作用（復帰の組の保存・WS 送信・IndexedDB）は同期フックが意図を見て起こす。
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

/**
 * 自分の参加者 ID（復帰の組に入る値）。
 *
 * **`aRoomView()` の既定のルームは輪の先頭がこの人である。** #271 で
 * お題の依頼はサーバーへ移り、#272 で参加時ドライバー宣言も畳んだので、
 * **輪の位置はこの純粋関数の判断に一切効かない**。
 */
const SELF = "creator-p";

function baseCtx(overrides: Partial<SnapshotContext> = {}): SnapshotContext {
  return {
    pendingResume: null,
    resumeDisplayName: "",
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
      resumeDisplayName: "Creator",
    });
    // When / Then（decideSnapshotIntents の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(decideSnapshotIntents(null, room, ctx)).toContainEqual({
      kind: "save-resume",
      identity: { code: "ROOM01", participantId: SELF, resumeToken: "rt", displayName: "Creator" },
    });
  });

  it("保留が無ければ保存しない（毎 snapshot で書き込まない）", () => {
    const room = aRoomView({ code: "ROOM01" });
    expect(kinds(room, baseCtx())).not.toContain("save-resume");
  });
});

describe("decideSnapshotIntents: 輪への自動加入は無い（#272）", () => {
  /**
   * **`not.toContain("join-rotation")` では見張れない** —— その意図は型から消えたので、
   * その検査は永久に成立する（恒真）。意図の並びを丸ごと突き合わせる（#271 で同じ罠を
   * 踏んだお題の意図と同じ書き方）。
   */
  it("自分が輪に居なくても、クライアントは member.add を起こさない", () => {
    // Given: 輪に自分が居ないロビー（#272 より前なら driver 宣言で加入していた場面）
    const room = aRoomView({ session: { rotation: ["other"], currentIndex: 0 } });
    // When / Then: 立つのは画面追従だけ
    expect(kinds(room, baseCtx())).toEqual(["set-screen"]);
  });
});

describe("decideSnapshotIntents: 完了状態の後片付け", () => {
  it("完了から抜けたら前のセッションの完了状態を畳む", () => {
    // Given: 完成フェーズから、誰かがロビーへ戻した
    const prev = aRoomView({ code: "ROOM01", phase: "celebration", problem });
    const next = aRoomView({ code: "ROOM01", phase: "setup", problem });

    // When / Then（kinds の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(kinds(next, baseCtx(), prev)).toContain("clear-completion");
  });

  it("完了に留まっている間は畳まない（同じ完成の snapshot が続いても二重保存しない）", () => {
    // Given: 完成フェーズのまま、在席の変化などで snapshot がもう一度届く
    const prev = aRoomView({ code: "ROOM01", phase: "celebration", problem });
    const next = aRoomView({ code: "ROOM01", phase: "celebration", problem });

    // When / Then
    expect(kinds(next, baseCtx(), prev)).not.toContain("clear-completion");
  });

  it("完了を経ていない遷移では畳まない（ロビー→セッション）", () => {
    // Given: 一度も完成していないルームの通常の開始
    const prev = aRoomView({ code: "ROOM01", phase: "ready", problem });
    const next = aRoomView({ code: "ROOM01", phase: "session", problem });

    // When / Then
    expect(kinds(next, baseCtx(), prev)).not.toContain("clear-completion");
  });

  it("畳むのは画面遷移より先（set-screen より前に積まれる）", () => {
    // Given: 完成からロビーへ
    const prev = aRoomView({ code: "ROOM01", phase: "celebration", problem });
    const next = aRoomView({ code: "ROOM01", phase: "setup", problem });

    // When
    const order = kinds(next, baseCtx(), prev);

    // Then: 画面が切り替わる前に完了状態が降りている
    expect(order.indexOf("clear-completion")).toBeLessThan(order.indexOf("set-screen"));
  });
});

describe("decideSnapshotIntents: お題", () => {
  it("ロビーでお題が無くても、クライアントは依頼を送らない（サーバーが用意する・#271）", () => {
    // Given: ロビーでお題が未確定。**自分は輪の先頭である**（旧実装ならここで依頼していた）
    const room = aRoomView({ code: "ROOM01", phase: "ready", problem: null });

    // When / Then: 立つのは画面追従だけ。
    // **`not.toContain("request-problem")` では見張れない** —— その意図は型から
    // 消えたので、その検査は永久に成立する（恒真）。意図の並びを丸ごと突き合わせる。
    expect(kinds(room, baseCtx())).toEqual(["set-screen"]);
  });

  it("輪の先頭でなくても、クライアントは依頼を送らない（#271）", () => {
    // Given: 輪の先頭は自分ではない
    const room = aRoomView({
      code: "ROOM01",
      phase: "ready",
      problem: null,
      session: { rotation: ["someone-else", SELF], currentIndex: 0, driverCounts: [0, 0] },
    });

    // When / Then: 立つのは画面追従だけ（恒真にならないよう並びごと見る）
    expect(kinds(room, baseCtx())).toEqual(["set-screen"]);
  });

  it("難易度が変わっても、クライアントは生成中の表示を立てない（#271 レビュー）", () => {
    // Given: 難易度が変わった
    const prev = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });

    // When / Then: 作り直すのはサーバーで、待ちの表示も立てない。
    // **立てると降ろせなくなる** —— サーバーは設定変更とお題確定の snapshot を
    // 同じ tick で送るので、2 本目を処理する時点でも「生成中ではない」ままになり、
    // 内容差分で降ろす clear-generating が成立しない（実測で 65 秒固まった）。
    expect(kinds(next, baseCtx(), prev)).toEqual(["set-screen"]);
  });

  it("別のルームの snapshot なら設定変更とみなさない", () => {
    // Given
    const prev = aRoomView({ code: "OTHER", phase: "ready", problem, config: { difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { difficulty: "hard" } });
    // When / Then（kinds の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(kinds(next, baseCtx(), prev)).toEqual(["set-screen"]);
  });

  it("お題を使わないルームでは、設定が変わっても生成中の表示を出さない（#271）", () => {
    // Given: お題なしのルームで難易度だけが変わった
    const cfg = { problemEnabled: false };
    const prev = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { ...cfg, difficulty: "easy" } });
    const next = aRoomView({ code: "ROOM01", phase: "ready", problem, config: { ...cfg, difficulty: "hard" } });

    // When / Then
    expect(kinds(next, baseCtx(), prev)).toEqual(["set-screen"]);
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
      resumeDisplayName: "Creator",
      generatingProblem: true,
    });
    // When / Then（decideSnapshotIntents の戻り値をそのまま検証するため操作と検証が同じ式になる）
    expect(decideSnapshotIntents(prev, next, ctx).map((i) => i.kind)).toEqual([
      "save-resume",
      "clear-generating",
      "set-screen",
      "persist-completion",
    ]);
    // 注: お題系の意図はもう無い（依頼も待ちの表示もサーバー側・#271）。
    //     参加時ドライバー宣言の 2 種も無い（旧入口の撤去で立てる者が消えた・#272）。
  });

});
