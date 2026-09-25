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
import { redirectTo } from "../../src/platform/location.js";
import { aRoomView, aRecordWithUnresolvableName } from "../support/room-view.js";
import { clearResumeIdentity, joinRetryDelayMs, saveResumeIdentity } from "@tasuki/sync-client";

// 遷移は `platform/location.ts` に閉じている（#95 S5c・R9）。テストはそこを差し替える。
vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

/**
 * 諦めるまでの試行回数を、**公開された振る舞いから導く**。
 *
 * `JOIN_RETRY_MAX_ATTEMPTS` は export していない（製品コードで読む場所が無く、
 * テストのためだけの公開になるため）。上限は「`null` が返り始める回」として
 * 外から観測できる —— 値の写しを持つより、振る舞いを通るぶん壊れにくい。
 */
function maxAttempts(): number {
  for (let n = 1; n <= 100; n++) {
    if (joinRetryDelayMs(n, () => 0.5) === null) return n - 1;
  }
  throw new Error("上限が見つからない（100 回試しても null が返らなかった）");
}

/** 上限（公開された振る舞いから導く）。 */
const JOIN_RETRY_MAX_ATTEMPTS = maxAttempts();
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

/** 玄関で名乗った端末が開く URL のルームコード。 */
const ENTERED_ROOM_CODE = "ROOM01";

/**
 * 玄関で名乗った端末としてフックを起こし、接続済みの FakeWS を返す（#272）。
 *
 * **`createRoom` / `joinRoom` は #272 で畳んだ。** ルームを作るのも名乗るのも玄関
 * （`apps/landing`）の仕事になり、timer が接続を張る経路は入口の effect 1 つだけに
 * なった —— 復帰の組を置いて `?room=CODE` を開く、という実物と同じ Given を通す。
 */
function enterRoom(
  banner: BannerController,
  options: { code?: string; participantId?: string; displayName?: string; resumeToken?: string } = {},
) {
  const {
    code = ENTERED_ROOM_CODE,
    participantId = "me",
    displayName = "Creator",
    resumeToken = "rt",
  } = options;
  saveResumeIdentity({ code, participantId, resumeToken, displayName });
  window.history.replaceState(null, "", `/?room=${encodeURIComponent(code)}`);
  const hook = renderHook(() => useTimerSync(banner));
  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  if (ws === undefined) {
    throw new Error("ルームへ入る接続が張られませんでした（入口の判定が変わった可能性）。");
  }
  act(() => {
    ws.readyState = FakeWS.OPEN;
    ws.onopen?.();
  });
  const deliver = (msg: Record<string, unknown>) =>
    act(() => void ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent));
  return { ...hook, ws, deliver };
}

