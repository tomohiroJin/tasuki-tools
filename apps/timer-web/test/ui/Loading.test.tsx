/**
 * 読み込み中の受け皿（`Loading`）そのものの取り決め（#292）。
 *
 * `App` 越しの経路は `App.loading.test.tsx` / `App.loading-timeout.test.tsx` が見る。
 * ここで固定するのは、部品として外へ約束していること 2 つである。
 *
 * 1. **接続状態の文言が `StatusStrip` と食い違わない。** 接続状態を出す場所が
 *    2 つになった（ルームの画面が決まる前は `Loading`、決まった後は `StatusStrip`）。
 *    同じ状態を別の言葉で呼ぶと、画面が切り替わった瞬間に利用者には
 *    **状態が変わったように見える**。写しを持たせない代わりに、
 *    **両方を実際に描いて突き合わせる**（テスト側の定数同士を比べても、
 *    実装がどちらも同じ言葉に変わったときに気づけない）
 * 2. **行き止まりでも接続状態は消えない。** 行き止まりの文面は「読み込めていない」
 *    としか言わないので、それが切断によるものか無応答かは接続状態でしか読めない
 *
 * @requirements #292 EARS 2
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import React from "react";
import { Loading } from "../../src/ui/Loading.js";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";
import type { ConnectionStatus } from "../../src/ui/components/StatusStrip.js";

/**
 * 接続状態の全件。**`Record<ConnectionStatus, null>` で受けているのが肝** ——
 * 状態を足してここへ書き忘れると型検査が落ちる（件数は書かない・腐るため）。
 */
const ALL_STATUSES: Record<ConnectionStatus, null> = {
  online: null,
  reconnecting: null,
  lost: null,
  stale: null,
};

const STATUSES = Object.keys(ALL_STATUSES) as ConnectionStatus[];

/** `aria-label="接続状態"` の領域に実際に描かれた文字（装飾の丸は除く）。 */
function renderedConnectionText(node: React.ReactElement): string {
  const { unmount } = render(node);
  const text = screen.getByLabelText("接続状態").textContent?.replace(/●/g, "").trim() ?? "";
  unmount();
  return text;
}

function loadingWith(status: ConnectionStatus, timedOut = false) {
  return (
    <Loading
      connectionStatus={status}
      timedOut={timedOut}
      onReload={vi.fn()}
      onLeave={vi.fn()}
    />
  );
}

describe("Loading の接続状態（#292）", () => {
  it.each(STATUSES)("%s は StatusStrip と同じ言葉で呼ぶ", (status) => {
    // Given / When: 両方を実際に描いて、描かれた文字を取る
    const inLoading = renderedConnectionText(loadingWith(status));
    const inStrip = renderedConnectionText(
      <StatusStrip
        phase="lobby"
        displayName="ボブ"
        connectionStatus={status}
        roomCode="ROOM01"
      />,
    );

    // Then: StatusStrip は英語の添え字を後ろに持つので、前方一致で突き合わせる
    expect(inLoading).not.toBe("");
    expect(inStrip.startsWith(inLoading)).toBe(true);
  });

  it("状態ごとに違う言葉で呼ぶ（色を外しても区別が付く）", () => {
    const rendered = STATUSES.map((status) => renderedConnectionText(loadingWith(status)));

    for (const text of rendered) expect(text).not.toBe("");
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("行き止まりになっても接続状態は出し続ける", () => {
    // Given / When
    render(loadingWith("reconnecting", true));

    // Then: 行き止まりの文面と接続状態が同じ画面に並ぶ
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("ルームの情報を読み込めませんでした");
    expect(within(alert).getByLabelText("接続状態")).toHaveTextContent("再接続中");
    cleanup();
  });

  it("待っている間は読み込み中だと分かる表示を出す（対照）", () => {
    render(loadingWith("online", false));

    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
