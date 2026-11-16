/** 実 WebSocket の接続（開くまで待つ）。クライアントの種類によらず共通の部分。 */

import { WebSocket } from "ws";
import { LiveSetupError } from "./waiting";

/**
 * WebSocket を開き、open まで待つ。失敗は前提の構築の失敗（`LiveSetupError`）として throw する。
 *
 * `error` の受け手は最初から最後まで 1 つ残す（`once` にすると 2 回目の error が未処理の
 * 例外になる）。open の前の error は、ソケットを `terminate` で捨てて失敗にする。
 * open の後の error は、握りつぶさず警告として記録する。
 */
export async function openSocket(
  label: string,
  url: string,
  headers: Record<string, string>,
): Promise<WebSocket> {
  const ws = new WebSocket(url, { headers });
  await new Promise<void>((resolve, reject) => {
    let opened = false;
    ws.once("open", () => {
      opened = true;
      resolve();
    });
    ws.on("error", (e) => {
      if (opened) {
        console.warn(`live-sync-server: ${label} のソケットで error: ${e.message}`);
        return;
      }
      ws.terminate();
      reject(new LiveSetupError(`${label} の接続に失敗: ${e.message}`));
    });
  });
  return ws;
}
