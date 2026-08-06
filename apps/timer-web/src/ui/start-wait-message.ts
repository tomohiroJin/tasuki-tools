/**
 * 主催者以外に見せる「開始待ち」の案内（#76 J-3）。
 *
 * ロビーでの開始は主催者限定（開始前は HOST_ONLY_BEFORE_START）なので、
 * 主催者がタブを閉じると誰も始められない。ホストの自動移譲は在席検出
 * （heartbeat 15 秒 × 2）を待つため約 30〜40 秒かかり、その間ずっと
 * 「主催者のセッション開始を待っています...」と出ていた。
 *
 * **待っている相手がもう居ないことが分からない**のが問題で、待ち時間そのものではない。
 * 在席検出を早めると不安定な回線で誤って離脱扱いになるため、ここでは伝え方を変える。
 */

import type { Presence } from "./presence.js";

const WAITING_FOR_HOST = "主催者のセッション開始を待っています...";
const HOST_ABSENT = "主催者が不在です。まもなく主催者が引き継がれ、開始できるようになります。";

/**
 * 主催者の在席状況から案内文を決める。
 *
 * `null` は「主催者が参加者一覧に見つからない」場合（退出直後など）。
 * 待っても来ない点は offline と同じなので、同じ案内にする。
 */
export function startWaitMessage(hostPresence: Presence | null): string {
  if (hostPresence === null || hostPresence === "offline") return HOST_ABSENT;
  return WAITING_FOR_HOST;
}
