/**
 * ソロで抜けた後は、消えたルームへ戻ろうとしない（Issue #79）。
 *
 * サーバー側で「在室者が 0 人になる退出はルームごと破棄する」ようにしたため、
 * 退出が成立した時点でそのルームコードはもう存在しない。ここで保存済みの
 * リジューム識別情報が残っていると、再読込のたびに**消えた部屋へ resumeToken 付きの
 * room.join を送り直す**ことになり、利用者には「抜けたはずなのに引き戻され、失敗する」
 * ように見える。
 *
 * **行き先は #95 S5c で変わった。** 旧入口（`Setup` / `Join`）を撤去したので、
 * 退出が成立した本人は玄関のそのルーム（`/?room=CODE&left=self`）へ送られる。
 * `?room=` を URL から消す後始末（`stripRoomParam`）は不要になった。
 *
 * **自分で抜けてもコードは運ぶ**（#290・D3）。ルームがまだ在るかを判断するのは
 * 玄関（サーバーへ尋ねる・#274）であって、抜けた本人ではないからである。
 *
 * **FR-127 の「復帰の手がかりを保持しない」は、この D3 で意図して再解釈している。**
 * 旧入口（`Setup` / `Join`）は #249 で撤去され、「参加画面」という区分自体が実体を
 * 失った。復帰の組（`resumeToken`）は今も破棄しており、名乗り直さずには戻れない ——
 * 保持しないのはコードではなく、この組である。
 *
 * @requirements Issue #79, FR-004, FR-127
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { saveResumeIdentity, loadResumeIdentity } from "@tasuki/sync-client";
import { redirectTo } from "../../src/platform/location.js";

// 遷移は `platform/location.ts` に閉じている（#95 S5c・R9）。テストはそこを差し替える。
vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
  listRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
}));

const ME_ID = "solo-p1";

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
    session: { rotation: [ME_ID], driverCounts: [0] },
    participants: [
      {
        participantId: ME_ID,
        displayName: "アリス",
        presence: "online",
        hasAiKey: false,
        joinedAt: 0,
      },
    ],
  });
}

/**
 * 招待リンク（`?room=ROOM01`）を開いたソロの参加者として復帰し、
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

/** 再読込をまねる（保存済みの復帰の組と URL はそのまま引き継ぐ）。 */
function reload(): void {
  cleanup();
  FakeWS.instances = [];
  sentCommands = [];
  render(<App />);
  if (FakeWS.instances.length > 0) openLatestSocket();
}

beforeEach(() => {
  FakeWS.instances = [];
  // **呼び出し履歴を明示的に捨てる。** `restoreMocks: true` は `vi.mock` のファクトリが
  // 作った `vi.fn()` の `mock.calls` までは確実に消さず、前のテストの遷移が漏れる。
  vi.mocked(redirectTo).mockClear();
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  sentCommands = [];
  vi.stubGlobal("WebSocket", FakeWS);
  vi.spyOn(FakeWS.prototype, "send").mockImplementation((raw?: string) => {
    if (typeof raw === "string") sentCommands.push(JSON.parse(raw) as Record<string, unknown>);
  });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("ソロ退出後の復帰（Issue #79）", () => {
  it("退出が成立したら玄関へ送られ、復帰の手がかりも消える", () => {
    // Given（leaveSoloRoom がソロ退出の一連の流れ全体を行う）
    // When
    leaveSoloRoom();

    // Then: **自分で抜けてもコードを運ぶ**（#290・D3）。ルームがまだ在るかは玄関が決める
    // （#274・サーバーへ尋ねる）— 抜けた本人がそれを知っているわけではない。
    // 履歴へ積まない `replace` で送るので、戻るボタン 1 回で抜けたルームへ復帰しない。
    // **抜けたことは印で玄関へ運ぶ**（#95 S5c・I-1。バナーは遷移で失われる）
    expect(redirectTo).toHaveBeenCalledWith("/?room=ROOM01&left=self");
    // Then: 復帰の手がかりが残ると、再読込で消えた部屋へ戻ろうとする
    expect(loadResumeIdentity("ROOM01")).toBeNull();
  });

  it("退出直後に再読込しても、消えたルームへ room.join を送り直さない", () => {
    // Given
    leaveSoloRoom();

    // When: 同じタブで読み直す（遷移は差し替えてあるので URL は `?room=ROOM01` のまま
    //       残る。**保存が消えていることだけで止まる**ことを見るには、むしろ好都合）
    reload();

    // Then: join も飛ばず、玄関の名乗りへ送り直されるだけ
    expect(sentCommands.filter((c) => c.command === "room.join")).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith("/?room=ROOM01");
  });

  it("退出前の招待リンクを開き直しても、自動復帰せず玄関の名乗りから始まる", () => {
    // Given
    leaveSoloRoom();

    // When: ブックマークや共有済みの招待リンクをもう一度開く
    cleanup();
    FakeWS.instances = [];
    sentCommands = [];
    vi.mocked(redirectTo).mockClear();
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    if (FakeWS.instances.length > 0) openLatestSocket();

    // Then: 保存済み識別情報は消えているので、勝手に resumeToken 付きで join し直さない。
    // 名乗りはハブに 1 つだけあり、**コードは落とさずに運ぶ**（#95 S5c・R9）
    expect(sentCommands.filter((c) => c.command === "room.join")).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith("/?room=ROOM01");
  });
});
