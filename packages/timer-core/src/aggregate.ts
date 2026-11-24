/**
 * ドメインの集約型と導出関数
 * FR-006, FR-007, FR-008
 */

import type { BreakPolicy } from "./break-policy.js";

/**
 * ローテーションの 1 席（#95 S4a・D6）。
 *
 * **代理は名簿の住人ではなく、輪の上のラベルである。** 名簿（`@tasuki/room-core`）に
 * 居るのは実際に名乗って入室した人だけで、対面で同席しているだけの人（代理）は
 * ここにしか存在しない。だからこの型は「名簿の参加者を指す席」と「ラベルだけの席」の
 * 2 つを持つ判別可能 union になっている。
 *
 * `eligible` はドライバーとして順番が回ってくるかどうか（一時離脱で false になる）。
 * かつては `Participant.driverEligible` が持っていたが、それは名簿の属性ではなく
 * 「輪の上の席の属性」なので、名簿から抜くときにここへ移した。
 *
 * ⚠ **`eligible` の書き手は `evolve` ではない。** `DriverSkipped` / `DriverResumed` は
 * 集約の畳み込みでは扱わず（`evolve.ts` の該当 case を参照）、アプリ層の
 * `apps/tasuki-sync/src/application/apply-room-level-event.ts` が席を書き換える。
 * 席そのものを足す `ProxyMemberAdded` も同じ場所である（`MemberAdded` だけが evolve 側）。
 */
export type RotationEntry =
  | { kind: "member"; participantId: string; eligible: boolean }
  | { kind: "proxy"; id: string; label: string; eligible: boolean };

/** ローテーションの席の識別子。member は参加者ID、proxy は自分の ID。 */
export function rotationEntryId(entry: RotationEntry): string {
  return entry.kind === "member" ? entry.participantId : entry.id;
}

/** 休憩の基準・知らせの印に使う「稼働時間と交代回数」の組（#402）。 */
export interface BreakMark {
  /** 稼働区間の合計（ms） */
  elapsedMs: number;
  /** 総交代回数 */
  switches: number;
}

/** 休憩の状態（#402）。 */
export interface BreakState {
  /** 休憩に入った時刻（epoch ms）。休憩中でなければ null */
  since: number | null;
  /** 次の休憩の条件を測る起点。休憩に入るたびに書き直す */
  baseline: BreakMark;
  /** 休憩を知らせた時点の値。知らせていなければ null */
  suggestedAt: BreakMark | null;
}

/** 休憩の状態の初期値（休憩中でなく、基準は 0、知らせていない）。 */
export const INITIAL_BREAK_STATE: BreakState = {
  since: null,
  baseline: { elapsedMs: 0, switches: 0 },
  suggestedAt: null,
};

/** 休憩中か。 */
export function isOnBreak(session: Pick<SessionState, "break">): boolean {
  return session.break.since !== null;
}

/**
 * セッションが始まっているか（走行中・一時停止中・休憩中〔`break.since`〕・稼働の累計がある、のいずれか）。
 * 開始前（ロビー）の集約は時計が一度も走っていない（`accumulatedElapsedMs` が 0 で止まっている）。
 * 完成・中断のあとロビーへ戻った集約は、時計は止まっているが稼働の累計が残るので、始まっている側になる。
 * evolve（運転中の席を外したときの直前のドライバー）と、decide（開始前の break.start の拒否・
 * 運転中の人を外すときランダム交代の袋から引くかどうか〔#660〕）が共有する。
 */
export function sessionHasStarted(agg: Aggregate): boolean {
  return agg.clock.running || agg.session.isPaused || agg.session.break.since !== null || agg.clock.accumulatedElapsedMs > 0;
}

/**
 * ランダム交代の袋（#660）。交代のたびに、**この周でまだ運転していない適格な人**から次のドライバーを引く。
 *
 * どちらも席の識別子（{@link rotationEntryId}）で持つ。並べ替え・削除で添字は動くが、識別子は人に付く。
 * 輪に居ない識別子が残っていてもよい（読むとき {@link nextDriverIndex} が輪の席だけを見る）。席を外した人が
 * 入り直しても「この周で運転した」ことは残る。
 */
export interface RandomRotation {
  /**
   * 引く順。サーバーが作った順列（乱数はサーバーが持つ）を席の識別子へ写したもの。交代・開始のたびに作り直す。
   * 作り直したあとに入った席は載っていない。その席は、載っている席の後ろに輪の順で並ぶものとして読む。
   */
  order: readonly string[];
  /** この周で運転した人（いまの運転者を含む）。適格な全員が運転し終えたら、次の交代で交代先の 1 人に戻す。 */
  drove: readonly string[];
}

