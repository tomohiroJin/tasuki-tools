/**
 * ルーレットの状態の遷移（#94 spec §5.1）。
 *
 * **表現は直接遷移関数＋`Result`**（spec R16・`docs/adr/0016` 決定 1）。状態は小さく、
 * イベントの履歴・再生・段階適用が要らない。時計と乱数は引数で受ける（ドメインは環境を読まない）。
 */
import { err, ok, type Result } from "neverthrow";
import { drawPicks } from "./draw.js";
import type { RouletteError } from "./errors.js";
import { MAX_GUESTS, MAX_PICK, MAX_WHEEL, PRESS_AUTO_STOP_MS, PRESS_SEATS_PER_SEC, SETTLE_MAX, SETTLE_MIN, spinDurationMs } from "./limits.js";
import { pressStopOf } from "./press.js";
import { poolOf } from "./pool.js";
import { drawStopStyle } from "./stop-style.js";
import type { Entry, EntryId, Member, NameConflict, OrderRound, Pick, PressSpin, PressStop, RouletteMode, RouletteState, Spin } from "./types.js";

export interface SpinInput {
  /** 名簿の断片（アプリ層が作る） */
  members: readonly Member[];
  /** 回した人の表示名 */
  spunBy: string;
  /** サーバーの単調時計（ms） */
  now: number;
  /** `[0, n)` の整数 */
  randomInt: (n: number) => number;
  /** `SETTLE_MIN`〜`SETTLE_MAX` の実数。選ぶ人数の回だけ呼ぶ */
  randomSettle: () => number;
  /** 名前の衝突判定（`room-core` の `conflictsWithExisting`）。在室者と同じ名前のゲストを外す（{@link poolOf}） */
  conflicts: NameConflict;
  /**
   * 変わった止まり方を引く `[0, n)` の整数（#420）。同期サーバーは `randomInt` と同じ乱数源を渡す。
   * **省くと引かない**（変わった止まり方をしない）。当たりを引く `randomInt` とは分けて受ける（当たりの引き方を変えない・spec S8）
   */
  randomStyle?: (n: number) => number;
}

/** `startSpin` が返しうるコード。`INVALID_SETTLE`・`INVALID_RANDOM` は乱数源の契約違反（内部の誤り） */
type SpinErrorCode =
  | "ROULETTE_SPINNING"
  | "ROULETTE_TOO_FEW"
  | "ROULETTE_TOO_FEW_FOR_PICK"
  | "ROULETTE_TOO_MANY"
  | "INVALID_SETTLE"
  | "INVALID_RANDOM";

/**
 * 回転中か（`now - startedAt < spinDurationMs(k)`）。k は回した時点の人数（`picks` の件数・#401 spec M3）。
 * 押して止める回転は、止まるまで（押されるか 30 秒たつまで）回転中（#401 押して止める）。
 */
function isSpinning(state: RouletteState, now: number): boolean {
  const spin = state.lastSpin;
  if (spin === null) return false;
  if (spin.press !== undefined) return pressStopOf(spin, now - spin.startedAt) === null;
  return now - spin.startedAt < spinDurationMs(spin.picks.length, spin.stopStyle);
}

/**
 * 変わった止まり方を引いて回転に載せる（#420 spec S1・S4）。出なければ回転をそのまま返す（項目を持たない）。
 * 押して止めるには掛けない（押した位置と違う動きをすると嘘に見える・#401 押して止める P10）。
 */
function withStopStyle(spin: Spin, randomStyle: SpinInput["randomStyle"]): Result<Spin, RouletteError<"INVALID_RANDOM">> {
  if (randomStyle === undefined) return ok(spin);
  return drawStopStyle(randomStyle).map((stopStyle) => (stopStyle === null ? spin : { ...spin, stopStyle }));
}

/**
 * 回す。回転中は拒む。決め方で分ける（#401 順番に回す T1）。
 */
export function startSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  if (isSpinning(state, input.now)) return err({ code: "ROULETTE_SPINNING" });
  if (state.mode === "press") return startPressSpin(state, input);
  return state.mode === "order" ? startOrderSpin(state, input) : startOnceSpin(state, input);
}

