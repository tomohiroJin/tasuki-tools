/**
 * StatusStrip の接続表示を、WS クライアントの接続状態・セッション喪失・
 * 同期の古さから導出する（R5-1 / #209）。
 * banner（接続無関係の通知でも立つ）に結合しない。
 */
import type { ConnectionStatus } from "./components/StatusStrip.js";

/**
 * WS クライアントが知っている接続の状態。
 *
 * **`connecting` は「まだ一度も確立していない」**（#292 のレビュー）。
 * `SyncConnection` が通知するのは `online`（`onopen`）と `reconnecting`（`onclose`）の
 * 2 つだけで、**確立前は何も通知が来ない**。初期値を `online` にしていたため、
 * ソケットが `CONNECTING` のまま滞留する状況（中間装置が SYN を落とす・
 * キャプティブポータル）でも画面は「接続中」と断言していた。読み込み中の
 * 行き止まりに接続状態を並べた以上、そこが嘘だと原因の取り違えを招く。
 *
 * **この値を作るのは同期フックの初期値だけである。** 通知が来た時点で
 * `online` / `reconnecting` のどちらかへ移り、二度とここへは戻らない。
 */
export type ClientConnState = "connecting" | "online" | "reconnecting";

/**
 * 表示する接続状態を決める。
 *
 * **`syncStale` は「接続は生きているのに画面が古い」ことを表す（#209）。**
 * 契約に合わない同期フレームを捨てると、`snapshot` の棄却はほぼ必ず継続し、
 * 画面は生きて見えたまま古い状態で固まる。接続表示と同じ場所へ出すのは、
 * **利用者にとって「同期できているか」は接続の一部だから**である。
 *
 * 強い事実から順に返す。`lost` は復帰できないことが確定した状態、
 * 接続が切れていること（`connState`）も「古い」より先に伝えるべきことがある。
 * 再接続が成功すれば新しい `snapshot` が届くので、そこで `syncStale` は解消しうる。
 *
 * **最後は `connState` をそのまま返す。** こうしておくと
 * `ClientConnState ⊆ ConnectionStatus` を型検査が守る。リテラルへ展開して
 * `return "online"` と書くと、接続状態が増えたときに**どの分岐にも当たらず黙って
 * 「接続中」へ落ちる**（実測: そのまま返す形なら、増やした値が代入できず TS2322）。
 */
export function deriveConnectionStatus(
  sessionLost: boolean,
  connState: ClientConnState,
  syncStale: boolean,
): ConnectionStatus {
  if (sessionLost) return "lost";
  // 「古い」を出すのは接続が生きているときだけ。切れているならそちらが先。
  if (syncStale && connState === "online") return "stale";
  return connState;
}
