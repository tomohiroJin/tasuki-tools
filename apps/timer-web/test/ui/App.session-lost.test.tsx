/**
 * セッション喪失時の画面（#76 F-4）。
 *
 * 本番は揮発インメモリで、同期サーバーが再起動するとルームが全て消える。
 * これまでは StatusStrip が「セッション喪失」に変わるだけで、タイマーも
 * 一時停止・スキップ・完成! もそのまま押せる状態で残った。押しても何も起きず、
 * 説明バナーは再接続のたびに消え、やり直す導線も無かった。
 * poker は「ルームが見つかりません／トップへ戻る」に切り替わる。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
  listRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
}));

const HOST_ID = "host-1";

function participant(participantId: string, displayName: string) {
  return {
    participantId,
    connId: `c-${participantId}`,
    displayName,
    role: "host" as const,
    presence: "online" as const,
    hasAiKey: false,
    joinedAt: 0,
  };
}

function openLatestSocket(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
  ws.readyState = FakeWS.OPEN;
  ws.onopen?.();
  return ws;
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/** ルームを作ってセッション中まで進める。 */
function enterSession(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "アリス" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  const ws = openLatestSocket();
  sendServer(ws, {
    type: "room.created",
    code: "ROOM01",
    hostToken: "ht",
    resumeToken: "rt",
    participantId: HOST_ID,
  });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "session",
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "アリス")],
    }),
  });
  return ws;
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("セッション喪失（#76 F-4）", () => {
  it("喪失したら、効かなくなった操作を画面に残さない", () => {
    // Given: セッション中
    const ws = enterSession();
    expect(screen.getByRole("button", { name: /スキップ/ })).toBeInTheDocument();

    // When: サーバー再起動でルームが消えた
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    // Then: 押しても何も起きない操作を残さない
    expect(screen.queryByRole("button", { name: /スキップ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /完成/ })).not.toBeInTheDocument();
  });

  it("何が起きたかを画面に出し続ける", () => {
    // Given: セッション中
    const ws = enterSession();

    // When: ルームが消えた
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    // Then: 再接続のたびに消えるバナーではなく、画面として残る
    expect(screen.getByRole("heading", { name: /セッションが見つかりません/ })).toBeInTheDocument();
  });

  it("再接続が成功しても喪失の表示は消えない", () => {
    // Given: 喪失した
    const ws = enterSession();
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    // When: WS だけは再接続に成功する（ルームは戻らない）
    act(() => {
      ws.onopen?.();
    });

    // Then: 「繋がった」ことで喪失が無かったことにはならない
    expect(screen.getByRole("heading", { name: /セッションが見つかりません/ })).toBeInTheDocument();
  });

  it("やり直す導線がある", () => {
    // Given: 喪失した
    const ws = enterSession();
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    // When: 新しく始める
    fireEvent.click(screen.getByRole("button", { name: /新しいセッションを始める/ }));

    // Then: 入口へ戻る
    expect(screen.getByRole("button", { name: /ルームを作る/ })).toBeInTheDocument();
  });

  it("まだセッション中であるかのような表示を残さない", () => {
    // Given: セッション中
    const ws = enterSession();

    // When: ルームが消えた
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    // Then: 本文が「見つかりません」と言う横で、ステータスが「セッション中」と
    // 言い続けるのは矛盾している
    expect(screen.queryByText("セッション中")).not.toBeInTheDocument();
  });

  it("ローカルの記録が残っていることを伝える", () => {
    // 完成記録は端末に保存済みで、ルームが消えても失われない（FR-059）
    const ws = enterSession();
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "not found" });

    expect(screen.getByText(/記録は.*保持/)).toBeInTheDocument();
  });
});