/** テスト用の完成記録（永続化ポリシーの判断には使わないので中身は任意）。 */
const A_RECORD: CompletionRecord = {
  id: "rec-1",
  topicTitle: "FizzBuzz",
  elapsedSeconds: 300,
  members: ["Creator"],
  totalSwitches: 0,
  completedAt: 1_000_000,
};

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  // 復帰の組は localStorage に残る（#95 S4b）。テスト間で漏らさない。
  localStorage.clear();
  sessionStorage.clear();
  // **呼び出し履歴を明示的に捨てる。** `restoreMocks: true` は `vi.mock` のファクトリが
  // 作った `vi.fn()` の `mock.calls` までは確実に消さず、前のテストの遷移が次のテストへ
  // 漏れる（`test/ui/App.entry.test.tsx` と同じ理由）。`not.toHaveBeenCalled()` で
  // 見る #290 のテストはこれが無いと前のテストの `redirectTo("/")` を拾って落ちる。
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(saveRecord).mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useTimerSync: 接続の状態", () => {
  it("初期状態は connecting で、ルームは無く、どの画面でもない", () => {
    // Given
    const { result } = renderHook(() => useTimerSync(fakeBanner()));
    // When / Then（result.current への問い合わせが検証と同じ式になる）
    // **`"online"` ではない**（#292 のレビュー）。通知が来るのは `onopen` と `onclose`
    // だけなので、確立前を `online` で表すと「繋がっていないのに接続中」と断言する
    expect(result.current.connState).toBe("connecting");
    expect(result.current.room).toBeNull();
    // **`"lobby"` ではなく `null`。** 旧入口を撤去した後、ルームの画面が決まるまでは
    // どの画面でもない（#95 S5c・R9）。`"lobby"` を初期値にすると意味が嘘になる
    expect(result.current.mode).toBeNull();
  });

  it("玄関から入ると WebSocket を 1 本だけ開く", () => {
    // Given / When
    enterRoom(fakeBanner());
    // Then
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("接続が切れると connState が reconnecting になる（EARS 2）", () => {
    // Given
    const { result, ws } = enterRoom(fakeBanner());
    expect(result.current.connState).toBe("online");

    // When
    act(() => void ws.onclose?.());
    // Then
    expect(result.current.connState).toBe("reconnecting");
  });

  it("切断でバナーを出し、再確立で消す", () => {
    // Given
    const banner = fakeBanner();
    const { ws } = enterRoom(banner);
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
    return { ...enterRoom(banner), banner };
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

  /**
   * サーバーが発行した identity が、入口の effect が置いた「保存値の自分」を上書きする。
   *
   * **保存値とサーバー発行値は必ず別の ID にする。** 同じ ID にすると、入口の effect が
   * `setParticipantId(saved.participantId)` を呼んだ時点で期待値が成立し、
   * `handleIdentity` の `setParticipantId` を潰しても緑のままになる（恒真）。
   * #272 のレビューで、実際にこの形の恒真テストが見つかった。
   *
   * 実物の場面は**復帰トークンの失効**である。サーバーは別の `participantId` を
   * 再発行するので、ここで上書きしないと保存値の古い自分が残り、
   * `buildNoticeMessage` の「あなた」判定も StatusStrip の自分も**他人を指す**。
   */
  it("identity を受け取ると、保存値の participantId をサーバー発行の値で上書きする", () => {
    // Given: 端末の保存値と、サーバーがこれから発行する値は別人の ID
    const { result, deliver } = enterRoom(fakeBanner(), { participantId: "saved-me" });
    expect(result.current.participantId, "入口の effect が保存値を立てている").toBe("saved-me");

    // When: 復帰トークンが失効し、サーバーが別の participantId を再発行する
    deliver({
      type: "room.joined",
      code: "ROOM01",
      resumeToken: "rt-2",
      participantId: "reissued-me",
    });

    // Then
    expect(result.current.participantId).toBe("reissued-me");
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
      actorName: "Creator",
      actorParticipantId: "creator-p",
    });
    // Then
    expect(banner.calls.some((c) => c.startsWith("show:"))).toBe(true);
  });
});

/**
 * @requirements #91 E2 E15 E16（timer はお題を読んで表示するだけ・spec T3）
 */
