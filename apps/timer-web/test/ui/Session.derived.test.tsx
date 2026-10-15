/**
 * Session の画面が導く値（#370 の特性テスト）。
 *
 * 純粋関数（`ui/session-view.ts`）へ出す前に、**いまの表示を画面の単位で固定する**。
 * 名前の組（次・ナビ）・急ぎの印・進み具合・輪の大きさを見る。ナビは直前に実際に運転した人
 * （#374。輪の上の 1 つ前の席ではない）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Participant } from "@tasuki/timer-core";
import { aRoomView, type RoomViewOverrides } from "../support/room-view.js";

const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";
const NOW = 1_000_000;

const noop = () => {};
const handlers = {
  onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop, onStartBreak: noop, onEndBreak: noop, onAbort: noop,
  onReset: noop, onRenameParticipant: noop,
  onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
};

function p(participantId: string, displayName: string): Participant {
  return { participantId, displayName, presence: "online", joinedAt: 1 };
}

/** 3 人の輪（あや・いずみ・うた）。いまは `currentIndex` の人が運転している。 */
function threeSeats(overrides: RoomViewOverrides = {}) {
  return aRoomView({
    phase: "session",
    memberNames: ["あや", "いずみ", "うた"],
    participants: [p("a", "あや"), p("i", "いずみ"), p("u", "うた")],
    ...overrides,
    session: { rotation: ["a", "i", "u"], currentIndex: 1, ...(overrides.session ?? {}) },
  });
}

function renderSession(room = threeSeats()) {
  return render(<Session inviteUrl={INVITE_URL_FOR_TEST} room={room} participantId="a" {...handlers} />);
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

afterEach(() => {
  vi.useRealTimers();
  setViewport(1024);
});

describe("Session の名前の組", () => {
  it("次の人はサーバーが決めた nextIndex の人", () => {
    renderSession(threeSeats({ session: { nextIndex: 0 } }));
    expect(document.querySelector(".session-next-name")?.textContent).toBe("あや");
  });

  it("次が決まっていない（nextIndex が null）ときは —", () => {
    renderSession(threeSeats({ session: { nextIndex: null } }));
    expect(document.querySelector(".session-next-name")?.textContent).toBe("—");
  });

  it("ナビが有効なら、直前に運転した人（サーバーが送る previousDriverIndex）をナビに出す", () => {
    renderSession(threeSeats({ config: { navigatorEnabled: true }, session: { previousDriverIndex: 0 } }));
    expect(document.querySelector(".session-navigator-name")?.textContent).toBe("あや");
  });

  it("1 つ前の席が見送り中で飛ばされた交代の後は、飛ばされた人ではなく実際に運転した人をナビに出す（#374）", () => {
    // Given: 3 人の輪。あや → うた と交代し、1 つ前の席の いずみ は見送り中で飛ばされた
    renderSession(
      threeSeats({
        config: { navigatorEnabled: true },
        session: {
          currentIndex: 2,
          previousDriverIndex: 0,
          seats: [
            { id: "a", displayName: "あや", isProxy: false, skipReason: null },
            { id: "i", displayName: "いずみ", isProxy: false, skipReason: "stood-down" },
            { id: "u", displayName: "うた", isProxy: false, skipReason: null },
          ],
        },
      }),
    );
    // Then
    expect(document.querySelector(".session-navigator-name")?.textContent).toBe("あや");
  });

  it("直前に運転した人が分からない（交代前・古いサーバー）ならナビを出さない", () => {
    renderSession(threeSeats({ config: { navigatorEnabled: true } }));
    expect(document.querySelector(".session-navigator")).toBeNull();
  });

  it("ナビが無効ならナビを出さない", () => {
    renderSession(threeSeats({ config: { navigatorEnabled: false } }));
    expect(document.querySelector(".session-navigator")).toBeNull();
  });

  it("輪が 1 人ならナビを出さない（いまの人と同じになる）", () => {
    renderSession(
      aRoomView({ phase: "session", config: { navigatorEnabled: true }, memberNames: ["あや"], participants: [p("a", "あや")], session: { rotation: ["a"] } }),
    );
    expect(document.querySelector(".session-navigator")).toBeNull();
  });
});

describe("Session の急ぎの印と進み具合", () => {
  function running(secondsLeftAtAnchor: number, intervalSeconds = 60) {
    vi.useFakeTimers({ now: NOW });
    return threeSeats({
      clock: { running: true, anchorServerTime: NOW, secondsLeftAtAnchor, intervalSeconds, runningSince: 0 },
    });
  }

  it("動いていて残り 10 秒なら急ぎの印が付く", () => {
    renderSession(running(10));
    expect(screen.getByRole("timer").hasAttribute("data-urgent")).toBe(true);
  });

  it("残り 11 秒では急ぎの印は付かない", () => {
    renderSession(running(11));
    expect(screen.getByRole("timer").hasAttribute("data-urgent")).toBe(false);
  });

  it("止まっていれば残り 10 秒でも急ぎの印は付かない", () => {
    renderSession(threeSeats({ clock: { running: false, secondsLeftAtAnchor: 10 } }));
    expect(screen.getByRole("timer").hasAttribute("data-urgent")).toBe(false);
  });

  it("進み具合は、間隔のうち過ぎた割合で弧を描く（60 秒のうち 45 秒過ぎたら弧の 4 分の 3）", () => {
    renderSession(running(15, 60));
    const arc = document.querySelectorAll(".circular-progress-arc-layer circle")[1]!;
    const r = Number(arc.getAttribute("r"));
    const circumference = 2 * Math.PI * r;
    expect(Number(arc.getAttribute("stroke-dashoffset") ?? (arc as SVGElement).style.strokeDashoffset)).toBeCloseTo(circumference * 0.25, 3);
  });
});

describe("Session の輪の大きさ", () => {
  const orbitWidth = () => (document.querySelector(".team-orbit") as HTMLElement).style.width;
  const ringWidth = () => (document.querySelector(".circular-progress") as HTMLElement).style.width;

  it("広い画面では輪 460px・時計 300px", () => {
    setViewport(1280);
    renderSession();
    expect([orbitWidth(), ringWidth()]).toEqual(["460px", "300px"]);
  });

  it.each([
    [360, "278px", "183px"],
    [300, "248px", "163px"],
    [600, "340px", "224px"],
  ])("幅 %ipx の画面では輪 %s・時計 %s（幅から縮め、248〜340px に収める）", (width, orbit, ring) => {
    setViewport(width);
    renderSession();
    expect([orbitWidth(), ringWidth()]).toEqual([orbit, ring]);
  });
});
