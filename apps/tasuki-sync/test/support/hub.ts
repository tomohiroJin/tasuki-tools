/**
 * テスト用の HubBroadcaster（#95 S5a）。
 *
 * **配信を記録するだけ**にしてある。poker の `unwiredPokerHandlers`（呼ばれたら失敗）と
 * 違って「呼ばれるのが正常」だからで、名簿が変わる経路はどれもここを通る。
 * 何が配られたかを見たいテストは {@link SpyHubBroadcaster.rosterCalls} を読む。
 */
import type { HubBroadcaster } from "../../src/ports/hub-broadcaster.js";
import type { HubServerMsg } from "@tasuki/room-core";

export interface SpyHubBroadcaster extends HubBroadcaster {
  /** `broadcastRoster` が呼ばれたルームコード（呼ばれた順）。 */
  readonly rosterCalls: string[];
  /** `sendTo` で送られた組（呼ばれた順）。 */
  readonly sent: { connId: string; msg: HubServerMsg }[];
}

export function spyHub(): SpyHubBroadcaster {
  const rosterCalls: string[] = [];
  const sent: { connId: string; msg: HubServerMsg }[] = [];
  return {
    rosterCalls,
    sent,
    sendTo(connId, msg) {
      sent.push({ connId, msg });
    },
    broadcastRoster(roomCode) {
      rosterCalls.push(roomCode);
    },
  };
}
