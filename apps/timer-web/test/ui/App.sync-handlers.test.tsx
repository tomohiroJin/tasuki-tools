/**
 * `sync/use-timer-sync.ts` の SyncClient コールバックが「最新の state」を読む経路の
 * characterization test（Issue #46）。
 *
 * `makeClient` のコールバックは生成時の値で固定される（closure）ため、最新の state を
 * 読むには特別な作法が要る。Issue #46 はその作法を「state の写し ref（latestRef）」から
 * 「最新ハンドラ束への転送」へ入れ替えるリファクタで、読み取る値も同期タイミングも変えない。
 *
 * 既存の `App.state-ref.test.tsx`（Issue #41 の安全網）が覆っていない経路を、
 * リファクタ着手前にここで固定する。`App.state-ref.test.tsx` は #41 の成果物として
 * 内容を変えず、本ファイルを足す形にしている（テストを書き換えると「実装が正しいから
 * 緑」なのか「テストを直したから緑」なのかが切り分けられなくなるため）。
 *
 * 本ファイルは `<App />` を描画するブラックボックステストであり、対象のコールバックが
 * `App.tsx` から `sync/use-timer-sync.ts` の `makeClient` へ移設された後も、
 * 内部実装の在り処によらず経路を外側から検証し続けている。
 *
 * @requirements Issue #46 REQ-6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";
import { loadResumeIdentity } from "@tasuki/sync-client";
import { redirectTo } from "../../src/platform/location.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

// 遷移は `platform/location.ts` に閉じている（#95 S5c・R9）。テストはそこを差し替える。
vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

// お題生成に渡る言語・難易度は、生成結果（pickFallback）からは観測できない
// （時刻ベースの疑似ランダム選択で、言語が一致しなければ全件から選ぶため）。
// プロバイダの境界だけを差し替えて「何が渡されたか」を直接観測する。
const generateSpy = vi.fn();
/** generateSpy の解決値。`beforeEach` で毎回張り直す（下記コメント参照）。 */
function stubGenerateResolvedValue(): void {
  generateSpy.mockResolvedValue({
    problem: {
      title: "定型",
      description: "定型のお題",
      requirements: [],
      exampleTest: "expect(add(1, 2)).toBe(3)",
      hints: [],
      source: "fallback",
    },
    source: "fallback",
  });
}
// ⚠ **引数は 1 つ残らず転送すること。** かつてここは `generate(language, difficulty)` の
// 2 つだけを転送していた。#283 で「直前のお題」を足したとき、**造作が黙って落として
// いたせいで配線が切れても緑のまま**だった（型検査はテスト造作を拾わない）。
vi.mock("../../src/ai/no-ai.js", () => ({
  NoAiProvider: class {
    generate(...args: unknown[]) {
      return generateSpy(...args);
    }
  },
}));

const CREATOR_ID = "p-alice";

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

beforeEach(() => {
  FakeWS.instances = [];
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  // vitest.config.ts の restoreMocks: true により、各テスト開始前に
  // generateSpy の実装（mockResolvedValue）が自動で剥がされる（mockClear では戻らない）。
  // 剥がされた状態のまま onNeedProblem を呼ぶと provider.generate() が undefined を返し、
  // App.tsx 側の分割代入が例外になって catch に落ちる（problem.submit まで届かない）。
  // ここで毎回張り直すことで、restoreMocks の影響を受けず解決値を保証する。
  generateSpy.mockReset();
  stubGenerateResolvedValue();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  // ?room= を次のテストへ持ち越さない（App は初回 useEffect で URL を読む）。
  window.history.replaceState(null, "", "/");
});

/** 玄関で名乗った端末としてルームを開き、接続済み FakeWS を返す（#95 S5c・R9）。 */
function createRoomAndConnect(): FakeWS {
  return enterRoomAndConnect({ participantId: CREATOR_ID });
}

describe("SyncClient コールバックが最新の state を読む経路（Issue #46）", () => {
  it("onError/leave-room: 退出させられたとき直前のルームコードが玄関へ引き継がれる", () => {
    // Given: ROOM01 のロビーに居る
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", participants: [participant(CREATOR_ID, "Creator")] }),
    });

    // When: 他の参加者に退出させられた（destination: "join"）
    sendServer(ws, { type: "error", code: "REMOVED_BY_HOST", message: "removed" });

    // Then その1: 玄関のそのルームへ送られ、直前のルームコード（room?.code から解決）が
    // 引き継がれている（#95 S5c・R9。撤去前は timer 自身の `Join` 画面へ移していた）
    // Then その2: **外されたことを玄関へ運ぶ**（#95 S5c・I-1）。ここが無いと、
    // 外された人は説明抜きで名乗りの画面に着き、また参加してまた外される
    expect(redirectTo).toHaveBeenCalledWith("/?room=ROOM01&left=removed");
  });

  it("onRoom: room.joined の resumeToken が snapshot の room.code と組で保存される", () => {
    // Given
    const ws = createRoomAndConnect();
    // When: 識別情報と snapshot を受け取る
    sendServer(ws, { type: "room.joined", resumeToken: "rt-1", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", participants: [participant(CREATOR_ID, "Creator")] }),
    });

    // Then: onIdentity で預けた token が、onRoom の room.code と結合して保存される
    expect(loadResumeIdentity("ROOM01")).toEqual({
      code: "ROOM01",
      participantId: CREATOR_ID,
      resumeToken: "rt-1",
      displayName: "Creator",
    });
  });

  it("onNeedProblem: 生成にはロビーで設定された最新の言語・難易度が渡る", async () => {
    // Given: ロビーの設定が Python / hard に変わっている
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.joined", resumeToken: "rt", participantId: CREATOR_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        participants: [participant(CREATOR_ID, "Creator")],
        config: { language: "Python", difficulty: "hard" },
        problem: {
          title: "既存",
          description: "既存のお題",
          requirements: [],
          exampleTest: "expect(add(1, 2)).toBe(3)",
          hints: [],
          source: "fallback",
        },
      }),
    });

    // When: 代表に選ばれる（need-problem）
    const sendSpy = vi.spyOn(ws, "send");
    sendServer(ws, { type: "signal", signal: "need-problem", requestId: "req-1", deadlineMs: 60000 });

    // Then: 生成時の引数が room.config の最新値になっている。
    // **3 つ目（直前のお題）まで見る**（#283 のレビュー）—— 定型バンクから選ぶ実装は
    // これを候補から外すので、渡し忘れると「別のお題にする」が同じお題を返しうる。
    // 送信元の端末では生成中の snapshot が確定と同じ描画に畳まれるため、
    // **結果が変わること以外に押したことが画面に出る手段が無い**。
    await waitFor(() =>
      expect(generateSpy).toHaveBeenCalledWith(
        "Python",
        "hard",
        expect.objectContaining({ title: "既存" }),
      ),
    );

    // Then: ハンドラが catch に落ちず最後まで走り、生成結果が problem.submit として
    // サーバーへ送られる（requestId は need-problem のものを引き継ぐ）。
    await waitFor(() => {
      // FakeWS.send() は引数なし宣言のため mock.calls の要素型は空タプル []。
      // 上と同じキャストで実際の呼び出し形（[string][]）に合わせる。
      const submitted = (sendSpy.mock.calls as unknown as [string][])
        .map(([raw]) => JSON.parse(raw))
        .filter((c) => c.command === "problem.submit" && c.requestId === "req-1");
      expect(submitted).toHaveLength(1);
    });
  });
});
