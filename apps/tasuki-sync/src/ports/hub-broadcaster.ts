/**
 * HubBroadcaster ポート — 選択画面（ハブ）への配信（#95 S5a）。
 *
 * timer の {@link import("./broadcaster.js").Broadcaster} と**分けてある**。
 * 型が違う（`HubServerMsg`）だけでなく、混ぜると「timer の snapshot をハブへ送る」
 * 経路が型検査を通ってしまう。
 */
import type { HubServerMsg } from "@tasuki/room-core";

export interface HubBroadcaster {
  /** 特定の接続へ 1 通送る（復帰の組は本人にだけ返す）。 */
  sendTo(connId: string, msg: HubServerMsg): void;
  /**
   * そのルームのハブ接続すべてへ、**いまの名簿**を配信する（R3）。
   *
   * **引数に名簿を取らない。** 宛先も中身も「呼び出し時点のストア」から引くことで、
   * 保管より先に配信して 1 つ前の名簿を配る事故を、呼び出し側の順序に依存せず塞ぐ。
   */
  broadcastRoster(roomCode: string): void;
}
