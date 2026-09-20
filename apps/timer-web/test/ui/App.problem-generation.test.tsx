/**
 * お題の「生成中」がサーバー権威であることを、実物の snapshot 経路で確かめる（#283）。
 *
 * **観測点は画面である。** 純関数（`ui/problem-generation.ts`）の検査は判定そのものを
 * 固定するが、それが配線されていなければ利用者には何も起きない。ここでは FakeWS へ
 * snapshot を流し込み、お題カードの `aria-busy` と操作の可否で確かめる。
 *
 * ## ここで守っている穴（Issue #283 の 3 つ）
 *
 * 1. **同じお題が選ばれると降りない。** 内容差分（title / source）で降ろしていた頃は、
 *    `pickFallback` が同じ候補に当たると降りず、押した人だけが 65 秒固まった
 * 2. **再接続で欠けた snapshot。** 途中から来た端末は前の snapshot を持たないので、
 *    差分では「いま作り直している最中か」をそもそも問えない
 * 3. **AI から定型への縮退が黙って起きる**
 *
 * @requirements #283 EARS 1・EARS 2・EARS 3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect, ENTERED_ROOM_CODE } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import type { Problem, Room } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const SELF = "me-1";

/** 定型のお題 1 つ。**作り直しても同じものが返る状況**を作るために使い回す。 */
function fallbackProblem(): Problem {
  return {
    title: "FizzBuzz",
    description: "3 の倍数で Fizz",
    requirements: ["3 の倍数は Fizz"],
    exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
    hints: [],
    source: "fallback",
  };
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

function sendSnapshot(ws: FakeWS, overrides: Parameters<typeof aRoomView>[0]): Room {
  const room = aRoomView({
    code: ENTERED_ROOM_CODE,
    phase: "ready",
    participants: [
      {
        participantId: SELF,
        displayName: "Creator",
        presence: "online",
        hasAiKey: false,
        joinedAt: 0,
      },
    ],
    ...overrides,
  });
  sendServer(ws, { type: "snapshot", room });
  return room;
}

/** お題タブを開いた状態のロビーへ入る。 */
function enterLobby(): FakeWS {
  const ws = enterRoomAndConnect({ participantId: SELF });
  sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: SELF });
  return ws;
}

/**
 * お題カードの中の断り書き（#283・EARS 3）。
 *
 * **`role="status"` を画面全体から引かない** —— ロビーには通知など別の
 * ライブリージョンがあり、`getByRole("status")` は複数一致で落ちる。
 * 見たいのはお題カードの中なので、そこへ絞って引く。
 */
function fallbackNoticeInProblemCard(): HTMLElement | null {
  return within(screen.getByRole("group", { name: "お題" })).queryByRole("status");
}

