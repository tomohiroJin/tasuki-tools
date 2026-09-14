/**
 * 玄関で名乗った端末として timer のルームを開く共有ヘルパ（#95 S5c・R9）。
 *
 * 旧入口（`Setup` / `Join`）を撤去したので、**timer は URL とその端末に保存された
 * 同一性からしかルームへ入らない**。テストの Given も実物と同じ経路を通す ——
 * 復帰の組を置いて `?room=CODE` を開くと、`useTimerSync` の入口の effect が
 * `room.join` を送る（撤去前は「名前を入れて『ルームを作る』を押す」だった）。
 *
 * **お題の代表にはならない。** 代表は「輪の先頭」で決まる（`ui/problem-generation.ts`）
 * ので、代表として振る舞わせたいテストは `session.rotation` の先頭をこの参加者にすること
 * （`useTimerSync` を直接呼んでも代表にはならない）。
 */
import { render, act } from "@testing-library/react";
import React from "react";
import { saveResumeIdentity } from "@tasuki/sync-client";
import App from "../../src/App.js";
import { FakeWS } from "./fakes.js";

export interface EnterRoomOptions {
  /** 開くルームのコード。 */
  code?: string;
  /** その端末の参加者 ID（保存済みの復帰の組に入る値）。 */
  participantId?: string;
  /** その端末の表示名。 */
  displayName?: string;
  /** 保存済みの復帰トークン。 */
  resumeToken?: string;
}

/** 既定のルームコード。テストの大半がこの 1 つで足りる。 */
export const ENTERED_ROOM_CODE = "ROOM01";

/**
 * 復帰の組を置いてから `/?room=CODE` で `<App />` を描画し、接続済みの FakeWS を返す。
 *
 * 呼ぶ前に `FakeWS.instances` を空にし、`WebSocket` を差し替えておくこと
 * （各テストファイルの `beforeEach` が行っている）。
 */
export function enterRoomAndConnect(options: EnterRoomOptions = {}): FakeWS {
  const {
    code = ENTERED_ROOM_CODE,
    participantId = "me-1",
    displayName = "Creator",
    resumeToken = "rt",
  } = options;

  saveResumeIdentity({ code, participantId, resumeToken, displayName });
  window.history.replaceState(null, "", `/?room=${encodeURIComponent(code)}`);
  render(<App />);

  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  if (ws === undefined) {
    throw new Error("ルームへ入る接続が張られませんでした（入口の判定が変わった可能性）。");
  }
  ws.readyState = FakeWS.OPEN;
  act(() => {
    ws.onopen?.();
  });
  return ws;
}
