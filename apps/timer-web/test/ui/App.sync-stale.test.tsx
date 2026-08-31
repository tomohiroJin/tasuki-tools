/**
 * 契約に合わない同期フレームを捨てたことが、**画面から分かる**ことを固定する（#209）。
 *
 * 純関数（`deriveConnectionStatus`）とフック（`useTimerSync`）と表示部品
 * （`StatusStrip`）の 3 つが個別に緑でも、**その間の配線が 1 本切れていれば
 * 利用者には何も見えない**。ここは App を通して実経路を通す。
 *
 * @requirements #209
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

describe("捨てた同期フレームを画面で伝える", () => {
  /** StatusStrip が出している接続状態の文言。 */
  const connectionText = () => screen.getByLabelText("接続状態").textContent ?? "";

  it("正常に同期できている間は接続中とだけ出す", () => {
    // Given（正常な room.created と snapshot が届く）
    // When: 入室が成立する
    enterLobby();
    // Then
    expect(connectionText()).toContain("Connected");
    expect(connectionText()).not.toContain("Out of Sync");
  });

  it("契約に合わないフレームが届くと同期できていないことを出す", () => {
    // Given
    const ws = enterLobby();
    // When
    sendServer(ws, aFrameThatViolatesTheContract());
    // Then
    expect(connectionText()).toContain("同期できていません");
  });

  /**
   * **原因の取り違えは、利用者を無関係な対処へ誘導する。** 接続は生きているので
   * 「再接続中」や「セッション喪失」に化けてはいけない。接続表示は 1 つしか出ないため、
   * 他の状態の文言が消えていることまで見て初めて「置き換わった」と言える。
   */
  it("接続は生きているので再接続中やセッション喪失にはしない", () => {
    // Given
    const ws = enterLobby();
    // When
    sendServer(ws, aFrameThatViolatesTheContract());
    // Then
    expect(connectionText()).not.toContain("Reconnecting");
    expect(connectionText()).not.toContain("Session Lost");
    expect(connectionText()).not.toContain("Connected");
  });

  it("有効な snapshot が届けば接続中の表示に戻る", () => {
    // Given
    const ws = enterLobby();
    sendServer(ws, aFrameThatViolatesTheContract());
    expect(connectionText()).toContain("同期できていません");
    // When
    sendServer(ws, aValidSnapshot());
    // Then
    expect(connectionText()).toContain("Connected");
  });

  it("time.pong が届いても同期できていない表示は消えない", () => {
    // Given
    const ws = enterLobby();
    sendServer(ws, aFrameThatViolatesTheContract());
    // When（クライアントは 10 秒ごとに time.ping を送り、pong が返り続ける）
    sendServer(ws, { type: "time.pong", serverTime: 1_000 });
    // Then
    expect(connectionText()).toContain("同期できていません");
  });

  /**
   * **これが #209 の本命の場面である。** 壊れた値がサーバー側のルームに残っていると、
   * 入ろうとした人は最初の `snapshot` から捨てることになる。`mode` を動かすのは
   * 有効な `snapshot` だけなので **StatusStrip はまだ描画されておらず**、
   * 補わないと利用者には「ボタンが効かない」としか見えない。
   */
  it("ルームに入る前に捨てたときは、表示する場所が無いのでバナーで伝える", () => {
    // Given: 名前を入れてルームを作る操作までは成立している
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

    // Given の確認: StatusStrip はまだ出ていない（出す場所が無い）
    expect(screen.queryByLabelText("接続状態")).toBeNull();

    // When: 最初の snapshot が契約に合わず捨てられる
    sendServer(ws, aFrameThatViolatesTheContract());

    // Then: 何が起きているかが画面から分かる
    expect(screen.getByText(/同期できていません/)).toBeInTheDocument();
  });

  it("ルームに入れたらそのバナーは消える", () => {
    // Given
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
    sendServer(ws, aFrameThatViolatesTheContract());
    expect(screen.getByText(/同期できていません/)).toBeInTheDocument();

    // When
    sendServer(ws, aValidSnapshot());

    // Then（StatusStrip が出る場所へ移ったので、バナーは役目を終える）
    expect(screen.getByLabelText("接続状態")).toBeInTheDocument();
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });
});