/** お題カードの `aria-busy`（生成中の表示）。 */
function problemCardIsBusy(): boolean {
  return screen.getByRole("group", { name: "お題" }).getAttribute("aria-busy") === "true";
}

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("お題の生成中はサーバー権威（#283）", () => {
  // ─── EARS 1: 作り直している間、在室者全員にその旨を示す ────────────────────

  it("自分が押していなくても、サーバーが生成中と言えば生成中になる", () => {
    // Given: お題が確定しているロビー（**この端末は何も押していない**）
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: false },
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    expect(problemCardIsBusy()).toBe(false);

    // When: 別の誰かの操作でサーバーが作り直しを始めた
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: true, degraded: false },
    });

    // Then: 押していないこの端末でも生成中になる。
    // **旧実装では絶対に立たなかった** —— 生成中は押した人の操作の中でしか立たなかった。
    expect(problemCardIsBusy()).toBe(true);
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();
  });

  it("途中から繋いだ端末も、最初の snapshot で生成中と分かる", () => {
    // Given / When: 入って最初に受け取る snapshot が「生成中」を言っている
    //（**前の snapshot が無い**ので、内容差分ではこれを判定しようが無い）
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: true, degraded: false },
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    // Then
    expect(problemCardIsBusy()).toBe(true);
  });

  // ─── EARS 2: 同じお題が選ばれても表示を解除する ───────────────────────────

  it("作り直しの結果が 1 文字も変わらなくても、生成中は降りる", () => {
    // Given: 生成中
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: true, degraded: false },
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    expect(problemCardIsBusy()).toBe(true);

    // When: **同じお題**のまま確定の snapshot が届く
    //（`pickFallback` は候補から選ぶので、同じ候補に当たりうる。`hard` の TypeScript なら
    //  候補は数件しかない）
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: false },
    });

    // Then: 降りる。**内容差分で降ろしていた頃はここが降りず、65 秒固まっていた。**
    expect(problemCardIsBusy()).toBe(false);
    expect(screen.getByRole("button", { name: "別のお題にする" })).toBeEnabled();
  });

  it("「別のお題にする」を押しただけでは生成中にならない（立てるのはサーバー）", () => {
    // Given
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: false },
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    const sendSpy = vi.spyOn(ws, "send");

    // When
    fireEvent.click(screen.getByRole("button", { name: "別のお題にする" }));

    // Then: 依頼は送るが、表示はサーバーの返事を待つ。
    // **押した人の操作の中で立てると降ろせなくなる**（それが #283 の構造的な欠陥である）。
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"command":"problem.request"'));
    expect(problemCardIsBusy()).toBe(false);
  });

  it("帳簿を持たない snapshot（旧サーバー）では生成中を出さない", () => {
    // Given / When: 配布の窓（新しい画面 × 旧サーバー）。項目そのものが無い
    const ws = enterLobby();
    sendSnapshot(ws, { problem: fallbackProblem() });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    // Then: 操作は塞がない。**固まるより出ないほうが安全**である
    expect(problemCardIsBusy()).toBe(false);
    expect(screen.getByRole("button", { name: "別のお題にする" })).toBeEnabled();
  });

  it("セッション中（1 行バーを開いていない在室者）にも生成中が届く", () => {
    // Given: セッション画面（`Session.tsx` は ProblemEditor へ `compact` を渡し、
    // バーの初期状態は未展開）。**ここが抜けていると、セッション中は
    // 「押した人の画面にだけ出る」旧実装と同じ状態が残る**（レビュー指摘 5）。
    const ws = enterLobby();
    sendSnapshot(ws, {
      phase: "session",
      problem: fallbackProblem(),
      problemGeneration: { active: true, degraded: false },
    });

    // When / Then: バーを開かないまま生成中が分かる
    expect(problemCardIsBusy()).toBe(true);
  });

  // ─── EARS 3: AI から定型へ縮退したことを示す ──────────────────────────────

  it("AI から定型へ落ちたら、その旨が画面に出る", () => {
    // Given / When: 縮退して確定した
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: true },
      problemMode: "ai",
      aiUnlocked: true,
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    // Then
    expect(fallbackNoticeInProblemCard()).toHaveTextContent(/AI.*定型/);
  });

  it("縮退のあと利用者が手で書き換えたら、断り書きは消える", () => {
    // Given: 縮退で定型が載っている
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: true },
      problemMode: "ai",
      aiUnlocked: true,
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    expect(fallbackNoticeInProblemCard()).not.toBeNull();

    // When: 利用者が貼り付け／編集した（`problem.edit` が `edited: true` を立てる）
    sendSnapshot(ws, {
      problem: { ...fallbackProblem(), title: "自分で持ち込んだお題", edited: true },
      problemGeneration: { active: false, degraded: true },
      problemMode: "ai",
      aiUnlocked: true,
    });

    // Then: 自分で持ち込んだお題に「AI で作れなかったので定型にしました」は付かない。
    // **サーバーの印はまだ立っている**（降りるのは次の依頼のとき）ので、
    // 印だけを見ていると出続ける。
    expect(fallbackNoticeInProblemCard()).toBeNull();
  });

  it("縮退していなければ、その断り書きは出ない", () => {
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: false, degraded: false },
      problemMode: "ai",
      aiUnlocked: true,
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    expect(fallbackNoticeInProblemCard()).toBeNull();
  });

  it("生成中のあいだは、まだ縮退したとは言わない", () => {
    // 走っている最中に「定型になりました」と出すと、そのあと AI で作れた場合に嘘になる。
    const ws = enterLobby();
    sendSnapshot(ws, {
      problem: fallbackProblem(),
      problemGeneration: { active: true, degraded: true },
      problemMode: "ai",
      aiUnlocked: true,
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    expect(fallbackNoticeInProblemCard()).toBeNull();
  });
});
