/**
 * 切断・再接続のときに、App が接続状態をどう見せるかを固定する characterization test
 * （#167 E4 の安全網・EARS 2）。
 *
 * deriveConnectionStatus の単体テストと StatusStrip の表示テストは既にあるが、
 * **App を通して「WS が切れたら再接続中が出る」経路のテストが無かった。**
 * 純粋関数と表示部品が緑でも、その間の配線が切れていれば誰も気づかない。
 *
 * このファイルは E4 の再編に着手する**前**に、現行の App.tsx に対して書いて緑を確認する。
 *
 * @requirements #167（#72 E4）EARS 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";

function participant(participantId: string, displayName: string) {
  return {
    participantId,
    displayName,
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

function enterLobby(): FakeWS {
  // 玄関で名乗った端末としてルームを開く（#95 S5c・R9。旧入口 Setup はもう無い）。
  const ws = enterRoomAndConnect({ participantId: CREATOR_ID, displayName: "Creator" });
  sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "ready",
      participants: [participant(CREATOR_ID, "Creator")],
    }),
  });
  return ws;
}

beforeEach(() => {
  FakeWS.instances = [];
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("接続状態の表示（EARS 2）", () => {
  it("接続中は再接続中を出さない", () => {
    enterLobby();
    expect(screen.queryByText(/再接続中/)).toBeNull();
  });

  it("WS が切れたら StatusStrip が再接続中になる", () => {
    // Given
    const ws = enterLobby();

    // When: サーバー側の都合で接続が切れた（dispose 経由ではない）
    act(() => {
      ws.onclose?.();
    });

    // Then: 恒久表示の StatusStrip が再接続中を示す
    expect(screen.getByText(/再接続中/)).toBeInTheDocument();
  });

  it("WS が切れたらバナーで再接続中を知らせる", () => {
    // Given
    const ws = enterLobby();
    // When
    act(() => {
      ws.onclose?.();
    });
    // Then
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();
  });

  it("再接続が確立するとバナーが消え、再接続中の表示も消える", () => {
    // Given
    const ws = enterLobby();
    act(() => {
      ws.onclose?.();
    });
    expect(screen.getByText(/再接続中/)).toBeInTheDocument();

    // When: 同じソケットが開き直った（SyncClient は onopen で online へ戻す）
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });

    // Then: バナーも再接続中の表示も消える
    expect(screen.queryByText("接続が切れました。再接続しています...")).toBeNull();
    expect(screen.queryByText(/再接続中/)).toBeNull();
  });
});
