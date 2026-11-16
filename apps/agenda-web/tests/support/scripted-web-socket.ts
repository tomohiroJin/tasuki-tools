// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`・#594）。ここには、このアプリの固定データだけを残す
export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };


/** 進行タイマーの状態（組む前） */
export const IDLE_AGENDA = {
  phase: 'idle',
  title: '',
  rounds: 1,
  steps: [],
  currentId: null,
  runElapsedMs: 0,
  stepTimerMs: 0,
  stepSpentMs: 0,
};

/** 2 ステップの進行中の状態（s-1 が進行中）。 */
export function runningAgenda(stepTimerMs = 0, runElapsedMs = stepTimerMs) {
  return {
    phase: 'running',
    title: 'Retro',
    rounds: 1,
    steps: [
      { id: 's-1', round: 1, name: 'Check', durationSec: 60, onTimeout: 'wait', skipped: false, extensionSec: 0, spentMs: null },
      { id: 's-2', round: 1, name: 'Talk', durationSec: 120, onTimeout: 'advance', skipped: false, extensionSec: 0, spentMs: null },
    ],
    currentId: 's-1',
    runElapsedMs,
    stepTimerMs,
    stepSpentMs: stepTimerMs,
  };
}

/** 名簿のフレーム（あや・ゆうの 2 人が在室） */
export const ROSTER_FRAME = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['agenda'] },
      { participantId: 'p2', displayName: 'ゆう', presence: 'online', tools: ['agenda'] },
    ],
  },
};
