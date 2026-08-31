/**
 * StatusStrip の接続表示を、WS クライアントの接続状態・セッション喪失・
 * 同期の古さから導出する（R5-1 / #209）。
 * banner（接続無関係の通知でも立つ）に結合しない。
 */
import type { ConnectionStatus } from "./components/StatusStrip.js";

export type ClientConnState = "online" | "reconnecting";

/**
 * 表示する接続状態を決める。
 *
 * **`syncStale` は「接続は生きているのに画面が古い」ことを表す（#209）。**
 * 契約に合わない同期フレームを捨てると、`snapshot` の棄却はほぼ必ず継続し、
 * 画面は生きて見えたまま古い状態で固まる。接続表示と同じ場所へ出すのは、
 * **利用者にとって「同期できているか」は接続の一部だから**である。
 *
 * 強い事実から順に返す。`lost` は復帰できないことが確定した状態、
 * `reconnecting` は接続そのものが切れている状態で、どちらも
 * 「古い」より先に伝えるべきことがある。再接続が成功すれば新しい `snapshot` が
 * 届くので、そこで `syncStale` は解消しうる。
 */
export function deriveConnectionStatus(
  sessionLost: boolean,
  connState: ClientConnState,
  syncStale: boolean,
): ConnectionStatus {
  if (sessionLost) return "lost";
  if (connState === "reconnecting") return "reconnecting";
  if (syncStale) return "stale";
  return "online";
}
