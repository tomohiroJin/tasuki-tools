/**
 * うちわけの状態を配る（#476）。`agenda-broadcast.ts` と同じ形。
 *
 * 宛先は**うちわけの接続だけ**。宛先は**呼び出し時点の名簿**から決まるので、**保管のあとに呼ぶ**。
 * **全員に同じ写しを配る**（受け手ごとの出し分けは無い。誰が操作したかは状態に無い）。
 * **位置と取り消しの残りは送る時点で計る**（`toView` に単調時計の現在値を渡す。単調時計の値そのものは載せない）。
 */
import { connectionsIn } from "@tasuki/room-core";
import { createTrackState, toView, type TrackState } from "@tasuki/track-core";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { TrackServerMsg } from "../ports/track-server-msg.js";
import type { TrackStore } from "../ports/track-store.js";
import type { WallClock } from "../ports/wall-clock.js";
import { TOOL_TRACK } from "./tool-id.js";

export interface TrackBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  tracks: TrackStore;
  /** 単調時計。時刻軸はこれで測る */
  clock: MonotonicClock;
  /** 壁時計。**状態を最初に置くときに 1 度だけ読む**（時刻軸の 0 に当たる時刻。表示のためだけに持つ） */
  wallClock: WallClock;
  send: (connIds: string[], msg: TrackServerMsg) => void;
}

export interface TrackBroadcaster {
  /** そのルームのうちわけの接続すべてへ、いまの状態を送る */
  publish(roomCode: string): void;
  /** 参加・復帰した 1 本の接続へ、いまの状態を送る（無ければ空の記録を置いてから送る） */
  sendCurrent(connId: string, roomCode: string): void;
}

export function makeTrackBroadcaster(deps: TrackBroadcasterDeps): TrackBroadcaster {
  /** 送る時点の位置で写しを作る。写しの配列は readonly、wire の型は可変なので配列だけ複製する。 */
  const frameOf = (state: TrackState): TrackServerMsg => {
    const view = toView(state, deps.clock.now());
    return { type: "track", state: { ...view, segments: [...view.segments], pinned: [...view.pinned] } };
  };

  /** 状態が無ければ置く。**置いた時点が時刻軸の 0 になる**（最初に誰かがこの道具を開いた時点）。 */
  const stateOf = (roomCode: string): TrackState => {
    const current = deps.tracks.get(roomCode);
    if (current !== undefined) return current;
    const created = createTrackState({ mono: deps.clock.now(), wallMs: deps.wallClock.now() });
    deps.tracks.put(roomCode, created);
    return created;
  };

  return {
    publish(roomCode) {
      const room = deps.store.get(roomCode);
      const state = deps.tracks.get(roomCode);
      if (room === undefined || state === undefined) return; // ルームが消えた・まだ誰も開いていない
      deps.send(connectionsIn(room, TOOL_TRACK), frameOf(state));
    },
    sendCurrent(connId, roomCode) {
      // ルームが消えていたら状態を置かない（置くと、破棄の後始末が済んだルームに状態だけが残る）。
      if (deps.store.get(roomCode) === undefined) return;
      deps.send([connId], frameOf(stateOf(roomCode)));
    },
  };
}
