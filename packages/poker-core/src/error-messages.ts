// ドメインエラーの表示文言（docs/adr/0016 決定 2 項目 3）。
//
// エラー値は判別子と機械可読な詳細だけを持ち、文言はここが担う。
// **code だけでは文言を復元できない** — not-host も not-voting も、
// どの操作から来たかで文言が違う。そのため op を機械可読な詳細として持たせている。
//
// timer-core の displayMessageFor() と同じ役割で、同じく core の中に置く
// （「core の外に出す」という意味ではない。docs/adr/0016 決定 2 の注記）。
import { NAME_MAX_LENGTH, type RoomError } from './room';
import type { RoundError } from './round';

/** RoundError の表示文言。**#165 PR-2 以前の文字列をそのまま保つ。** */
export function messageForRoundError(error: RoundError): string {
  switch (error.code) {
    case 'not-voting':
      return error.op === 'vote' ? '現在は投票を受け付けていません' : 'すでに公開されています';
    case 'not-host':
      return error.op === 'reveal'
        ? 'ホストのみが公開できます'
        : 'ホストのみが次のラウンドを開始できます';
    case 'not-revealed':
      return '票の公開後にのみ次のラウンドを開始できます';
  }
}

/** RoomError の表示文言。**WS には届かない**（境界の NameSchema が先に弾く）が、
 *  ドメイン検証は docs/adr/0005 の MUST なので残っている。 */
export function messageForRoomError(error: RoomError): string {
  switch (error.code) {
    case 'invalid-name':
      return `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`;
  }
}
