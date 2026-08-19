/**
 * useTimerSync の単体テスト（#167 E4）。
 *
 * `docs/adr/0007` の追記は、抽象を導入する PR が差し替えるテストを同じ PR で
 * 追加することを条件にしている。App 経由の characterization test では
 * 「接続の生死」そのものを直接は見られないので、ここでフックだけを回す。
 *
 * @requirements #167（#72 E4）EARS 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimerSync } from "../../src/sync/use-timer-sync.js";
import type { Banner, BannerController } from "../../src/ui/use-banner.js";
import { saveRecord } from "../../src/records/indexeddb.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import type { CompletionRecord } from "@tasuki/timer-core";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

/** バナーの呼ばれ方だけを記録する差し替え。 */
function fakeBanner(): BannerController & { calls: string[] } {
  const calls: string[] = [];
  return {
    banner: null,
    show: (text) => void calls.push(`show:${text}`),
    clear: () => void calls.push("clear"),
    calls,
  };
}

/** show() に渡された引数まるごとを記録する差し替え（明示保存の失敗経路用）。 */
function fakeBannerRecordingArgs(): BannerController & {
  showCalls: Array<[string, Banner["kind"], { autoDismiss?: boolean } | undefined]>;
} {
  const showCalls: Array<[string, Banner["kind"], { autoDismiss?: boolean } | undefined]> = [];
  return {
    banner: null,
    show: (text, kind, options) => void showCalls.push([text, kind, options]),
    clear: () => {},
    showCalls,
  };
}

function latestSocket(): FakeWS {
  return FakeWS.instances[FakeWS.instances.length - 1]!;
}

/** テスト用の完成記録（永続化ポリシーの判断には使わないので中身は任意）。 */
const A_RECORD: CompletionRecord = {
  id: "rec-1",
  problemTitle: "FizzBuzz",
  language: "TypeScript",
  difficulty: "easy",
  elapsedSeconds: 300,
  members: ["Host"],
  totalSwitches: 0,
  completedAt: 1_000_000,
};

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(saveRecord).mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useTimerSync: 接続の状態", () => {
  it("初期状態は online で、ルームは無い", () => {
    // Given
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    // When / Then（result.current への問い合わせが検証と同じ式になる）
    expect(result.current.connState).toBe("online");
    expect(result.current.room).toBeNull();
    expect(result.current.mode).toBe("setup");
  });

  it("ルームを作ると WebSocket を 1 本だけ開く", () => {
    // Given
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    // When
    act(() => result.current.createRoom("Host"));
    // Then
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("接続が切れると connState が reconnecting になる（EARS 2）", () => {
    // Given
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    expect(result.current.connState).toBe("online");

    // When
    act(() => void ws.onclose?.());
    // Then
    expect(result.current.connState).toBe("reconnecting");
  });

  it("切断でバナーを出し、再確立で消す", () => {
    // Given
    const banner = fakeBanner();
    const { result } = renderHook(() => useTimerSync(banner));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    // When
    act(() => void ws.onclose?.());
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    // Then
    expect(banner.calls).toContain("show:接続が切れました。再接続しています...");
    expect(banner.calls[banner.calls.length - 1]).toBe("clear");
  });
});

