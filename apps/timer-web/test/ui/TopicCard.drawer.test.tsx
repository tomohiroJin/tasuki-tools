/**
 * お題の札の「続きを読む」の引き出し（#371 の特性テスト）。
 *
 * 開閉とフォーカスを戻す処理を共有のフックへ寄せる前に、poker・topic と同じ振る舞いを固定する。
 * jsdom の `<dialog>` は `showModal` / `close` を持たないので差し替える（poker の `current-topic.test.tsx` と同じ）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { TopicCard } from "../../src/ui/components/TopicCard.js";

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
let showModal = vi.fn();

beforeEach(() => {
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  proto.showModal = showModal;
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  cleanup();
});

const topic = { title: "FizzBuzz", body: "# 振る舞い\n3 のときは Fizz", source: "manual" as const };

describe("お題の札の引き出し", () => {
  it("Given 本文がある / When 続きを読むを押す / Then シートが開いて全文が出る", () => {
    render(<TopicCard topic={topic} />);
    const dialog = document.querySelector("dialog.ui-drawer") as HTMLDialogElement;
    expect(dialog.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "続きを読む" }));
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelector(".ui-drawer-body")?.textContent).toContain("3 のときは Fizz");
  });

  it("Given シートが開いている / When 閉じるを押す / Then 閉じて続きを読むへフォーカスが戻る", () => {
    render(<TopicCard topic={topic} />);
    const more = screen.getByRole("button", { name: "続きを読む" });
    const dialog = document.querySelector("dialog.ui-drawer") as HTMLDialogElement;
    fireEvent.click(more);
    const closeButton = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "閉じる");
    fireEvent.click(closeButton as HTMLButtonElement);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it("Given シートが開いている / When close イベントだけが届く（Esc） / Then フォーカスが続きを読むへ戻る", () => {
    render(<TopicCard topic={topic} />);
    const more = screen.getByRole("button", { name: "続きを読む" });
    const dialog = document.querySelector("dialog.ui-drawer") as HTMLDialogElement;
    fireEvent.click(more);
    (document.body as HTMLElement).focus();
    dialog.dispatchEvent(new Event("close"));
    expect(document.activeElement).toBe(more);
  });
});
