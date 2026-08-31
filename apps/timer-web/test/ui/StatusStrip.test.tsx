/**
 * StatusStrip コンポーネントのテスト
 * @requirements FR-032, FR-035, FR-036, FR-042, US8
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";

describe("StatusStrip", () => {
  const baseProps = {
    phase: "session" as const,
    displayName: "Alice",
    role: "host" as const,
    connectionStatus: "online" as const,
    problemMode: undefined as "ai" | "fallback" | undefined,
    roomCode: "ABCD01",
  };

  it("フェーズを表示する", () => {
    render(<StatusStrip {...baseProps} />);
    // "session" → 日本語ラベルかフェーズ識別子が表示される
    expect(screen.getByText(/session|セッション/i)).toBeTruthy();
  });

  it("接続状態が online のときに接続中の表示をする（色+テキスト併記）", () => {
    render(<StatusStrip {...baseProps} connectionStatus="online" />);
    expect(screen.getByText(/接続中|online|Connected/i)).toBeTruthy();
  });

  /**
   * @requirements US8-6
   */
  it("接続状態が reconnecting のときに再接続中を表示する", () => {
    render(<StatusStrip {...baseProps} connectionStatus="reconnecting" />);
    expect(screen.getByText(/再接続|reconnect/i)).toBeTruthy();
  });

  /**
   * @requirements FR-059
   */
  it("接続状態が lost のときにセッション喪失を表示する", () => {
    render(<StatusStrip {...baseProps} connectionStatus="lost" />);
    expect(screen.getByText(/喪失|Lost|lost/i)).toBeTruthy();
  });

  it("接続状態が stale のとき同期不整合を表示する（#209）", () => {
    render(<StatusStrip {...baseProps} connectionStatus="stale" />);
    expect(screen.getByText(/同期不整合|Out of Sync/i)).toBeTruthy();
  });

  it("自分の表示名と役割を表示する", () => {
    // Given（baseProps に displayName="Alice"・role="host" を重ねる）
    // When
    render(<StatusStrip {...baseProps} displayName="Alice" role="host" />);
    // Then
    expect(screen.getByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/host|ホスト/i)).toBeTruthy();
  });

  // 出題モード（AI/定型）バッジは AI 撤去に伴い廃止（定型のみのため表示しない）。

  it("roomCode を表示する", () => {
    render(<StatusStrip {...baseProps} roomCode="ABCD01" />);
    expect(screen.getByText(/ABCD01/)).toBeTruthy();
  });
});