describe("useTimerSync: メッセージの配線", () => {
  function connected() {
    const banner = fakeBanner();
    const hook = renderHook(() => useTimerSync(banner));
    act(() => hook.result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    const deliver = (msg: Record<string, unknown>) =>
      act(() => void ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent));
    return { ...hook, ws, banner, deliver };
  }

  it("snapshot を受け取ると room と画面が更新される（EARS 1）", () => {
    // Given
    const { result, deliver } = connected();
    // When
    deliver({ type: "snapshot", room: aRoomView({ code: "ROOM01", phase: "session" }) });
    // Then
    expect(result.current.room?.code).toBe("ROOM01");
    expect(result.current.mode).toBe("session");
  });

  it("identity を受け取ると participantId が入る", () => {
    // Given
    const { result, deliver } = connected();
    // When
    deliver({ type: "room.created", code: "ROOM01", hostToken: "ht", resumeToken: "rt", participantId: "me" });
    // Then
    expect(result.current.participantId).toBe("me");
  });

  it("room-not-found でセッション喪失になり、再接続しても戻らない（EARS 4）", () => {
    // Given
    const { result, ws, deliver } = connected();
    deliver({ type: "error", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(result.current.sessionLost).toBe(true);

    // When
    act(() => void ws.onclose?.());
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    // Then
    expect(result.current.sessionLost).toBe(true);
  });

  it("notice を受け取るとバナーを出す（EARS 3）", () => {
    // Given
    const { banner, deliver } = connected();
    // action は SignalNoticeMsg（packages/timer-core/src/schemas.ts）の picklist に
    // 実在する値でなければならない。ブリーフ原文の "driver.skip" はコマンド名であって
    // notice の action ではなく、実物とは食い違っていたため実在する値に差し替えている。
    // When
    deliver({
      type: "signal",
      signal: "notice",
      action: "session-aborted",
      actorName: "Host",
      actorParticipantId: "host-p",
    });
    // Then
    expect(banner.calls.some((c) => c.startsWith("show:"))).toBe(true);
  });
});

describe("useTimerSync: 明示保存の失敗経路", () => {
  it("saveRecordManually が失敗すると、文言・種別・自動消去なしでバナーを出す", async () => {
    // Given
    vi.mocked(saveRecord).mockRejectedValueOnce(new Error("boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const banner = fakeBannerRecordingArgs();
    const { result } = renderHook(() => useTimerSync(banner));

    // When
    await act(async () => {
      result.current.saveRecordManually(A_RECORD);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Then
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(banner.showCalls).toHaveLength(1);
    const [text, kind, options] = banner.showCalls[0]!;
    expect(text).toBe("記録の保存に失敗しました。");
    expect(kind).toBe("error");
    expect(options).toEqual({ autoDismiss: false });

    consoleErrorSpy.mockRestore();
  });

  it("saveRecordManually が成功すればバナーは出ない", async () => {
    // Given
    const banner = fakeBannerRecordingArgs();
    const { result } = renderHook(() => useTimerSync(banner));

    // When
    await act(async () => {
      result.current.saveRecordManually(A_RECORD);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Then
    expect(banner.showCalls).toHaveLength(0);
  });
});

describe("useTimerSync: 開始（お題なし）", () => {
  it("お題が無い状態でロビーから開始すると problem.request → phase.set → session.act の順で送る", () => {
    // Given
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    // 作成者（isCreator）だと、ロビーの snapshot だけで代表お題の自動依頼が別途走り、
    // startSession() 自身が送る problem.request と混ざって順序を確かめにくくなる。
    // ここでは非作成者として参加させ、startSession() の配線だけを見る。
    act(() => result.current.joinRoom("ROOM01", "Guest"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    const deliver = (msg: Record<string, unknown>) =>
      act(() => void ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent));
    deliver({ type: "room.joined", code: "ROOM01", resumeToken: "rt", participantId: "p-1" });
    deliver({ type: "snapshot", room: aRoomView({ code: "ROOM01", phase: "ready" }) });
    expect(result.current.mode).toBe("lobby");
    expect(result.current.room?.problem).toBeNull();

    // When
    const sendSpy = vi.spyOn(ws, "send");
    act(() => result.current.startSession());

    // Then
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(sent.map((m) => m.command)).toEqual(["problem.request", "phase.set", "session.act"]);
    expect(sent[0]!.requestId).toBe("req-ROOM01");
    expect(sent[1]!.phase).toBe("session");
    expect(sent[2]!.action).toBe("START");
  });
});

describe("useTimerSync: 後始末", () => {
  it("unmount で WebSocket を閉じる", () => {
    // Given
    const { result, unmount } = renderHook(() => useTimerSync(fakeBanner()));
    act(() => result.current.createRoom("Host"));
    const ws = latestSocket();
    const closeSpy = vi.spyOn(ws, "close");
    // When
    unmount();
    // Then
    expect(closeSpy).toHaveBeenCalled();
  });
});
