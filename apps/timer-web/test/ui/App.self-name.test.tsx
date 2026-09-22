/**
 * 自分の名前が引けないときの縮退（#294）。
 *
 * `App.tsx` は StatusStrip へ「自分の表示名」を渡す。名簿（`room.participants`）から
 * 自分が引けないとき、かつてここは **`config.members[0]`（＝輪の先頭の席の名前）**へ
 * 縮退していた。輪は並べ替えられるので、それは自分でも作成者でもない**他人**である。
 *
 * この窓は実在する —— 再接続で復帰トークンが拒まれると、サーバーは新しい
 * `participantId` を `room.joined` で配る（`room-join.ts`）。それが届くまでの間、
 * 画面は古い ID を持ったまま snapshot を描く。`sync/use-timer-sync.ts` の入口の
 * effect が保存済みの ID を先に立てているのも、同じ事故（**復帰した本人が他人の
 * 名前を見る**）を避けるためである。
 *
 * **縮退は「その人を指す」ものでなければならない**（#294 EARS 1）。
 * 誰か分からないなら「あなた」と言う。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act, within } from "@testing-library/react";
import { FakeWS } from "../support/fakes.js";
import { enterRoomAndConnect } from "../support/enter-room.js";
import { aRoomView } from "../support/room-view.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

/** この端末が持っている（もう名簿に無い）参加者 ID。 */
const MY_STALE_ID = "me-stale";
/** 輪の先頭に座っている別人。 */
const OTHER_ID = "p-aya";

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

/**
 * 「自分が名簿に居ない」snapshot を描いた状態にする。
 *
 * `room.joined` は送らない（復帰の経路では新規参加のときしか来ない）。
 * 端末が持っている ID は保存済みの復帰の組から立つので、名簿の誰とも一致しない。
 */
function enterRoomWhereIAmNotListed(): void {
  const ws = enterRoomAndConnect({ participantId: MY_STALE_ID, displayName: "わたし" });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase: "ready",
      session: {
        rotation: [OTHER_ID],
        driverCounts: [0],
        seats: [{ id: OTHER_ID, displayName: "あや", isProxy: false, skipReason: null }],
      },
      participants: [
        {
          participantId: OTHER_ID,
          displayName: "あや",
          presence: "online",
          hasAiKey: false,
          joinedAt: 0,
        },
      ],
    }),
  });
}

beforeEach(() => {
  FakeWS.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("自分の名前が引けないときの縮退（#294 EARS 1）", () => {
  it("名簿から自分を引けないとき、StatusStrip は「あなた」を出す", () => {
    // Given: 自分が名簿に居ないルーム
    // When: その snapshot を描いた
    enterRoomWhereIAmNotListed();

    // Then
    const strip = screen.getByRole("status", { name: "ステータス情報" });
    expect(within(strip).getByText("あなた")).toBeTruthy();
  });

  it("名簿から自分を引けないとき、StatusStrip は輪の先頭の人の名前を出さない", () => {
    // Given: 自分が名簿に居ないルーム
    // When: その snapshot を描いた
    enterRoomWhereIAmNotListed();

    // Then: 輪の先頭（＝別人）の名前は画面の他の場所には出てよいが、帯の中に出てはならない
    const strip = screen.getByRole("status", { name: "ステータス情報" });
    expect(within(strip).queryByText("あや")).toBeNull();
  });
});
