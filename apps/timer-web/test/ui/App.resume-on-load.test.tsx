/**
 * 再読込・タブ復元での復帰（#76 F-3）。
 *
 * 従来、復帰は WS の自動再接続経路にしか無く、ページを読み直すと必ず参加画面へ戻された。
 * sessionStorage には resumeToken が残っているのに使われず、名前と参加方法を入れ直し、
 * ローテーションにも入り直す必要があった。poker は再読込で復帰するため、
 * 同じ製品の中で挙動が割れていた。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { saveResumeIdentity } from "../../src/sync/resume-identity.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const HOST_ID = "host-1";
const ME_ID = "me-1";

function participant(participantId: string, displayName: string, role: "host" | "editor") {
  return {
    participantId,
    connId: `c-${participantId}`,
    displayName,
    role,
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

/** セッション中の部屋の snapshot（自分は編集者として在席）。 */
function sessionSnapshot() {
  return aRoomView({
    code: "ROOM01",
    phase: "session",
    hostParticipantId: HOST_ID,
    participants: [participant(HOST_ID, "アリス", "host"), participant(ME_ID, "ボブ", "editor")],
  });
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

describe("再読込での復帰（#76 F-3）", () => {
  it("保存済みの識別情報があれば、参加画面を出さずに部屋へ戻る", () => {
    // Given: セッション中に同じタブで再読込した（sessionStorage は生き残る）
    saveResumeIdentity({
      code: "ROOM01",
      participantId: ME_ID,
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: ページが読み込まれ、部屋の状態が届く
    render(<App />);
    const ws = openLatestSocket();
    sendServer(ws, { type: "snapshot", room: sessionSnapshot() });

    // Then: 名前と参加方法を入れ直させない
    expect(screen.queryByRole("heading", { name: "モブに参加" })).not.toBeInTheDocument();
  });

  it("復帰時に resumeToken 付きの room.join を送る", () => {
    // Given: 保存済みの識別情報
    saveResumeIdentity({
      code: "ROOM01",
      participantId: ME_ID,
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: ページが読み込まれ、接続が開く
    // （接続前にキューへ積まれるため、開く前から送信を見張る）
    render(<App />);
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    const sendSpy = vi.spyOn(ws, "send");
    ws.readyState = FakeWS.OPEN;
    act(() => {
      ws.onopen?.();
    });

    // Then: 利用者の操作なしに、本人として join し直している
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(raw as unknown as string) as Record<string, unknown>,
    );
    expect(sent).toContainEqual({
      command: "room.join",
      code: "ROOM01",
      displayName: "ボブ",
      hasAiKey: false,
      resumeToken: "rt_1",
    });
  });

  it("復帰後のステータスに自分の名前と役割が出る", () => {
    // Given: 保存済みの識別情報
    saveResumeIdentity({
      code: "ROOM01",
      participantId: ME_ID,
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: ページ読み込みでの復帰後、部屋の状態だけが届く
    // （再接続時の room.joined が来ない経路。自分が誰かは保存値から分かっている）
    render(<App />);
    const ws = openLatestSocket();
    sendServer(ws, { type: "snapshot", room: sessionSnapshot() });

    // Then: 作成者（アリス）ではなく自分（ボブ）として表示される。
    // ここが崩れると、復帰した本人が他人の名前と役割を見ることになる
    const strip = screen.getByLabelText("ステータス情報");
    expect(strip).toHaveTextContent("ボブ");
    expect(strip).toHaveTextContent("編集者");
  });

  it("別のルームの招待リンクを開いたときは、前のルームへ戻さない", () => {
    // Given: 前のルームの識別情報が残っている
    saveResumeIdentity({
      code: "OLD999",
      participantId: ME_ID,
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: 別のルームの招待リンクで開く
    render(<App />);

    // Then: 通常どおり参加画面から始まる
    expect(screen.getByRole("heading", { name: "モブに参加" })).toBeInTheDocument();
  });

  it("保存が無ければ従来どおり参加画面を出す（招待リンクで初めて来た人）", () => {
    // Given: 保存なし
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: 招待リンクで開く
    render(<App />);

    // Then: 名前と参加方法を尋ねる
    expect(screen.getByRole("heading", { name: "モブに参加" })).toBeInTheDocument();
  });
});
