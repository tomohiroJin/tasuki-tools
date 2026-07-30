// apps/web/test/ui/components/RemovalConfirmDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { RemovalConfirmDialog } from "../../../src/ui/components/RemovalConfirmDialog.js";
import type { Participant } from "@tdd-mob/core";

function makeParticipant(overrides?: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    connId: "conn1",
    displayName: "Alice",
    role: "host",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000000,
    ...overrides,
  };
}

describe("RemovalConfirmDialog", () => {
  /**
   * @requirements FR-177, FR-178, US1
   */
  describe("pendingRemoval が null のとき", () => {
    it("何も描画しない", () => {
      // Given / When
      const { container } = render(
        <RemovalConfirmDialog
          pendingRemoval={null}
          participants={[]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(container.firstChild).toBeNull();
    });
  });

  describe("pendingRemoval が非 null のとき", () => {
    const participant = makeParticipant({ participantId: "p1", displayName: "Alice" });

    it("participantLabel で組み立てたタイトルを持つ確認ダイアログが描画される", () => {
      // Given / When
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(screen.getByText("Alice さんを退出させますか？")).toBeInTheDocument();
    });

    it("確定ボタンのラベルは「退出させる」になっている", () => {
      // Given / When
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(screen.getByRole("button", { name: "退出させる" })).toBeInTheDocument();
    });

    it("isShared=true のとき説明文に他の参加者への反映を明示する一文を含む", () => {
      // Given / When
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(
        screen.getByText((_, node) =>
          node?.textContent === "一覧とドライバーの輪から外れます。招待から再参加できます。（他の参加者全員の画面にも反映されます）",
        ),
      ).toBeInTheDocument();
    });

    it("isShared=false のとき説明文に他の参加者への反映を明示する一文を含まない", () => {
      // Given / When
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(
        screen.getByText((_, node) =>
          node?.textContent === "一覧とドライバーの輪から外れます。招待から再参加できます。",
        ),
      ).toBeInTheDocument();
    });

    it("確定操作で onConfirm に対象の participantId を渡して呼ぶ", () => {
      // Given
      const onConfirm = vi.fn();
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={true}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );
      // When
      fireEvent.click(screen.getByRole("button", { name: "退出させる" }));
      // Then
      expect(onConfirm).toHaveBeenCalledWith("p1");
    });

    it("取消操作で onCancel を呼ぶ", () => {
      // Given
      const onCancel = vi.fn();
      render(
        <RemovalConfirmDialog
          pendingRemoval={participant}
          participants={[participant]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />,
      );
      // When
      fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
      // Then
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("同名参加者がいるとき", () => {
    it("タイトルに識別子付きの呼び名を使う", () => {
      // Given
      const p1 = makeParticipant({ participantId: "p1", displayName: "Bob" });
      const p2 = makeParticipant({ participantId: "p2", displayName: "Bob" });
      // When
      render(
        <RemovalConfirmDialog
          pendingRemoval={p1}
          participants={[p1, p2]}
          isShared={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      // Then
      expect(screen.getByText("Bob さん（ID: p1）を退出させますか？")).toBeInTheDocument();
    });
  });
});