/**
 * 1 回で決める（#94・#401 複数人決定）。入る人が選ぶ人数 + 1 人未満（選ぶ人数 1 なら 2 人未満）・`MAX_WHEEL` 超えは拒む。
 * 通れば `lastSpin` を更新した状態を返す（`wheel` は pool の凍結した写し・`picks` は選ぶ人数の件数）。
 */
function startOnceSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  const pool = poolOf(input.members, state, input.conflicts);
  const k = state.pickCount;
  // 入る人がちょうど k 人なら全員が選ばれ、回す意味が無い（#401 spec M5）。k = 1 では #94 の「2 人から」と同じ
  if (pool.length < k + 1) return err({ code: k === 1 ? "ROULETTE_TOO_FEW" : "ROULETTE_TOO_FEW_FOR_PICK" });
  if (pool.length > MAX_WHEEL) return err({ code: "ROULETTE_TOO_MANY" });
  const settles: number[] = [];
  for (let i = 0; i < k; i++) {
    const settle = input.randomSettle();
    if (!(settle >= SETTLE_MIN && settle <= SETTLE_MAX)) return err({ code: "INVALID_SETTLE" });
    settles.push(settle);
  }
  return drawPicks(pool, k, input.randomInt).andThen((indices) => {
    const picks = indices.map((index, i): Pick => ({ index, settle: settles[i] ?? SETTLE_MIN }));
    const first = picks[0] ?? { index: 0, settle: SETTLE_MIN };
    const spin: Spin = {
      seq: (state.lastSpin?.seq ?? 0) + 1,
      wheel: pool,
      winnerIndex: first.index,
      settle: first.settle,
      picks,
      spunBy: input.spunBy,
      startedAt: input.now,
    };
    return withStopStyle(spin, input.randomStyle).map((lastSpin) => ({ ...state, lastSpin }));
  });
}

/**
 * 順番に回す（#401 順番に回す T2・T3・T4・T6・T7）。押すたびに「まだの人」（入る人 − 番が決まった人）から 1 人を一様に引く。
 *
 * - 回が無い・終わっていれば新しい回を始める。新しい回は 2 人から（`ROULETTE_TOO_FEW`）
 * - まだの人が 1 人なら**回さずに**その人の番にして回を終える（`lastSpin` は変えない・T3）。0 人（途中で全員が抜けた）なら回を終える
 * - 選ぶ人数（`pickCount`）は使わず、変えない（T7）
 */
function startOrderSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  const round: OrderRound = state.order === null || state.order.finished ? { done: [], finished: false } : state.order;
  const doneIds = new Set(round.done.map((e) => e.id));
  const pool = poolOf(input.members, state, input.conflicts);
  const open = pool.filter((e) => !doneIds.has(e.id));
  if (round.done.length === 0 && open.length < 2) return err({ code: "ROULETTE_TOO_FEW" });
  const last = open.length === 1 ? open[0] : undefined;
  if (open.length <= 1) {
    return ok({ ...state, order: { done: last === undefined ? round.done : [...round.done, last], finished: true } });
  }
  if (open.length > MAX_WHEEL) return err({ code: "ROULETTE_TOO_MANY" });
  const settle = input.randomSettle();
  if (!(settle >= SETTLE_MIN && settle <= SETTLE_MAX)) return err({ code: "INVALID_SETTLE" });
  const index = input.randomInt(open.length);
  const chosen = open[index];
  // randomInt が契約（[0, n)）を破った。サーバーの乱数源は契約を守るので、ここへは来ない
  if (chosen === undefined) return err({ code: "INVALID_RANDOM" });
  const spin: Spin = {
    seq: (state.lastSpin?.seq ?? 0) + 1,
    wheel: open,
    winnerIndex: index,
    settle,
    picks: [{ index, settle }],
    turn: round.done.length + 1,
    spunBy: input.spunBy,
    startedAt: input.now,
  };
  return withStopStyle(spin, input.randomStyle).map((lastSpin) => ({
    ...state,
    order: { done: [...round.done, chosen], finished: false },
    lastSpin,
  }));
}

/**
 * 押して止める（#401 押して止める P2）。止まる席を決めずに回し始める。起点の位置（`p0`）は乱数で決める
 * （30 秒で自動に止まったときに一様になるように）。選ぶ人数と一周の記録は使わず、変えない（P6）。
 */
function startPressSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  const pool = poolOf(input.members, state, input.conflicts);
  if (pool.length < 2) return err({ code: "ROULETTE_TOO_FEW" });
  if (pool.length > MAX_WHEEL) return err({ code: "ROULETTE_TOO_MANY" });
  const seat = input.randomInt(pool.length);
  if (!Number.isInteger(seat) || seat < 0 || seat >= pool.length) return err({ code: "INVALID_RANDOM" });
  const settle = input.randomSettle();
  if (!(settle >= SETTLE_MIN && settle <= SETTLE_MAX)) return err({ code: "INVALID_SETTLE" });
  return ok({
    ...state,
    lastSpin: {
      seq: (state.lastSpin?.seq ?? 0) + 1,
      wheel: pool,
      winnerIndex: 0,
      settle: SETTLE_MIN,
      picks: [],
      press: { p0: seat + settle, rate: PRESS_SEATS_PER_SEC, stop: null },
      spunBy: input.spunBy,
      startedAt: input.now,
    },
  });
}

export interface StopInput {
  /** 押した画面が見ていた回転 */
  seq: number;
  /** 押した瞬間に、その画面の指し針が指していた席と、席の中の位置（0 以上 1 未満） */
  index: number;
  settle: number;
  /** 押した人の表示名 */
  by: string;
  /** サーバーの単調時計（ms） */
  now: number;
}

/** 止まった回転（当たりの席・`picks` を止まった位置にそろえる。古い画面と、1 人の結果を読む画面の部品のため） */
function withStop(spin: Spin & { press: PressSpin }, stop: PressStop): Spin {
  return { ...spin, winnerIndex: stop.index, settle: stop.settle, picks: [{ index: stop.index, settle: stop.settle }], press: { ...spin.press, stop } };
}

/**
 * 押して止める（#401 押して止める P3・P4）。**押した画面が送った位置で止める**（押した人の画面が正）。
 * 最初の押下だけを採る。止まった後・30 秒を過ぎた後・違う回転への押下は何も変えない（同じ参照。ほぼ同時に押すのは普通のこと）。
 * 位置の形（席の番号は 0〜席数未満の整数・席の中の位置は 0 以上 1 未満）が外れたら拒む。
 * **押した時刻と位置が合っているかは見ない**: 1 秒 20 席では 1 周が 1.2 秒以下で、時間の窓ではどの席も通る（spec P4）。
 */
export function stopPress(state: RouletteState, input: StopInput): Result<RouletteState, RouletteError<"ROULETTE_STOP_INVALID">> {
  const spin = state.lastSpin;
  if (spin === null || spin.press === undefined || spin.seq !== input.seq) return ok(state);
  if (pressStopOf(spin, input.now - spin.startedAt) !== null) return ok(state);
  const { index, settle } = input;
  if (!Number.isInteger(index) || index < 0 || index >= spin.wheel.length) return err({ code: "ROULETTE_STOP_INVALID" });
  if (!(settle >= 0 && settle < 1)) return err({ code: "ROULETTE_STOP_INVALID" });
  return ok({ ...state, lastSpin: withStop({ ...spin, press: spin.press }, { index, settle, by: input.by, atMs: input.now - spin.startedAt }) });
}

/**
 * 決め方を変える（#401 順番に回す T1・T8）。回っている間（`ROULETTE_SPINNING`）と、順番に回す回の途中
 * （`ROULETTE_ROUND_IN_PROGRESS`）は拒む。変えたら回を捨てる。同じ値なら同じ参照を返す。
 */
export function setMode(
  state: RouletteState,
  mode: RouletteMode,
  now: number,
): Result<RouletteState, RouletteError<"ROULETTE_SPINNING" | "ROULETTE_ROUND_IN_PROGRESS">> {
  if (state.mode === mode) return ok(state);
  if (isSpinning(state, now)) return err({ code: "ROULETTE_SPINNING" });
  if (state.order !== null && !state.order.finished) return err({ code: "ROULETTE_ROUND_IN_PROGRESS" });
  return ok({ ...state, mode, order: null });
}

