/**
 * App.tsx の state/ref 二重管理リファクタの characterization test（Issue #41）。
 *
 * `makeClient` のコールバックは生成時の値で固定される（closure）ため、
 * `room` / `endType` / `participantId` / `generatingProblem` は state（描画用）と
 * ref（closure 用・`useLatestRef` 経由）の両方で保持している。
 * Issue #41 はこの4本の ref 宣言を1本の集約 ref にまとめるリファクタで、
 * 値そのものや同期タイミングは変えない。
 *
 * 着手前は App.tsx を直接 render するテストが存在しなかったため、
 * このファイルはリファクタの安全網として新設した（4組それぞれが実際に
 * 使われる代表的なフローを FakeWS で駆動して検証する）。
 *
 * なお Issue #46 で `latestRef`（state の写し）は撤廃され、コールバックは
 * ハンドラ束の ref 経由で最新の state を読むようになった。このファイルが検証する
 * 「4組の値が実際に使われるフロー」の期待値は、その前後で変わらない。
 *
 * @requirements Issue #41（#28 D-2）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import type { Problem } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const HOST_ID = "host-1";

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

function problemB(): Problem {
  return {
    title: "回文判定",
    description: "文字列が回文か判定する",
    requirements: ["大文字小文字を無視"],
    exampleTest: "expect(add(1, 2)).toBe(3)",
    hints: [],
    source: "fallback",
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

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Setup 画面から「ルームを作る」まで進め、接続済み FakeWS を返す。 */
function createRoomAndConnect(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  return openLatestSocket();
}

describe("App.tsx の state/ref 二重管理（4組）", () => {
  it("roomRef: 生成中お題の再依頼リクエストが最新の room.code を参照する", () => {
    // Given: ロビーに到達し、お題Aが確定している
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // When: 「お題」タブへ切り替え、「別のお題にする」を押す
    // （regenerateProblem は roomRef.current?.code を参照する）
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByRole("button", { name: "別のお題にする" }));

    // Then: 送信された requestId に現在の room.code（ROOM01）が含まれる
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('"command":"problem.request"'),
    );
    const [rawSent] = sendSpy.mock.calls[0] as unknown as [string];
    const sent = JSON.parse(rawSent);
    expect(sent.requestId).toContain("ROOM01");
  });

  it("generatingRef: 生成中に新しいお題が来ると生成中表示が解除される", () => {
    // Given: 「別のお題にする」押下で生成中になっている
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    fireEvent.click(screen.getByRole("button", { name: "別のお題にする" }));
    expect(screen.getByRole("button", { name: "生成中" })).toBeInTheDocument();

    // When: 変化したお題Bを含む snapshot が届く
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        problem: problemB(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // Then: 生成中表示が解除され、通常の「別のお題にする」に戻る
    expect(screen.queryByRole("button", { name: "生成中" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "別のお題にする" })).toBeInTheDocument();
  });

  it("participantIdRef + roomRef: notice の実行者が自分のとき「あなた」と表示する", () => {
    // Given: ロビーで自分の participantId が確定している
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // When: 自分が実行者の notice（session-reset）が届く
    sendServer(ws, {
      type: "signal",
      signal: "notice",
      action: "session-reset",
      actorName: "Host",
      actorParticipantId: HOST_ID,
    });

    // Then: participantIdRef が最新の自分の ID を指しているので「あなた」と表示される
    expect(screen.getByText("あなたがセッションをリセットしました。")).toBeInTheDocument();
  });

  it("endTypeRef: 中断（abort）後の celebration snapshot では完成記録を保存しない", async () => {
    // Given: セッション画面まで進める（サーバー権威の phase で直接遷移させる）
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    const sessionRoom = () =>
      aRoomView({
        code: "ROOM01",
        phase: "session",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
        clock: { running: true, runningSince: Date.now() },
      });
    sendServer(ws, { type: "snapshot", room: sessionRoom() });

    // When: 「途中で終える」→確認 で endType が abort になる
    fireEvent.click(screen.getByRole("button", { name: /途中で終える/ }));
    fireEvent.click(screen.getByRole("button", { name: "終える（記録なし）" }));

    // その後に celebration snapshot が届く（サーバーは常にお題つきの room を返す）
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        hostParticipantId: HOST_ID,
        problem: problemA(),
        participants: [
          { participantId: HOST_ID, connId: "c1", displayName: "Host", role: "host", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // Then: endTypeRef.current === "abort" のガードで完成記録の保存経路（saveRecord）が呼ばれない
    const { saveRecord } = await import("../../src/records/indexeddb.js");
    expect(saveRecord).not.toHaveBeenCalled();
  });
});
