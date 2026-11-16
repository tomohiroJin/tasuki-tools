// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`・#594）。ここには、このアプリの固定データだけを残す
export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };


/** ルーレットの状態（誰も回していない・誰も外していない） */
export const IDLE_ROULETTE = { excluded: [], guests: [], drawn: [], spin: null };

/** 回した直後の状態（`seq` ごとに 1 回の回転）。 */
export function spinState(seq: number, elapsedMs = 0) {
  return {
    ...IDLE_ROULETTE,
    spin: {
      seq,
      wheel: [
        { id: 'p1', name: 'あや' },
        { id: 'p2', name: 'ゆう' },
      ],
      winnerIndex: 1,
      settle: 0.5,
      spunBy: 'あや',
      durationMs: 4000,
      elapsedMs,
    },
  };
}

/** 名簿のフレーム（あや・ゆうの 2 人が在室） */
export const ROSTER_FRAME = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['roulette'] },
      { participantId: 'p2', displayName: 'ゆう', presence: 'online', tools: ['roulette'] },
    ],
  },
};