describe("useTimerSync: お題のフレーム", () => {
  it("Given ルームに入った timer / When お題のフレームが届く / Then topic にタイトルと本文が入る", () => {
    // Given
    const { result, deliver } = enterRoom(fakeBanner());
    // When
    deliver({
      type: "topic",
      state: {
        topic: { title: "FizzBuzz", body: "本文", source: "manual" },
        generating: false,
        degraded: false,
        aiUnlocked: false,
      },
    });
    // Then
    expect(result.current.topic).toEqual({ title: "FizzBuzz", body: "本文", source: "manual" });
  });

  it("Given お題がある / When お題なしのフレームが届く / Then topic が null に戻る", () => {
    // Given
    const { result, deliver } = enterRoom(fakeBanner());
    deliver({
      type: "topic",
      state: {
        topic: { title: "FizzBuzz", body: "", source: "manual" },
        generating: false,
        degraded: false,
        aiUnlocked: false,
      },
    });
    expect(result.current.topic).not.toBeNull();
    // When
    deliver({
      type: "topic",
      state: { topic: null, generating: false, degraded: false, aiUnlocked: false },
    });
    // Then
    expect(result.current.topic).toBeNull();
  });

  it("Given お題がある / When ルームから抜けた知らせが届く / Then topic が null に戻る（抜けたルームのお題を次のルームへ持ち越さない）", () => {
    // Given
    const { result, deliver } = enterRoom(fakeBanner());
    deliver({
      type: "topic",
      state: {
        topic: { title: "FizzBuzz", body: "", source: "manual" },
        generating: false,
        degraded: false,
        aiUnlocked: false,
      },
    });
    expect(result.current.topic).not.toBeNull();
    // When
    deliver({ type: "error", code: "LEFT_ROOM", message: "退出しました" });
    // Then
    expect(result.current.topic).toBeNull();
  });

  it("Given ルームに入った timer / When お題のフレームが届く / Then syncStale は立たない", () => {
    // Given
    const { result, deliver } = enterRoom(fakeBanner());
    // When
    deliver({
      type: "topic",
      state: {
        topic: { title: "FizzBuzz", body: "", source: "manual" },
        generating: false,
        degraded: false,
        aiUnlocked: false,
      },
    });
    // Then
    expect(result.current.syncStale).toBe(false);
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

/**
 * かつてここには「お題が無いと problem.request を先に送る」検査があった。
 * timer 内でのお題の作成・依頼は撤去し、お題ツール（別アプリ）が配る任意の札に
 * なったので、`startSession()` はお題の有無を見ずに phase.set → 開始だけを送る
 * （#91 PR 3）。代わりの検査は `Lobby.single-screen.test.tsx` の
 * 「お題が無いロビーでも開始ボタンが押せる」が担う。
 */

describe("useTimerSync: 後始末", () => {
  it("unmount で WebSocket を閉じる", () => {
    // Given
    const { unmount, ws } = enterRoom(fakeBanner());
    const closeSpy = vi.spyOn(ws, "close");
    // When
    unmount();
    // Then
    expect(closeSpy).toHaveBeenCalled();
  });
});

describe("混雑で入室を拒まれたとき", () => {
  /**
   * バナーを差し替えて接続済みにする（上の describe のものとは別に持つ）。
   *
   * **入るのは参加（`room.join`）経路である。** `JOIN_RATE_LIMITED` は `room.join` の
   * 応答であって `room.create` では返らない。**#95 S4b では実害も出る** —— 復帰の組の
   * 鍵がルームコード別になったため、どのルームへ入ろうとしていたかが分からないと
   * 再送すべき組を引けない。**#272 以降、timer が接続を張る経路はこれ 1 つだけ**
   * （作成は玄関の仕事になった）なので、`enterRoom` がそのまま前提になる。
   */
  function connectedWith(banner: BannerController) {
    return enterRoom(banner, { code: SEEDED_ROOM_CODE, displayName: "私" });
  }

  /** 前提で入っておくルーム。保存済みの復帰の組と鍵を合わせる（#95 S4b）。 */
  const SEEDED_ROOM_CODE = "ROOM01";

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

  /**
   * 待機中に復帰の組が消えると、自動では入り直せない（`sendResumeJoin` が偽を返す枝）。
   *
   * **#272 はこの枝を「条件が永久に偽になった」と見立てて畳む候補に挙げたが、実測では
   * まだ成立する。** 消えた前提は「招待リンクで来た初回」のほうである（旧入口の撤去で、
   * 復帰の組を持たない端末は入口の effect を通れなくなった）。残る経路は**別タブが同じ
   * ルームの組を捨てたとき** —— 鍵は `localStorage`・ルームコード別（#95 S4b・D12）で、
   * 選択画面や poker を別タブで開くのは現実的な使い方である。
   *
   * ここが無いと「自動で入り直しています…」が消えないまま、何も起きない画面になる。
   */
  it("待機中に別タブが復帰の組を捨てたら、手立てを伝えて再送をやめる", () => {
    // Given: 混雑で弾かれて再試行を待っている
    vi.useFakeTimers();
    try {
      const banner = fakeBannerRecordingArgs();
      const { ws, deliver } = connectedWith(banner);
      const send = vi.spyOn(ws, "send");
      deliver({ type: "error", code: "JOIN_RATE_LIMITED", message: "混み合っています" });

      // When: 別タブが同じルームから退出し、この端末の復帰の組が消える。
      // **鍵の形を写さない。** 退出の後始末が実際に呼ぶ関数をそのまま使う ——
      // 生の `localStorage.removeItem()` で鍵を組み立てると、`@tasuki/sync-client` が
      // 接頭辞や版を足した日に**黙って何も消さなくなり**、このテストは狙った枝
      // （`sendResumeJoin` が偽を返す）へ一度も入らないまま別の理由で赤くなる。
      clearResumeIdentity(SEEDED_ROOM_CODE);
      act(() => void vi.advanceTimersByTime(maxDelayOf(1) + 100));

      // Then: 送る材料が無いので送らず、利用者が次に取れる手立てを出す
      expect(sentCommands(send)).not.toContain("room.join");
      const lastCall = banner.showCalls[banner.showCalls.length - 1];
      expect(lastCall?.[0]).toMatch(/再読込|読み込み直/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("試行を使い切ったら、何をすれば入れるかを伝えて再送をやめる", () => {
    // Given
    vi.useFakeTimers();
    try {
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
    return { ...enterRoom(banner), banner };
  }

  const aValidSnapshot = () => ({ type: "snapshot", room: aRoomView({ code: "ROOM01" }) });

  /**
   * ADR 0005 の追記が挙げた経路（名簿から引けない席の空文字）と同じ壊し方をする。
   * #294 で `config.members` が wire から落ちたので、その投影はサーバー側の
   * 完成記録（`sessionRecords[].members`・最小長 1）が引き継いだ。
   */
  function aFrameThatViolatesTheContract(): Record<string, unknown> {
    const room = aRoomView({ code: "ROOM01" });
    return { type: "snapshot", room: { ...room, sessionRecords: [aRecordWithUnresolvableName()] } };
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
    expect(result.current.room?.sessionRecords).toEqual([]);
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
   * ルーム由来の画面状態を持ち越さない手段が変わった（#95 S5c・R9 → C-1）。
   *
   * 撤去前は state を 1 つずつ畳んで旧入口（`Setup`）へ戻していた。いまは
   * **ルームをロビーへ戻す**ので、画面ごと作り直される。ルームが生きているうちは
   * 玄関へは遷移しない（#290・D5）。畳み忘れを心配する state はもう無く、
   * 見るべきは**送るコマンド**と**行き先**である。
   */
  it("新しいセッションを始めるとルームをロビーへ戻し、玄関へは送らない", () => {
    // Given: ROOM01 に居て、その後で契約に合わないフレームを捨てている
    const { result, deliver, ws } = connected();
    deliver(aValidSnapshot());
    deliver(aFrameThatViolatesTheContract());
    expect(result.current.syncStale).toBe(true);
    const sendSpy = vi.spyOn(ws, "send");

    // When
    act(() => result.current.newSession());

    // Then: `celebration` のまま残さない（残すと timer だけ死んだルームになる）
    const sent = sendSpy.mock.calls.map(
      ([raw]) => JSON.parse(String(raw)) as Record<string, unknown>,
    );
    expect(sent).toContainEqual({ command: "phase.set", phase: "setup" });
    // **押した本人も他の全員と同じくロビーへ戻る**（#290・D5）。遷移すると、
    // 押した人だけがルームから出される。
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("ルームを失っているときは、新しいセッションで玄関へ送る", () => {
    // Given: ROOM01 が消えている（`ROOM_NOT_FOUND` を受けた）
    const { result, deliver } = connected();
    deliver(aValidSnapshot());
    deliver({ type: "error", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(result.current.sessionLost).toBe(true);

    // When
    act(() => result.current.newSession());

    // Then: 宛先が無いので `phase.set` は送らず、玄関へ送る
    expect(redirectTo).toHaveBeenCalledWith("/");
  });
});
