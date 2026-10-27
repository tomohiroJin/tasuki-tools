export { SIDES, VISIBILITIES, METHOD_IDS, METHODS, methodsOf } from "./methods.js";
export type { Side, Visibility, MethodId, CardId, MethodRule } from "./methods.js";

export { INITIAL_CHECKIN_STATE } from "./types.js";
export type { Round, CheckinState } from "./types.js";

export { CHECKIN_DOMAIN_ERROR_CODES } from "./errors.js";
export type { CheckinDomainErrorCode, CheckinError } from "./errors.js";

export {
  chooseMethod,
  drawMethod,
  playCard,
  setVisibility,
  reveal,
  playAgain,
  setSpectator,
  prune,
  applyAutoReveal,
} from "./checkin.js";

export { playersOf, toView } from "./projection.js";
export type { SeatInput, SeatView, PileView, RoundView, CheckinView } from "./projection.js";
