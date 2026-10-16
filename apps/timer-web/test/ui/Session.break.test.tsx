/**
 * Session × 休憩（#402）
 *
 * v2.10 で休憩は一度撤去され、#402 で作り直した。条件「なし」のルームは撤去後と同じく、
 * 休憩の操作も表示も無い（書体の拡張の層を取らないため・設計 D9）。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

const ELAPSED: Partial<SessionConfig> = {
  intervalMinutes: 5,
  break: { trigger: "elapsed", every: 60, mode: "auto" },
};

function participant(id: string, name: string, presence: Participant["presence"] = "online"): Participant {
  return { participantId: id, displayName: name, presence, joinedAt: 1000 };
}

interface RoomOpts {
  config?: Partial<SessionConfig>;
  brk?: { since: number | null; suggestedAtSwitches: number | null };
  othersOffline?: boolean;
  currentIndex?: number;
  totalSwitches?: number;
}

/** 自分（p-alice）と Bob の 2 人の輪。break と config と在席だけを上書きする */
function roomWith(o: RoomOpts = {}): Room {
  return aRoomView({
    code: "AA0001",
    config: { intervalMinutes: 5, ...(o.config ?? {}) },
    memberNames: ["Alice", "Bob"],
    session: {
      rotation: ["p-alice", "p-bob"],
      driverCounts: [0, 0],
      currentIndex: o.currentIndex ?? 0,
      totalSwitches: o.totalSwitches ?? 0,
      ...(o.brk ? { break: o.brk } : {}),
    },
    phase: "session",
    participants: [participant("p-alice", "Alice"), participant("p-bob", "Bob", o.othersOffline ? "offline" : "online")],
  });
}

const onBreakRoom = (since: number, o: RoomOpts = {}) =>
  roomWith({ config: ELAPSED, ...o, brk: { since, suggestedAtSwitches: null } });

const noop = () => {};
function props(room: Room) {
  return {
    inviteUrl: INVITE_URL_FOR_TEST,
    room,
    participantId: "p-alice",
    onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop, onStartBreak: noop, onEndBreak: noop,
    onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

afterEach(() => vi.useRealTimers());

describe("休憩の操作は条件なしのルームに出ない", () => {
  it("Given 条件なしのルーム / When 描く / Then 休憩のボタンが存在しない", () => {
    render(<Session {...props(roomWith())} />);
    expect(screen.queryByRole("button", { name: /休憩/ })).toBeNull();
  });

  // 画面は休憩中かを `session.break.since` だけで決め、条件を見ない（`isOnBreakRoom`）。条件「なし」では
  // サーバーが break.start を拒み（BREAK_DISABLED）、セッション中は設定も変えられないので、この snapshot は
  // 普通は届かない。届いたとき（古いサーバーの状態など）に覆いを隠すと、時計が止まったまま終える手段が
  // 消える。だから覆いは出して「休憩を終える」を残す、を固定する（総合レビュー・2026-10-16）
  it("Given 条件なしのルームに休憩中の snapshot が届く / When 描く / Then 覆いは出て、終える手段が残る", () => {
    render(<Session {...props(roomWith({ brk: { since: 1000, suggestedAtSwitches: null } }))} />);
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "休憩を終える" })).toBeInTheDocument();
  });

  it("Given 条件なしのルーム / When 描く / Then 画面の文字にも属性にも「休」「憩」が無い（書体の拡張の層を取らない）", () => {
    render(<Session {...props(roomWith({ config: { intervalMinutes: 5 } }))} />);
    expect(document.body.textContent).not.toMatch(/[休憩]/);
    // 書体は title（ツールチップ）・aria-label（読み上げだけでなく一部は描かれる）・placeholder の字も描く
    const attrs = [...document.body.querySelectorAll("*")].flatMap((el) =>
      ["title", "aria-label", "placeholder"].map((name) => el.getAttribute(name) ?? ""),
    );
    // 属性を 1 つも拾えていなければ、下の判定は空振りで緑になる
    expect(attrs.filter((v) => v !== "").length).toBeGreaterThan(0);
    expect(attrs.filter((v) => /[休憩]/.test(v))).toEqual([]);
  });
});

