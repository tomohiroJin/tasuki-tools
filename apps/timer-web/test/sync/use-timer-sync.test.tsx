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
import { joinRetryDelayMs, JOIN_RETRY_MAX_ATTEMPTS } from "../../src/sync/join-retry.js";
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

describe("混雑で入室を拒まれたとき", () => {
  /** バナーを差し替えて接続済みにする（上の describe のものとは別に持つ）。 */
  function connectedWith(banner: BannerController) {
    const hook = renderHook(() => useTimerSync(banner));
    act(() => hook.result.current.createRoom("Host"));
    const ws = latestSocket();
    act(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.();
    });
    const deliver = (msg: Record<string, unknown>) =>
      act(() => void ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent));
    return { ...hook, ws, deliver };
  }

  /** 保存済みの識別情報を置く（再接続時の再送と同じ材料）。 */
  function seedResumeIdentity() {
    sessionStorage.setItem(
      "tdd-mob:resume-identity",
      JSON.stringify({ code: "ROOM01", participantId: "me", resumeToken: "rt", displayName: "私" }),
    );
  }

  /**
   * その回に起こりうる最大の待ち時間（ms）。ばらつきの上端を取る。
   * **待ち時間や上限回数をテストへ直書きしない** — 方針を変えたときに、
   * 実装と無関係な理由でここが赤くなる（または見逃す）。
   */
  function maxDelayOf(attempt: number): number {
    return joinRetryDelayMs(attempt, () => 0.999999) ?? 0;
  }

  /** 送信された command 名の一覧。 */
  function sentCommands(send: { mock: { calls: unknown[][] } }): string[] {
    return send.mock.calls
      .map((c: unknown[]) => {
        try {
          return (JSON.parse(String(c[0])) as { command?: string }).command ?? "";
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }

  it("すぐには送り直さず、待ってから room.join を自動で送り直す", () => {
    // Given: 保存済みの識別情報があり、入室が混雑で拒まれた
    vi.useFakeTimers();
    try {
      seedResumeIdentity();
      const { ws, deliver } = connectedWith(fakeBanner());
      const send = vi.spyOn(ws, "send");
      deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });
      // Then: 即時の再送はしない（素朴な再試行はバケツを消費し続ける）
      expect(sentCommands(send)).not.toContain("room.join");
      // When: 1 回目の待ち時間の上限ぶん進める（**方針から導く。直書きしない**）
      act(() => void vi.advanceTimersByTime(maxDelayOf(1) + 100));
      // Then
      expect(sentCommands(send)).toContain("room.join");
    } finally {
      vi.useRealTimers();
    }
  });

  it("待っていることが分かるバナーを出し、自動では消さない", () => {
    // Given
    vi.useFakeTimers();
    try {
      seedResumeIdentity();
      const banner = fakeBannerRecordingArgs();
      const { deliver } = connectedWith(banner);
      // When
      deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });
      // Then: 4 秒で消える一時バナーだと「待てば入れる」ことが伝わらない
      const last = banner.showCalls[banner.showCalls.length - 1];
      expect(last?.[2]?.autoDismiss).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("待機中に退室したら、その後に諦めのバナーを出さない", () => {
    // Given: 混雑で弾かれて再試行を待っている最中に、退室が成立する
    vi.useFakeTimers();
    try {
      seedResumeIdentity();
      const banner = fakeBannerRecordingArgs();
      const { deliver } = connectedWith(banner);
      deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });
      // When: 退室（保存済みの識別情報はここで破棄される）
      deliver({ type: "error", code: "LEFT_ROOM", message: "退出しました" });
      act(() => void vi.advanceTimersByTime(maxDelayOf(1) + 100));
      // Then: すでに入口へ戻っている画面へ、無関係な固定バナーを後から出さない
      const texts = banner.showCalls.map((c) => c[0]);
      expect(texts[texts.length - 1]).not.toMatch(/混雑が続いています/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("待機中にセッションを失ったら、その後に諦めのバナーを出さない", () => {
    // Given: 混雑で弾かれて再試行を待っている最中に、ルームが消える
    vi.useFakeTimers();
    try {
      seedResumeIdentity();
      const banner = fakeBannerRecordingArgs();
      const { deliver } = connectedWith(banner);
      deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });
      // When
      deliver({ type: "error", code: "ROOM_NOT_FOUND", message: "no room" });
      act(() => void vi.advanceTimersByTime(maxDelayOf(1) + 100));
      // Then: 喪失の表示は SessionLost 画面が担う。バナーで上書きしない
      const texts = banner.showCalls.map((c) => c[0]);
      expect(texts[texts.length - 1]).not.toMatch(/混雑が続いています/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("試行を使い切ったら、何をすれば入れるかを伝えて再送をやめる", () => {
    // Given
    vi.useFakeTimers();
    try {
      seedResumeIdentity();
      const banner = fakeBannerRecordingArgs();
      const { ws, deliver } = connectedWith(banner);
      const send = vi.spyOn(ws, "send");
      // When: 拒まれるたびに待ち、上限回数を超えるまで繰り返す
      const rounds = JOIN_RETRY_MAX_ATTEMPTS + 2;
      for (let i = 0; i < rounds; i++) {
        deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });
        act(() => void vi.advanceTimersByTime(maxDelayOf(JOIN_RETRY_MAX_ATTEMPTS) + 100));
      }
      const attempts = sentCommands(send).filter((c) => c === "room.join").length;
      // Then: 際限なく送らない（上限も方針から導く）
      expect(attempts).toBeLessThanOrEqual(JOIN_RETRY_MAX_ATTEMPTS);
      // Then: 利用者が次に取れる手立てが画面に出る
      const lastCall = banner.showCalls[banner.showCalls.length - 1];
      expect(lastCall?.[0]).toMatch(/再読込|読み込み直/);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * 契約に合わない同期フレームを捨てたことを、利用者へ表出できる形で持つ。
 *
 * **`snapshot` の棄却はほぼ必ず継続する。** 契約に合わない値はサーバー側のルームに
 * 残り続けるため、以後すべての `snapshot` が捨てられ、画面は生きて見えたまま
 * 古い状態で固まる。ここで見るのは「固まっていることが状態として出ているか」と、
 * 「まだルームに入れていない間も伝わるか」である。
 *
 * @requirements #209
 */
describe("useTimerSync: 捨てた同期フレームの表出", () => {
  /** show の引数と clear の両方を記録する差し替え。 */
  function recordingBanner(): BannerController & {
    shown: Array<[string, Banner["kind"], { autoDismiss?: boolean } | undefined]>;
    cleared: number;
  } {
    const shown: Array<[string, Banner["kind"], { autoDismiss?: boolean } | undefined]> = [];
    const state = { banner: null, shown, cleared: 0 } as BannerController & {
      shown: typeof shown;
      cleared: number;
    };
    state.show = (text, kind, options) => void shown.push([text, kind, options]);
    state.clear = () => void (state.cleared += 1);
    return state;
  }

  /** 接続だけ済ませた状態。**まだ snapshot は届いていないので room は無い。** */
  function connected(banner: BannerController = fakeBanner()) {
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

  const aValidSnapshot = () => ({ type: "snapshot", room: aRoomView({ code: "ROOM01" }) });

  /**
   * ADR 0005 の追記が挙げた実際の経路と同じ壊し方をする。
   * `config.members` の要素は `displayNameStr`（最小長 1）なので、空文字が載ると落ちる。
   */
  function aFrameThatViolatesTheContract(): Record<string, unknown> {
    const room = aRoomView({ code: "ROOM01" });
    return { type: "snapshot", room: { ...room, config: { ...room.config, members: [""] } } };
  }

  /** ルームの状態を載せていないフレームの棄却（交代シグナルの `nextDriverName` 欠落）。 */
  const aDroppedSignal = () => ({ type: "signal", signal: "switch" });

  it("初期状態では同期は古くない", () => {
    // Given
    const { result } = connected();
    // Then
    expect(result.current.syncStale).toBe(false);
  });

  it("ルームの中身で落ちたフレームを捨てると同期が古い状態になる", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aValidSnapshot());
    // When
    deliver(aFrameThatViolatesTheContract());
    // Then
    expect(result.current.syncStale).toBe(true);
  });

  /**
   * **一過性の棄却で警告を立てない。** サーバーに定期 `snapshot` 配信は無いので、
   * 一度立てると次に誰かが操作するまで下りない。画面が古くならない棄却では立てない。
   */
  it("ルームの状態を載せていないフレームの棄却では古い状態にしない", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aValidSnapshot());
    // When
    deliver(aDroppedSignal());
    // Then
    expect(result.current.syncStale).toBe(false);
  });

  it("捨てたフレームの中身は画面に入らない（前の状態のまま固まる）", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aValidSnapshot());
    // When
    deliver(aFrameThatViolatesTheContract());
    // Then（捨てられたので room は前のまま）
    expect(result.current.room?.config.members).toEqual(["Host"]);
  });

  it("有効な snapshot を受け取ると同期が古い状態から戻る", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aFrameThatViolatesTheContract());
    expect(result.current.syncStale).toBe(true);
    // When
    deliver(aValidSnapshot());
    // Then
    expect(result.current.syncStale).toBe(false);
  });

  /**
   * **点滅の回帰テスト。** クライアントは 10 秒ごとに `time.ping` を送り、
   * `time.pong` が返る。`snapshot` だけが落ち続ける状況で「有効なフレームが来たら
   * 解除」にすると、pong のたびに表示が消えて次の snapshot で戻る。
   * 解除条件は「画面が実際に新しい状態を得たとき」に限る。
   */
  it("time.pong を受け取っても同期が古い状態は戻らない", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aFrameThatViolatesTheContract());
    expect(result.current.syncStale).toBe(true);
    // When
    deliver({ type: "time.pong", serverTime: 1_000 });
    // Then
    expect(result.current.syncStale).toBe(true);
  });

  /**
   * **StatusStrip はルームに入るまで描画されない**（`App.tsx` が
   * `mode !== "setup" && mode !== "join"` を条件にしている）。そして `mode` を動かすのは
   * 有効な `snapshot` だけなので、**最初の `snapshot` を捨てると表示する場所が無い。**
   * その間だけバナーで補う。
   */
  it("ルームに入る前の棄却は、消えないバナーで伝える", () => {
    // Given
    const banner = recordingBanner();
    const { deliver } = connected(banner);
    // When（room がまだ無い状態で最初の snapshot が落ちる）
    deliver(aFrameThatViolatesTheContract());
    // Then
    expect(banner.shown).toHaveLength(1);
    const [text, kind, options] = banner.shown[0]!;
    expect(text).toContain("同期できていません");
    expect(kind).toBe("warn");
    // 継続する異常なので、時間で消してはいけない
    expect(options?.autoDismiss).toBe(false);
  });

  it("ルームに入った後の棄却ではバナーを出さない（StatusStrip に任せる）", () => {
    // Given
    const banner = recordingBanner();
    const { deliver } = connected(banner);
    deliver(aValidSnapshot());
    const before = banner.shown.length;
    // When
    deliver(aFrameThatViolatesTheContract());
    // Then
    expect(banner.shown.length).toBe(before);
  });

  it("ルームに入れたらバナーを消す", () => {
    // Given
    const banner = recordingBanner();
    const { deliver } = connected(banner);
    deliver(aFrameThatViolatesTheContract());
    const before = banner.cleared;
    // When
    deliver(aValidSnapshot());
    // Then
    expect(banner.cleared).toBeGreaterThan(before);
  });

  /**
   * ルーム由来の画面状態は退出・やり直しで畳む（FR-128 と同じ扱い）。
   * 持ち越すと、次のルームに入った瞬間に前のルームの警告が出る。
   */
  it("新しいセッションを始めると古い状態を持ち越さない", () => {
    // Given
    const { result, deliver } = connected();
    deliver(aFrameThatViolatesTheContract());
    expect(result.current.syncStale).toBe(true);
    // When
    act(() => result.current.newSession());
    // Then
    expect(result.current.syncStale).toBe(false);
  });
});
