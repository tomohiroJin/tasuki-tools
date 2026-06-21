/**
 * ConfigPanel（ロビーのセッション設定パネル）のテスト
 * UX 再設計: 言語/難易度/交代間隔 + 詳細設定(ナビ/強い通知/休憩) をロビーで host が決める。
 * 変更は config.set 相当の onChange(patch) で通知する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ConfigPanel } from "../../src/ui/components/ConfigPanel.js";
import type { SessionConfig } from "@tdd-mob/core";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice"],
  intervalMinutes: 5,
};

describe("ConfigPanel（ロビー設定・UX 再設計）", () => {
  it("canEdit のとき言語/難易度/交代間隔の選択肢が表示される", () => {
    render(<ConfigPanel config={config} canEdit onChange={vi.fn()} />);
    // 「言語をランダムに選ぶ」ボタンも /言語/ にマッチするため、select 要素で特定する
    expect(screen.getByRole("combobox", { name: "言語" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "難易度" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /交代間隔/ })).toBeTruthy();
  });

  it("言語を変更すると onChange({language}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "言語" }), { target: { value: "Python" } });
    expect(onChange).toHaveBeenCalledWith({ language: "Python" });
  });

  it("交代間隔ボタンで onChange({intervalMinutes}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "10分" }));
    expect(onChange).toHaveBeenCalledWith({ intervalMinutes: 10 });
  });

  it("詳細設定のナビゲータートグルで onChange({navigatorEnabled:true}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    expect(onChange).toHaveBeenCalledWith({ navigatorEnabled: true });
  });

  it("休憩リマインダ ON で正の整数、OFF で 0 を送る", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: expect.any(Number) });
    expect(onChange.mock.calls.at(-1)?.[0].breakEveryRotations).toBeGreaterThanOrEqual(1);
    // ON 済みの状態から OFF にすると 0
    onChange.mockClear();
    rerender(<ConfigPanel config={{ ...config, breakEveryRotations: 4 }} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: 0 });
  });

  it("canEdit=false では編集要素を出さず現在の設定を読み取り表示する", () => {
    render(<ConfigPanel config={config} canEdit={false} onChange={vi.fn()} />);
    // 観覧者モードでは select（combobox）が存在しない
    expect(screen.queryByRole("combobox", { name: "言語" })).toBeNull();
    // 現在値（言語・難易度）はテキストで読める
    expect(screen.getByText(/TypeScript/)).toBeTruthy();
  });

  it("言語ランダムボタンが存在する（個別ランダム化 ②）", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    // 新設計: 言語と難易度を別々に振る（旧「設定をランダムに決める」は廃止）
    expect(screen.getByRole("button", { name: "言語をランダムに選ぶ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "難易度をランダムに選ぶ" })).toBeTruthy();
  });
});

describe("ConfigPanel problemEnabled", () => {
  it("problemEnabled=false のとき言語コンボボックスが描画されない", () => {
    render(<ConfigPanel config={config} canEdit onChange={vi.fn()} problemEnabled={false} />);
    expect(screen.queryByRole("combobox", { name: "言語" })).toBeNull();
  });

  it("problemEnabled 省略（デフォルト）のとき言語コンボボックスが描画される", () => {
    render(<ConfigPanel config={config} canEdit onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "言語" })).toBeTruthy();
  });
});

const cfg: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 7 };

describe("ConfigPanel 個別ランダム", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("言語ランダムは言語のみ変える（プールから・難易度は不変）", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // プール先頭 = TypeScript
    const onChange = vi.fn();
    render(<ConfigPanel config={cfg} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "言語をランダムに選ぶ" }));
    expect(onChange).toHaveBeenCalledWith({ language: "TypeScript" });
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty("difficulty");
  });

  it("難易度ランダムは難易度のみ変える", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // DIFFICULTIES 先頭 = easy
    const onChange = vi.fn();
    render(<ConfigPanel config={cfg} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "難易度をランダムに選ぶ" }));
    expect(onChange).toHaveBeenCalledWith({ difficulty: "easy" });
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty("language");
  });

  it("プールを全 OFF にすると言語ランダムは何もしない", () => {
    localStorage.setItem("tdd-mob:random-language-pool:v1", JSON.stringify([]));
    const onChange = vi.fn();
    render(<ConfigPanel config={cfg} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "言語をランダムに選ぶ" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("チップ操作でプールが永続する", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={cfg} canEdit onChange={onChange} />);
    // チップは折りたたみ（<details>）内なので先に開く
    fireEvent.click(screen.getByText("ランダム対象の言語"));
    fireEvent.click(screen.getByRole("button", { name: "ランダム対象から TypeScript を外す" }));
    const saved = JSON.parse(localStorage.getItem("tdd-mob:random-language-pool:v1") ?? "[]");
    expect(saved).not.toContain("TypeScript");
  });

  it("観覧者（canEdit=false）はランダムボタンを出さない", () => {
    render(<ConfigPanel config={cfg} canEdit={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "言語をランダムに選ぶ" })).toBeNull();
  });

  it("canEdit が false→true に変わってもフックエラーで落ちない（Rules of Hooks）", () => {
    const { rerender } = render(<ConfigPanel config={cfg} canEdit={false} onChange={vi.fn()} />);
    // 観覧者→編集者（ホスト移譲）への遷移を再現
    expect(() =>
      rerender(<ConfigPanel config={cfg} canEdit onChange={vi.fn()} />),
    ).not.toThrow();
    // 編集 UI（言語🎲）が出ている
    expect(screen.getByRole("button", { name: "言語をランダムに選ぶ" })).toBeTruthy();
  });
});
