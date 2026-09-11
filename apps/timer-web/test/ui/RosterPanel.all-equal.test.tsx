/**
 * 名簿は全員を同格に描く（#95 S3・役割とホストの廃止）。
 *
 * かつて名簿の行操作は `canManage`（ホスト／編集者以上）で塞がれ、
 * 「主催者」「観覧」のバッジが役割を可視化していた。役割そのものが消えた以上、
 * **誰の行にも同じ操作が出る**ことと、**役割のバッジをどこにも描かない**ことの
 * 両方を固定する。前者だけを見ていると、ゲートを外した後にバッジの残骸が
 * 残っても気づけない。
 *
 * バッジ不在の検証は空振りしやすい。描画そのものが失敗していても
 * `queryByText(...)` は null を返して緑になるため、**同じテストの中で
 * 「行が描かれていること」を先に固定してから**バッジの不在を見る。
 *
 * @requirements FR-046, FR-065, FR-084, US9
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant } from "@tasuki/timer-core";

const noop = vi.fn();

function participant(overrides: Partial<Participant> & Pick<Participant, "participantId">): Participant {
  return {
    displayName: "だれか",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000,
    ...overrides,
  };
}

/** RosterPanel の必須 props のうち、このテストが関心を持たないもの。 */
const baseProps = {
  currentDriverId: "",
  onRename: noop,
  onSkip: noop,
  onResume: noop,
  onAddProxy: noop,
};

describe("#95 S3: 名簿は全員を同格に描く", () => {
  it("部屋を作った人でなくても他の参加者に退出の操作が出る", () => {
    // Given: 自分（みなと）は部屋を作った人ではない
    const me = participant({ participantId: "p2", displayName: "みなと" });
    const other = participant({ participantId: "p1", displayName: "あかり" });
    // When
    render(
      <RosterPanel
        {...baseProps}
        participants={[other, me]}
        myParticipantId="p2"
        onRemove={noop}
      />,
    );
    // Then: かつては管理権限を持つ人にしか出なかった操作が出る
    expect(screen.getByRole("button", { name: "あかり を退出させる" })).toBeTruthy();
  });

  it("自分の行には退出させる操作を出さない（自己退出は別経路）", () => {
    // Given
    const me = participant({ participantId: "p2", displayName: "みなと" });
    const other = participant({ participantId: "p1", displayName: "あかり" });
    // When
    render(
      <RosterPanel
        {...baseProps}
        participants={[other, me]}
        myParticipantId="p2"
        onRemove={noop}
      />,
    );
    // Then
    expect(screen.queryByRole("button", { name: "みなと を退出させる" })).toBeNull();
  });

  it("役割のバッジをどこにも描かない", () => {
    // Given
    const alone = participant({ participantId: "p1", displayName: "あかり" });
    // When
    render(<RosterPanel {...baseProps} participants={[alone]} myParticipantId="p1" />);
    // Then: まず行が描かれていることを固定し、そのうえで不在を見る（空振り防止）
    expect(screen.getByText("あかり")).toBeTruthy();
    expect(screen.queryByText("主催者")).toBeNull();
    expect(screen.queryByText("観覧")).toBeNull();
  });

  it("代理参加者を追加する操作を誰にでも出す", () => {
    // Given
    const alone = participant({ participantId: "p1", displayName: "あかり" });
    // When
    render(<RosterPanel {...baseProps} participants={[alone]} myParticipantId="p1" />);
    // Then: かつては管理権限を持つ人にだけ出していた
    expect(screen.getByRole("button", { name: "代理参加者を追加" })).toBeTruthy();
  });
});
