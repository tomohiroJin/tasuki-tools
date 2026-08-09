/**
 * ソロで抜けた後は、消えたルームへ戻ろうとしない（Issue #79）。
 *
 * サーバー側で「在室者が 0 人になる退出はルームごと破棄する」ようにしたため、
 * 退出が成立した時点でそのルームコードはもう存在しない。ここで sessionStorage の
 * リジューム識別情報や URL の `?room=` が残っていると、再読込のたびに
 * **消えた部屋へ resumeToken 付きの room.join を送り直す**ことになり、
 * 利用者には「抜けたはずなのに参加画面へ引き戻され、失敗する」ように見える。
 *
 * LEFT_ROOM を受けた後始末（`clearResumeIdentity` と `stripRoomParam`）は既にあるので、
 * ソロ退出という新しい経路でもそれが効いていることを実際の画面越しに固定する。
 *
 * @requirements Issue #79, FR-004, FR-127
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { saveResumeIdentity, loadResumeIdentity } from "../../src/sync/resume-identity.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
  listRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
}));

const ME_ID = "solo-host-1";

/** 送信されたコマンド（全ソケット分）。room.join の再送を見張るために記録する。 */
let sentCommands: Array<Record<string, unknown>>;

function openLatestSocket(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
  ws.readyState = FakeWS.OPEN;
  act(() => {
    ws.onopen?.();
  });
  return ws;
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/** 自分ひとりだけが在室するルーム（room.create 直後の状態）。 */
function soloSnapshot() {
  return aRoomView({
    code: "ROOM01",
    phase: "setup",
    hostParticipantId: ME_ID,
    session: { rotation: [ME_ID], driverCounts: [0] },
    participants: [
      {
        participantId: ME_ID,
        connId: "c-solo",
        displayName: "アリス",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 0,
      },
    ],
  });
}

/**
 * 招待リンク（`?room=ROOM01`）を開いたソロの主催者として復帰し、
 * サーバーから自己退出の成立（LEFT_ROOM）を受け取るところまで進める。
 */
function leaveSoloRoom(): void {
  saveResumeIdentity({
    code: "ROOM01",
    participantId: ME_ID,
    resumeToken: "rt_1",
    displayName: "アリス",
  });
  window.history.replaceState(null, "", "/?room=ROOM01");

  render(<App />);
  const ws = openLatestSocket();
  sendServer(ws, { type: "snapshot", room: soloSnapshot() });
  // サーバーはソロ退出を受理し、破棄したルームへ snapshot を撒かずに本人だけへ通知する。
  sendServer(ws, { type: "error", code: "LEFT_ROOM", message: "ルームから抜けました。" });
}

/** 再読込をまねる（同一タブなので sessionStorage と URL はそのまま引き継ぐ）。 */
function reload(): void {
  cleanup();
  FakeWS.instances = [];
  sentCommands = [];
  render(<App />);
  if (FakeWS.instances.length > 0) openLatestSocket();
}

beforeEach(() => {
  FakeWS.instances = [];
  sentCommands = [];
  vi.stubGlobal("WebSocket", FakeWS);
  vi.spyOn(FakeWS.prototype, "send").mockImplementation((raw?: string) => {
    if (typeof raw === "string") sentCommands.push(JSON.parse(raw) as Record<string, unknown>);
  });
  sessionStorage.clear();
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("ソロ退出後の復帰（Issue #79）", () => {
  it("退出が成立したら入口画面へ戻り、URL とセッション保存の両方から手がかりが消える", () => {
    // Given / When
    leaveSoloRoom();

    // Then: 入口画面（作成画面）に戻っている
    expect(screen.getByRole("heading", { name: "TDD Mob Pro Timer" })).toBeInTheDocument();
    // Then: 復帰の手がかりが片方でも残ると、再読込で消えた部屋へ戻ろうとする
    expect(loadResumeIdentity()).toBeNull();
    expect(new URL(window.location.href).searchParams.get("room")).toBeNull();
  });

  it("退出直後に再読込しても、消えたルームへ room.join を送り直さない", () => {
    // Given
    leaveSoloRoom();

    // When: 同じタブで読み直す
    reload();

    // Then: 参加画面へ引き戻されず、join も飛ばない
    expect(screen.getByRole("heading", { name: "TDD Mob Pro Timer" })).toBeInTheDocument();
    expect(sentCommands.filter((c) => c.command === "room.join")).toEqual([]);
  });

  it("退出前の招待リンクを開き直しても、自動復帰せず参加画面から始まる", () => {
    // Given
    leaveSoloRoom();

    // When: ブックマークや共有済みの招待リンクをもう一度開く
    cleanup();
    FakeWS.instances = [];
    sentCommands = [];
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    if (FakeWS.instances.length > 0) openLatestSocket();

    // Then: 保存済み識別情報は消えているので、勝手に resumeToken 付きで join し直さない
    expect(screen.getByRole("heading", { name: "モブに参加" })).toBeInTheDocument();
    expect(sentCommands.filter((c) => c.command === "room.join")).toEqual([]);
  });
});
