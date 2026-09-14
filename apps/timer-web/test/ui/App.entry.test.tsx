/**
 * 玄関・選択画面から `?view=history` で開いたときの入口配線（#95 S5c）。
 *
 * `decideEntry` 自体の分岐は `test/ui/entry.test.ts` が純粋関数として検証済み。
 * ここで見るのは、`App.tsx` が mount 時の URL を見て `History` を最優先で出し、
 * 「戻る」が `platform/location.js` 経由で戻り先 URL へ遷移することだけである。
 *
 * `kind: "redirect"` の適用（旧入口が無いときに玄関へ送る）はこの段では配線していない
 * （旧入口 Setup/Join がまだ生きているため）。ここでは検証しない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("../../src/records/indexeddb.js", () => ({
  loadRecords: vi.fn().mockResolvedValue([]),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/platform/location.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/location.js")>();
  return { ...actual, navigateTo: vi.fn() };
});

import App from "../../src/App.js";
import { navigateTo } from "../../src/platform/location.js";
import { FakeWS } from "../support/fakes.js";

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App の入口配線（?view=history）", () => {
  it("Given 玄関から ?view=history で開いた / When 描画する / Then ルームに入らず履歴を出す", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history");

    // When
    render(<App />);

    // Then
    expect(await screen.findByText("完了記録の履歴")).toBeInTheDocument();
  });

  it("Given 玄関から開いた履歴 / When 戻るを押す / Then 玄関の URL へ遷移する", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history");
    render(<App />);
    await screen.findByText("完了記録の履歴");

    // When
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));

    // Then
    expect(navigateTo).toHaveBeenCalledWith("/");
  });

  it("Given 選択画面から ?view=history&room=CODE で開いた / When 戻るを押す / Then 同じルームの選択画面へ遷移する", async () => {
    // Given
    window.history.replaceState(null, "", "/?view=history&room=ROOM01");
    render(<App />);
    await screen.findByText("完了記録の履歴");

    // When
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));

    // Then
    expect(navigateTo).toHaveBeenCalledWith("/?room=ROOM01");
  });
});
