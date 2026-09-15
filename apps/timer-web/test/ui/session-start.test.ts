/**
 * ロビーの「開始」で何を送るかの判定（#95 S5c・C-1）。
 *
 * **時計が走っているかだけでは足りない。** `session.complete` は一時停止中でも休憩中でも
 * 通るので、完了したルームの時計は止まっていることがある。そこで `START` を送ると、
 * 前のセッションの残り時間・ドライバーの順・担当回数を引きずったまま走り出す。
 */
import { describe, it, expect } from "vitest";
import { carriesPreviousSession, startActionFor } from "../../src/ui/session-start.js";
import { aRoomView } from "../support/room-view.js";

/** 一度も開始していないルームの集約（`initialAggregate` が作る形）。 */
function pristine() {
  const room = aRoomView();
  return { session: room.session, clock: room.clock };
}

describe("startActionFor", () => {
  it("一度も開始していなければ START を送る", () => {
    // Given: 作られたばかりのルーム
    const { session, clock } = pristine();

    // When / Then
    expect(startActionFor(session, clock)).toBe("start");
  });

  it("時計が走っていれば作り直す（完了したセッションの時計は止まっていない）", () => {
    // Given: 完成として締めた直後（`SessionCompleted` は集約を畳み込まない）
    const { session, clock } = pristine();

    // When / Then
    expect(startActionFor(session, { ...clock, running: true, runningSince: 1000 })).toBe("reset");
  });

  it("一時停止したまま完了していれば作り直す（時計は止まっている）", () => {
    // Given: 一時停止 →「完成!」。`running` は false だが `isPaused` が残る
    const { session, clock } = pristine();
    const paused = { ...session, isPaused: true };
    const frozen = { ...clock, running: false, secondsLeftAtAnchor: 120, accumulatedElapsedMs: 300_000 };

    // When
    const action = startActionFor(paused, frozen);

    // Then: ここが "start" に落ちると、残り 120 秒・再開待ちのまま次が始まる
    expect(action).toBe("reset");
  });

  it("休憩したまま完了していれば作り直す（`isPaused` は立たない）", () => {
    // Given: 休憩で時計を止めたまま「完成!」。`isPaused` は立たず、経過だけが積まれる
    const { session, clock } = pristine();
    const onBreak = { ...clock, running: false, accumulatedElapsedMs: 60_000 };

    // When / Then
    expect(startActionFor(session, onBreak)).toBe("reset");
  });

  it("交代の跡が残っていれば作り直す（時計が満タンへ戻されていても）", () => {
    // Given: 「最初から」で時計だけ満タンに戻した後に完了した形
    const { session, clock } = pristine();
    const switched = { ...session, currentIndex: 1, totalSwitches: 3, driverCounts: [2, 1] };

    // When / Then: 時計だけ見ると初期状態と見分けが付かない
    expect(startActionFor(switched, clock)).toBe("reset");
  });
});

describe("carriesPreviousSession", () => {
  it("初期状態だけが「引きずっていない」", () => {
    // Given
    const { session, clock } = pristine();

    // When / Then
    expect(carriesPreviousSession(session, clock)).toBe(false);
  });

  it("残り時間が減っていれば引きずっている", () => {
    // Given: 途中で止まった時計（`freezeRunningClock` が残量を焼き付けた形）
    const { session, clock } = pristine();

    // When / Then
    expect(carriesPreviousSession(session, { ...clock, secondsLeftAtAnchor: 1 })).toBe(true);
  });
});