/**
 * 順番に回す回を最初からやり直す（#401 順番に回す T8）。一周の記録（`drawn`）は変えない。回が無ければ同じ参照を返す。
 * 回っている間は拒む（回っている円盤が、回す前の円盤へ跳ぶ）。
 */
export function resetOrder(state: RouletteState, now: number): Result<RouletteState, RouletteError<"ROULETTE_SPINNING">> {
  if (state.order === null) return ok(state);
  if (isSpinning(state, now)) return err({ code: "ROULETTE_SPINNING" });
  return ok({ ...state, order: null });
}

/**
 * 選ぶ人数を変える（#401 spec M2）。1〜`MAX_PICK` の整数の外は拒む。同じ値なら同じ参照を返す
 * （変わらない操作は配らない）。**回っている間も受ける** —— 回転は回した時点の人数を `picks` に凍結して持つので、
 * 変えてもその回転は変わらない（spec M3。外す・戻すと同じ扱い）。
 */
export function setPickCount(state: RouletteState, count: number): Result<RouletteState, RouletteError<"INVALID_PICK_COUNT">> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PICK) return err({ code: "INVALID_PICK_COUNT" });
  return ok(state.pickCount === count ? state : { ...state, pickCount: count });
}

/** 外す・戻す。冪等（トグルにしない —— 2 人がほぼ同時に押すと打ち消し合う）。 */
export function setIncluded(state: RouletteState, id: EntryId, included: boolean): RouletteState {
  const has = state.excluded.includes(id);
  if (included) return has ? { ...state, excluded: state.excluded.filter((x) => x !== id) } : state;
  return has ? state : { ...state, excluded: [...state.excluded, id] };
}

/**
 * 名前を足す。**名前は正規化済みで受ける**（正規化は同期サーバーが表示名の規約で行う・spec R13）。
 *
 * 同じ名前は拒む。比べる相手は `members`（名簿の全参加者。**在室を問わない**）と、すでに足したゲスト。
 * 同じ名前かは渡された `conflicts`（`room-core` の `conflictsWithExisting`。参加の重複拒否と同じ関数・同じキー）
 * だけで決め、**ここで文字列を比べない**（写しを持つと、大文字小文字の扱いが参加と食い違う）。
 */
export function addGuest(
  state: RouletteState,
  name: string,
  members: readonly Member[],
  conflicts: NameConflict,
): Result<RouletteState, RouletteError<"TOO_MANY_GUESTS" | "GUEST_NAME_TAKEN">> {
  if (state.guests.length >= MAX_GUESTS) return err({ code: "TOO_MANY_GUESTS" });
  const existing = [...members, ...state.guests].map((e) => ({ participantId: e.id, displayName: e.name }));
  if (conflicts(existing, name)) return err({ code: "GUEST_NAME_TAKEN" });
  const guest: Entry = { id: `g-${state.nextGuestSeq}`, name };
  return ok({ ...state, guests: [...state.guests, guest], nextGuestSeq: state.nextGuestSeq + 1 });
}

/**
 * ゲストを消し、`excluded` の記録も落とす。知らない ID は何も変えない（退出と同時に押されうる）。
 * 順番に回す回の記録（`order.done`）からは落とさない（`prune` と同じ理由）。
 */
export function removeGuest(state: RouletteState, id: EntryId): RouletteState {
  if (!state.guests.some((g) => g.id === id)) return state;
  return {
    ...state,
    guests: state.guests.filter((g) => g.id !== id),
    excluded: state.excluded.filter((x) => x !== id),
  };
}

/**
 * 名簿から消えた参加者の ID を `excluded` から落とす（退出を繰り返しても配列が膨らまない）。
 * **ゲストの ID も `knownIds` に含めて呼ぶこと**（含めないとゲストの記録が落ちる）。
 *
 * **順番に回す回の記録（`order.done`）からは落とさない**（#401 順番に回す T6・PR #418 のレビュー）。番は `done` の並びの位置なので、
 * 落とすと後ろの人の番が繰り上がり、次の番が既出の番と重なる。発表を終えた人が部屋を閉じるのはこの決め方の普通の使い方である。
 * `done` は決まったときの名前ごと持つので名簿が要らず、大きさは回の中で番が決まった人数で頭打ちになる（回が終われば捨てる）。
 */
