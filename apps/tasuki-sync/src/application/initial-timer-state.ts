/**
 * timer の初期状態を組み立てる（#95 S5b）。
 *
 * **作る契機は 2 つあり、どちらも同じ 1 箇所を通る。**
 *
 *   1. timer の入口でルームを作った（`command-handlers/room-create.ts`）
 *   2. **timer の状態が無いルームへ timer の入口から入った**（`join-room.ts`。D8 の遅延生成）
 *
 * 2 が増えたのは S5b である。選択画面（ハブ）で作ったルームはツールの状態を持たない
 * ので、そのままでは timer へ入れない。S4a〜S5a は入口ごとの門
 * （`tool-gate.ts`）でこれを「入れないルーム」として拒んでいたが、
 * **入口が選択画面に一本化される以上、拒むのではなく作るのが正しい**（D8）。
 *
 * 写しを 2 つ持たないのは、初期状態が「輪に 1 席ある」という不変条件を含むためである ——
 * `evolve` は輪が空だと `currentIndex` を決められない。片方だけが席を置かない形に
 * なると、そのルームだけが最初の操作で破綻する。
 */
import {
  initialAggregate,
  type IntervalMinutes,
  type RotationEntry,
  type SessionConfig,
  type TimerConfig,
  type TimerState,
} from "@tasuki/timer-core";

export interface InitialTimerStateInput {
  /** ルームコード（名簿と対になる鍵）。 */
  code: string;
  /** 作成時刻（壁時計）。名簿の `createdAt` と揃える。 */
  createdAt: number;
  /**
   * 最初に輪へ座る人。
   *
   * 作成時は作成者、遅延生成のときは**そのとき timer へ入ってきた人**である。
   * 参加とローテーション加入は #95 S3 以降ふつうは独立しているが、
   * **輪を空にできない**という不変条件があるので、最初の 1 人だけは席に着く。
   */
  participantId: string;
  /**
   * timer の入口から来た設定（wire の形）。**遅延生成では渡されない**（既定で始める）。
   *
   * wire の設定は保管する設定と同じ形である（#294 で `members` が落ちた）ので、
   * ここはそのまま受ける。名簿は別の正本が持つ（#95 S4a・D15）—— 輪に並べられるのは
   * 作成時点の在室者ただ一人である。
   */
  config?: SessionConfig;
}

/** ルームを作らずに開いた timer の既定設定。 */
const DEFAULT_INTERVAL_MINUTES = 5 as IntervalMinutes;

export function createInitialTimerState(input: InitialTimerStateInput): TimerState {
  const { code, createdAt, participantId } = input;

  const config: TimerConfig = input.config ?? {
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  };

  const seat: RotationEntry = { kind: "member", participantId, eligible: true };
  const agg = initialAggregate(config, [seat]);

  return {
    code,
    createdAt,
    config,
    session: agg.session,
    clock: agg.clock,
    phase: "setup",
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}
