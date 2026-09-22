/**
 * 輪に席はあるが timer の画面に居ない人の見え方（#95 S5c）。
 *
 * S5a で `participants` が timer の在席者に絞られたため、選択画面へ戻った人の名前は
 * `participants` から引けない。**#276 でこの穴を埋める経路が変わった** —— かつては
 * 画面側が `config.members`（rotation と同じ順の表示名）を渡して席を補っていたが、
 * いまはサーバーが組む `session.seats`（`Seat.displayName` は絞っていない名簿から引く）
 * がその席の名前と `skipReason`（離席理由）を直接運んでくる。`config.members` から
 * 輪の名前を補う経路は画面側から消えた（`rotation-names.ts` 参照）。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Participant, Room, Seat, SeatSkipReason } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

function p(participantId: string, displayName: string): Participant {
  return { participantId, displayName, presence: "online", hasAiKey: false, joinedAt: 1 };
}

const noop = () => {};
const handlers = {
  onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop,
  onAbort: noop, onReset: noop, onRenameParticipant: noop, onDriverSkip: noop,
  onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
};

/**
 * rotation=[あや, ゆう]。`present` が偽なら「ゆう」は選択画面へ戻っている。
 *
 * 席（`skipReason`）はサーバーが組むため、`aRoomView` の既定は輪から機械的に
 * 導くだけで在席かどうかを推測しない（#276）。この Given で「ゆう」を離席させたい
 * ときは、`session.seats` を丸ごと渡してサーバーの決定を模す。
 */
function makeRoom(options: { present: boolean }): Room {
  const participants = options.present
    ? [p("aya-p", "あや"), p("yuu-p", "ゆう")]
    : [p("aya-p", "あや")];
  const seats: Seat[] = [
    { id: "aya-p", displayName: "あや", isProxy: false, skipReason: null },
    { id: "yuu-p", displayName: "ゆう", isProxy: false, skipReason: options.present ? null : "away" },
  ];
  return aRoomView({
    code: "AA0001",
    memberNames: ["あや", "ゆう"],
    session: { rotation: ["aya-p", "yuu-p"], currentIndex: 0, driverCounts: [0, 0], seats },
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants,
  });
}

describe("Session 輪に席が残る離席者", () => {
  it("timer を離れた人の名前を出し、その席が別の画面だと示す", () => {
    // Given（「ゆう」は選択画面へ戻り、participants から消えている）
    const room = makeRoom({ present: false });

    // When
    render(
      <Session inviteUrl={INVITE_URL_FOR_TEST} room={room} participantId="aya-p" {...handlers} />,
    );

    // Then（名前なしの空枠にならず、番が回らない理由が読める）
    expect(screen.getAllByText("ゆう").length).toBeGreaterThan(0);
    expect(screen.getByText("別の画面")).toBeTruthy();
  });

  it("timer に居る人には「別の画面」を出さない（対照）", () => {
    // Given（同じ輪で「ゆう」が timer に居るだけの違い）
    const room = makeRoom({ present: true });

    // When
    render(
      <Session inviteUrl={INVITE_URL_FOR_TEST} room={room} participantId="aya-p" {...handlers} />,
    );

    // Then
    expect(screen.getAllByText("ゆう").length).toBeGreaterThan(0);
    expect(screen.queryByText("別の画面")).toBeNull();
  });
});

/** `session.seats` 1 枠分の造作。`skipReason` の既定は null（番が回る）。 */
function seat(id: string, name: string, skipReason: SeatSkipReason | null = null): Seat {
  return { id, displayName: name, isProxy: false, skipReason };
}

describe("Session 「次」はサーバーの nextIndex が指す人を出す（#276）", () => {
  /**
   * @requirements #276 E2
   */
  it("「次」はサーバーの nextIndex が指す人を出す", () => {
    // 輪: [あや(現), ゆう(離席), かい]。素朴な `(currentIndex + 1) % len` なら
    // 「次: ゆう」になるところ。サーバーは離席中の「ゆう」を飛ばし「かい」を指す。
    const room = aRoomView({
      code: "AA0001",
      memberNames: ["あや", "ゆう", "かい"],
      session: {
        rotation: ["aya-p", "yuu-p", "kai-p"],
        currentIndex: 0,
        driverCounts: [0, 0, 0],
        seats: [seat("aya-p", "あや"), seat("yuu-p", "ゆう", "away"), seat("kai-p", "かい")],
        nextIndex: 2,
      },
      clock: { running: true, runningSince: 0 },
      phase: "session",
      participants: [p("aya-p", "あや"), p("kai-p", "かい")],
    });

    render(<Session room={room} participantId="aya-p" inviteUrl={INVITE_URL_FOR_TEST} {...handlers} />);

    // 「次:」欄そのものの文字列で判定する。単に「かい」が画面のどこかに
    // 出ていることだけを見ると、交代順ストリップ側の「かい」の行と区別が付かず、
    // 素朴な `(currentIndex + 1) % len`（「次: ゆう」になる）に戻しても
    // このアサーションは緑のままになってしまう（恒真化を避ける）。
    // 「次:」と名前は別々のテキストノード（地の文＋<span>）に分かれているため、
    // 既定の文字列マッチャは要素をまたいだ結合を見ない（RTL の既知の制約）。
    // 関数マッチャで対象要素自身の textContent を直接見て判定する。
    const nextLine = (text: string) =>
      screen.queryByText((_content, element) => element?.textContent === text);
    expect(nextLine("次: かい")).toBeTruthy();
    expect(nextLine("次: ゆう")).toBeNull();
    // #249 が置いた「（別の画面）」は出ない。次の席は定義上必ず適格である（D12）。
    expect(screen.queryByText("（別の画面）")).toBeNull();
  });

  /**
   * @requirements #276 E5
   */
  it("全席が不適格なら人名を出さない", () => {
    const room = aRoomView({
      code: "AA0001",
      memberNames: ["あや", "ゆう"],
      session: {
        rotation: ["aya-p", "yuu-p"],
        currentIndex: 0,
        driverCounts: [0, 0],
        seats: [seat("aya-p", "あや", "away"), seat("yuu-p", "ゆう", "disconnected")],
        nextIndex: null,
      },
      clock: { running: true, runningSince: 0 },
      phase: "session",
      participants: [p("yuu-p", "ゆう")],
    });

    render(<Session room={room} participantId="yuu-p" inviteUrl={INVITE_URL_FOR_TEST} {...handlers} />);

    expect(screen.getByText("（交代できる人がいません）")).toBeTruthy();
  });
});
