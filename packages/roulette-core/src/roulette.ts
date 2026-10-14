/**
 * ルーレットの状態の遷移（#94 spec §5.1）。
 *
 * **表現は直接遷移関数＋`Result`**（spec R16・`docs/adr/0016` 決定 1）。状態は小さく、
 * イベントの履歴・再生・段階適用が要らない。時計と乱数は引数で受ける（ドメインは環境を読まない）。
 */
import { err, ok, type Result } from "neverthrow";
import { drawWinner } from "./draw.js";
import type { RouletteError } from "./errors.js";
import { MAX_GUESTS, MAX_WHEEL, SETTLE_MAX, SETTLE_MIN, SPIN_DURATION_MS } from "./limits.js";
import { poolOf } from "./pool.js";
import type { Entry, EntryId, Member, NameConflict, RouletteState } from "./types.js";

export interface SpinInput {
  /** 名簿の断片（アプリ層が作る） */
  members: readonly Member[];
  /** 回した人の表示名 */
  spunBy: string;
  /** サーバーの単調時計（ms） */
  now: number;
  /** `[0, n)` の整数 */
  randomInt: (n: number) => number;
  /** `SETTLE_MIN`〜`SETTLE_MAX` の実数 */
  randomSettle: () => number;
  /** 名前の衝突判定（`room-core` の `conflictsWithExisting`）。在室者と同じ名前のゲストを外す（{@link poolOf}） */
  conflicts: NameConflict;
}

/** `startSpin` が返しうるコード。`INVALID_SETTLE`・`INVALID_RANDOM` は乱数源の契約違反（内部の誤り） */
type SpinErrorCode =
  | "ROULETTE_SPINNING"
  | "ROULETTE_TOO_FEW"
  | "ROULETTE_TOO_MANY"
  | "INVALID_SETTLE"
  | "INVALID_RANDOM";

/** 回転中か（`now - startedAt < SPIN_DURATION_MS`）。 */
function isSpinning(state: RouletteState, now: number): boolean {
  return state.lastSpin !== null && now - state.lastSpin.startedAt < SPIN_DURATION_MS;
}

/**
 * 回す。回転中・入る人が 2 人未満・`MAX_WHEEL` 超えは拒む。
 * 通れば `lastSpin` と `drawn` を更新した状態を返す（`wheel` は pool の凍結した写し）。
 */
export function startSpin(state: RouletteState, input: SpinInput): Result<RouletteState, RouletteError<SpinErrorCode>> {
  if (isSpinning(state, input.now)) return err({ code: "ROULETTE_SPINNING" });
  const pool = poolOf(input.members, state, input.conflicts);
  if (pool.length < 2) return err({ code: "ROULETTE_TOO_FEW" });
  if (pool.length > MAX_WHEEL) return err({ code: "ROULETTE_TOO_MANY" });
  const settle = input.randomSettle();
  if (!(settle >= SETTLE_MIN && settle <= SETTLE_MAX)) return err({ code: "INVALID_SETTLE" });
  return drawWinner(pool, state, input.randomInt).map(({ winnerIndex, drawn }) => ({
    ...state,
    drawn,
    lastSpin: {
      seq: (state.lastSpin?.seq ?? 0) + 1,
      wheel: pool,
      winnerIndex,
      settle,
      spunBy: input.spunBy,
      startedAt: input.now,
    },
  }));
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
  excluded: string[];
  guests: Entry[];
  drawn: string[];
  spin: null | {
    seq: number;
    wheel: Entry[];
    winnerIndex: number;
    settle: number;
    spunBy: string;
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
  return {
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
            spunBy: spin.spunBy,
            durationMs: SPIN_DURATION_MS,
            elapsedMs: Math.min(SPIN_DURATION_MS, Math.max(0, now - spin.startedAt)),
          },
  };
}
