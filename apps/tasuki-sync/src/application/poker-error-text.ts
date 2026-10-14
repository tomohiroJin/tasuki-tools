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
} as const;
