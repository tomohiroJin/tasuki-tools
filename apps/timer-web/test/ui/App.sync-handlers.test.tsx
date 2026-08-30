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
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { loadResumeIdentity } from "../../src/sync/resume-identity.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

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
vi.mock("../../src/ai/no-ai.js", () => ({
  NoAiProvider: class {
    generate(language: string, difficulty: string) {
      return generateSpy(language, difficulty);
    }
  },
}));

const HOST_ID = "host-1";
const OTHER_ID = "other-1";

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

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  // Join/Setup は前回の名前を localStorage から復元する。テスト間で漏らさない。
  clearPreferences();
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
  sessionStorage.clear();
  clearPreferences();
  // ?room= を次のテストへ持ち越さない（App は初回 useEffect で URL を読む）。
  window.history.replaceState(null, "", "/");
});

/** Setup 画面から「ルームを作る」まで進め、接続済み FakeWS を返す。 */
function createRoomAndConnect(): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  return openLatestSocket();
}

describe("SyncClient コールバックが最新の state を読む経路（Issue #46）", () => {
  it("onError/leave-room: 退出させられたとき直前のルームコードが参加画面へ引き継がれる", () => {
    // Given: ROOM01 のロビーに居る
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", hostParticipantId: HOST_ID, participants: [participant(HOST_ID, "Host")] }),
    });

    // When: ホストに退出させられた（destination: "join"）
    sendServer(ws, { type: "error", code: "REMOVED_BY_HOST", message: "removed" });

    // Then: 参加画面へ移り、直前のルームコード（room?.code から解決）が引き継がれている
    // （Join.tsx はコードを見出しではなく本文の span に出す）
    expect(screen.getByRole("heading", { name: "モブに参加" })).toBeInTheDocument();
    expect(screen.getByText(/ROOM01/)).toBeInTheDocument();
  });

  it("onRoom: snapshot に自分が現れたら member.add を1回だけ送る（driver 宣言）", () => {
    // Given: ?room= からドライバーとして参加する
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Guest" } });
    fireEvent.click(screen.getByRole("radio", { name: "ドライバーとして参加" }));
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    const ws = openLatestSocket();
    sendServer(ws, { type: "room.joined", code: "ROOM01", resumeToken: "rt", participantId: OTHER_ID });

    // When: 自分を含む snapshot が届く（rotation には未加入）
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

    // Then: 自分の participantId（onIdentity で確定した最新値）で member.add が飛ぶ
    // FakeWS.send() は引数なし宣言のため mock.calls の要素型は空タプル []。
    // 実際には JSON 文字列1個で呼ばれるので、既存 App.state-ref.test.tsx と同じ
    // キャストで実際の呼び出し形（[string][]）に合わせる。
    const added = (sendSpy.mock.calls as unknown as [string][])
      .map(([raw]) => JSON.parse(raw))
      .filter((c) => c.command === "member.add");
    expect(added).toEqual([{ command: "member.add", participantId: OTHER_ID }]);
  });

  it("onRoom: room.created の resumeToken が snapshot の room.code と組で保存される", () => {
    // Given
    const ws = createRoomAndConnect();
    // When: 識別情報と snapshot を受け取る
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt-1", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({ code: "ROOM01", hostParticipantId: HOST_ID, participants: [participant(HOST_ID, "Host")] }),
    });

    // Then: onIdentity で預けた token が、onRoom の room.code と結合して保存される
    expect(loadResumeIdentity()).toEqual({
      code: "ROOM01",
      participantId: HOST_ID,
      resumeToken: "rt-1",
      displayName: "Host",
    });
  });

  it("onNeedProblem: 生成にはロビーで設定された最新の言語・難易度が渡る", async () => {
    // Given: ロビーの設定が Python / hard に変わっている
    const ws = createRoomAndConnect();
    sendServer(ws, { type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: HOST_ID });
    sendServer(ws, {
      type: "snapshot",
      room: aRoomView({
        code: "ROOM01",
        hostParticipantId: HOST_ID,
        participants: [participant(HOST_ID, "Host")],
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

    // Then: 生成時の引数が room.config の最新値になっている
    await waitFor(() => expect(generateSpy).toHaveBeenCalledWith("Python", "hard"));

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
