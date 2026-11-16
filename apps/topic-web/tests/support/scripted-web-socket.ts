// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`・#594）。ここには、このアプリの固定データだけを残す
export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };

export const IDLE_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };
