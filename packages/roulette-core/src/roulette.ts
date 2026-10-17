/**
 * ルーレットの状態の遷移（#94 spec §5.1）。
 *
 * **表現は直接遷移関数＋`Result`**（spec R16・`docs/adr/0016` 決定 1）。状態は小さく、
 * イベントの履歴・再生・段階適用が要らない。時計と乱数は引数で受ける（ドメインは環境を読まない）。
 */
import { err, ok, type Result } from "neverthrow";
import { drawPicks } from "./draw.js";
import type { RouletteError } from "./errors.js";
import { MAX_GUESTS, MAX_PICK, MAX_WHEEL, SETTLE_MAX, SETTLE_MIN, spinDurationMs } from "./limits.js";
import { poolOf } from "./pool.js";
import type { Entry, EntryId, Member, NameConflict, OrderRound, Pick, RouletteMode, RouletteState } from "./types.js";

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
}

/** `startSpin` が返しうるコード。`INVALID_SETTLE`・`INVALID_RANDOM` は乱数源の契約違反（内部の誤り） */
type SpinErrorCode =
  | "ROULETTE_SPINNING"
  | "ROULETTE_TOO_FEW"
  | "ROULETTE_TOO_FEW_FOR_PICK"
  | "ROULETTE_TOO_MANY"
  | "INVALID_SETTLE"
  | "INVALID_RANDOM";

/** 回転中か（`now - startedAt < spinDurationMs(k)`）。k は回した時点の人数（`picks` の件数・#401 spec M3）。 */
function isSpinning(state: RouletteState, now: number): boolean {
  const spin = state.lastSpin;
  return spin !== null && now - spin.startedAt < spinDurationMs(spin.picks.length);
}

/**
 * 回す。回転中は拒む。決め方で分ける（#401 順番に回す T1）。
 */
export function startSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  if (isSpinning(state, input.now)) return err({ code: "ROULETTE_SPINNING" });
  return state.mode === "order" ? startOrderSpin(state, input) : startOnceSpin(state, input);
}

/**
 * 1 回で決める（#94・#401 複数人決定）。入る人が選ぶ人数 + 1 人未満（選ぶ人数 1 なら 2 人未満）・`MAX_WHEEL` 超えは拒む。
 * 通れば `lastSpin` と `drawn` を更新した状態を返す（`wheel` は pool の凍結した写し・`picks` は選ぶ人数の件数）。
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
  return drawPicks(pool, state, k, input.randomInt).map(({ picks: indices, drawn }) => {
    const picks = indices.map((index, i): Pick => ({ index, settle: settles[i] ?? SETTLE_MIN }));
    const first = picks[0] ?? { index: 0, settle: SETTLE_MIN };
    return {
      ...state,
      drawn,
      lastSpin: {
        seq: (state.lastSpin?.seq ?? 0) + 1,
        wheel: pool,
        winnerIndex: first.index,
        settle: first.settle,
        picks,
        spunBy: input.spunBy,
        startedAt: input.now,
      },
    };
  });
}

/**
 * 順番に回す（#401 順番に回す T2・T3・T4・T6・T7）。押すたびに「まだの人」（入る人 − 番が決まった人）から 1 人を一様に引く。
 *
 * - 回が無い・終わっていれば新しい回を始める。新しい回は 2 人から（`ROULETTE_TOO_FEW`）
 * - まだの人が 1 人なら**回さずに**その人の番にして回を終える（`lastSpin` は変えない・T3）。0 人（途中で全員が抜けた）なら回を終える
 * - 選ぶ人数（`pickCount`）と一周の記録（`drawn`）は使わず、変えない（T7）
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
  return ok({
    ...state,
    order: { done: [...round.done, chosen], finished: false },
    lastSpin: {
      seq: (state.lastSpin?.seq ?? 0) + 1,
      wheel: open,
      winnerIndex: index,
      settle,
      picks: [{ index, settle }],
      turn: round.done.length + 1,
      spunBy: input.spunBy,
      startedAt: input.now,
    },
  });
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
 * ゲストを消し、`excluded`・`drawn` の記録も落とす。知らない ID は何も変えない（退出と同時に押されうる）。
 * 順番に回す回の記録（`order.done`）からは落とさない（`prune` と同じ理由）。
 */
export function removeGuest(state: RouletteState, id: EntryId): RouletteState {
  if (!state.guests.some((g) => g.id === id)) return state;
  return {
    ...state,
    guests: state.guests.filter((g) => g.id !== id),
    excluded: state.excluded.filter((x) => x !== id),
    drawn: state.drawn.filter((x) => x !== id),
  };
}

/** 一周をやり直す（`drawn` を空にする）。すでに空なら同じ参照を返す（変わらない操作は配らない）。 */
export function resetCycle(state: RouletteState): RouletteState {
  return state.drawn.length === 0 ? state : { ...state, drawn: [] };
}

/**
 * 名簿から消えた参加者の ID を `excluded` / `drawn` から落とす（退出を繰り返しても配列が膨らまない）。
 * **ゲストの ID も `knownIds` に含めて呼ぶこと**（含めないとゲストの記録が落ちる）。
 *
 * **順番に回す回の記録（`order.done`）からは落とさない**（#401 順番に回す T6・PR #418 のレビュー）。番は `done` の並びの位置なので、
 * 落とすと後ろの人の番が繰り上がり、次の番が既出の番と重なる。発表を終えた人が部屋を閉じるのはこの決め方の普通の使い方である。
 * `done` は決まったときの名前ごと持つので名簿が要らず、大きさは回の中で番が決まった人数で頭打ちになる（回が終われば捨てる）。
 */
export function prune(state: RouletteState, knownIds: Iterable<EntryId>): RouletteState {
  const known = new Set(knownIds);
  const excluded = state.excluded.filter((id) => known.has(id));
  const drawn = state.drawn.filter((id) => known.has(id));
  // 何も落ちなければ同じ参照を返す（同期サーバーが「変わっていない」を参照で判定する）
  if (excluded.length === state.excluded.length && drawn.length === state.drawn.length) return state;
  return { ...state, excluded, drawn };
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
  const spin = state.lastSpin;
  const durationMs = spin === null ? 0 : spinDurationMs(spin.picks.length);
  return {
    pickCount: state.pickCount,
    mode: state.mode,
    order: state.order === null ? null : { done: state.order.done.map((e) => ({ ...e })), finished: state.order.finished },
    excluded: [...state.excluded],
    guests: state.guests.map((g) => ({ ...g })),
    drawn: [...state.drawn],
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
            spunBy: spin.spunBy,
            durationMs,
            elapsedMs: Math.min(durationMs, Math.max(0, now - spin.startedAt)),
          },
  };
}
