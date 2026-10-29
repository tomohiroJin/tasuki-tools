// 回転の長さ（`SPIN_DURATION_MS`）は載せない（#365）。外の製品コードは使わず、wire の `durationMs` で届く。
// 人数の上限（`MAX_GUESTS`・`MAX_WHEEL`）は #458 で画面が使うので載せる。
export { MAX_GUESTS, MAX_WHEEL } from "./limits.js";
export { SETTLE_MIN, SETTLE_MAX } from "./limits.js";
// 止まる時刻の表と、2 人目からの「置く」「送る」の長さ（#401）。画面が何人目まで決まったかと角度を、
// サーバーと同じ表から出すために載せる（写しを持つと片方だけ直る）。
export { MAX_PICK, STOP_HOLD_MS, NEXT_MOVE_MS, pickStopsMs } from "./limits.js";
// 押して止める（#401）。画面が回る速さと 30 秒の自動停止を、サーバーと同じ値で描くために載せる
export { PRESS_AUTO_STOP_MS, PRESS_SEATS_PER_SEC } from "./limits.js";
export { pressPositionAt, pressStopOf } from "./press.js";
// 変わった止まり方（#420）。画面が止まり方の名前を読み、1 人目が止まる時刻（`pickStopsMs` の第 2 引数）をそろえるために載せる
export { STOP_STYLES, STOP_STYLE_EXTRA_MS, isStopStyle } from "./limits.js";
export type { StopStyle } from "./limits.js";

export { INITIAL_ROULETTE_STATE } from "./types.js";
export type { Entry, EntryId, Member, NameConflict, OrderRound, Pick, PressSpin, PressStop, RouletteMode, RouletteState, Spin } from "./types.js";

export { poolOf } from "./pool.js";

export {
  startSpin,
  setIncluded,
  addGuest,
  addGuests,
  removeGuest,
  prune,
  setPickCount,
  setMode,
  resetOrder,
  stopPress,
  toView,
} from "./roulette.js";
export type { GuestBatch, SpinInput, StopInput, RouletteView } from "./roulette.js";

export { ROULETTE_ERROR_CODES } from "./errors.js";
export type { RouletteError, RouletteDomainErrorCode, RouletteErrorCode } from "./errors.js";

export {
  RouletteCommandSchema,
  RouletteFrameSchema,
  RouletteErrorFrameSchema,
} from "./schemas.js";
export type { RouletteCommand } from "./schemas.js";

export { rouletteErrorMessageFor } from "./error-messages.js";
