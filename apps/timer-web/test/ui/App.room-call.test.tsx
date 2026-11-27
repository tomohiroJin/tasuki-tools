/**
 * 呼びかけの知らせ（#677）が、timer の画面から**分かる**ことを固定する。
 *
 * 知らせは timer の契約（`ServerMsgSchema`）に無い言葉なので、先に見分けないと「契約に合わないフレーム」として
 * 捨てられ、同期の告知（#209）が立つ。フックと部品が個別に緑でも配線が 1 本切れれば利用者には見えないので、
 * App を通して実経路を通す。
 *
 * @requirements #677
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, fireEvent, within } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

function enterLobby(): FakeWS {
  const ws = enterRoomAndConnect({ participantId: CREATOR_ID });
  sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "ready",
      participants: [{ participantId: CREATOR_ID, displayName: "Creator", presence: "online", joinedAt: 0 }],
    }),
  });
  return ws;
}

const callFrame = (tool: string, fromName = "いお") => ({
  type: "room.call",
  call: { tool, fromParticipantId: "p2", fromName },
});

const connectionText = () => screen.getByLabelText("接続状態").textContent ?? "";

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("呼びかけの知らせを timer の画面に出す", () => {
  it("Given ルームに入っている / When 呼びかけの知らせが届く / Then 名前と道具の名前と、同じルームへ移るリンクが出る", () => {
    const ws = enterLobby();

    sendServer(ws, callFrame("poker"));

    const notice = document.querySelector(".ui-call") as HTMLElement;
    expect(notice).toHaveTextContent("いおさんが Planning Poker に呼んでいます");
    expect(within(notice).getByRole("link", { name: "移る" })).toHaveAttribute("href", "/poker/?room=ROOM01");
  });

  it("Given 呼びかけの知らせ / When 届く / Then 同期できていないとは出さない（契約に合わないフレームとして捨てない）", () => {
    const ws = enterLobby();

    sendServer(ws, callFrame("poker"));

    expect(connectionText()).toContain("Connected");
    expect(connectionText()).not.toContain("同期できていません");
  });

  it("Given 知らせが出ている / When 閉じる / Then 知らせは消える", () => {
    const ws = enterLobby();
    sendServer(ws, callFrame("poker"));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(document.querySelector(".ui-call")).toBeNull();
  });

  it("Given 知らせが出ている / When 新しい知らせが届く / Then 並べず最新の 1 つにする", () => {
    const ws = enterLobby();
    sendServer(ws, callFrame("poker"));

    sendServer(ws, callFrame("agenda", "うみ"));

    expect(document.querySelectorAll(".ui-call")).toHaveLength(1);
    expect(document.querySelector(".ui-call")).toHaveTextContent("うみさんが Agenda Timer に呼んでいます");
  });

  it("Given 知らない道具の知らせ / When 届く / Then 何も出さず、同期の告知も立てない", () => {
    const ws = enterLobby();

    sendServer(ws, callFrame("unknown-tool"));

    expect(document.querySelector(".ui-call")).toBeNull();
    expect(connectionText()).not.toContain("同期できていません");
  });
});
