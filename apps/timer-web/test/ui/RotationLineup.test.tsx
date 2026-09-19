// apps/web/test/ui/RotationLineup.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { SeatSkipReason } from "@tasuki/timer-core";
import { RotationLineup } from "../../src/ui/components/RotationLineup.js";

describe("RotationLineup", () => {
  const mk = (id: string, name: string, label = name, skipReason: SeatSkipReason | null = null) => ({
    participantId: id, displayName: name, label, skipReason,
  });
  const props = {
    rotation: [mk("p1", "Alice"), mk("p2", "Bob"), mk("p3", "Carol")],
    currentIndex: 0, nextIndex: 1, intervalSeconds: 300, isPaused: false,
  };

  it("番号付きで全員を並べ、現在に「今」次に「次」を出す", () => {
    // Given（props をそのまま使い、selfIndex=2）
    // When
    render(<RotationLineup {...props} selfIndex={2} />);
    // Then
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
    // Given（表示名を React の key にしていると同名で key が衝突し、行が1つに潰れるか
    // 別人の行に強調が付く。実機で 168 件の key 重複警告として観測された）
    const rotation = [mk("p1", "Bob", "Bob（ID: p1）"), mk("p2", "Bob", "Bob（ID: p2）")];
    // When
    render(
      <RotationLineup
        rotation={rotation}
        currentIndex={0}
        nextIndex={1}
        intervalSeconds={300}
        selfIndex={1}
        isPaused={false}
      />,
    );
    // Then（呼び名で描かれるので、同名でもどちらの行か読み取れる）
    expect(screen.getByText("Bob（ID: p1）")).toBeTruthy();
    expect(screen.getByText("Bob（ID: p2）")).toBeTruthy();
    expect(screen.getAllByText("（あなた）")).toHaveLength(1);
  });

  it("timer に居ない席は「別の画面」と出し、順番の予告を出さない", () => {
    // Given（Bob は選択画面へ戻っており、サーバーはこの席をドライバーから外す・D21）。
    // 他に交代できる席が無いので、サーバーの nextIndex は null になる。
    const rotation = [mk("p1", "Alice"), mk("p2", "Bob", "Bob", "away")];

    // When
    render(
      <RotationLineup
        rotation={rotation}
        currentIndex={0}
        nextIndex={null}
        intervalSeconds={300}
        selfIndex={0}
        isPaused={false}
      />,
    );

    // Then（名前は出るが、回ってこない順番を予告しない）
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("別の画面")).toBeTruthy();
    expect(screen.queryByText("⟶ 次")).toBeNull();
  });

  it("在席している席には「別の画面」を出さず、順番の予告も従来どおり出す（対照）", () => {
    // Given（同じ並びで、Bob が timer に居るだけの違い）
    const rotation = [mk("p1", "Alice"), mk("p2", "Bob")];

    // When
    render(
      <RotationLineup
        rotation={rotation}
        currentIndex={0}
        nextIndex={1}
        intervalSeconds={300}
        selfIndex={0}
        isPaused={false}
      />,
    );

    // Then
    expect(screen.queryByText("別の画面")).toBeNull();
    expect(screen.getByText("⟶ 次")).toBeTruthy();
  });
});

describe("番が回らない理由（#276 E1 / D11）", () => {
  const mk = (
    id: string, name: string, label = name,
    skipReason: SeatSkipReason | null = null,
  ) => ({ participantId: id, displayName: name, label, skipReason });

  it("一時離脱・別の画面・未接続をそれぞれ文字で示す", () => {
    render(
      <RotationLineup
        rotation={[
          mk("p1", "Alice"),
          mk("p2", "Bob", "Bob", "stood-down"),
          mk("p3", "Carol", "Carol", "away"),
          mk("p4", "Dave", "Dave", "disconnected"),
        ]}
        currentIndex={0} nextIndex={0} intervalSeconds={300} isPaused={false} selfIndex={0}
      />,
    );
    expect(screen.getByText("離脱中")).toBeTruthy();
    expect(screen.getByText("別の画面")).toBeTruthy();
    expect(screen.getByText("未接続")).toBeTruthy();
  });

  it("現ドライバーには「順番は回りません」と言わない（運転中のため）", () => {
    render(
      <RotationLineup
        rotation={[mk("p1", "Alice", "Alice", "disconnected"), mk("p2", "Bob")]}
        currentIndex={0} nextIndex={1} intervalSeconds={300} isPaused={false} selfIndex={1}
      />,
    );
    expect(screen.getByTitle("接続が切れています")).toBeTruthy();
    expect(screen.queryByTitle(/順番は回りません/)).toBeNull();
  });

  it("自分の席が飛ばされるときは「あとnull人」を出さない", () => {
    render(
      <RotationLineup
        rotation={[mk("p1", "Alice"), mk("p2", "Bob", "Bob", "disconnected")]}
        currentIndex={0} nextIndex={0} intervalSeconds={300} isPaused={false} selfIndex={1}
      />,
    );
    expect(screen.getByText("あなた: 番が回りません（未接続）")).toBeTruthy();
    expect(screen.queryByText(/あとnull人/)).toBeNull();
  });
});
