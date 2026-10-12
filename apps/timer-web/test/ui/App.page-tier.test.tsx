/**
 * 器の段（`Stage` の `page`・`App.tsx` の `pageOf`）を画面の段階で見る（#352・設計 D1）。
 *
 * まとめはロビー・セッションと同じ部屋の段階なので、完了しても器の段を変えない（変えると上の帯ごと幅が跳ねる）。
 * **直値（`ui-page--wide`）と比べず、完了の前後の `className` を比べる。** 段の名前が変わっても「跳ねない」ことだけを見る。
 * 読み込み中は読む画面の段（`--prose`）のまま —— 「全部 wide にすれば跳ねない」という直し方を止める。
 *
 * @requirements #352 設計 D1・m130・m131
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, cleanup } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRecord, aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const ME = "p-alice";

function participant(participantId: string, displayName: string) {
  return { participantId, displayName, presence: "online" as const, joinedAt: 0 };
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/** 器（`Stage` の内側の div）の className。 */
function pageClass(): string {
  const el = document.querySelector(".stage-inner");
  if (el === null) throw new Error("器（.stage-inner）が描かれていない");
  return el.className;
}

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("器の段は画面の段階で決まる", () => {
  it("Given ルームのセッション / When 完了の snapshot が届く / Then 器の段は変わらない（帯ごと幅が跳ねない）", () => {
    // Given: セッション中
    const ws = enterRoomAndConnect({ participantId: ME, displayName: "Creator" });
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: ME });
    const room = (phase: "session" | "celebration", sessionRecords: ReturnType<typeof aRecord>[]) =>
      aRoomView({ code: "ROOM01", phase, participants: [participant(ME, "Creator")], sessionRecords });
    sendServer(ws, { type: "snapshot", room: room("session", []) });
    expect(screen.getByRole("main", { name: "セッション" })).toBeInTheDocument();
    const during = pageClass();

    // When: 完成の記録を 1 件足した完了の snapshot
    sendServer(ws, { type: "snapshot", room: room("celebration", [aRecord({ id: "srv-1" })]) });

    // Then: まとめが出て、器の className はセッションのときと同じ
    expect(screen.getByRole("heading", { name: "セッション完了" })).toBeInTheDocument();
    expect(pageClass()).toBe(during);
  });

  it("Given ルームへ入る途中 / When snapshot がまだ届かない / Then 器は読む画面の段（--prose）のまま", () => {
    // Given / When: 接続したが snapshot は届いていない（読み込み中）
    enterRoomAndConnect({ participantId: ME, displayName: "Creator" });

    // Then
    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
    expect(pageClass()).toContain("ui-page--prose");
  });
});
