/**
 * 読み込みが終わらないときの行き止まりと、読み込み中の接続状態（#292）。
 *
 * ## 何が起きていたか
 *
 * `Loading`（`mode === null` の受け皿）は状態を一切受け取らない。**WS が切れた場合は
 * バナーが出るが、繋がっているのに `room.join` の答えが返らない場合は
 * 「読み込んでいます…」だけが永久に出続けた**（`@tasuki/sync-client` が持つタイマーは
 * 再接続用の 1 つだけで、応答が来ない場合に諦める仕組みがどこにも無かった）。
 * しかも `StatusStrip` は `mode !== null` のときしか描かれないので、
 * **その間は接続の状態そのものが画面に出ていなかった。**
 *
 * ## ここで固定すること
 *
 * - 期限（`room.join` を送ってから 10 秒）が切れたら、読み込めていないことと
 *   **次にできること**（再読み込み・最初の画面へ戻る）を出す（EARS 1 / EARS 3）
 * - 期限は**サーバーが答えた場面では畳む**。入室できた・退出が成立した・
 *   混雑で入り直しを待っている、のどれでも「読み込めていません」と断じない
 * - `mode === null` の間も**接続の状態が読める**（EARS 2）
 *
 * ⚠ **対照（期限の直前・snapshot が届いた後）を必ず置く。** 「いつでも行き止まりを
 * 出す」実装でも、対照が無ければ全部緑になる。
 *
 * @requirements #292 EARS 1, EARS 2, EARS 3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";
import { joinRetryDelayMs, saveResumeIdentity } from "@tasuki/sync-client";

vi.mock("../../src/records/indexeddb.js", () => ({
  loadRecords: vi.fn().mockResolvedValue([]),
  listRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

// 遷移は `platform/location.ts` に閉じている（#95 S5c・R9）。テストはそこを差し替える。
vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { redirectTo } from "../../src/platform/location.js";

/** 実装が使う期限。テストは「その値で分岐すること」を見るので、前後の両方を測る。 */
const DEADLINE_MS = 10_000;

/** 行き止まりの見出し。ここだけを名指しで見る（本文全体への正規表現は当たり所が広すぎる）。 */
const DEAD_END_TITLE = "ルームの情報を読み込めませんでした";

const ROOM_CODE = "ROOM01";

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/**
 * 玄関で名乗った端末として `?room=CODE` を開き、`room.join` を送ったところまで進める。
 *
 * **偽タイマーは `render` より前に入れる。** 期限の `setTimeout` は入口の effect の
 * 中（＝`render` の最中）に積まれるので、後から偽タイマーへ切り替えると掴めない。
 */
