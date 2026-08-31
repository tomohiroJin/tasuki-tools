// サーバーから届いたエラーの汎用表示（#217）
import type { ErrorCode } from '@tasuki/poker-core';
import type { SyncError } from '../hooks/useSync';

/**
 * その `code` が**専用の表出を持っている**か。
 *
 * 持っているものを汎用表示にも出すと、**同じ 1 つの出来事が 2 つの別々の問題に見える。**
 *
 * - `room-not-found` → ページ全体が専用画面に替わる（#76 J-1）
 * - `rate-limited` → 参加フォームに「自動で入り直しています」が出る（#147）
 *
 * **未知の `code` はここに載らない**（`docs/poker/adr/0003` 決定 2 で `null` に畳まれる）。
 * 意味を知らないコードに専用の表出はありえないので、汎用表示が受け持つ。
 */
function hasDedicatedDisplay(code: ErrorCode | null): boolean {
  return code === 'room-not-found' || code === 'rate-limited';
}

interface Props {
  error: SyncError | null;
  onClose: () => void;
}

/**
 * どの画面でも同じ形でエラーを伝える（#217）。
 *
 * これが入室後の画面にしか無かったため、**トップ画面と参加フォームでは
 * サーバーのエラーが画面からも devtools からも消えていた。**
 */
export function ErrorNote({ error, onClose }: Props) {
  if (error === null || hasDedicatedDisplay(error.code)) return null;
  return (
    <p className="error-note" role="alert">
      {error.message}
      <button type="button" className="secondary" onClick={onClose}>
        閉じる
      </button>
    </p>
  );
}
