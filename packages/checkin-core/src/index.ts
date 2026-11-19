export {
  SIDES,
  VISIBILITIES,
  METHOD_IDS,
  METHOD_IDS_BEFORE_635,
  METHODS,
  methodsOf,
  GROUP_IDS,
  METHOD_GROUPS,
  groupsOf,
} from "./methods.js";
export type { Side, Visibility, MethodId, CardId, MethodRule, GroupId, MethodGroup } from "./methods.js";

export { INITIAL_CHECKIN_STATE } from "./types.js";
export type { Round, CheckinState } from "./types.js";

export { CHECKIN_DOMAIN_ERROR_CODES } from "./errors.js";
export type { CheckinDomainErrorCode, CheckinError } from "./errors.js";

export {
  chooseMethod,
  drawMethod,
  drawMethodForOldClients,
  drawMethodInGroup,
  playCard,
  setVisibility,
  reveal,
  playAgain,
  setSpectator,
  prune,
  applyAutoReveal,
  recordRevealedNames,
} from "./checkin.js";

export { playersOf, toView } from "./projection.js";
export type { SeatInput, SeatView, PileView, RoundView, CheckinView } from "./projection.js";

export {
  CheckinCommandSchema,
  CheckinFrameSchema,
  CheckinErrorFrameSchema,
  CHECKIN_ERROR_CODES,
} from "./schemas.js";
export type { CheckinCommand, CheckinErrorCode } from "./schemas.js";

export { checkinErrorMessageFor } from "./error-messages.js";
