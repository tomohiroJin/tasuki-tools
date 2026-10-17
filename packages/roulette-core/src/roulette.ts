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
import type { Entry, EntryId, Member, NameConflict, Pick, RouletteState } from "./types.js";

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
 * 回す。回転中・入る人が選ぶ人数 + 1 人未満（選ぶ人数 1 なら 2 人未満）・`MAX_WHEEL` 超えは拒む。
 * 通れば `lastSpin` と `drawn` を更新した状態を返す（`wheel` は pool の凍結した写し・`picks` は選ぶ人数の件数）。
 */
export function startSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  if (isSpinning(state, input.now)) return err({ code: "ROULETTE_SPINNING" });
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

/** ゲストを消し、`excluded`・`drawn` の記録も落とす。知らない ID は何も変えない（退出と同時に押されうる）。 */
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
            spunBy: spin.spunBy,
            durationMs,
            elapsedMs: Math.min(durationMs, Math.max(0, now - spin.startedAt)),
          },
  };
}
