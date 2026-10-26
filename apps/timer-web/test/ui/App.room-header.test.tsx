/**
 * ルーム画面の共通の見出し（#447 段 2）。
 *
 * `App.tsx` が上の帯の直後に 1 つだけ置く。出す条件は帯と同じ（ルームの画面が決まっていて、ルームを失っていない）。
 * ロビーは通常の見た目、セッションと完了は詰めた見た目（`ui-room-header--compact`）。
 * 休憩中は覆いの外へフォーカスを入れさせないよう、見出しを包む要素を inert にする。
 * jsdom は CSS を評価しないので、ここで見るのは DOM とクラスと属性だけ。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import { saveResumeIdentity } from "@tasuki/sync-client";
import App from "../../src/App.js";
import type { RoomPhase } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
  loadRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
}));

const ME = "p-alice";

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/** 指定の phase の snapshot を描いた状態にする（`session` を渡すと休憩中などを作れる）。 */
function enter(phase: RoomPhase, session: Record<string, unknown> = {}): FakeWS {
  const ws = enterRoomAndConnect({ code: "ROOM01", participantId: ME, displayName: "アリス" });
  sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: ME });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase,
      session: {
        rotation: [ME],
        driverCounts: [0],
        seats: [{ id: ME, displayName: "アリス", isProxy: false, skipReason: null }],
        ...session,
      },
      participants: [{ participantId: ME, displayName: "アリス", presence: "online", joinedAt: 0 }],
    }),
  });
  return ws;
}

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function header(): HTMLElement {
  return screen.getByRole("heading", { name: "TDD Mob Pro Timer", level: 1 }).closest("header") as HTMLElement;
}

describe("timer の共通の見出し", () => {
  it("Given ロビー / When 描く / Then 見出しが 1 つ・戻るリンクは同じルームの選択画面・詰めた見た目ではない", () => {
    // Given / When
    enter("ready");

    // Then
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "選択画面へ戻る" })).toHaveAttribute("href", "/?room=ROOM01");
    expect(header()).toHaveClass("ui-room-header");
    expect(header()).not.toHaveClass("ui-room-header--compact");
  });

  it("Given ロビー / When 描く / Then 見出しは同期の参加用 URL とルームコードを見せる（配線）", () => {
    // Given / When
    enter("ready");

    // Then: 値は同期フックが組み立てた URL（?room=ROOM01 を含む）。空に壊すと赤になる
    const h = header();
    const url = h.querySelector(".ui-invite-url")?.textContent ?? "";
    expect(url).toMatch(/^https?:\/\/.+[?&]room=ROOM01$/);
    expect(h.querySelector(".ui-room-header-code-value")?.textContent).toBe("ROOM01");
  });

  it("Given セッション中 / When 描く / Then 詰めた見た目の見出しが 1 つ", () => {
    // Given / When
    enter("session");

    // Then
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(header()).toHaveClass("ui-room-header--compact");
    expect(screen.getByRole("button", { name: "仲間を招く" })).toHaveAttribute("aria-expanded", "false");
  });

  it("Given 完了 / When 描く / Then 詰めた見た目で、戻るリンクがある", () => {
    // Given / When
    enter("celebration");

    // Then
    expect(header()).toHaveClass("ui-room-header--compact");
    expect(screen.getByRole("link", { name: "選択画面へ戻る" })).toHaveAttribute("href", "/?room=ROOM01");
  });

  it("Given 帯の中 / When ロビーを描く / Then 戻るリンクは帯でなく見出しの 1 つだけ", () => {
    // Given / When
    enter("ready");

    // Then
    expect(screen.getAllByRole("link", { name: "選択画面へ戻る" })).toHaveLength(1);
    const strip = screen.getByRole("status", { name: "ステータス情報" });
    expect(strip.querySelector("a")).toBeNull();
  });

  it("Given まだ snapshot が無い / When 描く / Then 見出しを描かない", () => {
    // Given / When
    enterRoomAndConnect({ participantId: ME });

    // Then
    expect(screen.queryByRole("heading", { name: "TDD Mob Pro Timer" })).toBeNull();
  });

  it("Given ロビーで招待の欄を開いた / When セッションが始まる / Then 詰めた見た目の招待の欄はたたまれている", () => {
    // Given: 狭いロビーで「仲間を招く」を開いた
    const ws = enter("ready");
    act(() => {
      screen.getByRole("button", { name: "仲間を招く" }).click();
    });
    expect(screen.getByRole("button", { name: "仲間を招く" })).toHaveAttribute("aria-expanded", "true");

    // When: セッションが始まる
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "session",
        session: {
          rotation: [ME],
          driverCounts: [0],
          seats: [{ id: ME, displayName: "アリス", isProxy: false, skipReason: null }],
        },
        participants: [{ participantId: ME, displayName: "アリス", presence: "online", joinedAt: 0 }],
      }),
    });

    // Then: 開いたままだと計器が押し下げられる
    expect(header()).toHaveClass("ui-room-header--compact");
    expect(screen.getByRole("button", { name: "仲間を招く" })).toHaveAttribute("aria-expanded", "false");
  });

  it("Given 日本語を含むルームコード / When ロビーを描く / Then 戻るリンクの行き先は符号化されている", () => {
    // Given / When
    const ws = enterRoomAndConnect({ code: "朝会モブ-a1b2", participantId: ME, displayName: "アリス" });
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: ME });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "朝会モブ-a1b2",
        phase: "ready",
        session: {
          rotation: [ME],
          driverCounts: [0],
          seats: [{ id: ME, displayName: "アリス", isProxy: false, skipReason: null }],
        },
        participants: [{ participantId: ME, displayName: "アリス", presence: "online", joinedAt: 0 }],
      }),
    });

    // Then
    expect(screen.getByRole("link", { name: "選択画面へ戻る" })).toHaveAttribute(
      "href",
      `/?room=${encodeURIComponent("朝会モブ-a1b2")}`,
    );
  });

  it("Given ルームを失った / When 描く / Then 見出しを描かない", () => {
    // Given
    const ws = enter("session");

    // When
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "x" });

    // Then
    expect(screen.queryByRole("heading", { name: "TDD Mob Pro Timer" })).toBeNull();
  });

  it("Given 履歴を開いた / When 描く / Then 見出しを描かない（帯も描かれない）", () => {
    // Given: 復帰の組があっても、?view=history は履歴を最優先で出す
    saveResumeIdentity({ code: "ROOM01", participantId: ME, resumeToken: "rt", displayName: "アリス" });
    window.history.replaceState(null, "", "/?view=history&room=ROOM01");

    // When
    render(<App />);

    // Then
    expect(screen.queryByRole("heading", { name: "TDD Mob Pro Timer" })).toBeNull();
    expect(screen.queryByRole("status", { name: "ステータス情報" })).toBeNull();
  });

  it("Given 休憩でないセッション / When 描く / Then 見出しを包む要素は inert でない", () => {
    // Given / When
    enter("session");

    // Then
    expect(header().parentElement).not.toHaveAttribute("inert");
  });

  it("Given 休憩中のセッション / When 描く / Then 見出しを包む要素が inert", () => {
    // Given / When
    enter("session", { break: { since: 1000, suggestedAtSwitches: 0, suggestedAtElapsedMs: null } });

    // Then
    expect(header().parentElement).toHaveAttribute("inert");
  });
});
