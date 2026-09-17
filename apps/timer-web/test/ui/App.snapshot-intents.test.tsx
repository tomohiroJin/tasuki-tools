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
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import { saveRecord as saveRecordMock } from "../../src/records/indexeddb.js";
import type { Problem } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

const CREATOR_ID = "p-alice";
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

/** 自分（CREATOR_ID）が輪の先頭に居る session（#271 より前は「お題の代表」だった）。 */
const SELF_LEADS_ROTATION = { rotation: [CREATOR_ID], currentIndex: 0, driverCounts: [0] };

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
  it("完成（中断でない）なら記録が保存される", () => {
    // Given
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });

    // When
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        problem: problemA(),
        participants: [participant(CREATOR_ID, "Creator")],
      }),
    });

    // Then
    expect(saveRecordMock).toHaveBeenCalledTimes(1);
  });

  it("中断（abort）後の celebration では saveRecord が呼ばれない（既存の否定側を壊さない）", () => {
    // Given
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "session",
        problem: problemA(),
        participants: [participant(CREATOR_ID, "Creator")],
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
        problem: problemA(),
        participants: [participant(CREATOR_ID, "Creator")],
      }),
    });

    // Then
    expect(saveRecordMock).not.toHaveBeenCalled();
  });
});

describe("設定変更: 依頼も待ちの表示もクライアントは持たない（#271）", () => {
  it("設定変更と作り直したお題が同じ tick で届いても、生成中に固まらない（#271 レビュー）", () => {
    // Given: お題のあるロビー。
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const othersRotation = { rotation: [OTHER_ID, CREATOR_ID], currentIndex: 0, driverCounts: [0, 0] };
    const lobby = (difficulty: string, problem: Problem) =>
      aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem,
        config: { difficulty },
        participants: [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Other")],
        session: othersRotation,
      });
    sendServer(ws, { type: "snapshot", room: lobby("easy", problemA()) });
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));

    // When: サーバーは設定変更の snapshot と、作り直したお題の snapshot を**続けて**送る。
    //
    // **1 つの act に入れるのが要点である。** 本番では 2 フレームが同じ読み取りで届き、
    // 間に再描画が挟まらない。`sendServer` を 2 回呼ぶと act ごとに描画されてしまい、
    // この競合は再現しない（それを見落として、生成中が永久に降りない欠陥を通した）。
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: "snapshot", room: lobby("hard", problemA()) }) } as MessageEvent);
      ws.onmessage?.({
        data: JSON.stringify({ type: "snapshot", room: lobby("hard", { ...problemA(), title: "別のお題" }) }),
      } as MessageEvent);
    });

    // Then: お題は差し替わり、パネルは操作できる状態に戻っている
    expect(screen.getByRole("heading", { level: 3, name: "別のお題" })).toBeDefined();
    expect(screen.getByRole("group", { name: "お題" })).not.toHaveAttribute("aria-busy");
  });

  it("依頼そのものは送らない（作り直すのはサーバー・#271）", () => {
    // Given
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const sendSpy = vi.spyOn(ws, "send");

    // When: お題の無いロビー（#271 より前なら代表として依頼を送っていた場面）
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem: null,
        participants: [participant(CREATOR_ID, "Creator")],
        session: SELF_LEADS_ROTATION,
      }),
    });

    // Then
    expect(sentFrames(sendSpy).filter((f) => f.command === "problem.request")).toEqual([]);
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
 * 操作の中に置くと、**押していない端末では `recordSaved` が立ったまま**になり、
 * 2 本目の完成で自分の端末に記録が保存されない（FR-020 の自動保存）。`record` も
 * 前回のままなので、2 本目の完了画面に**1 本目の記録**が出る。
 *
 * ここは**何も押さない端末**を演じる。押す側の操作は 1 つも呼ばない。
 */
describe("clear-completion: 開始を押していない端末でも、2 本目の記録が残る", () => {
  const ROTATION = { rotation: [CREATOR_ID, OTHER_ID], currentIndex: 0 };
  const PARTICIPANTS = [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Other")];

  /** 完成フェーズの snapshot。交代回数で 1 本目と 2 本目を見分ける。 */
  function celebration(totalSwitches: number, driverCounts: number[]) {
    return {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "celebration",
        problem: problemA(),
        participants: PARTICIPANTS,
        session: { ...ROTATION, totalSwitches, driverCounts },
      }),
    };
  }

  it("2 本目の完成で記録が保存され、完了画面にも 2 本目の記録が出る", () => {
    // Given: 何も押さない端末で 1 本目が完成している
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, celebration(1, [1, 0]));
    expect(saveRecordMock, "1 本目が保存されていない").toHaveBeenCalledTimes(1);
    // **`getAllBy` で受ける。** 「N 回」は交代回数のカードとドライバー別の棒の両方に出る
    expect(screen.getAllByText("1回"), "1 本目の交代回数").not.toHaveLength(0);

    // When: 誰かがロビーへ戻し、誰かが開始し、2 本目が完成する。
    //       **この端末は 1 度も操作していない**
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        phase: "setup",
        problem: problemA(),
        participants: PARTICIPANTS,
        session: { ...ROTATION, totalSwitches: 1, driverCounts: [1, 0] },
      }),
    });
    sendServer(ws, celebration(9, [5, 4]));

    // Then その1: 2 本目もこの端末に保存される（FR-020 の自動保存）
    expect(saveRecordMock, "2 本目が保存されていない").toHaveBeenCalledTimes(2);

    // Then その2: 完了画面に出るのは**2 本目**の記録である
    expect(screen.getAllByText("9回"), "2 本目の交代回数").not.toHaveLength(0);
    expect(screen.queryAllByText("1回"), "1 本目の記録が残っている").toHaveLength(0);
  });

  it("完了から抜けていなければ畳まない（同じ完成の snapshot が 2 度来ても二重保存しない）", () => {
    // Given: 1 本目が完成している
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, celebration(1, [1, 0]));

    // When: 在席の変化などで、同じ完成フェーズの snapshot がもう一度届く
    sendServer(ws, celebration(1, [1, 0]));

    // Then: 畳むのは phase が完了から抜けたときだけなので、記録は 1 件のまま
    expect(saveRecordMock).toHaveBeenCalledTimes(1);
  });
});
