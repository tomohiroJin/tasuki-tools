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
import { screen, fireEvent, act, cleanup, renderHook } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { useTimerSync } from "../../src/sync/use-timer-sync.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";
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

/**
 * 玄関で名乗った端末としてルームを開き、接続済み FakeWS を返す（#95 S5c・R9）。
 *
 * 旧入口（`Setup`）を撤去したので、timer に「ルームを作る」画面はもう無い（作るのはハブ）。
 * **代表（お題を依頼する人）は「輪の先頭」で決まる**ようになったので、代表として
 * 振る舞わせたいテストは `session.rotation` の先頭をこの参加者にする。
 */
function enterRoomAsGuest(): FakeWS {
  return enterRoomAndConnect({ participantId: CREATOR_ID, displayName: "Creator" });
}

/** 自分（CREATOR_ID）が輪の先頭に居る＝お題の代表であることを表す session。 */
const SELF_LEADS_ROTATION = { rotation: [CREATOR_ID], currentIndex: 0, driverCounts: [0] };

beforeEach(() => {
  FakeWS.instances = [];
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
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
  localStorage.clear();
  sessionStorage.clear();
  clearPreferences();
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

describe("begin-generating: 設定が変わったら、輪の先頭でなくても生成中の表示に入る（#271）", () => {
  it("難易度が変わった snapshot を受けたら、お題カードが生成中になる", () => {
    // Given: お題のあるロビー。**輪の先頭は自分ではない**（旧実装ならここで何も起きなかった）
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const othersRotation = { rotation: [OTHER_ID, CREATOR_ID], currentIndex: 0, driverCounts: [0, 0] };
    const lobby = (difficulty: string) =>
      aRoomView({
        code: "ROOM01",
        phase: "ready",
        problem: problemA(),
        config: { difficulty },
        participants: [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Other")],
        session: othersRotation,
      });
    sendServer(ws, { type: "snapshot", room: lobby("easy") });
    // ロビーはタブで分かれている。お題カードは「お題」タブの側にある。
    fireEvent.click(screen.getByRole("tab", { name: "お題" }));
    expect(screen.getByRole("group", { name: "お題" })).not.toHaveAttribute("aria-busy");

    // When: 誰かが難易度を変えた（サーバーが作り直す）
    sendServer(ws, { type: "snapshot", room: lobby("hard") });

    // Then: 待っていることが見える
    expect(screen.getByRole("group", { name: "お題" })).toHaveAttribute("aria-busy", "true");
  });

  it("依頼そのものは送らない（作り直すのはサーバー・#271）", () => {
    // Given
    const ws = enterRoomAsGuest();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    const sendSpy = vi.spyOn(ws, "send");

    // When: お題の無いロビー（旧実装なら代表として依頼を送っていた場面）
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

describe("consume-driver-join: 参加時ドライバー宣言は一度きりで、輪から外れても再送しない", () => {
  it("宣言を消費した後は、自分が輪から外れた snapshot が来ても member.add を再送しない", () => {
    // Given: ドライバーを宣言して参加する。
    // ⚠ **この `joinRoom()` は製品からは到達しない**（#95 S5c・I-4）。呼び手だった
    // `Join` 画面を撤去し、名乗りはハブに移った。宣言を受け取る配線はフックに残って
    // いるが、**叩く利用者はもう居ない**。一掃は別 Issue が持つ。ここは撤去の前後で
    // 配線が変わっていないことの記録として残している。
    const { result } = renderHook(() =>
      useTimerSync({ banner: null, show: () => {}, clear: () => {} }),
    );
    act(() => result.current.joinRoom("ROOM01", "Guest", "", "driver"));
    const ws = openLatestSocket();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: OTHER_ID });

    // 自分を含む最初の snapshot（rotation 未加入）→ 宣言を消費し member.add を1回送る
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        participants: [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Guest")],
        session: { rotation: [CREATOR_ID], driverCounts: [0] },
      }),
    });

    // When: 自分が輪から外れた（skip 等で rotation から消えた）snapshot が続けて届く
    const sendSpy = vi.spyOn(ws, "send");
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        participants: [participant(CREATOR_ID, "Creator"), participant(OTHER_ID, "Guest")],
        session: { rotation: [CREATOR_ID], driverCounts: [0] },
      }),
    });

    // Then: 宣言は最初の snapshot で消費済みなので、2 回目では member.add を送らない
    const added = sentFrames(sendSpy).filter((f) => f.command === "member.add");
    expect(added).toEqual([]);
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