/** セッション状態（時間系を含まない） */
interface SessionState {
  /** ローテーション順の席（#95 S4a・D6） */
  rotation: RotationEntry[];
  /**
   * 現ドライバーのインデックス。
   * 不変条件: 輪が空なら 0、それ以外は `0 ≤ currentIndex < rotation.length` の整数（#376）。
   */
  currentIndex: number;
  /** 一時停止フラグ */
  isPaused: boolean;
  /** 各人の担当回数（rotationと同じ長さ） */
  driverCounts: number[];
  /** 総交代回数 */
  totalSwitches: number;
  /**
   * 直前に実際に運転した人の席の識別子（{@link rotationEntryId}・#374）。交代がまだ無ければ null。
   *
   * ナビ（⑦）はこの人を指す。輪の上の 1 つ前の席ではない —— 交代は飛ばされる席を飛ばし
   * （`nextEligibleIndex`）、強制指名（`driver.assign`）は輪のどこへでも飛ぶので、
   * 1 つ前の席の人は運転していないことがある。席の状態は「いま」しか持たないので、
   * 画面が席から逆向きにたどっても復元できない。
   *
   * **添字ではなく識別子で持つ。** 並べ替え・削除で添字は動くが、識別子は人に付く。
   * 添字への投影は同期サーバーの snapshot DTO が毎回行う（`session.previousDriverIndex`）。
   * 書き手は `evolve` の `DriverSwitched` と、運転中の人が外れたときの `MemberRemoved` である
   * （イベントの形は変えていない）。
   */
  previousDriverId: string | null;
  /**
   * ランダム交代の袋（#660）。輪の順で回るモードなら null。
   *
   * 設定の `rotationMode`（`TimerState.config`）を集約へ写したもので、交代間隔の `clock.intervalSeconds` と同じ関係にある。
   * 次に替わる人は {@link nextDriverIndex} がここから決める。交代（decide）と予告（同期サーバーの snapshot DTO）が
   * 同じ関数を呼ぶので、予告した人と実際に替わる人は食い違わない。
   */
  randomRotation: RandomRotation | null;
  /**
   * 休憩の状態（#402）。時計と同じ evolve で変わるので、表示と時計が食い違わない。
   * v2.10 は休憩をルームの `onBreak` に持ち、時計を止めずに食い違った。
   */
  break: BreakState;
}

/**
 * サーバー権威タイマー状態
 * 残り時間と経過時間は anchorServerTime から導出する
 */
export interface ServerClock {
  /** タイマー稼働中フラグ */
  running: boolean;
  /** 交代間隔（秒） */
  intervalSeconds: number;
  /** 開始/再開/交代時のサーバー時刻 (epoch ms) */
  anchorServerTime: number;
  /** anchor時点の残り秒 */
  secondsLeftAtAnchor: number;
  /** 稼働区間の合計(ms)。停止時に確定加算 */
  accumulatedElapsedMs: number;
  /** 現在の稼働区間の開始時刻（停止中はnull） */
  runningSince: number | null;
}

/** 集約 */
export interface Aggregate {
  session: SessionState;
  clock: ServerClock;
}

/**
 * timer の設定（**サーバー側**・#95 S4a・D15）。
 *
 * **名簿を持たない。** かつてここには `members: string[]`（表示名の一覧）があったが、
 * それは名簿（`@tasuki/room-core`）と `session.rotation` の二重帳簿だった。表示名の
 * 解決はアプリ層の DTO 組み立て（`timer-snapshot-dto.ts`）が毎回行う。
 *
 * **wire へ出る形もこれと同じである**（{@link ./wire.js SessionConfig} は別名にすぎない）。
 * #294 まで wire だけが `members`（ローテーション順の表示名）を持っていたが、読み手が
 * 席（`session.seats`）へ移ったので落とした。
 */
