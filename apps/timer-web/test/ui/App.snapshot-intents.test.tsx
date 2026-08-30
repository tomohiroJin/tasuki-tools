/**
 * `decideSnapshotIntents` が返す意図のうち、App.tsx の適用 switch を経由しないと
 * 誰にも守られない 4 種（`persist-completion` / `request-problem` /
 * `regenerate-problem` / `consume-driver-join`）を、App 経由の副作用（WS 送信・
 * IndexedDB 保存）で直接確認する肯定テスト（#167 Task 5 レビュー指摘）。
 *
 * Task 5 の対照実行で、この 4 種は「switch の case を握りつぶしても 1 件も
 * テストが落ちない」ことが判明した。既存の否定テスト（例:
 * `App.state-ref.test.tsx` の「中断では保存しない」）は「起きないこと」しか
 * 見ておらず、「本来起きるべきことが実際に起きる」側を誰も見ていなかった。
 *
 * 次の Task 6 でこの適用 switch は同期フックへ丸ごと移る予定であり、
 * 移設時に case が 1 つ落ちても気づけるよう、ここで先に網を張る。
 *
 * 期待値は実装（App.tsx・snapshot-intents.ts）から機械的に写さず、
 * 意図の定義（requestId の組み立て規則等）から手で導いている。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";
import { saveRecord as saveRecordMock } from "../../src/records/indexeddb.js";
import type { Problem } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const HOST_ID = "host-1";
const OTHER_ID = "other-1";

function problemA(): Problem {
  return {
    title: "FizzBuzz",
    description: "3の倍数でFizz",
    requirements: ["3の倍数はFizz"],
    exampleTest: "expect(add(1, 2)).toBe(3)",
    hints: [],
    source: "fallback",
  };
}

function participant(participantId: string, displayName: string, role: "host" | "editor" = "host") {
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

/** テスト用に FakeWS を OPEN 状態にし、connect() のキュー送信をフラッシュする。 */
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

/** send スパイの呼び出しを JSON にパースした配列で取り出す。 */
function sentFrames(sendSpy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
}

/** Setup 画面から「ルームを作る」まで進め、接続済み FakeWS を返す（作成者・isCreator=true）。 */
function createRoomAndConnect(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  return openLatestSocket();
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
  // vitest.config.ts の restoreMocks: true は各テスト開始前に
  // mockImplementation/mockResolvedValue を剥がすだけで、vi.mock ファクトリ由来の
  // saveRecord モックの呼び出し履歴（mock.calls）までは確実にクリアしない
  // （App.sync-handlers.test.tsx の generateSpy と同種の罠）。ここで明示的にクリアし、
  // 前のテストの呼び出しが「保存されなかった」テストへ漏れ込むのを防ぐ。
  vi.mocked(saveRecordMock).mockClear();
});

afterEach(() => {
  // 前のテストの App インスタンスが celebration 等の画面に留まったまま残ると、
  // 次のテストの getByRole/getByLabelText が意図しない要素を拾う恐れがあるため、
  // 明示的に unmount する（他の describe と App インスタンスを共有しないため）。
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

describe("persist-completion: 完成フェーズの snapshot でローカル記録が実際に保存される", () => {
  it("完成（中断でない）なら記録が保存される", () => {
    // Given
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });

    // When
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [participant(HOST_ID, "Host")],
      }),
    });

    // Then
    expect(saveRecordMock).toHaveBeenCalledTimes(1);
  });

  it("中断（abort）後の celebration では saveRecord が呼ばれない（既存の否定側を壊さない）", () => {
    // Given
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "session",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [participant(HOST_ID, "Host")],
        clock: { running: true, runningSince: Date.now() },
      }),
    });

    // When
    fireEvent.click(screen.getByRole("button", { name: /途中で終える/ }));
    fireEvent.click(screen.getByRole("button", { name: "終える（記録なし）" }));

    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [participant(HOST_ID, "Host")],
      }),
    });

    // Then
    expect(saveRecordMock).not.toHaveBeenCalled();
  });
});

describe("request-problem: 作成者がロビーで一度だけ代表生成を依頼する", () => {
  it("お題の無いロビーの snapshot を受けたら requestId: req-<CODE>-lobby で送る", () => {
    // Given
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    const sendSpy = vi.spyOn(ws, "send");

    // When
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem: null,
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host")],
      }),
    });

    // Then
    const requests = sentFrames(sendSpy).filter((f) => f.command === "problem.request");
    expect(requests).toEqual([{ command: "problem.request", requestId: "req-ROOM01-lobby" }]);
  });
});

describe("regenerate-problem: 作成者がロビーでの難易度変更を受けて作り直しを依頼する", () => {
  it("難易度が変わった snapshot を受けたら requestId が req-<CODE>-cfg- で始まる依頼を送る", () => {
    // Given
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem: problemA(),
        config: { difficulty: "easy" },
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host")],
      }),
    });
    const sendSpy = vi.spyOn(ws, "send");

    // When
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem: problemA(),
        config: { difficulty: "hard" },
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host")],
      }),
    });

    // Then
    const requests = sentFrames(sendSpy).filter((f) => f.command === "problem.request");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.requestId).toMatch(/^req-ROOM01-cfg-/);
  });
});

describe("consume-driver-join: 参加時ドライバー宣言は一度きりで、輪から外れても再送しない", () => {
  it("宣言を消費した後は、自分が輪から外れた snapshot が来ても member.add を再送しない", () => {
    // Given: ?room= からドライバーとして参加する
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Guest" } });
    fireEvent.click(screen.getByRole("radio", { name: "ドライバーとして参加" }));
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    const ws = openLatestSocket();
    sendServer(ws, { type: "room.joined", code: "ROOM01", resumeToken: "rt", participantId: OTHER_ID });

    // 自分を含む最初の snapshot（rotation 未加入）→ 宣言を消費し member.add を1回送る
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host"), participant(OTHER_ID, "Guest", "editor")],
        session: { rotation: [HOST_ID], driverCounts: [0] },
      }),
    });

    // When: 自分が輪から外れた（skip 等で rotation から消えた）snapshot が続けて届く
    const sendSpy = vi.spyOn(ws, "send");
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host"), participant(OTHER_ID, "Guest", "editor")],
        session: { rotation: [HOST_ID], driverCounts: [0] },
      }),
    });

    // Then: 宣言は最初の snapshot で消費済みなので、2 回目では member.add を送らない
    const added = sentFrames(sendSpy).filter((f) => f.command === "member.add");
    expect(added).toEqual([]);
  });
});
