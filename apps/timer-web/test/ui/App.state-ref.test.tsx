/**
 * App.tsx の state/ref 二重管理リファクタの characterization test（Issue #41）。
 *
 * `makeClient` のコールバックは生成時の値で固定される（closure）ため、
 * `room` / `endType` / `participantId` は state（描画用）と
 * ref（closure 用・`useLatestRef` 経由）の両方で保持していた。
 * Issue #41 はその ref 宣言を1本の集約 ref にまとめるリファクタで、
 * 値そのものや同期タイミングは変えない。
 *
 * 着手前は App.tsx を直接 render するテストが存在しなかったため、
 * このファイルはリファクタの安全網として新設した（4組それぞれが実際に
 * 使われる代表的なフローを FakeWS で駆動して検証する）。
 *
 * なお Issue #46 で `latestRef`（state の写し）は撤廃され、コールバックは
 * ハンドラ束の ref 経由で最新の state を読むようになった。このファイルが検証する
 * 「値が実際に使われるフロー」の期待値は、その前後で変わらない。
 *
 * **#283 で `generatingProblem` の組そのものが消えた。** 生成中はサーバーが持つ
 * 状態（`Room.problemGeneration`）になり、画面は snapshot をそのまま読むだけに
 * なったので、state も ref も要らない。**ここにあった 1 件は移設ではなく削除である** ——
 * 代わりの検査は `App.problem-generation.test.tsx` にあり、そちらは
 * 「同じお題でも降りる」「押していない端末でも立つ」という**旧実装では作れない
 * 前提**を見ている（ここへ残すと、消えた仕組みの名前だけが生き続ける）。
 *
 * @requirements Issue #41（#28 D-2）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import type { Problem } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";

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

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

beforeEach(() => {
  FakeWS.instances = [];
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** 玄関で名乗った端末としてルームを開き、接続済み FakeWS を返す（#95 S5c・R9）。 */
function createRoomAndConnect(): FakeWS {
  return enterRoomAndConnect({ participantId: CREATOR_ID });
}

describe("App.tsx の state/ref 二重管理", () => {
  it("roomRef: 生成中お題の再依頼リクエストが最新の room.code を参照する", () => {
    // Given: ロビーに到達し、お題Aが確定している
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        problem: problemA(),
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", hasAiKey: false, joinedAt: 0 },
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

  it("participantIdRef + roomRef: notice の実行者が自分のとき「あなた」と表示する", () => {
    // Given: ロビーで自分の participantId が確定している
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        problem: problemA(),
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // When: 自分が実行者の notice（session-reset）が届く
    sendServer(ws, {
      type: "signal",
      signal: "notice",
      action: "session-reset",
      actorName: "Creator",
      actorParticipantId: CREATOR_ID,
    });

    // Then: participantIdRef が最新の自分の ID を指しているので「あなた」と表示される
    expect(screen.getByText("あなたがセッションを最初から始め直しました。")).toBeInTheDocument();
  });

  it("endTypeRef: 中断（abort）後の celebration snapshot では完成記録を保存しない", async () => {
    // Given: セッション画面まで進める（サーバー権威の phase で直接遷移させる）
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const sessionRoom = () =>
      aRoomView({
        code: "ROOM01",
        phase: "session",
        problem: problemA(),
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", hasAiKey: false, joinedAt: 0 },
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
        problem: problemA(),
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", hasAiKey: false, joinedAt: 0 },
        ],
      }),
    });

    // Then: endTypeRef.current === "abort" のガードで完成記録の保存経路（saveRecord）が呼ばれない
    const { saveRecord } = await import("../../src/records/indexeddb.js");
    expect(saveRecord).not.toHaveBeenCalled();
  });
});
