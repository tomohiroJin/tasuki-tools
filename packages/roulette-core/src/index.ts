// 回転の長さ・人数の上限（`SPIN_DURATION_MS`・`MAX_GUESTS`・`MAX_WHEEL`）は載せない（#365）。外の製品コードは
// 使わず、回転の長さは wire の `durationMs` で届く。要るようになったら、そのとき載せる。
export { SETTLE_MIN, SETTLE_MAX } from "./limits.js";
// 止まる時刻の表と、2 人目からの「置く」「送る」の長さ（#401）。画面が何人目まで決まったかと角度を、
// サーバーと同じ表から出すために載せる（写しを持つと片方だけ直る）。
export { MAX_PICK, STOP_HOLD_MS, NEXT_MOVE_MS, pickStopsMs } from "./limits.js";

export { INITIAL_ROULETTE_STATE } from "./types.js";
export type { Entry, EntryId, Member, NameConflict, Pick, RouletteState, Spin } from "./types.js";

export { poolOf } from "./pool.js";

export {
  startSpin,
  setIncluded,
  addGuest,
  removeGuest,
  resetCycle,
  prune,
  setPickCount,
  toView,
} from "./roulette.js";
export type { SpinInput, RouletteView } from "./roulette.js";

export { ROULETTE_ERROR_CODES } from "./errors.js";
export type { RouletteError, RouletteDomainErrorCode, RouletteErrorCode } from "./errors.js";

export {
  RouletteCommandSchema,
  RouletteFrameSchema,
  RouletteErrorFrameSchema,
} from "./schemas.js";
export type { RouletteCommand } from "./schemas.js";

export { rouletteErrorMessageFor } from "./error-messages.js";
