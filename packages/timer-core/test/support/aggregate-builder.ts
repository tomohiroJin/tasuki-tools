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
import type { Aggregate, IntervalMinutes, SessionConfig } from "../../src/aggregate.js";

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
  private currentIndex = 0;
  private intervalMinutes: IntervalMinutes = 5;
  private clockState: ClockState = "initial";
  private anchor: number = NOW;

  /** ローテーション順の参加者ID配列を設定する（D6b: 表示名一覧ではなくIDの配列）。 */
  withRotation(...ids: string[]): this {
    this.rotation = ids;
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
    if (this.rotation.length === 0) {
      throw new AggregateBuildError("withRotation() で最低1人指定する必要がある（空配列は不可）");
    }
    if (this.currentIndex < 0 || this.currentIndex >= this.rotation.length) {
      throw new AggregateBuildError(
        `withCurrentDriver(${this.currentIndex}) は rotation（${this.rotation.length}人）の範囲外`,
      );
    }

    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: this.rotation,
      intervalMinutes: this.intervalMinutes,
    };

    let agg = initialAggregate(config, this.rotation);
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
