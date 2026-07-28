// apps/web/test/ui/RotationLineup.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { RotationLineup } from "../../src/ui/components/RotationLineup.js";

describe("RotationLineup", () => {
  const mk = (id: string, name: string) => ({ participantId: id, displayName: name });
  const props = {
    rotation: [mk("p1", "Alice"), mk("p2", "Bob"), mk("p3", "Carol")],
    currentIndex: 0, intervalSeconds: 300, isPaused: false,
  };

  it("番号付きで全員を並べ、現在に「今」次に「次」を出す", () => {
    render(<RotationLineup {...props} selfIndex={2} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("▶ 今")).toBeTruthy();
    expect(screen.getByText("⟶ 次")).toBeTruthy();
  });

  it("自分が rotation 内なら自分基準サマリを出す", () => {
    render(<RotationLineup {...props} selfIndex={2} />);
    // Carol は 2 手先・約10分後。
    // 自分基準サマリの固有テキストで精密検証（他の要素では出現しない全文）
    expect(screen.getByText("あなた: あと2人・約10分後")).toBeTruthy();
  });

  it("自分が今ドライバーなら「あなたの番です」", () => {
    render(<RotationLineup {...props} currentIndex={2} selfIndex={2} />);
    expect(screen.getByText("あなたの番です")).toBeTruthy();
  });

  it("同名が2人並んでも両方の行が描画され、自分の行だけが「（あなた）」になる", () => {
    // 表示名を React の key にしていると同名で key が衝突し、行が1つに潰れるか
    // 別人の行に強調が付く（実機で 168 件の key 重複警告として観測された）。
    render(
      <RotationLineup
        rotation={[mk("p1", "Bob"), mk("p2", "Bob")]}
        currentIndex={0}
        intervalSeconds={300}
        selfIndex={1}
        isPaused={false}
      />,
    );
    expect(screen.getAllByText("Bob")).toHaveLength(2);
    expect(screen.getAllByText("（あなた）")).toHaveLength(1);
  });
});
