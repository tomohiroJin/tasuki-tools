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

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import type { Problem } from "@tasuki/timer-core";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";
import { ProblemEditor } from "../../src/ui/components/ProblemEditor.js";

/** 接続状態。色だけでなく、この文言が必ず並ぶこと。 */
const CONNECTION_CASES = [
  { status: "online", label: "接続中" },
  { status: "reconnecting", label: "再接続中" },
  { status: "lost", label: "セッション喪失" },
] as const;

/** 難易度。段階色に加えて、この文言が必ず並ぶこと。 */
const DIFFICULTY_CASES = [
  { difficulty: "easy", label: "初級" },
  { difficulty: "medium", label: "中級" },
  { difficulty: "hard", label: "上級" },
] as const;

const baseStrip = {
  phase: "session" as const,
  displayName: "Alice",
  role: "host" as const,
  roomCode: "ABCD01",
};

const baseProblem: Problem = {
  title: "FizzBuzz",
  description: "3 の倍数で Fizz",
  requirements: [],
  exampleTest: "",
  hints: [],
  source: "fallback",
  edited: false,
};

describe("色だけで状態を伝えない（FR-032）", () => {
  describe("接続状態", () => {
    it.each(CONNECTION_CASES)(
      "$status は「$label」というテキストを色と併記する",
      ({ status, label }) => {
        // Given / When
        render(<StatusStrip {...baseStrip} connectionStatus={status} />);

        // Then（領域を aria-label で特定してから、その中の文字を見る）
        const region = screen.getByLabelText("接続状態");
        expect(region).toBeVisible();
        expect(within(region).getByText(new RegExp(label))).toBeVisible();
      },
    );

    it("状態を表す丸は装飾として読み上げから外す（テキストが本体）", () => {
      // Given / When
      render(<StatusStrip {...baseStrip} connectionStatus="online" />);
      // Then
      const region = screen.getByLabelText("接続状態");
      const dot = region.querySelector('[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      // 丸そのものが読み上げ名を持ってしまうと「色＋テキスト」ではなく二重読みになる
      expect(dot?.textContent?.trim()).toBe("●");
    });

    it("色を外しても状態が伝わる（実際に描画された文言が 3 状態で互いに違う）", () => {
      // Given / When（**期待値ではなく、実際に描画された文字を集める。**
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

  describe("難易度バッジ", () => {
    it.each(DIFFICULTY_CASES)(
      "$difficulty は「$label」というテキストを段階色と併記する",
      ({ difficulty, label }) => {
        // Given / When
        render(
          <ProblemEditor
            problem={baseProblem}
            difficulty={difficulty}
            onEdit={vi.fn()}
            onCopy={vi.fn()}
            onRegenerate={vi.fn()}
            onPaste={vi.fn()}
          />,
        );
        // Then
        const group = screen.getByRole("group", { name: "お題" });
        expect(within(group).getByText(label)).toBeVisible();
      },
    );

    it("色を外しても難易度が伝わる（実際に描画されたバッジの文言が 3 段階で互いに違う）", () => {
      // Given / When（実際に描画された文字を集める）
      const rendered = DIFFICULTY_CASES.map(({ difficulty }) => {
        const { unmount } = render(
          <ProblemEditor
            problem={baseProblem}
            difficulty={difficulty}
            onEdit={vi.fn()}
            onCopy={vi.fn()}
            onRegenerate={vi.fn()}
            onPaste={vi.fn()}
          />,
        );
        // バッジ群は見出しの直前に並ぶ。お題の題名を除いた「バッジだけ」の文字を取る
        const group = screen.getByRole("group", { name: "お題" });
        const badges = [...group.querySelectorAll("span")]
          .map((el) => el.textContent?.trim() ?? "")
          .filter((t) => t !== "" && t !== baseProblem.title);
        unmount();
        return badges.join("|");
      });

      // Then
      for (const text of rendered) expect(text).not.toBe("");
      expect(new Set(rendered).size).toBe(rendered.length);
    });
  });
});
