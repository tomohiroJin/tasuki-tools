/**
 * ツールへ移動している間の画面（#95 S5c 追補・利用者の実画面フィードバック）。
 *
 * **旧入口（`Setup` / `Join`）を撤去した副作用である。** `AppMode` から `setup` と
 * `join` が消えた結果、ルームの画面が決まるまで `mode` は `null` のままになり、
 * その間 `App.tsx` は何も描かなかった（`StatusStrip` も `mode === null` では出ない）。
 * 選択画面から timer を開いた人には、復帰の `room.join` に対する snapshot が届くまで
 * 白い画面だけが見える。撤去前はここに `Setup` が居た。
 *
 * ⚠ **「空でないこと」を見るテストにしない。** `<Stage>` は常に描かれているので、
 * 何を出しても通ってしまう。読み込み中だと**名指しで**分かる要素を見る。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { saveResumeIdentity } from "@tasuki/sync-client";

vi.mock("../../src/records/indexeddb.js", () => ({
  loadRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn(), redirectTo: vi.fn() };
});

import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("ルームの画面が決まるまでの表示", () => {
  it("Given 選択画面から開いた / When snapshot が届く前 / Then 読み込み中だと分かる表示が出る", () => {
    // Given: 選択画面で名乗った人が timer の札を押した（復帰の組は端末にある）
    saveResumeIdentity({
      code: "ROOM01",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");

    // When: snapshot はまだ届いていない
    render(<App />);

    // Then: 読み込み中であることが読み上げにも乗る形で出ている
    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
  });

  it("Given 行き先の無い URL / When 玄関へ送り返している間 / Then 読み込み中だと分かる表示が出る", () => {
    // Given: `/timer/` を素で開いた（旧入口の Setup はもう無い）
    window.history.replaceState(null, "", "/");

    // When: 玄関へ送るのを待っている
    render(<App />);

    // Then: 遷移が終わるまでの間も白いままにしない
    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
  });

  it("対照: Given 同じ入口 / When snapshot が届く / Then 読み込み中の表示は消える", () => {
    // Given
    saveResumeIdentity({
      code: "ROOM01",
      participantId: "me-1",
      resumeToken: "rt_1",
      displayName: "ボブ",
    });
    window.history.replaceState(null, "", "/?room=ROOM01");
    render(<App />);
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    ws.readyState = FakeWS.OPEN;
    act(() => {
      ws.onopen?.();
    });

    // When: ルームの画面が決まる
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "snapshot",
          room: aRoomView({ code: "ROOM01", phase: "setup" }),
        }),
      } as MessageEvent);
    });

    // Then: 読み込み中の表示は残らない（出しっぱなしにすると嘘になる）
    expect(screen.queryByText(/読み込んでいます/)).not.toBeInTheDocument();
  });
});
