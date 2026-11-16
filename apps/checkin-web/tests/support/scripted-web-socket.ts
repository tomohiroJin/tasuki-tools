// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`・#594）。ここには、このアプリの固定データだけを残す
export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };


/** 回の無い状態（まだやり方を選んでいない）の自分の見え方 */
export const IDLE_CHECKIN = { you: 'p1', spectating: false, spectatorCount: 0, round: null };

/** 開いている回（weather・自分は札を出していない）の見え方 */
export function openCheckin(yourCard: string | null = null) {
  return {
    you: 'p1',
    spectating: false,
    spectatorCount: 0,
    round: {
      seq: 1,
      method: 'weather',
      visibility: 'named',
      locked: false,
      seats: [
        { id: 'p1', name: 'あや', played: yourCard !== null },
        { id: 'p2', name: 'ゆう', played: false },
      ],
      status: 'open',
      playedCount: yourCard === null ? 0 : 1,
      playerCount: 2,
      yourCard,
    },
  };
}

/** 名簿のフレーム（あや・ゆうの 2 人が在室） */
export const ROSTER_FRAME = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['checkin'] },
      { participantId: 'p2', displayName: 'ゆう', presence: 'online', tools: ['checkin'] },
    ],
  },
};
