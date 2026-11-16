// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`・#594）。呼び出し側の import を変えないための入口
export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';