describe("休憩（#402）", () => {
  it("Given 条件ありのルーム / When 描く / Then 「休憩する」と添え書きがある", () => {
    render(<Session {...props(roomWith({ config: ELAPSED }))} />);
    expect(screen.getByRole("button", { name: /休憩する/ })).toBeInTheDocument();
    expect(screen.getByText("次の休憩までを数え直します")).toBeInTheDocument();
  });

  it("Given 条件ありのルーム / When 「休憩する」を押す / Then onStartBreak", async () => {
    const onStartBreak = vi.fn();
    render(<Session {...props(roomWith({ config: ELAPSED }))} onStartBreak={onStartBreak} />);
    await userEvent.click(screen.getByRole("button", { name: /休憩する/ }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 休憩中のルーム / When 描く / Then 覆いが出て、残り時間の円は無い", () => {
    render(<Session {...props(onBreakRoom(1000))} />);
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("休憩明けはAliceさん")).toBeInTheDocument();
  });

  it("Given 休憩中（再接続直後に初めて描く） / When 描く / Then 経過は休憩の開始から数える", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(61_000);
    render(<Session {...props(onBreakRoom(1000))} clockOffset={0} />);
    expect(screen.getByText("01:00")).toBeInTheDocument();
  });

  // 覆いの経過は秒単位なので、休憩中は 1 秒ごとに描けば足りる。走行中の 200ms のまま Session 全体を
  // 描き直すと、止まった画面を 1 秒に 5 回作り直す（PR #416 のレビュー）。間隔は再描画の唯一の源（useNowTick の setInterval）で測る。
  it.each([
    ["休憩中", 1000, false],
    ["走行中（対照）", 200, true],
  ] as const)("Given %s / When 描く / Then 時刻を進める間隔は %i ms", (label, expected, running) => {
    const base = label === "休憩中" ? onBreakRoom(Date.now() - 60_000) : roomWith({ config: ELAPSED });
    const spy = vi.spyOn(globalThis, "setInterval");
    try {
      render(<Session {...props({ ...base, clock: { ...base.clock, running } })} />);
      expect(spy.mock.calls.map((c) => c[1])).toEqual([expected]);
    } finally {
      spy.mockRestore();
    }
  });

  it("Given 休憩中 / When 覆いが開く / Then フォーカスは見出しにあり、Enter でも Esc でも休憩は終わらない", async () => {
    const onEndBreak = vi.fn();
    render(<Session {...props(onBreakRoom(1000))} onEndBreak={onEndBreak} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "休憩中" }));
    await userEvent.keyboard("{Enter}{Escape}");
    expect(onEndBreak).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
  });

  it("Given 休憩中 / When 「休憩を終える」を押す / Then onEndBreak", async () => {
    const onEndBreak = vi.fn();
    render(<Session {...props(onBreakRoom(1000))} onEndBreak={onEndBreak} />);
    await userEvent.click(screen.getByRole("button", { name: "休憩を終える" }));
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 休憩中 / When 覆いの「完成」を押す / Then 確認が覆いの上に出て、確定して初めて onComplete", async () => {
    const onComplete = vi.fn();
    render(<Session {...props(onBreakRoom(1000))} onComplete={onComplete} />);
    const overlay = screen.getByRole("dialog", { name: "休憩中" });
    await userEvent.click(within(overlay).getByRole("button", { name: /完成/ }));
    expect(onComplete).not.toHaveBeenCalled();
    const confirm = screen.getByRole("dialog", { name: "このセッションを完成として記録しますか？" });
    // 確認ダイアログが操作できる（覆いのフォーカストラップに引き戻されない）
    expect(confirm).toContainElement(document.activeElement as HTMLElement);
    await userEvent.click(within(confirm).getByRole("button", { name: "完成として記録する" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Given 覆いの完成の確認 / When キャンセルする / Then onComplete は呼ばれず、覆いに戻る", async () => {
    const onComplete = vi.fn();
    render(<Session {...props(onBreakRoom(1000))} onComplete={onComplete} />);
    await userEvent.click(within(screen.getByRole("dialog", { name: "休憩中" })).getByRole("button", { name: /完成/ }));
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "このセッションを完成として記録しますか？" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
  });

  it("Given 輪に居て離脱していない / When 覆いの「一時離脱」を押す / Then onDriverSkip に自分の識別子", async () => {
    const onDriverSkip = vi.fn();
    render(<Session {...props(onBreakRoom(1000))} onDriverSkip={onDriverSkip} />);
    await userEvent.click(within(screen.getByRole("dialog", { name: "休憩中" })).getByRole("button", { name: "一時離脱" }));
    expect(onDriverSkip).toHaveBeenCalledWith("p-alice");
  });

  it("Given 自分が既に一時離脱中 / When 描く / Then 覆いに「一時離脱」は出ない", () => {
    const room = onBreakRoom(1000);
    room.participants = room.participants.map((p) => (p.participantId === "p-alice" ? { ...p, driverEligible: false } : p));
    render(<Session {...props(room)} />);
    expect(within(screen.getByRole("dialog", { name: "休憩中" })).queryByRole("button", { name: "一時離脱" })).toBeNull();
  });

  it("Given 休憩中で自分以外が全員 offline / When 描く / Then 最後の一人の警告", () => {
    render(<Session {...props(onBreakRoom(1000, { othersOffline: true }))} />);
    expect(screen.getByText(/あなたが最後の一人です/)).toBeInTheDocument();
  });

  it("Given 休憩中で他に online が居る / When 描く / Then 通常の回収の警告", () => {
    render(<Session {...props(onBreakRoom(1000))} />);
    expect(screen.getByText("全員がこの画面を閉じると、しばらくしてルームは消えます。")).toBeInTheDocument();
  });

  it("Given 知らせるだけで、いまの交代で知らせた / When 描く / Then 帯が出て押すと onStartBreak", async () => {
    const onStartBreak = vi.fn();
    const room = roomWith({
      config: { intervalMinutes: 5, break: { trigger: "elapsed", every: 60, mode: "suggest" } },
      totalSwitches: 3,
      brk: { since: null, suggestedAtSwitches: 3 },
    });
    render(<Session {...props(room)} onStartBreak={onStartBreak} />);
    expect(screen.getByText("休憩の時間です")).toBeInTheDocument();
    const band = screen.getByText("休憩の時間です").closest<HTMLElement>(".break-suggest-band");
    expect(band).not.toBeNull();
    await userEvent.click(within(band!).getByRole("button", { name: "休憩する" }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 知らせてから交代が進んだ / When 描く / Then 帯は出ない", () => {
    const room = roomWith({
      config: { intervalMinutes: 5, break: { trigger: "elapsed", every: 60, mode: "suggest" } },
      totalSwitches: 4,
      brk: { since: null, suggestedAtSwitches: 3 },
    });
    render(<Session {...props(room)} />);
    expect(screen.queryByText("休憩の時間です")).toBeNull();
  });

  it("Given 走行中 / When 交代と同時に休憩に入った snapshot が届く / Then 交代の全画面の知らせは出ない", () => {
    const running = (o: RoomOpts) => {
      const r = roomWith({ config: { ...ELAPSED, assertiveSwitch: true }, ...o });
      r.clock = { ...r.clock, running: true };
      return r;
    };
    const { rerender } = render(<Session {...props(running({}))} />);
    rerender(
      <Session {...props(running({ currentIndex: 1, totalSwitches: 1, brk: { since: 5000, suggestedAtSwitches: null } }))} />,
    );
    expect(screen.queryByRole("alertdialog", { name: "ドライバー交代通知" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
  });

  it("Given 走行中 / When 休憩なしの交代の snapshot が届く / Then 交代の全画面の知らせは出る（対照）", () => {
    const running = (o: RoomOpts) => {
      const r = roomWith({ config: { ...ELAPSED, assertiveSwitch: true }, ...o });
      r.clock = { ...r.clock, running: true };
      return r;
    };
    const { rerender } = render(<Session {...props(running({}))} />);
    rerender(<Session {...props(running({ currentIndex: 1, totalSwitches: 1 }))} />);
    expect(screen.getByRole("alertdialog", { name: "ドライバー交代通知" })).toBeInTheDocument();
  });

  it("Given 確認ダイアログ（最初から）が開いている / When 休憩中の snapshot が届く / Then フォーカスの奪い合いで落ちず、背後は inert", async () => {
    const { rerender } = render(<Session {...props(roomWith({ config: ELAPSED }))} />);
    await userEvent.click(screen.getByRole("button", { name: /最初から/ }));
    expect(screen.getByRole("dialog", { name: "最初から再スタートしますか？" })).toBeInTheDocument();
    const errors: unknown[] = [];
    const onErr = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener("error", onErr);
    expect(() => rerender(<Session {...props(onBreakRoom(1000))} />)).not.toThrow();
    // 背後の確認ダイアログの取消ボタンへフォーカスを移そうとしても、奪い合いにならない
    screen.getByRole("heading", { name: "休憩中" }).focus();
    screen.getByRole("button", { name: "キャンセル" }).focus();
    window.removeEventListener("error", onErr);
    expect(errors).toEqual([]);
    // 覆いの外（セッション画面の本体）は操作できない
    expect(document.querySelector("[inert]")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "休憩中" }).closest("[inert]")).toBeNull();
  });

  it("Given 休憩中 / When 描く / Then 覆いの外のセッション画面は inert、休憩でなければ inert でない", () => {
    const { container, rerender } = render(<Session {...props(roomWith({ config: ELAPSED }))} />);
    expect(container.querySelector("[inert]")).toBeNull();
    rerender(<Session {...props(onBreakRoom(1000))} />);
    expect(container.querySelector("[inert]")).not.toBeNull();
  });
});

describe("最後の一人の beforeunload（設計 §7.1）", () => {
  function unloadPrevented(): boolean {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }

  it("Given 休憩中で自分以外が全員 offline / When beforeunload / Then 確認が出る（preventDefault）", () => {
    render(<Session {...props(onBreakRoom(1000, { othersOffline: true }))} />);
    expect(unloadPrevented()).toBe(true);
  });

  it("Given 休憩中で他に online が居る / When beforeunload / Then 確認は出ない", () => {
    render(<Session {...props(onBreakRoom(1000))} />);
    expect(unloadPrevented()).toBe(false);
  });

  it("Given 休憩中でない（全員 offline でも） / When beforeunload / Then 確認は出ない", () => {
    render(<Session {...props(roomWith({ config: ELAPSED, othersOffline: true }))} />);
    expect(unloadPrevented()).toBe(false);
  });
});