export interface TimerConfig {
  /** 交代間隔（分）: 3/5/7/10/15 のみ */
  intervalMinutes: IntervalMinutes;
  /** ナビゲーター役を明示するか */
  navigatorEnabled?: boolean;
  /** 休憩の条件（#402）。無ければ「なし」 */
  break?: BreakPolicy;
  /** 強い全画面交代通知を使うか */
  assertiveSwitch?: boolean;
  /** 交代先の決め方（#660）。無ければ輪の順（`"order"`） */
  rotationMode?: RotationMode;
  // ⚠ かつてここには `language` / `difficulty`（お題を作るときの言語と難易度）と
  // お題機能を使うかの切り替えがあった。**#91 PR 3 で落とした。** お題は
  // ルームの共有資産（`@tasuki/topic-core`）になり、timer はお題を作らず、お題の有無で
  // 開始を止めることもない。`SessionConfigSchema` に項目が無いので、古い画面が
  // `config.set` に載せて送ってきてもパーサの出力に残らない。
}

/**
 * 交代先の決め方の一覧（#660）。型とスキーマの両方がここから導く。
 * `"order"` は輪の順、`"random"` は交代のたびにランダム（{@link RandomRotation}）。
 */
export const ROTATION_MODES = ["order", "random"] as const;

/** 交代先の決め方 */
export type RotationMode = (typeof ROTATION_MODES)[number];

/**
 * ルームフェーズの一覧。**型とスキーマの両方がここから導く**（#363。以前は 6 か所に書いていた）。
 */
export const ROOM_PHASES = ["setup", "ready", "session", "celebration"] as const;

/** ルームフェーズ */
export type RoomPhase = (typeof ROOM_PHASES)[number];

/**
 * **ドメインが扱う**セッション操作の一覧（`decide` の `session.act`）。
 *
 * wire（`schemas.ts` の `session.act`）はこれに `COMPLETE`・`RESET` を足した 7 つを受けるが、
 * その 2 つはドメインが扱わない（同期サーバーの翻訳で落ち、UNKNOWN_COMMAND になる。#363）。
 * 「ドメインの集合 ⊂ wire の集合」という関係を、wire 側がここを広げて組むことで表す。
 */
export const SESSION_ACTIONS = [
  "START",
  "SWITCH",
  "PAUSE",
  "RESUME",
  // 現ドライバーのまま持ち時間だけを満タンからやり直す（Issue #14）。
  "RESTART",
] as const;

/** ドメインが扱うセッション操作 */
export type SessionAction = (typeof SESSION_ACTIONS)[number];

/**
 * サーバー側の timer の状態（#95 S4a・D2）。
 *
 * **名簿を持たない。** 誰が居るかはメンバーシップ文脈（`@tasuki/room-core` の `Room`）が
 * 正本で、`code` で突き合わせる。この 2 つが出会うのはアプリ層の DTO 組み立て
 * （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts`）だけである。
 *
 * クライアントへ送る形は {@link ./wire.js Room} で、これはその投影ではなく合成結果である。
 */
export interface TimerState {
  code: string;
  createdAt: number;
  config: TimerConfig;
  session: SessionState;
  clock: ServerClock;
  phase: RoomPhase;
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  // ⚠ かつてここには timer のお題（`problem`・`problemMode`・`aiUnlocked`・
  // `problemGeneration`・AI の鍵を持つ参加者の一覧）があった。**#91 PR 3 で落とした。** お題は
  // ルームの共有資産になり、状態は `@tasuki/topic-core` の文脈が持つ（timer-core は
  // topic-core を知らない。完成記録のタイトルはアプリ層が値として渡す）。
}

/** 完成記録 */
export interface CompletionRecord {
  id: string;
  roomId?: string;
  /**
   * 完了した時点で掲げていたお題のタイトル（#91・spec T9）。お題なしで完了したら null。
   * **本文は持たない**（`sessionRecords` は件数の上限が無く、毎回の snapshot で配られる）。
   */
  topicTitle: string | null;
  elapsedSeconds: number;
  members: string[];
  totalSwitches: number;
  completedAt: number;
  /** ドライバー別の担当回数（members と同順・§振り返り）。旧記録には無いので任意。 */
  driverCounts?: number[];
  /** ローテーションが一巡した回数（totalSwitches / rotation 長）。任意。 */
  rounds?: number;
}

// ─── 導出関数 ───────────────────────────────────────────────────────────────

/**
 * 現在の残り秒を導出する
 * @param clock タイマー状態
 * @param now 現在時刻 (epoch ms)
 * @param clockOffset クライアント→サーバーの時刻補正量(ms)
 */
export function secondsLeft(
  clock: ServerClock,
  now: number,
  clockOffset = 0,
): number {
  if (!clock.running) {
    return clock.secondsLeftAtAnchor;
  }
  const adjustedNow = now + clockOffset;
  const elapsed = (adjustedNow - clock.anchorServerTime) / 1000;
  return Math.max(0, clock.secondsLeftAtAnchor - elapsed);
}