function openRoomAwaitingSnapshot(): FakeWS {
  vi.useFakeTimers();
  saveResumeIdentity({
    code: ROOM_CODE,
    participantId: "me-1",
    resumeToken: "rt_1",
    displayName: "ボブ",
  });
  window.history.replaceState(null, "", `/?room=${ROOM_CODE}`);
  render(<App />);
  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  if (ws === undefined) throw new Error("入口の判定が変わった（接続が張られていない）");
  ws.readyState = FakeWS.OPEN;
  act(() => {
    ws.onopen?.();
  });
  return ws;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("読み込みが終わらないときの行き止まり（#292・EARS 1 / EARS 3）", () => {
  it("対照: 期限の直前までは読み込み中のままで、行き止まりを出さない", () => {
    // Given: room.join を送ったが、まだ何も返ってきていない
    openRoomAwaitingSnapshot();

    // When: 期限の 1ms 手前まで進める
    advance(DEADLINE_MS - 1);

    // Then: まだ待っている（ここで出るなら「いつでも出す」実装と区別が付かない）
    expect(screen.queryByText(DEAD_END_TITLE)).toBeNull();
    expect(screen.getByText(/読み込んでいます/)).toBeVisible();
  });

  it("期限が切れると、読み込めていないことと次にできることが出る", () => {
    // Given
    openRoomAwaitingSnapshot();

    // When: 期限まで進める（サーバーは何も答えていない）
    advance(DEADLINE_MS);

    // Then: 何が起きたかと、次にできることが読める
    expect(screen.getByText(DEAD_END_TITLE)).toBeVisible();
    expect(screen.getByRole("button", { name: /再読み込み/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /最初の画面へ戻る/ })).toBeVisible();
    // 待ち続けていると誤解させない（「読み込んでいます…」は引っ込む）
    expect(screen.queryByText(/読み込んでいます/)).toBeNull();
  });

  it("行き止まりは読み上げにも乗る（assertive なライブリージョン）", () => {
    openRoomAwaitingSnapshot();
    advance(DEADLINE_MS);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(DEAD_END_TITLE);
  });

  it("「再読み込みする」はいまの URL を開き直す", () => {
    openRoomAwaitingSnapshot();
    advance(DEADLINE_MS);
    const here = window.location.href;

    fireEvent.click(screen.getByRole("button", { name: /再読み込み/ }));

    expect(redirectTo).toHaveBeenCalledWith(here);
  });

  it("「最初の画面へ戻る」は玄関へ送る", () => {
    openRoomAwaitingSnapshot();
    advance(DEADLINE_MS);

    fireEvent.click(screen.getByRole("button", { name: /最初の画面へ戻る/ }));

    expect(redirectTo).toHaveBeenCalledWith("/");
  });

  it("期限より前に snapshot が届けば、以後どれだけ経っても行き止まりは出ない", () => {
    // Given
    const ws = openRoomAwaitingSnapshot();
    advance(DEADLINE_MS - 1000);

    // When: ルームの画面が決まった
    sendServer(ws, { type: "snapshot", room: aRoomView({ code: ROOM_CODE, phase: "setup" }) });
    advance(DEADLINE_MS * 3);

    // Then: 入れているのに「読み込めていません」と言い出さない
    expect(screen.queryByText(DEAD_END_TITLE)).toBeNull();
  });

  /**
   * ⚠ **上のテストだけでは畳み忘れを捕まえられない。** ルームの画面が決まった後は
   * `Loading` が描かれないので、期限のタイマーが残って印を立てても**画面には何も出ない**。
   * 「表示が出ないこと」を見ている限り、畳んでも畳まなくても緑になる。
   * ここだけは残っているタイマーの数そのものを測る。
   */
  it("画面が決まったら期限のタイマーそのものが消える（実測）", () => {
    // Given: 期限が張られている
    const ws = openRoomAwaitingSnapshot();
    const pending = vi.getTimerCount();

    // When
    sendServer(ws, { type: "snapshot", room: aRoomView({ code: ROOM_CODE, phase: "setup" }) });

    // Then: ちょうど 1 本（期限）減る
    expect(vi.getTimerCount()).toBe(pending - 1);
  });

  /**
   * セッション喪失も畳む必要がある局面だが、**画面からは区別できない** ——
   * `App` は `sessionLost` を先に見て `SessionLost` を描くので、印が立っても
   * `Loading` は出ない。ここも残っているタイマーの数で測る。
   */
  it("セッションを失ったら期限のタイマーそのものが消える（実測）", () => {
    // Given
    const ws = openRoomAwaitingSnapshot();
    const pending = vi.getTimerCount();

    // When: 入ろうとしたルームがもう無い
    sendServer(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "gone" });

    // Then: ちょうど 1 本（期限）減る
    expect(vi.getTimerCount()).toBe(pending - 1);
  });

  it("退出が成立したら、去った後に行き止まりが出ない（畳み忘れ）", () => {
    // Given: room.join を送った直後に、自己退出が成立した
    const ws = openRoomAwaitingSnapshot();
    sendServer(ws, { type: "error", code: "LEFT_ROOM", message: "left" });

    // When: 玄関へ去った後に期限が来る
    advance(DEADLINE_MS * 2);

    // Then: 抜けた人に、無関係な諦めの表示が後から出ない
    expect(screen.queryByText(DEAD_END_TITLE)).toBeNull();
  });

  /**
   * **混雑（`JOIN_RATE_LIMITED` → `retry-later`）は「待てば入れる」経路である。**
   * #147 の待ちは回を追うごとに倍になり、最大 30 秒＋ばらつき —— **期限（10 秒）を
   * 必ず追い越す**。畳まないと、入り直しを待っているだけの人を「読み込めていません」と
   * 断じることになる。
   *
   * ⚠ **1 回目の拒否だけでは捕まえられない。** 1 回目の待ちは期限より短いので、
   * 入り直しの送信が期限を張り直してしまい、畳んでいなくても発火しない。
   * **待ちが期限を追い越すところまで進める**のがこのテストの肝である。
   * 待ちの値は `joinRetryDelayMs`（方針の正本）から引く —— ここへ数を書き写すと、
   * 方針が変わった日に「追い越していない」場面を測り続けることになる。
   */
  it("入り直しまでの待ちが期限を追い越しても、行き止まりと断じない（混雑の経路）", () => {
    // Given: 待ち時間のばらつきを固定する（joinRetryDelayMs は Math.random を使う）
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ws = openRoomAwaitingSnapshot();

    // When: 混雑が続き、入り直しまでの待ちが期限を追い越したところで期限ぶんだけ待つ
    for (let attempt = 1; ; attempt += 1) {
      sendServer(ws, { type: "error", code: "JOIN_RATE_LIMITED", message: "busy" });
      const delay = joinRetryDelayMs(attempt, () => 0.5);
      if (delay === null) throw new Error("待ちが期限を追い越す前に試行を使い切った");
      if (delay > DEADLINE_MS) {
        advance(DEADLINE_MS + 1);
        break;
      }
      advance(delay);
    }

    // Then: 待てば入れる経路を「読み込めていません」と誤って断じない
    expect(screen.queryByText(DEAD_END_TITLE)).toBeNull();
    // 代わりに、待っていることは既存のバナーが伝えている
    expect(screen.getByText(/自動で入り直しています/)).toBeVisible();
  });

  it("入り直しても答えが返らなければ、そのときは行き止まりになる（混雑の免除は永久ではない）", () => {
    // Given
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ws = openRoomAwaitingSnapshot();
    sendServer(ws, { type: "error", code: "JOIN_RATE_LIMITED", message: "busy" });

    // When: 2 秒後に入り直し、そこから期限ぶん待っても何も返らない
    advance(2000 + DEADLINE_MS);

    // Then
    expect(screen.getByText(DEAD_END_TITLE)).toBeVisible();
  });
});

describe("読み込み中の接続状態（#292・EARS 2）", () => {
  it("対照: 読み込み中も接続の状態が読める", () => {
    openRoomAwaitingSnapshot();

    const region = screen.getByLabelText("接続状態");
    expect(region).toBeVisible();
    expect(region).toHaveTextContent("接続中");
  });

  it("読み込み中に切断されたら、接続の状態が再接続中に変わる", () => {
    // Given
    const ws = openRoomAwaitingSnapshot();
    expect(screen.getByLabelText("接続状態")).not.toHaveTextContent("再接続中");

    // When
    act(() => {
      ws.onclose?.();
    });

    // Then: ルームの画面が決まる前でも、接続が切れたことが読める
    expect(screen.getByLabelText("接続状態")).toHaveTextContent("再接続中");
  });

  it("行き止まりになった後も接続の状態が読める", () => {
    openRoomAwaitingSnapshot();
    advance(DEADLINE_MS);

    expect(screen.getByLabelText("接続状態")).toHaveTextContent("接続中");
  });
});
