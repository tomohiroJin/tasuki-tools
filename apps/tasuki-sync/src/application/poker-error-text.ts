/**
 * poker の接続へ返すエラーの文言のうち、同期サーバーの複数の場所が返すもの（#362）。
 *
 * **poker の契約は timer の系統とは別である**（コードはケバブ記法。`@tasuki/poker-core` の
 * `ErrorCode`）。いま同じ文の言葉があっても（例: `not-joined` と timer の系統の `NOT_IN_ROOM`）、
 * 一方だけを変えたいときに縛り合わないよう、`connection-errors.ts` とは混ぜない。
 */
export const POKER_ERROR_TEXT = {
  /** `room-not-found`。入室・照会・ルームへの操作の 3 か所が返す。 */
  ROOM_NOT_FOUND: 'ルームが見つかりません',
  /** `rate-limited`。入室と照会の 2 か所が返す。 */
  RATE_LIMITED: '試行が多すぎます。しばらくしてからお試しください',
  /** `not-joined`。参加していない接続・名簿に居ない人の操作（G-9）の 3 か所が返す。 */
  NOT_JOINED: 'ルームに参加していません',
  /** `participant-not-found`。`remove-participant` の対象が名簿に居ないとき（#419）。 */
  PARTICIPANT_NOT_FOUND: '参加者が見つかりません',
  /**
   * `not-removable`。接続している人・自分自身は外せない（#419・G-5）。
   * 自分自身・中核の輪の都合の拒否もこの 1 つに畳む（画面は自分の行にボタンを出さず、中核の拒否は理屈の上で届かないので、文言は「接続している人」で足りる）。
   */
  NOT_REMOVABLE: '接続している人は外せません',
} as const;
