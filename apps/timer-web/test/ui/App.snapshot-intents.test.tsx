/**
 * `decideSnapshotIntents` が返す意図のうち、同期フックの適用 switch を経由しないと
 * 誰にも守られないもの（`persist-completion`）を、App 経由の副作用
 * （画面・IndexedDB 保存）で直接確認する肯定テスト（#167 Task 5 レビュー指摘）。
 *
 * **#272 で参加時ドライバー宣言（`consume-driver-join` / `join-rotation`）が消えた。**
 * 宣言を立てる旧入口（`Join`）を #95 S5c で撤去したためである。あとに残るのは
 * 「クライアントが輪をいじらない」ことを見る否定側だけになった。
 *
 * **#271 でお題系の意図が全部消えた。** `request-problem` / `regenerate-problem` は
 * お題の依頼がサーバーへ移って不要になった
 * （`apps/tasuki-sync/src/application/lobby-problem.ts`）。ここに残るのは、
 * **クライアントが何もしないこと**を確かめる否定側と、同じ tick で 2 本の
 * snapshot が届いても画面が固まらないことを見る回帰テストである。
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
import { screen, act, cleanup } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRecord, aRoomView } from "../support/room-view.js";
import { saveRecord as saveRecordMock } from "../../src/records/indexeddb.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";
const OTHER_ID = "other-1";

function participant(participantId: string, displayName: string) {
  return {
    participantId,
    displayName,
    presence: "online" as const,
    joinedAt: 0,
  };
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

/**
 * 玄関で名乗った端末としてルームを開き、接続済み FakeWS を返す（#95 S5c・R9）。
 *
 * 旧入口（`Setup`）を撤去したので、timer に「ルームを作る」画面はもう無い（作るのはハブ）。
 * **お題の依頼はサーバーが起こす**（#271）ので、輪の先頭かどうかはお題の振る舞いに
 * 効かない。
 */
function enterRoomAsGuest(): FakeWS {
  return enterRoomAndConnect({ participantId: CREATOR_ID, displayName: "Creator" });
}

beforeEach(() => {
  FakeWS.instances = [];
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
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
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("persist-completion: 完成フェーズの snapshot でローカル記録が実際に保存される", () => {
  it("完成（サーバーが記録を 1 件足した）なら、その記録がそのまま保存される", () => {
    // Given: セッション中の snapshot を 1 度受け取っている（比べる相手がある）
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "session",
        participants: [participant(CREATOR_ID, "Creator")],
        sessionRecords: [],
      }),
    });

    // When: サーバーが作った記録（お題なし）を 1 件足した完了の snapshot が届く
    const record = aRecord({ id: "srv-1", topicTitle: null });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        participants: [participant(CREATOR_ID, "Creator")],
        sessionRecords: [record],
      }),
    });

    // Then: 端末は組み立て直さず、サーバーの記録を保存する（#91 PR 3）
    expect(saveRecordMock).toHaveBeenCalledTimes(1);
    expect(saveRecordMock).toHaveBeenCalledWith(record);
    expect(screen.getByRole("heading", { name: "セッション完了" })).toBeInTheDocument();
  });

  it("別の人が中断した（記録が増えない）完了の snapshot なら、押していない端末でも中断と出て保存しない", () => {
    // Given: この端末は何も押さない。お題はある（旧実装はここで記録を組み立てて保存していた）
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const room = (phase: "session" | "celebration") =>
      aRoomView({
        code: "ROOM01",
        phase,
        participants: [participant(CREATOR_ID, "Creator")],
        sessionRecords: [],
      });
    sendServer(ws, { type: "snapshot", room: room("session") });

    // When
    sendServer(ws, { type: "snapshot", room: room("celebration") });

    // Then
    expect(saveRecordMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "セッション終了（中断）" })).toBeInTheDocument();
  });

  it("前のセッションの記録が残るルームで別の人が中断しても、その記録を保存し直さず中断と出る", () => {
    // Given: 1 本目の記録（サーバーのもの）が残ったルームで、2 本目のセッションが走っている。
    // **記録が空でないのが要点である** —— 「完了へ入ったら末尾の記録を保存する」誤りは、
    // 記録が空のルームでは何も保存しないので区別できない。
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const first = aRecord({ id: "first" });
    const room = (phase: "session" | "celebration") =>
      aRoomView({
        code: "ROOM01",
        phase,
        participants: [participant(CREATOR_ID, "Creator")],
        sessionRecords: [first],
      });
    sendServer(ws, { type: "snapshot", room: room("session") });

    // When: 別の人が中断した。サーバーは記録を足さずに完了へ移す（この端末は何も押さない）
    sendServer(ws, { type: "snapshot", room: room("celebration") });

    // Then
    expect(saveRecordMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "セッション終了（中断）" })).toBeInTheDocument();
  });
});

