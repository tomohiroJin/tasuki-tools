/**
 * 契約に合わない同期フレームを捨てたことが、**画面から分かる**ことを固定する（#209）。
 *
 * 純関数（`deriveConnectionStatus`）とフック（`useTimerSync`）と表示部品
 * （`StatusStrip`）の 3 つが個別に緑でも、**その間の配線が 1 本切れていれば
 * 利用者には何も見えない**。ここは App を通して実経路を通す。
 *
 * @requirements #209（#181 からの切り出し）
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

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

function aValidSnapshot(): Record<string, unknown> {
  return {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "ready",
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "Host")],
    }),
  };
}

/**
 * ADR 0005 の追記が挙げた実際の経路と同じ壊し方をする。
 * `rotationDisplayNames()` が在室しない ID に返す空文字が `config.members` に載ると、
 * `SessionConfigSchema.members`（最小長 1）に落ちる。
 */
function aFrameThatViolatesTheContract(): Record<string, unknown> {
  const room = aRoomView({
    code: "ROOM01",
    phase: "session",
    hostParticipantId: HOST_ID,
    participants: [participant(HOST_ID, "Host")],
  });
  return { type: "snapshot", room: { ...room, config: { ...room.config, members: [""] } } };
}

function enterLobby(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
  ws.readyState = FakeWS.OPEN;
  ws.onopen?.();
  sendServer(ws, {
    type: "room.created",
    code: "ROOM01",
    hostToken: "ht",
    resumeToken: "rt",
    participantId: HOST_ID,
  });
  sendServer(ws, aValidSnapshot());
  return ws;
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
  // 捨てたことは devtools にも残る（#181）。テスト出力を汚さないために黙らせる。
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("捨てた同期フレームを画面で伝える（#209）", () => {
  it("正常に同期できている間は同期不整合を出さない", () => {
    enterLobby();
    expect(screen.queryByText(/同期不整合/)).toBeNull();
  });

  it("契約に合わないフレームが届くと StatusStrip が同期不整合になる", () => {
    // Given
    const ws = enterLobby();
    // When
    sendServer(ws, aFrameThatViolatesTheContract());
    // Then
    expect(screen.getByText(/同期不整合/)).toBeInTheDocument();
  });

  it("接続は生きているので再接続中やセッション喪失にはしない", () => {
    // Given
    const ws = enterLobby();
    // When
    sendServer(ws, aFrameThatViolatesTheContract());
    // Then（原因の取り違えは、利用者を無関係な対処へ誘導する）
    expect(screen.queryByText(/再接続中/)).toBeNull();
    expect(screen.queryByText(/セッション喪失/)).toBeNull();
  });

  it("有効な snapshot が届けば同期不整合は消える", () => {
    // Given
    const ws = enterLobby();
    sendServer(ws, aFrameThatViolatesTheContract());
    expect(screen.getByText(/同期不整合/)).toBeInTheDocument();
    // When
    sendServer(ws, aValidSnapshot());
    // Then
    expect(screen.queryByText(/同期不整合/)).toBeNull();
  });

  it("time.pong が届いても同期不整合は消えない（点滅させない）", () => {
    // Given
    const ws = enterLobby();
    sendServer(ws, aFrameThatViolatesTheContract());
    // When（クライアントは 10 秒ごとに time.ping を送り、pong が返り続ける）
    sendServer(ws, { type: "time.pong", serverTime: 1_000 });
    // Then
    expect(screen.getByText(/同期不整合/)).toBeInTheDocument();
  });
});
