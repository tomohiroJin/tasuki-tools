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
import { screen, act } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";
import { displayMessageFor } from "@tasuki/timer-core";

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
  // render/fireEvent を偽タイマーの下で使うと内部の待機が固まりうるため、
  // 各テストは enterLobby() を実時間で終えた後に vi.useFakeTimers() へ切り替える。
  // 後始末として実時間へ必ず戻す。
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("バナーの自動消去の区別（EARS 2 補強）", () => {
  it("(a) 切断バナーは時間が経っても消えない", () => {
    // Given
    const ws = enterLobby();
    vi.useFakeTimers();

    // When
    act(() => {
      ws.onclose?.();
    });
    // Then
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();
  });

  it("(b) 一時的な操作エラーのバナーは4秒で消える", () => {
    // Given
    const ws = enterLobby();
    vi.useFakeTimers();

    // When
    // RATE_LIMITED は errorAction() の switch に列挙が無く、既定の "transient" になる
    // （session-lost や leave-room には分類されないコード）。
    sendServer(ws, { type: "error", code: "RATE_LIMITED", message: "too many" });
    const expected = displayMessageFor("RATE_LIMITED");
    // Then
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

  it("(c) 一時エラー表示中に切断すると、一時エラーの4秒タイマーで切断バナーが消えない（最終レビューで判明した回帰の再発防止）", () => {
    // Given
    const ws = enterLobby();
    vi.useFakeTimers();

    // RATE_LIMITED は (b) と同じく errorAction() の既定分類で "transient" になり、
    // 4 秒の自動消去タイマーを持つバナーとして表示される。
    sendServer(ws, { type: "error", code: "RATE_LIMITED", message: "too many" });
    const transientMessage = displayMessageFor("RATE_LIMITED");
    expect(screen.getByText(transientMessage)).toBeInTheDocument();

    // When
    act(() => {
      // 一時エラーの4秒タイマーが発火する前（1秒後）に切断する。
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      ws.onclose?.();
    });
    // Then
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();

    act(() => {
      // 一時エラーを表示してから合計5秒（>4秒）経過させる。旧 App.tsx では
      // 一時エラーの4秒タイマーがバナーの種類を見ずに消去していたため、
      // 切断中にもかかわらず切断バナーが消えていた（Issue #32 の意図に反する）。
      // useBanner.show() は新しいバナーを出すたびに直前のタイマーを解除するので、
      // ここでは切断バナーが残り続けるのが正しい。
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("接続が切れました。再接続しています...")).toBeInTheDocument();
  });
});
