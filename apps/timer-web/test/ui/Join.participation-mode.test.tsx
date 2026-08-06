/**
 * 参加方法の選択が何を決めるのかを示す（#76 J-2）。
 *
 * 「見学で参加」を選んでも、ステータスの役割表示は「編集者 (editor)」になる。
 * 実装上これは正しい —「見学」が決めるのは**交代の輪に入るかどうか**だけで、
 * 役割ではないため。しかし画面はそれを何も言わないので、選んだ言葉と表示が
 * 食い違って見える。
 *
 * 役割を viewer にする直し方は採らない。開始前の `role.set` は主催者限定で、
 * `member.add` も編集者以上が要るため、見学で入った人は開始前に自分で
 * ドライバーへ移れなくなる（主催者に頼むまで詰む）。言葉のほうを実態に合わせる。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Join } from "../../src/ui/Join.js";

describe("参加方法の選択（#76 J-2）", () => {
  it("それぞれの選択が交代の輪への出入りを決めると分かる", () => {
    // Given: 招待リンクから来た人
    // When: 参加画面を開く
    render(<Join code="ROOM01" onJoin={vi.fn()} />);

    // Then: 「見学」が役割ではなく輪への参加を指すと読み取れる
    const group = screen.getByRole("radiogroup", { name: "参加方法" });
    expect(group).toHaveTextContent(/交代の輪に入る/);
    expect(group).toHaveTextContent(/交代の輪に入らない/);
  });

  it("見学でもあとからドライバーになれると伝える", () => {
    // Given: 招待リンクから来た人
    // When: 参加画面を開く
    render(<Join code="ROOM01" onJoin={vi.fn()} />);

    // Then: 見学を選ぶことが不可逆に見えないようにする
    expect(screen.getByText(/後から加入\/離脱できます/)).toBeInTheDocument();
  });

  it("選択そのものの読み上げ名は変えない（既存の操作を壊さない）", () => {
    // Given: 参加画面
    render(<Join code="ROOM01" onJoin={vi.fn()} />);

    // When/Then: 支援技術から見た名前は従来どおり
    expect(screen.getByRole("radio", { name: "ドライバーとして参加" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "見学で参加" })).toBeInTheDocument();
  });
});
