// @tasuki/poker-core — ドメイン + プロトコル契約の単一情報源
//
// **公開記号は明示列挙する。`export *` は使わない**（ADR-0016 決定 2 項目 2）。
// 検査は `scripts/audit-public-surface.mjs` が行う。

// ./deck
export { NUMBER_CARD_VALUES, FIBONACCI_DECK, cardKey, cardEquals } from './deck';
export type { NumberCardValue, Card } from './deck';

// ./error-messages
export {
  DEFAULT_ERROR_MESSAGE,
  messageForRoundError,
  messageForRoomError,
} from './error-messages';

// ./protocol
export {
  ClientMessageSchema,
  ERROR_CODES,
  ServerMessageSchema,
  isKnownErrorCode,
  parseClientMessage,
  parseServerMessage,
} from './protocol';
export type {
  ClientMessage,
  ErrorCode,
  ServerMessage,
  RoomStateMessage,
  ParticipantView,
  RoundStats,
  VoteView,
  ProtocolError,
} from './protocol';

// ./room
export {
  NAME_MAX_LENGTH,
  isValidName,
  createRoom,
  findParticipantByToken,
  markDisconnected,
  markConnected,
  joinRoom,
} from './room';
export type { Participant, Round, Room, RoomError, ParticipantIds, RoomUpdate } from './room';

// ./round
export { castVote, shouldAutoReveal, applyAutoReveal, revealBy, nextRound } from './round';
export type { RoundError } from './round';

// ./snapshot
export { createSnapshotBuilder, snapshotFor } from './snapshot';

// ./stats
export { computeStats } from './stats';
