/**
 * 玄関・選択画面から `?view=history` で開いたときの入口配線（#95 S5c）。
 *
 * `decideEntry` 自体の分岐は `test/ui/entry.test.ts` が純粋関数として検証済み。
 * ここで見るのは、`App.tsx` が mount 時の URL を見て `History` を最優先で出し、
 * 「戻る」が `platform/location.js` 経由で戻り先 URL へ遷移することだけである。
 *
 * **`kind: "redirect"` の適用もここで見る（#95 S5c・R9）。** 旧入口（`Setup` / `Join`）を
 * 撤去したので、ルームコードを伴わない URL には行き先が無い。玄関（`/`）へ送る。
 * ルームコードはあるのに端末へ同一性が無いときも、名乗りはハブに 1 つだけあるので
 * **コードを落とさずに**玄関の参加画面へ送る。
 *
 * ## レビューで見つかった実害（#95 S5c）
 *
 * 選択画面の「記録を見る」は `?view=history&room=CODE` を作る。選択画面に居る人は
 * そのルームの `resumeIdentity` を必ず持っているため、`useTimerSync` の mount effect
 * （`?room=` を見て復帰する経路）が発火すると、履歴を見るだけのつもりで `room.join` が
 * 送られ、**在席が接続に紐づく設計**（#95 S4b）のもとでは他の参加者の名簿にその人が
 * 現れてしまう。下の 2 テストはこの経路を「送らないこと」と、対照として「?view= が
 * 無ければ従来どおり送ること」の両方で確かめる。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { saveResumeIdentity } from "@tasuki/sync-client";

vi.mock("../../src/records/indexeddb.js", () => ({
  loadRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

import App from "../../src/App.js";
import { navigateTo, redirectTo } from "../../src/platform/location.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import type { Problem } from "@tasuki/timer-core";

/** 完了記録が作られる条件を満たす最小のお題（お題が無いと Summary に記録が出ない）。 */
function problemA(): Problem {
  return {
    title: "FizzBuzz",
    description: "3 の倍数で Fizz",
    requirements: ["3 の倍数は Fizz"],
    exampleTest: "expect(add(1, 2)).toBe(3)",
    hints: [],
    source: "fallback",
  };
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  localStorage.clear();
  // **呼び出し履歴を明示的に捨てる。** `restoreMocks: true` は `vi.mock` のファクトリが
  // 作った `vi.fn()` の `mock.calls` までは確実に消さず、前のテストの遷移が次のテストへ
  // 漏れる（実測: 未実装のはずの遷移が「呼ばれている」で緑になった）。
  vi.mocked(navigateTo).mockClear();
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("App の入口配線（?view=history）", () => {
  it("Given 玄関から ?view=history で開いた / When 描画する / Then ルームに入らず履歴を出す", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history");

    // When
    render(<App />);

    // Then
    expect(await screen.findByText("完了記録の履歴")).toBeInTheDocument();
  });

  it("Given 玄関から開いた履歴 / When 戻るを押す / Then 玄関の URL へ遷移する", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history");
    render(<App />);
    await screen.findByText("完了記録の履歴");

    // When
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));

    // Then
    expect(navigateTo).toHaveBeenCalledWith("/");
  });

  it("Given 選択画面から ?view=history&room=CODE で開いた / When 戻るを押す / Then 同じルームの選択画面へ遷移する", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history&room=ROOM01");
    render(<App />);
    await screen.findByText("完了記録の履歴");

    // When
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));

    // Then
    expect(navigateTo).toHaveBeenCalledWith("/?room=ROOM01");
  });

  it("Given 選択画面の resumeIdentity を持っている / When ?view=history&room=CODE を開く / Then room.join を送らない", async () => {
    // Given: このルームの復帰の組が既に保存されている（選択画面に居た証拠）
    saveResumeIdentity({
      code: "ROOM-HIST",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?view=history&room=ROOM-HIST");

    // When: 記録だけを見るつもりで開く
    render(<App />);
    await screen.findByText("完了記録の履歴");

    // Then: 接続そのものが張られない（room.join はおろか WS も開かない）
    expect(FakeWS.instances).toHaveLength(0);
  });

  it("対照: Given 同じ resumeIdentity / When view の無い ?room=CODE を開く / Then room.join を送る", () => {
    // Given: 上のテストと同じ復帰の組（仕込みが効いていることの対照）。
    // 接続前にキューへ積まれるため、開く前から送信を見張る（App.resume-on-load.test.tsx と同じ作法）。
    saveResumeIdentity({
      code: "ROOM-HIST",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM-HIST");
    render(<App />);
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    const sendSpy = vi.spyOn(ws, "send");

    // When: 接続が開く
    ws.readyState = FakeWS.OPEN;
    act(() => {
      ws.onopen?.();
    });

    // Then: 同じ仕込みなら、view が無ければ従来どおり room.join を送る
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(raw as unknown as string) as Record<string, unknown>,
    );
    expect(sent).toContainEqual({
      command: "room.join",
      code: "ROOM-HIST",
      displayName: "ボブ",
      hasAiKey: false,
      resumeToken: "rt_1",
    });
  });
});

describe("App の入口配線（旧入口の撤去・R9）", () => {
  it("Given ルームコードが無い / When timer を開く / Then 玄関へ送られる", () => {
    // Given: `/timer/` を素で開いた（旧入口の Setup はもう無い）
    window.history.replaceState(null, "", "/");

    // When
    render(<App />);

    // Then: 画面を描かずに玄関へ送る。**replace で送る**（戻るで往復しないため）
    expect(redirectTo).toHaveBeenCalledWith("/");
    expect(FakeWS.instances, "行き先が無いのに接続を張っている").toHaveLength(0);
  });

  it("Given ルームコードはあるが端末に同一性が無い / When timer を開く / Then 玄関の参加画面へ送られる", () => {
    // Given: ハブを通らずに `/timer/?room=CODE` を直接開いた
    window.history.replaceState(null, "", "/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");

    // When
    render(<App />);

    // Then: 名乗りはハブに 1 つだけある。コードは落とさずに運ぶ
    expect(redirectTo).toHaveBeenCalledWith("/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");
    expect(FakeWS.instances, "名乗れないのに接続を張っている").toHaveLength(0);
  });

  /**
   * 完了後の「新しいセッション」（#95 S5c・C-1、行き先は #290・D5 で改めた）。
   *
   * **行き先だけを見るテストにしない。** 撤去の段では「同じルームの選択画面へ
   * `navigateTo` する」を固定していたが、**その行き先のルームは `phase` が
   * `celebration` のまま**で、戻ってきても Summary がまた出る閉路だった。
   * `navigateTo` の引数しか見ていなかったので、閉路であることを誰も見ていなかった。
   *
   * **ルームが生きているなら玄関へは送らない（#290）。** `phase.set` は在室者
   * 全員へ届くので、押した本人も他の全員と同じく snapshot でロビーへ戻る。ここで
   * 玄関へ遷移すると、押した本人だけがルームから出される食い違いが起きていた。
   * ここでは**ルームがロビーへ戻ること**と**玄関へは送られないこと**の両方を見る。
   */
  it("Given セッションを終えた / When 新しいセッションを選ぶ / Then ルームがロビーへ戻り、玄関へは送らない", () => {
    // Given: ROOM01 のセッションを完了し、Summary が出ている
    saveResumeIdentity({
      code: "ROOM01",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    ws.readyState = FakeWS.OPEN;
    act(() => {
      ws.onopen?.();
    });
    const deliver = (room: unknown) =>
      act(() => {
        ws.onmessage?.({ data: JSON.stringify({ type: "snapshot", room }) } as MessageEvent);
      });
    // **完了したセッションの時計は走ったままである**（`SessionCompleted` は集約を畳み込まない）。
    // 次の開始がこの状態から成立することまで見たいので、実物と同じ形を渡す
    const celebration = aRoomView({
      code: "ROOM01",
      phase: "celebration",
      problem: problemA(),
      clock: { running: true, runningSince: 1000, secondsLeftAtAnchor: 0 },
    });
    deliver(celebration);
    const sendSpy = vi.spyOn(ws, "send");

    // When
    fireEvent.click(screen.getByRole("button", { name: /新しいセッション/ }));

    // Then その1: **ルームをロビーへ戻す。** 送るコマンドそのものを見る ——
    //   `celebration` のまま残すと、同じルームへ戻ってきた人は timer を開くたび
    //   完了画面に着く（poker は使えるのに timer だけ死んだルームになる）
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(raw as unknown as string) as Record<string, unknown>,
    );
    expect(sent, "ロビーへ戻す phase.set").toContainEqual({ command: "phase.set", phase: "setup" });

    // Then その2: **玄関へは送らない**（#290・D5）。ルームは生きたままなので、
    //   押した本人も他の全員と同じく `phase.set` の snapshot でロビーへ戻る。
    //   ここで玄関へ遷移すると、押した本人だけがルームから出されてしまう。
    expect(redirectTo).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  /**
   * ロビーへ戻ったルームで、残った人が次のセッションを始められること（#95 S5c・C-1）。
   *
   * **完了したセッションの時計は走ったままである**（`SessionCompleted` は集約を
   * 畳み込まない）。この状態で `session.act START` を送ると `PhaseConflict` で弾かれる。
   */
  it("Given ロビーへ戻ったルーム（時計は走ったまま）/ When セッションを開始する / Then 弾かれない形で送る", () => {
    // Given
    saveResumeIdentity({
      code: "ROOM01",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    ws.readyState = FakeWS.OPEN;
    act(() => {
      ws.onopen?.();
    });
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "snapshot",
          room: aRoomView({
            code: "ROOM01",
            phase: "setup",
            problem: problemA(),
            clock: { running: true, runningSince: 1000, secondsLeftAtAnchor: 0 },
          }),
        }),
      } as MessageEvent);
    });
    const start = screen.getByRole("button", { name: /セッションを開始/ });
    expect(start, "お題があるのに開始できない").toBeEnabled();
    const sendSpy = vi.spyOn(ws, "send");

    // When
    fireEvent.click(start);

    // Then: 走行中の START は弾かれるので、**先頭・満タン・走行へ作り直す**方を送る
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(raw as unknown as string) as Record<string, unknown>,
    );
    expect(sent).toContainEqual({ command: "phase.set", phase: "session" });
    expect(sent, "新しいセッションの開始").toContainEqual({ command: "session.reset" });
    expect(
      sent.filter((f) => f.command === "session.act"),
      "走行中に START を送ると PhaseConflict で弾かれる",
    ).toEqual([]);
  });
});
