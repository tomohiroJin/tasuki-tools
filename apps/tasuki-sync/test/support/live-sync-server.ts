/**
 * 実 WebSocket 越しにサーバーを叩くためのテストヘルパ（Issue #80）。
 *
 * ## なぜ要るか
 *
 * 業務ロジックのテスト（356 件）は `handlers.handleCommand()` を直接呼ぶ in-process 方式で、
 * 送信は `SpyBroadcaster`（送信を模したもの）で観測している。速く安定していて、
 * あれはあれで正しい。ただし **「WS アダプタ → handlers → broadcaster → 実ソケット」
 * の配線が本当に繋がっているか**と**利用者の画面に届く JSON の形**は、その方式では
 * 一切見ていない。onMessage の配線を外しても、送出メッセージの `type` を別名に変えても、
 * in-process のテストは緑のまま通る。
 *
 * ここは**その 1 層だけ**を受け持つ。ルールを網羅する場所ではない（それは既存 356 件の役目）。
 *
 * ## 配線は本番と同じものを通す
 *
 * サーバーの組み立ては `createSyncServer()`（`src/create-sync-server.ts`）に一本化してあり、
 * 本番の `server.ts` とこのヘルパは**同じ関数**を呼ぶ。テスト側で組み立てを書き写すと、
 * 写しが本番からずれた瞬間に配線の検査が死ぬ（テストは緑のまま本番だけ壊れる）。
 *
 * 設定も `loadSyncConfig()` を通す。`PORT=0`（OS に空きポートを選ばせる）が
 * config を素通りすることまで含めて実経路で確かめられる。
 *
 * ## 前提の構築と検証の失敗を区別する
 *
 * ルーム作成・参加といった前提の構築が失敗したときは `throw` する（`expect` は使わない）。
 * ヘルパのバグ／使い方の誤りと、テスト対象の検証失敗を取り違えないため（FR-096）。
 *
 * ## 構成（#597）
 *
 * 実体は `live/` に責務ごとに分けてある。使う側は従来どおりこのファイルから import する。
 *
 * - 起動: `live/server.ts`（`LiveSyncServer`・`startLiveSyncServer`）
 * - 接続: `live/connection.ts`（ソケットを開くまで待つ。内部用）
 * - 待ち: `live/waiting.ts`（`LiveSetupError`・タイムアウトの既定。内部用は定数）
 * - 各道具の送受信: `live/*-client.ts`（timer・poker・ハブ・お題・ルーレット・進行タイマー・チェックイン）
 * - 前提の構築: `live/room-ops.ts`（`createRoom`・`joinRoom`・`addToRotation`）
 */

export { LiveSetupError } from "./live/waiting";
export { LiveClient } from "./live/timer-client";
export { LivePokerClient } from "./live/poker-client";
export { LiveHubClient } from "./live/hub-client";
export { LiveTopicClient } from "./live/topic-client";
export { LiveRouletteClient } from "./live/roulette-client";
export { LiveAgendaClient } from "./live/agenda-client";
export { LiveCheckinClient, type CheckinReceived } from "./live/checkin-client";
export { LiveTrackClient } from "./live/track-client";
export { LiveSyncServer, startLiveSyncServer } from "./live/server";
export { createRoom, joinRoom, addToRotation, setPassphraseViaHub } from "./live/room-ops";
