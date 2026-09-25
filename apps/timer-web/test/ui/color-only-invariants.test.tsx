/**
 * 色だけで状態を伝えていないことを固定する。
 *
 * @requirements FR-032（色のみに依存しない表現・WCAG AA のコントラスト）
 *
 * **見た目を作り替える作業で最初に失われるのがこれ。**
 * 色を差し替えるとき、隣のテキストは「冗長だから」と削られやすい。削られても
 * 画面は成立して見えるので、誰かがこの検査を書いていない限り気づけない。
 *
 * 判定は **`aria-label` で特定できる領域**に対して行う。本文全体に正規表現を当てると、
 * 別の場所の文字列に当たって「通っていないのに緑」になる（過去に実際に踏んだ）。
 *
 * 在室状況（online / idle / offline）は `presence.test.ts` と
 * `Lobby.presence-a11y.test.tsx` が担当しているのでここでは重複させない。
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";
import type { ConnectionStatus } from "../../src/ui/components/StatusStrip.js";

/**
 * 接続状態。色だけでなく、この文言が必ず並ぶこと。
 *
 * **`Record<ConnectionStatus, string>` で受けているのが肝。** 状態を足してここへ
 * 書き忘れると**型検査が落ちる**ので、新しい状態だけ「色のみ」で伝えていても
 * 素通りしない。件数は書かない（足すたびに腐るため）。
 */
const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "つないでいます",
  online: "接続中",
  reconnecting: "再接続中",
  lost: "セッション喪失",
  stale: "同期できていません",
};

const CONNECTION_CASES = Object.entries(CONNECTION_LABELS).map(([status, label]) => ({
  status: status as ConnectionStatus,
  label,
}));

const baseStrip = {
  phase: "session" as const,
  displayName: "Alice",
  roomCode: "ABCD01",
};

describe("色だけで状態を伝えない（FR-032）", () => {
  describe("接続状態", () => {
    it.each(CONNECTION_CASES)(
      "$status は「$label」というテキストを色と併記する",
      ({ status, label }) => {
        // Given
        render(<StatusStrip {...baseStrip} connectionStatus={status} />);

        // When（領域を aria-label で特定してから、その中の文字を見る）
        const region = screen.getByLabelText("接続状態");
        // Then
        expect(region).toBeVisible();
        expect(within(region).getByText(new RegExp(label))).toBeVisible();
      },
    );

    it("状態を表す丸は装飾として読み上げから外す（テキストが本体）", () => {
      // Given
      render(<StatusStrip {...baseStrip} connectionStatus="online" />);
      // When
      const region = screen.getByLabelText("接続状態");
      const dot = region.querySelector('[aria-hidden="true"]');
      // Then
      expect(dot).not.toBeNull();
      // 丸そのものが読み上げ名を持ってしまうと「色＋テキスト」ではなく二重読みになる
      expect(dot?.textContent?.trim()).toBe("●");
    });

    it("色を外しても状態が伝わる（実際に描画された文言が互いに違う）", () => {
      // Given（CONNECTION_LABELS の各状態を入力に使う）
      // When（**期待値ではなく、実際に描画された文字を集める。**
      //   テスト側の定数を突き合わせるだけでは、実装の文言を同じにしても気づけない）
      const rendered = CONNECTION_CASES.map(({ status }) => {
        const { unmount } = render(<StatusStrip {...baseStrip} connectionStatus={status} />);
        const text = screen.getByLabelText("接続状態").textContent?.replace(/●/g, "").trim() ?? "";
        unmount();
        return text;
      });

      // Then（どれも空でなく、互いに重複していない。同じ文言なら色でしか区別できない）
      for (const text of rendered) expect(text).not.toBe("");
      expect(new Set(rendered).size).toBe(rendered.length);
    });
  });
});
