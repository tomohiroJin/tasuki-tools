/**
 * Markdown サブセットレンダラのテスト
 * 重点: XSS 安全（危険スキームのリンク化拒否・innerHTML 不使用）と
 *       基本記法・autolink の末尾約物トリム。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Markdown } from "../../src/ui/components/Markdown.js";

describe("Markdown（安全な MD サブセット）", () => {
  it("[表示](https://…) を安全なリンクとして描画する", () => {
    // Given
    const source = "[Google](https://google.com)";
    // When
    render(<Markdown source={source} />);
    // Then
    const a = screen.getByRole("link", { name: "Google" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://google.com");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("javascript: スキームのリンクは <a> にせずラベルのみ表示する（XSS 防止）", () => {
    // Given
    const source = "[クリック](javascript:steal)";
    // When
    render(<Markdown source={source} />);
    // Then
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("クリック")).toBeTruthy();
  });

  it("生 URL を autolink し、末尾の約物は URL に含めない", () => {
    // Given
    const source = "参照: https://example.com/a 。";
    // When
    render(<Markdown source={source} />);
    // Then
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/a");
  });

  it("見出し・箇条書き・太字・インラインコードを描画する", () => {
    // Given
    const source = "## 見出し\n\n- **太字** 項目\n- `code` 項目";
    // When
    render(<Markdown source={source} />);
    // Then
    expect(screen.getByText("見出し")).toBeTruthy();
    expect(screen.getByText("太字").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("未終端トークンや空文字でもクラッシュしない", () => {
    // Given（未終端トークン・空文字それぞれを対象にする表形式のケース）
    // When（呼び出しと例外なしの検証を一体で行う）
    expect(() => render(<Markdown source="" />)).not.toThrow();
    expect(() => render(<Markdown source={"**bold\n`code\n[a]("} />)).not.toThrow();
  });

  it("行区切り U+2028 / U+2029 を含む見出しでも止まらずに見出しとして描画する", () => {
    // Given（U+2028・U+2029 は見出しの `.` に一致しない。解析が前へ進まず固まった入力）
    const sources = ["# 見出し\u2028続き", "## a\u2029b"];
    // When
    const { unmount } = render(<Markdown source={sources[0]!} />);
    const headingText = screen.getByRole("heading", { level: 3 }).textContent;
    unmount();
    render(<Markdown source={sources[1]!} />);
    // Then
    expect(headingText).toBe("見出し");
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("a");
  }, 2000);

  it("U+2028 を含む普通の段落でも止まらずに両方の行を描画する", () => {
    // Given
    const source = "一行目\u2028二行目";
    // When
    const { container } = render(<Markdown source={source} />);
    // Then
    expect(container.textContent).toContain("一行目");
    expect(container.textContent).toContain("二行目");
  }, 2000);
});
