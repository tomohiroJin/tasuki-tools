/**
 * 切断バナーと一時エラーバナーの「自動消去するかどうか」を、App を通して固定する
 * characterization test（#167 E4 のレビュー指摘の安全網・EARS 2 の補強）。
 *
 * `App.connection.test.tsx` は偽タイマーを使っておらず、`onclose` 直後に同期的な
 * アサーションしか行わないため、`useBanner` の `autoDismiss` 分岐を壊しても
 * （常に自動消去する／常に自動消去しない、どちらの向きの変異でも）検出できない
 * ことがレビューで判明した。このファイルは `vi.useFakeTimers()` で時間を進め、
 * 次の 2 方向を両方確かめる。
 *
 * (a) 消えてはいけないバナー（切断バナー）は、時間が経っても消えない。
 * (b) 消えるべきバナー（一時的な操作エラー）は、4 秒経ったら消える。
 *
 * (a) だけでは「すべてのバナーを消さない」実装でも緑になり、(b) だけでは
 * 「すべてのバナーを消す」実装でも緑になる。両方あって初めて「区別している」
 * ことの証拠になる。
 *
 * @requirements #167（#72 E4）EARS 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";
import { displayMessageFor } from "@tasuki/timer-core";

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

function enterLobby(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
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
      phase: "ready",
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "Host")],
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
  // render/fireEvent を偽タイマーの下で使うと内部の待機が固まりうるため、
  // 各テストは enterLobby() を実時間で終えた後に vi.useFakeTimers() へ切り替える。
  // 後始末として実時間へ必ず戻す。
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("バナーの自動消去の区別（EARS 2 補強）", () => {
  it("(a) 切断バナーは時間が経っても消えない", () => {
    const ws = enterLobby();
    vi.useFakeTimers();

    act(() => {
      ws.onclose?.();
    });
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();
  });

  it("(b) 一時的な操作エラーのバナーは4秒で消える", () => {
    const ws = enterLobby();
    vi.useFakeTimers();

    // RATE_LIMITED は errorAction() の switch に列挙が無く、既定の "transient" になる
    // （session-lost や leave-room には分類されないコード）。
    sendServer(ws, { type: "error", code: "RATE_LIMITED", message: "too many" });
    const expected = displayMessageFor("RATE_LIMITED");
    expect(screen.getByText(expected)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText(expected)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(expected)).toBeNull();
  });
});