/**
 * 稼働経過時間(ms)を導出する（停止中の時間を除外）
 * FR-006
 * @param clock タイマー状態
 * @param now 現在時刻 (epoch ms)
 * @param clockOffset クライアント→サーバーの時刻補正量(ms)
 */
export function elapsedMs(
  clock: ServerClock,
  now: number,
  clockOffset = 0,
): number {
  if (!clock.running || clock.runningSince === null) {
    return clock.accumulatedElapsedMs;
  }
  const adjustedNow = now + clockOffset;
  return clock.accumulatedElapsedMs + (adjustedNow - clock.runningSince);
}

/**
 * 初期集約を生成する。
 *
 * rotation は**席の配列**（{@link RotationEntry}）なので、設定からは組み立てられない。
 * 呼び出し側が「誰が輪に並ぶか」を席として渡す（D6b・#95 S4a）。
 */
export function initialAggregate(config: TimerConfig, rotation: readonly RotationEntry[]): Aggregate {
  const agg = initialAggregateInSeconds(config.intervalMinutes * 60, rotation);
  if (config.rotationMode !== "random") return agg;
  // 作成の時点では乱数を受けない（`room.create` は decide を通らない）。引く順は空で始め、開始（START）で作る。
  return { ...agg, session: { ...agg.session, randomRotation: freshRandomRotation(agg.session, undefined) } };
}

/**
 * 秒で受ける {@link initialAggregate}（#364）。リセット（`evolve.ts` の `SessionReset`）は
 * 集約の秒をそのまま使う。かつては分へ戻して（`as IntervalMinutes`）から渡し、ここでまた秒に直していた。
 *
 * **パッケージの内側だけで使う**（`index.ts` に出さない）。
 */
