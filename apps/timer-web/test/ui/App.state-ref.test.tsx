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
 * なったので、state も ref も要らない。**ここにあった 1 件は移設ではなく削除である。**
 *
 * **#91 PR 3 で roomRef の組（お題の再依頼リクエスト）も消えた。** timer 内でのお題の
 * 作成・生成は撤去し、お題ツール（別アプリ）へ移った。`regenerateProblem` も
 * `App.problem-generation.test.tsx` もこの PR で削除したので、代わりの検査は無い
 * （生成中の演出ごと無くなったため、検査すべき振る舞いも残っていない）。
 *
 * @requirements Issue #41（#28 D-2）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRecord, aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";

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
  it("participantIdRef + roomRef: notice の実行者が自分のとき「あなた」と表示する", () => {
    // Given: ロビーで自分の participantId が確定している
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", joinedAt: 0 },
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

  it("直前の room: 前のセッションの記録が残るルームで別の人が中断すると、保存せず中断と出る", async () => {
    // Given: 1 本目の記録（サーバーのもの）が残ったルームで、2 本目が走っている。
    // 終わり方は「直前の描画の room と比べて記録が増えたか」で決まる（#91 PR 3）ので、
    // ハンドラが最新の room を読んでいなければ（前 = null や古い room）ここは中断と出ない。
    // **記録が空でないのが要点である** —— 空だと「末尾の記録を保存する」誤りと区別できない。
    const { saveRecord } = await import("../../src/records/indexeddb.js");
    vi.mocked(saveRecord).mockClear();
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const room = (phase: "session" | "celebration") =>
      aRoomView({
        code: "ROOM01",
        phase,
        participants: [
          { participantId: CREATOR_ID, displayName: "Creator", presence: "online", joinedAt: 0 },
        ],
        sessionRecords: [aRecord({ id: "first" })],
      });
    sendServer(ws, { type: "snapshot", room: room("session") });

    // When: 別の人が中断した。サーバーは記録を足さずに完了へ移す（この端末は何も押さない）
    sendServer(ws, { type: "snapshot", room: room("celebration") });

    // Then
    expect(saveRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "セッション終了（中断）" })).toBeInTheDocument();
  });
});
