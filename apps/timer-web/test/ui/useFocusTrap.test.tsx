/**
 * useFocusTrap の再描画に対する振る舞い（#321 の比較の仕組みで見つけた不具合）。
 *
 * 呼び出し側（ConfirmDialog・NotifySettings）は `onClose` に毎回新しい関数を渡す。
 * これを effect の依存に入れていたため、ダイアログを開いている間に親が再描画するたびに
 * effect が作り直され、後始末で「開く前にフォーカスしていたボタン」へフォーカスが戻り、
 * 背後のページがそのボタンまでスクロールし直していた（本番でも起きる）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useRef } from "react";
import { useFocusTrap } from "../../src/ui/useFocusTrap.js";

interface HarnessProps {
  open: boolean;
  onClose: () => void;
  /** 再描画を起こすためだけの値（中身は使わない） */
  tick: number;
}

function Harness({ open, onClose, tick }: HarnessProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 呼び出し側と同じく、描画のたびに新しい関数を渡す
  useFocusTrap({ open, containerRef: dialogRef, onClose: () => onClose(), initialFocusRef: cancelRef });
  return (
    <div data-tick={tick}>
      <button type="button">開く</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-label="確認">
          <button ref={cancelRef} type="button">
            取消
          </button>
          <button type="button">実行</button>
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("Given 開いたダイアログ / When 親が再描画する（onClose が新しい関数になる） / Then 開く前のボタンへ一瞬もフォーカスが戻らない", () => {
    // Given: 開く前に「開く」ボタンへフォーカスし、ダイアログを開く
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} tick={0} />);
    const opener = screen.getByRole("button", { name: "開く" });
    opener.focus();
    rerender(<Harness open onClose={onClose} tick={0} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));
    // 最終的なフォーカスの位置だけを見ると、作り直した effect が取消へ戻すので緑のままになる。
    // 不具合の実体は「一瞬開く前のボタンへ戻る」ことで、そのときブラウザが背後をスクロールする。
    const openerFocuses = vi.fn();
    opener.addEventListener("focus", openerFocuses);

    // When: 開いたまま親が再描画する
    rerender(<Harness open onClose={onClose} tick={1} />);

    // Then
    expect(openerFocuses).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));
  });

  it("Given 開いたダイアログ / When フォーカスがダイアログの外へ移る / Then ダイアログの中へ戻る", () => {
    // Given: 外の「開く」ボタンを残したままダイアログを開く
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} tick={0} />);
    const cancel = screen.getByRole("button", { name: "取消" });
    expect(document.activeElement).toBe(cancel);

    // When: 背景のボタンへフォーカスが移る（外をクリックしてから Tab を押した場合など）
    screen.getByRole("button", { name: "開く" }).focus();

    // Then: モーダルなので外へは出さない。ダイアログの初期フォーカスへ戻す
    expect(document.activeElement).toBe(cancel);
  });

  it("Given 閉じたダイアログ / When 外の要素へフォーカスする / Then 引き戻さない", () => {
    // Given: 開いてから閉じる
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} tick={0} />);
    rerender(<Harness open={false} onClose={onClose} tick={1} />);

    // When
    const opener = screen.getByRole("button", { name: "開く" });
    opener.focus();

    // Then: 閉じた後は見張りが外れている
    expect(document.activeElement).toBe(opener);
  });

  it("Given 開いたダイアログが再描画された後 / When Esc を押す / Then 最新の onClose が呼ばれる", () => {
    // Given
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Harness open onClose={first} tick={0} />);
    rerender(<Harness open onClose={latest} tick={1} />);

    // When
    fireEvent.keyDown(document, { key: "Escape" });

    // Then: 古い onClose を握ったままにしない
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("Given 開いたダイアログ / When 閉じる / Then 開く前のボタンへフォーカスが戻る", () => {
    // Given
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} tick={0} />);
    const opener = screen.getByRole("button", { name: "開く" });
    opener.focus();
    rerender(<Harness open onClose={onClose} tick={0} />);

    // When
    rerender(<Harness open={false} onClose={onClose} tick={1} />);

    // Then
    expect(document.activeElement).toBe(opener);
  });
});
