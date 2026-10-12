export { SPIN_DURATION_MS, MAX_GUESTS, MAX_WHEEL, SETTLE_MIN, SETTLE_MAX } from "./limits.js";

export { INITIAL_ROULETTE_STATE } from "./types.js";
export type { Entry, EntryId, Member, RouletteState, Spin } from "./types.js";

export { poolOf } from "./pool.js";

export { drawWinner } from "./draw.js";
export type { DrawResult } from "./draw.js";

export {
  startSpin,
  isSpinning,
  setIncluded,
  addGuest,
  removeGuest,
  resetCycle,
  prune,
  toView,
} from "./roulette.js";
export type { SpinInput, RouletteView } from "./roulette.js";

export { ROULETTE_ERROR_CODES } from "./errors.js";
export type { RouletteError, RouletteDomainErrorCode, RouletteErrorCode } from "./errors.js";

export {
  RouletteCommandSchema,
  RouletteViewSchema,
  RouletteFrameSchema,
  RouletteErrorCodeSchema,
  RouletteErrorFrameSchema,
} from "./schemas.js";
export type { RouletteCommand } from "./schemas.js";

export { rouletteErrorMessageFor } from "./error-messages.js";