describe("輪への自動加入: 玄関から入った端末は member.add を起こさない（#272）", () => {
  /**
   * **参加時ドライバー宣言は #272 で畳んだ。** 宣言を立てていたのは旧入口（`Join`）
   * だけで、#95 S5c の撤去で立てる者が居なくなった。ここは「配線ごと消えた」ことを
   * App 経由で固定する —— 消えたあとに誰かが `member.add` を送り直す配線を足したら
   * 落ちる（純粋関数側の並び検査だけでは、フックの適用 switch を見張れない）。
   */
  it("自分が輪に居ない snapshot が続けて届いても member.add を送らない", () => {
    // Given: 玄関で名乗った端末としてルームへ入る（製品の唯一の経路）
    const ws = enterRoomAndConnect({ participantId: OTHER_ID, displayName: "Guest" });
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: OTHER_ID });

    // When: 自分は参加者に居るが輪には居ない snapshot が 2 度届く
    const sendSpy = vi.spyOn(ws, "send");
    const outsideRotation = {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        participants: [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Guest")],
        session: { rotation: [CREATOR_ID], driverCounts: [0] },
      }),
    };
    sendServer(ws, outsideRotation);
    sendServer(ws, outsideRotation);

    // Then: 一度も送らない（輪に入るのはロビーの操作だけ）
    expect(sentFrames(sendSpy).filter((f) => f.command === "member.add")).toEqual([]);
  });
});

/**
 * 完了から抜けたら、前のセッションの完了状態を**全端末で**畳む（#95 S5c・レビュー ②）。
 *
 * **「開始」を押すのは 1 人だけである。** 「新しいセッション」を押した人は玄関へ去り、
 * ロビーで「セッションを開始」を押すのは別の誰か、残りは何も押さない。畳むのを
 * 操作の中に置くと、押していない端末では `record` が前回のままになり、2 本目の
 * 完了画面に**1 本目の記録**が出る。（#91 PR 3 までは「保存済みの印」が立ったままになり
 * 2 本目が保存されない窓もあった。保存が完了へ入った瞬間だけになり、印は消えた。）
 *
 * ここは**何も押さない端末**を演じる。押す側の操作は 1 つも呼ばない。
 */
describe("clear-completion: 開始を押していない端末でも、2 本目の記録が残る", () => {
  const ROTATION = { rotation: [CREATOR_ID, OTHER_ID], currentIndex: 0 };
  const PARTICIPANTS = [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Other")];

  /** サーバーが作った記録。交代回数で 1 本目と 2 本目を見分ける。 */
  const FIRST = aRecord({ id: "r1", members: ["Creator", "Other"], totalSwitches: 1, driverCounts: [1, 0] });
  const SECOND = aRecord({ id: "r2", members: ["Creator", "Other"], totalSwitches: 9, driverCounts: [5, 4] });

  /** 指定の phase と記録を持つ snapshot。 */
  function snapshot(phase: "setup" | "session" | "celebration", sessionRecords: ReturnType<typeof aRecord>[]) {
    return {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase,
        participants: PARTICIPANTS,
        session: ROTATION,
        sessionRecords,
      }),
    };
  }

  it("2 本目の完成で記録が保存され、完了画面にも 2 本目の記録が出る", () => {
    // Given: 何も押さない端末で 1 本目が完成している
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, snapshot("session", []));
    sendServer(ws, snapshot("celebration", [FIRST]));
    expect(saveRecordMock, "1 本目が保存されていない").toHaveBeenCalledTimes(1);
    // **`getAllBy` で受ける。** 「N 回」は交代回数のカードとドライバー別の棒の両方に出る
    expect(screen.getAllByText("1回"), "1 本目の交代回数").not.toHaveLength(0);

    // When: 誰かがロビーへ戻し、誰かが開始し、2 本目が完成する。
    //       **この端末は 1 度も操作していない**
    sendServer(ws, snapshot("setup", [FIRST]));
    sendServer(ws, snapshot("session", [FIRST]));
    sendServer(ws, snapshot("celebration", [FIRST, SECOND]));

    // Then その1: 2 本目もこの端末に保存される（FR-020 の自動保存）
    expect(saveRecordMock, "2 本目が保存されていない").toHaveBeenCalledTimes(2);
    expect(saveRecordMock).toHaveBeenLastCalledWith(SECOND);

    // Then その2: 完了画面に出るのは**2 本目**の記録である
    expect(screen.getAllByText("9回"), "2 本目の交代回数").not.toHaveLength(0);
    expect(screen.queryAllByText("1回"), "1 本目の記録が残っている").toHaveLength(0);
  });

  it("完了から抜けていなければ畳まない（同じ完成の snapshot が 2 度来ても二重保存しない）", () => {
    // Given: 1 本目が完成している
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, snapshot("session", []));
    sendServer(ws, snapshot("celebration", [FIRST]));

    // When: 在席の変化などで、同じ完成フェーズの snapshot がもう一度届く
    sendServer(ws, snapshot("celebration", [FIRST]));

    // Then: 保存は完了へ入った瞬間だけなので、記録は 1 件のまま
    expect(saveRecordMock).toHaveBeenCalledTimes(1);
  });
});