export function initialAggregateInSeconds(intervalSeconds: number, rotation: readonly RotationEntry[]): Aggregate {
  return {
    session: {
      rotation: [...rotation],
      currentIndex: 0,
      isPaused: false,
      driverCounts: rotation.map(() => 0),
      totalSwitches: 0,
      previousDriverId: null,
      randomRotation: null,
      break: INITIAL_BREAK_STATE,
    },
    clock: {
      running: false,
      intervalSeconds,
      anchorServerTime: 0,
      secondsLeftAtAnchor: intervalSeconds,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
  };
}

/**
 * ドライバー対象（driverEligible !== false）の次のインデックスを返す。
 * @param session セッション状態
 * @param currentIndex 現在のインデックス
 * @param ineligible ドライバー対象外のインデックス集合（undefined = 全員対象）
 * @returns 次の eligible インデックス。全員 ineligible の場合は currentIndex を返す。
 */
export function nextEligibleIndex(
  session: Pick<SessionState, "rotation">,
  currentIndex: number,
  ineligible: ReadonlySet<number> | undefined,
): number {
  const len = session.rotation.length;
  if (len === 0) return 0;
  if (!ineligible || ineligible.size === 0) {
    return (currentIndex + 1) % len;
  }

  // 最大 len 回試行して eligible を見つける
  for (let i = 1; i <= len; i++) {
    const candidate = (currentIndex + i) % len;
    if (!ineligible.has(candidate)) return candidate;
  }
  // 全員 ineligible → 現状維持
  return currentIndex;
}

/** 交代先を決めるのに要る、セッションの部分。`randomRotation` を省くと輪の順として扱う。 */
type RotationView = Pick<SessionState, "rotation"> & Partial<Pick<SessionState, "randomRotation">>;

/**
 * `fromIndex` の席の次に運転する席の添字（#660）。**交代先の決め方の入口はここ 1 つである。**
 *
 * 輪の順のモードなら {@link nextEligibleIndex}、ランダム交代なら袋（{@link RandomRotation}）から決める。
 * 交代（decide の SWITCH・`advanceDriver`）・運転中の人を外したときの次の担当・snapshot の予告が、すべてここを呼ぶ。
 * 交代先が無ければ `fromIndex` を返す（{@link nextEligibleIndex} と同じ約束）。
 *
 * @param ineligible 交代先にしない席の添字（undefined = 全員適格）
 */
export function nextDriverIndex(
  session: RotationView,
  fromIndex: number,
  ineligible: ReadonlySet<number> | undefined,
): number {
  const random = session.randomRotation ?? null;
  return random === null
    ? nextEligibleIndex(session, fromIndex, ineligible)
    : nextRandomIndex(session.rotation, random, fromIndex, ineligible);
}

/**
 * ランダム交代の次の席。引く順に並べた席のうち、`fromIndex` でも不適格でもない席から、
 * この周でまだ運転していない最初の席を選ぶ。全員が運転し終えていれば最初の席（次の周の最初の人）。
 * 候補が無ければ `fromIndex`。
 */
function nextRandomIndex(
  rotation: readonly RotationEntry[],
  random: RandomRotation,
  fromIndex: number,
  ineligible: ReadonlySet<number> | undefined,
): number {
  const len = rotation.length;
  if (len === 0) return 0;
  const indexById = new Map(rotation.map((entry, i) => [rotationEntryId(entry), i]));
  // 引く順の席。輪に居ない識別子は飛ばし、同じ席は 1 回だけ数える（Set は入れた順を保つ）
  const ordered = new Set<number>();
  for (const id of random.order) {
    const i = indexById.get(id);
    if (i !== undefined) ordered.add(i);
  }
  // 引く順に居ない席（作り直したあとに入った人）は、その後ろに輪の順で並べる
  for (let step = 1; step <= len; step++) ordered.add((fromIndex + step) % len);

  const open = [...ordered].filter((i) => i !== fromIndex && !ineligible?.has(i));
  const drove = new Set(random.drove);
  // `!`: open の添字は ordered（輪の席の添字）から来る
  return open.find((i) => !drove.has(rotationEntryId(rotation[i]!))) ?? open[0] ?? fromIndex;
}

/** 順列（席の添字）を席の識別子へ写す。順列でなければ undefined。 */
function seatIdsInOrder(rotation: readonly RotationEntry[], order: readonly number[] | undefined): string[] | undefined {
  if (order === undefined || !isPermutation(order, rotation.length)) return undefined;
  // `!`: 直前で [0..len-1] の順列だと確かめた
  return order.map((i) => rotationEntryId(rotation[i]!));
}

/**
 * いまの運転者だけが運転した状態の袋を作る（モードを入れたとき・開始・リセット）。
 * `order` が順列でなければ（省略を含む）、`fallback` の引く順を使う。無ければ空（輪の順で並ぶ）。
 */
export function freshRandomRotation(
  session: Pick<SessionState, "rotation" | "currentIndex">,
  order: readonly number[] | undefined,
  fallback: readonly string[] = [],
): RandomRotation {
  const current = session.rotation[session.currentIndex];
  return {
    order: seatIdsInOrder(session.rotation, order) ?? fallback,
    drove: current !== undefined ? [rotationEntryId(current)] : [],
  };
}

/**
 * 交代（SWITCH・時間切れ・運転中の人を外したあとの繰り上げ）で `nextIndex` の席へ替わったあとの袋。
 * ランダム交代でなければ null。
 *
 * 交代先がこの周で運転し終えていたら（{@link nextDriverIndex} が未運転の人を見つけられなかった）、次の周を始める。
 * `order` が順列なら引く順を作り直す。順列でなければ（省略を含む）今の引く順のまま。
 */
export function randomRotationAfterSwitch(
  session: Pick<SessionState, "rotation" | "randomRotation">,
  nextIndex: number,
  order: readonly number[] | undefined,
): RandomRotation | null {
  const random = session.randomRotation;
  const next = session.rotation[nextIndex];
  if (random === null || next === undefined) return random;
  const id = rotationEntryId(next);
  return {
    order: seatIdsInOrder(session.rotation, order) ?? random.order,
    drove: random.drove.includes(id) ? [id] : [...random.drove, id],
  };
}

/**
 * 指名（`driver.assign`）で `index` の席へ替わったあとの袋。ランダム交代でなければ null。
 * 指名された人をこの周で運転した人に足す。運転し終えた人を指名しても、周は始め直さない。
 */
export function randomRotationAfterAssign(
  session: Pick<SessionState, "rotation" | "randomRotation">,
  index: number,
): RandomRotation | null {
  const random = session.randomRotation;
  const target = session.rotation[index];
  if (random === null || target === undefined) return random;
  const id = rotationEntryId(target);
  return random.drove.includes(id) ? random : { order: random.order, drove: [...random.drove, id] };
}

/**
 * 輪の席を指す添字か（整数で `0 ≤ i < len`）。#376。
 *
 * **decide と evolve が同じこの述語を使う。** decide は範囲外を `InvalidIndex` で拒み、
 * evolve は範囲外を持つイベントを黙って無視する（集約をそのまま返す）。述語を 1 本にしておくと、
 * 「decide は通したのに evolve が無視する」「decide は拒むのに evolve は適用する」の食い違いが起きない。
 * 整数でない添字も拒む —— 配列の添字としては切り捨てられ、別の席を指してしまう。
 */
export function isSeatIndex(i: number, len: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < len;
}

/**
 * 輪の長さが `len` のときに `currentIndex` として正しい値か（`SessionState.currentIndex` の不変条件。#376）。
 * 空の輪なら 0 だけ、それ以外は席の添字。
 */
export function isCurrentIndexFor(i: number, len: number): boolean {
  return len === 0 ? i === 0 : isSeatIndex(i, len);
}

/** `order` が `[0..len-1]` の順列か（長さが同じ・全部が席の添字・重複が無い）。decide と evolve が共有する（#376）。 */
export function isPermutation(order: readonly number[], len: number): boolean {
  return order.length === len && order.every((i) => isSeatIndex(i, len)) && new Set(order).size === len;
}

/**
 * 運転中の人の席（`removedIndex`）を外したとき、次に担当になる席を**外した後の添字**で返す（#376）。
 *
 * 交代と同じ規則（{@link nextDriverIndex}。輪の順なら外れた席の次から、ランダム交代なら袋から）で適格な人を探す。
 * 適格な人が居なければ、位置で次の席（末尾なら先頭）にする —— 交代なら「現状維持」になる場面だが、
 * 外れた人の席には留まれないので、`ineligible` を省いたとき（=全員が適格）と同じ席へ倒す。
 * 外した後の輪が空なら 0。
 *
 * どの入力でも NaN を返さない。外す席の添字が範囲外（空の輪を含む）なら、何も外れないので
 * いまの担当（`currentIndex`）を返す。
 *
 * @param ineligible 交代先にしない席（外す前の添字。undefined = 全員適格）
 */
export function nextDriverAfterRemoval(
  session: RotationView & Pick<SessionState, "currentIndex">,
  removedIndex: number,
  ineligible: ReadonlySet<number> | undefined,
): number {
  const len = session.rotation.length;
  if (!isSeatIndex(removedIndex, len)) return session.currentIndex;
  // 適格な人が居なければ nextDriverIndex は外した席そのものを返す（外した席を飛ばすかどうかに関わらない）。
  // 長さ 1 なら外した席しか無いので、位置で次の席 (0 + 1) % 1 = 0 になる。
  const found = nextDriverIndex(session, removedIndex, ineligible);
  const chosen = found === removedIndex ? (removedIndex + 1) % len : found;
  return chosen > removedIndex ? chosen - 1 : chosen;
}

/** 交代間隔として許容される分の一覧 */
export const VALID_INTERVAL_MINUTES = [3, 5, 7, 10, 15] as const;

/** 交代間隔の型 */
export type IntervalMinutes = (typeof VALID_INTERVAL_MINUTES)[number];

/** ローテーションに並べられる席数の上限。
 *  下限（かつての `MIN_MEMBERS`）は、それを見ていた `config.set` の members 検証が
 *  #95 S4a で概念ごと消えたため落とした（`decide.ts` の削除箇所を参照）。 */
export const MAX_MEMBERS = 10;

// ⚠ かつてここには `MAX_DISPLAY_NAME` と `MAX_NFKC_EXPANSION` があった。
// **#95 S4b で `@tasuki/room-core` の `display-name.ts` へ移した。** 表示名の規約は
// メンバーシップ文脈のものであり、その上限をモブタイマーのドメインが持っていたのは、
// 境界の検証（`schemas.ts`）がここから引いていた名残である。
// 適用する場所も `apps/tasuki-sync/src/application/normalize-command-names.ts` へ移り、
// **これで `timer-core → room-core` の期限つき一時依存が消えた**（`docs/adr/0017` 決定 4）。
export const MAX_ROOM_NAME = 60;
export const MAX_HANDOFF_NOTE = 2000;
// ⚠ かつてここにはお題の上限（要件・タイトル・本文・ヒント）・設定の言語と難易度の
// 上限・AI 解錠の合言葉の上限があった。**#91 PR 3 でお題ごと timer-core から落とした。**
// お題の上限はいま `@tasuki/topic-core` の `limits.ts` が持つ。

// ⚠ かつてここに合言葉の最大長（`MAX_PASSPHRASE`）があった。**#377 で `@tasuki/room-core` へ移した。**
// 合言葉はルームの入室を守るもので、玄関の `room.join` も同じ上限で確かめる必要があるため。
