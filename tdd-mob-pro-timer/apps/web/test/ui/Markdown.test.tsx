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
    render(<Markdown source="[Google](https://google.com)" />);
    const a = screen.getByRole("link", { name: "Google" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://google.com");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("javascript: スキームのリンクは <a> にせずラベルのみ表示する（XSS 防止）", () => {
    render(<Markdown source="[クリック](javascript:steal)" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("クリック")).toBeTruthy();
  });

  it("生 URL を autolink し、末尾の約物は URL に含めない", () => {
    render(<Markdown source="参照: https://example.com/a 。" />);
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/a");
  });

  it("見出し・箇条書き・太字・インラインコードを描画する", () => {
    render(
      <Markdown source={"## 見出し\n\n- **太字** 項目\n- `code` 項目"} />,
    );
    expect(screen.getByText("見出し")).toBeTruthy();
    expect(screen.getByText("太字").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("未終端トークンや空文字でもクラッシュしない", () => {
    expect(() => render(<Markdown source="" />)).not.toThrow();
    expect(() => render(<Markdown source={"**bold\n`code\n[a]("} />)).not.toThrow();
  });
});