export function prune(state: RouletteState, knownIds: Iterable<EntryId>): RouletteState {
  const known = new Set(knownIds);
  const excluded = state.excluded.filter((id) => known.has(id));
  // 何も落ちなければ同じ参照を返す（同期サーバーが「変わっていない」を参照で判定する）
  if (excluded.length === state.excluded.length) return state;
  return { ...state, excluded };
}

/** wire へ載せる形（spec §5.3）。 */
export interface RouletteView {
  /** 決め方（#401 順番に回す）。**古いサーバーは載せない**（web は `once` として読む） */
  mode?: RouletteMode | undefined;
  /** 順番に回す回。古いサーバーは載せない */
  order?: { done: Entry[]; finished: boolean } | null | undefined;
  /** 選ぶ人数（#401）。**古いサーバーは載せない**ので省略しうる（web は 1 として読む） */
  pickCount?: number | undefined;
  excluded: string[];
  guests: Entry[];
  drawn: string[];
  spin: null | {
    seq: number;
    wheel: Entry[];
    winnerIndex: number;
    settle: number;
    /** 止まる順の当たり（#401）。古いサーバーは載せない（web は `[{ index: winnerIndex, settle }]` として読む） */
    picks?: Pick[] | undefined;
    /** 順番に回すときの番（#401 順番に回す）。1 回で決めるときは載せない */
    turn?: number | undefined;
    /** 押して止めるとき（#401 押して止める）。古いサーバーは載せない */
    press?: { p0: number; rate: number; stop: PressStop | null } | undefined;
    /**
     * 変わった止まり方（#420）。ごくまれにだけ載せる。**文字列で受ける**（新しいサーバーの知らない名前でフレームごと捨てない。
     * 画面は `isStopStyle` で読み、知らなければ普通に止まる）
     */
    stopStyle?: string | undefined;
    spunBy: string;
    /** 回転の全体の長さ（k 人ぶん・`spinDurationMs`） */
    durationMs: number;
    elapsedMs: number;
  };
}

/**
 * wire へ載せる形にする。`elapsedMs` を**この時点で**計る（0〜`durationMs` に丸める）。
 * `startedAt` は出力に載せない（プロセスの外では意味を持たない・spec R5）。
 */
export function toView(state: RouletteState, now: number): RouletteView {
  const stored = state.lastSpin;
  // 押して止める回転は 30 秒で自動に止まる。止まった位置は式から出し、当たりの席もそろえて載せる（状態には書かない）
  const press = stored?.press;
  const auto = stored !== null && press !== undefined && press.stop === null ? pressStopOf(stored, now - stored.startedAt) : null;
  const spin = stored !== null && press !== undefined && auto !== null ? withStop({ ...stored, press }, auto) : stored;
  const durationMs = spin === null ? 0 : spin.press !== undefined ? PRESS_AUTO_STOP_MS : spinDurationMs(spin.picks.length, spin.stopStyle);
  return {
    pickCount: state.pickCount,
    mode: state.mode,
    order: state.order === null ? null : { done: state.order.done.map((e) => ({ ...e })), finished: state.order.finished },
    excluded: [...state.excluded],
    guests: state.guests.map((g) => ({ ...g })),
    // 古い画面が必須で読むので空の配列で送り続ける（#427 J6）。新しい画面は読まない
    drawn: [],
    spin:
      spin === null
        ? null
        : {
            seq: spin.seq,
            wheel: spin.wheel.map((e) => ({ ...e })),
            winnerIndex: spin.winnerIndex,
            settle: spin.settle,
            picks: spin.picks.map((p) => ({ ...p })),
            ...(spin.turn === undefined ? {} : { turn: spin.turn }),
            ...(spin.press === undefined
              ? {}
              : { press: { p0: spin.press.p0, rate: spin.press.rate, stop: spin.press.stop === null ? null : { ...spin.press.stop } } }),
            ...(spin.stopStyle === undefined ? {} : { stopStyle: spin.stopStyle }),
            spunBy: spin.spunBy,
            durationMs,
            elapsedMs: Math.min(durationMs, Math.max(0, now - spin.startedAt)),
          },
  };
}
