// @tasuki/poker-core — ドメイン + プロトコル契約の単一情報源
//
// **公開記号は明示列挙する。`export *` は使わない**（ADR-0016 決定 2 項目 2）。
// 検査は `scripts/audit-public-surface.mjs` が行う。
//
// ## 何を載せるか（ADR-0016 追記 2026-09-01・#182）
//
// - **値**（関数・定数）は、このパッケージの外の製品コードが取り込むものだけを載せる。
//   代わりの入口があるなら載せない（例: `ClientMessageSchema` ではなく
//   `parseClientMessage`、`shouldAutoReveal` ではなく `applyAutoReveal`）。
//   落としてもパッケージ内部の相対 import は変わらないので、振る舞いは変わらない。
// - **型**は、載せた値の**署名から到達できる**なら載せる。取り込まれていなくても
//   契約の一部である —— `createRoom(…, ids: ParticipantIds): Result<RoomUpdate, RoomError>`
//   は型推論が効くので誰も `ParticipantIds` を書かないが、注釈を書きたい利用者は
//   名前を要求する。**下の型はすべてこの理由で残している。**
//
// 値の側は `scripts/audit-structure.mjs` の SC-039④ が見張る（型は数えない）。

// ./deck
export { FIBONACCI_DECK, cardKey, cardEquals } from './deck';
// NumberCardValue: Card の number 枝の値型
export type { NumberCardValue, Card } from './deck';

// ./error-messages
export {
  DEFAULT_ERROR_MESSAGE,
  messageForRoundError,
  messageForRoomError,
} from './error-messages';

// ./protocol
export { isKnownErrorCode, parseClientMessage, parseServerMessage } from './protocol';
// ProtocolError: parse* が返す Result のエラー型
// ServerMessage: parseServerMessage の戻り値型
export type {
  ClientMessage,
  ErrorCode,
  ServerMessage,
  OutboundServerMessage,
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
// Participant: Room.participants の要素型・findParticipantByToken の戻り値型
// Round: Room.round の型
// ParticipantIds: createRoom / joinRoom の引数型
// RoomUpdate / RoomError: createRoom / joinRoom が返す Result の両側
export type { Participant, Round, Room, RoomError, ParticipantIds, RoomUpdate } from './room';

// ./round
export { castVote, applyAutoReveal, revealBy, nextRound } from './round';
export type { RoundError } from './round';

// ./snapshot
export { createSnapshotBuilder } from './snapshot';
