/**
 * StatusStrip の接続表示を、WS クライアントの接続状態とセッション喪失から導出する（R5-1）。
 * banner（接続無関係の通知でも立つ）に結合しない。
 */
import type { ConnectionStatus } from "./components/StatusStrip.js";

export type ClientConnState = "online" | "reconnecting";

export function deriveConnectionStatus(sessionLost: boolean, connState: ClientConnState): ConnectionStatus {
  if (sessionLost) return "lost";
  return connState;
}
