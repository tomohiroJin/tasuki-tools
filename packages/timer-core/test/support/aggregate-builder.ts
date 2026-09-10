/**
 * anAggregate() — 集約構築ビルダー（packages/timer-core 共有・新設5）
 *
 * core のテストは集約（{ session, clock }）を直接組み立てて decide/evolve を呼ぶ。
 * apps/sync の aRoom() は makeHandlers 経由でコマンドを流すルーム専用ビルダーであり、
 * core には使えない（Given の形がまったく違う）。
 *
 * `initialAggregate` を内部で使い、実際の状態遷移（SessionStarted/SessionPaused）は
 * evolve() にそのまま任せる。現在 12 ファイルが手で組んでいる形の和集合以上は作らない（FR-118）。
 *
 * 前提の構築（withCurrentDriver の範囲外指定・rotation 未指定 等）に失敗した場合は throw する。
 * これにより、前提の失敗（このヘルパのバグ／使い方の誤り）と、
 * テスト対象の検証の失敗（`expect` によるアサーション失敗）を区別できる（FR-096）。
 *
 * @requirements FR-096, FR-097, FR-118, US2
 */

import { initialAggregate } from "../../src/aggregate.js";
import { evolve } from "../../src/evolve.js";
import { rotationEntryId } from "../../src/aggregate.js";
import type { Aggregate, IntervalMinutes, RotationEntry, TimerConfig } from "../../src/aggregate.js";

/** 参加者IDの並びを「名簿を指す席」の並びへ写す（#95 S4a）。 */
export function memberSeats(...ids: string[]): RotationEntry[] {
  return ids.map((participantId) => ({ kind: "member" as const, participantId, eligible: true }));
}

/**
 * 代理の席（#95 S4a・D6）。**名簿に居ない人の席**なので、判別可能 union の proxy 側を
 * 踏むテストはここから作る。`memberSeats` だけを使っていると proxy 側の分岐
 * （`rotationEntryId` の proxy 分岐・`MembersShuffled` の remap・`member.add` の重複判定）が
 * 一度も実行されない。
 */
export function proxySeat(id: string, label: string): RotationEntry {
  return { kind: "proxy", id, label, eligible: true };
}

/** 席の並びを識別子の並びへ写す（アサーションを ID で書くため）。 */
export function seatIds(rotation: readonly RotationEntry[]): string[] {
  return rotation.map(rotationEntryId);
}

/** 決定的なアンカー時刻の既定値。各テストが独自の epoch を書かなくて済むようにする。 */
export const NOW = 1_000_000;

/** 前提の構築に失敗したことを表すエラー。検証の失敗と区別するための専用型。 */
class AggregateBuildError extends Error {
  constructor(message: string) {
    super(`anAggregate(): ${message}`);
    this.name = "AggregateBuildError";
  }
}

type ClockState = "initial" | "running" | "paused";

export function anAggregate(): AggregateBuilder {
  return new AggregateBuilder();
}

class AggregateBuilder {
  private rotation: string[] = ["Alice", "Bob", "Charlie"];
  private seats: RotationEntry[] | undefined = undefined;
  private currentIndex = 0;
  private intervalMinutes: IntervalMinutes = 5;
  private clockState: ClockState = "initial";
  private anchor: number = NOW;

  /** ローテーション順の参加者ID配列を設定する（D6b: 表示名一覧ではなくIDの配列）。
   *  #95 S4a で rotation は席の配列になったが、ここは ID で受けて席へ写す。 */
  withRotation(...ids: string[]): this {
    this.rotation = ids;
    this.seats = undefined;
    return this;
  }

  /** 席そのものを並べる（代理を混ぜたいとき。#95 S4a）。`withRotation` と排他。 */
  withSeats(...seats: RotationEntry[]): this {
    this.seats = seats;
    return this;
  }

  /** 現ドライバーの index を設定する。 */
  withCurrentDriver(index: number): this {
    this.currentIndex = index;
    return this;
  }

  /** 交代間隔（分）を設定する。既定は 5 分。 */
  withIntervalMinutes(minutes: IntervalMinutes): this {
    this.intervalMinutes = minutes;
    return this;
  }

  /** clock を稼働中にする（SessionStarted 相当）。 */
  running(): this {
    this.clockState = "running";
    return this;
  }

  /** clock を一時停止済みにする（SessionStarted → SessionPaused 相当）。 */
  paused(): this {
    this.clockState = "paused";
    return this;
  }

  /** アンカー時刻（SessionStarted/SessionPaused の now）を設定する。既定は NOW。 */
  at(now: number): this {
    this.anchor = now;
    return this;
  }

  build(): Aggregate {
    const seats = this.seats ?? memberSeats(...this.rotation);
    if (seats.length === 0) {
      throw new AggregateBuildError("withRotation()/withSeats() で最低1席指定する必要がある（空配列は不可）");
    }
    if (this.currentIndex < 0 || this.currentIndex >= seats.length) {
      throw new AggregateBuildError(
        `withCurrentDriver(${this.currentIndex}) は rotation（${seats.length}席）の範囲外`,
      );
    }

    const config: TimerConfig = {
      language: "TypeScript",
      difficulty: "easy",
      intervalMinutes: this.intervalMinutes,
    };

    let agg = initialAggregate(config, seats);
    agg = {
      ...agg,
      session: { ...agg.session, currentIndex: this.currentIndex },
    };

    if (this.clockState === "running" || this.clockState === "paused") {
      agg = evolve(agg, { type: "SessionStarted", now: this.anchor }, this.anchor);
    }
    if (this.clockState === "paused") {
      agg = evolve(agg, { type: "SessionPaused", now: this.anchor }, this.anchor);
    }

    return agg;
  }
}
