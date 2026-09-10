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
//   契約の一部である —— `validateName(raw): Result<string, RoomError>` は型推論が
//   効くので誰も `RoomError` を書かないが、注釈を書きたい利用者は名前を要求する。
//   **下の型はすべてこの理由で残している。**
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

// ./name
export { NAME_MAX_LENGTH, isValidName, validateName } from './name';
// RoomError: validateName が返す Result のエラー型（messageForRoomError の引数型でもある）
export type { RoomError } from './name';

// ./round
//
// `shouldAutoReveal` は**載せない**。`applyAutoReveal` が代わりの入口である。
// （#95 S4a では `discardVote`（R8: 退出した人の票を捨てる）も「呼び出し元が無い」ことを
// 理由にここへ載せなかったが、その後 `round.ts` から実装ごと落とした。理由と復活の段は
// `round.ts` の跡のコメントにある。）
export { createRound, castVote, applyAutoReveal, revealBy, nextRound } from './round';
// Round: 上の関数の引数・戻り値型（`RoundStore` が保管する型でもある）
// VoterView: applyAutoReveal の引数型。名簿の断片を構造的部分型で受ける
// RoundError: castVote / revealBy / nextRound が返す Result のエラー型
export type { Round, VoterView, RoundError } from './round';

// ./snapshot
export { createSnapshotBuilder } from './snapshot';
// ParticipantFragment: createSnapshotBuilder の引数型。名簿の断片を構造的部分型で受ける
export type { ParticipantFragment } from './snapshot';
