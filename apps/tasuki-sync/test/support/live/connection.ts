/** 実 WebSocket の接続（開くまで待つ）。クライアントの種類によらず共通の部分。 */

import { WebSocket } from "ws";
import { LiveSetupError } from "./waiting";

/** WebSocket を開き、open まで待つ。失敗は前提の構築の失敗（`LiveSetupError`）として throw する。 */
export async function openSocket(
  label: string,
  url: string,
  headers: Record<string, string>,
): Promise<WebSocket> {
  const ws = new WebSocket(url, { headers });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(new LiveSetupError(`${label} の接続に失敗: ${e.message}`)));
  });
  return ws;
}
