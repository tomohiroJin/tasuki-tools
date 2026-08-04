/**
 * 接続状態・喪失提示のテスト
 * @requirements FR-036, FR-049, FR-059, US8, US10
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";

describe("接続状態の提示", () => {
  const baseProps = {
    phase: "session" as const,
    displayName: "Alice",
    role: "host" as const,
    roomCode: "CONN01",
    problemMode: undefined as "ai" | "fallback" | undefined,
  };

  it("接続中のとき ● オンライン を表示する", () => {
    render(<StatusStrip {...baseProps} connectionStatus="online" />);
    expect(screen.getByText(/接続中|Connected/i)).toBeTruthy();
  });

  it("再接続中のとき ⟳ 再接続中… を表示する", () => {
    render(<StatusStrip {...baseProps} connectionStatus="reconnecting" />);
    expect(screen.getByText(/再接続|reconnect/i)).toBeTruthy();
  });

  it("セッション喪失のとき喪失状態を表示する", () => {
    render(<StatusStrip {...baseProps} connectionStatus="lost" />);
    expect(screen.getByText(/喪失|Lost/i)).toBeTruthy();
  });
});
