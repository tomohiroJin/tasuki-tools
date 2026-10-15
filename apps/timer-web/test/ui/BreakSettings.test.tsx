/**
 * ロビーの休憩の条件（#402）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { BreakSettings } from "../../src/ui/components/BreakSettings.js";

describe("BreakSettings", () => {
  it("Given 条件なし / When 経過時間を選ぶ / Then 既定の 60 分・自動で onChange する", async () => {
    const onChange = vi.fn();
    render(<BreakSettings policy={undefined} intervalMinutes={5} eligibleSeats={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "経過時間" }));
    expect(onChange).toHaveBeenCalledWith({ trigger: "elapsed", every: 60, mode: "auto" });
  });
  it("Given 知らせるだけの経過時間 / When 周回を選ぶ / Then 入り方を引き継ぎ既定の 2 周", async () => {
    const onChange = vi.fn();
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 30, mode: "suggest" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "周回" }));
    expect(onChange).toHaveBeenCalledWith({ trigger: "rounds", every: 2, mode: "suggest" });
  });
  it("Given 経過時間 / When なしを選ぶ / Then every 0 で none", async () => {
    const onChange = vi.fn();
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 60, mode: "auto" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "なし" }));
    expect(onChange).toHaveBeenCalledWith({ trigger: "none", every: 0, mode: "auto" });
  });
  it("Given 経過時間 / When 90分を選ぶ / Then every だけが変わる", async () => {
    const onChange = vi.fn();
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 60, mode: "auto" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "90分" }));
    expect(onChange).toHaveBeenCalledWith({ trigger: "elapsed", every: 90, mode: "auto" });
  });
  it("Given 経過時間 / When 知らせるだけを選ぶ / Then mode だけが変わる", async () => {
    const onChange = vi.fn();
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 60, mode: "auto" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "知らせるだけ" }));
    expect(onChange).toHaveBeenCalledWith({ trigger: "elapsed", every: 60, mode: "suggest" });
  });
  it("Given 周回 1 周・3 分交代・2 人 / When 描く / Then 約 6 分ごとの目安が出る", () => {
    render(
      <BreakSettings
        policy={{ trigger: "rounds", every: 1, mode: "auto" }}
        intervalMinutes={3}
        eligibleSeats={2}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/約 6 分ごと/)).toBeInTheDocument();
  });
  it("Given 周回 2 周・5 分交代・3 人 / When 描く / Then 約 30 分ごと（積。和なら 10 になる）", () => {
    render(
      <BreakSettings
        policy={{ trigger: "rounds", every: 2, mode: "auto" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/約 30 分ごと/)).toBeInTheDocument();
  });
  it("Given 経過時間 / When 描く / Then 周回の目安は出ない", () => {
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 60, mode: "auto" }}
        intervalMinutes={3}
        eligibleSeats={2}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/ごと/)).toBeNull();
  });
  it("Given 条件なし / When 描く / Then 間隔と入り方は出ない", () => {
    render(<BreakSettings policy={undefined} intervalMinutes={5} eligibleSeats={3} onChange={() => {}} />);
    expect(screen.queryByRole("group", { name: "休憩の間隔" })).toBeNull();
    expect(screen.queryByRole("group", { name: "入り方" })).toBeNull();
  });
  it("Given 経過時間 / When 描く / Then 選択中の条件が aria-pressed になる", () => {
    render(
      <BreakSettings
        policy={{ trigger: "elapsed", every: 60, mode: "auto" }}
        intervalMinutes={5}
        eligibleSeats={3}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "経過時間" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "60分" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "なし" })).toHaveAttribute("aria-pressed", "false");
  });
});
