/**
 * ロビーは 1 画面（#91 PR 3）。
 *
 * かつては「ルーム」「お題」のタブで画面を分け、お題が無い（お題機能が有効で
 * `room.problem` が無い）ときは開始ボタンを無効化してお題を待たせていた。
 * timer 内でのお題の作成・生成は撤去し、お題ツール（別アプリ）が配る任意の札に
 * なったので、**お題の有無で開始を止めない**。タブも無くなり、画面は 1 つになる。
 *
 * @requirements #91 E16
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

/** 参加用 URL は同期フックが組み立てる（#95 S5b）。画面へは値として渡す。 */
const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    memberNames: ["Alice"],
    session: { rotation: ["creator-p"] },
    participants: [
      {
        participantId: "creator-p",
        displayName: "Alice",
        presence: "online",
        joinedAt: 0,
      },
    ],
    ...overrides,
  });
}

const noop = vi.fn();

describe("ロビーは 1 画面（#91 PR 3）", () => {
  it("Given 既定のロビー（お題なし） / When ロビーを描く / Then タブは 1 つも出ない", () => {
    // Given（既定の room はお題無し・topic 未指定）
    // When
    render(
      <Lobby
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
      />,
    );
    // Then
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("Given 開始ボタンと参加者一覧 / When ロビーを描く / Then 両方が同じ画面に出る", () => {
    // Given: 既定のルーム（お題なし）
    // When: 描く
    render(
      <Lobby
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /セッションを開始/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /参加者/ })).toBeInTheDocument();
  });

  it("Given お題が無いロビー（旧実装なら開始ボタンが無効化されていた場面） / When 開始ボタンを押す / Then 押せて onStartSession が呼ばれる", () => {
    // Given: お題は無い（problem: null が既定）。topic prop も渡さない。
    const onStartSession = vi.fn();
    // When
    render(
      <Lobby
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={onStartSession}
      />,
    );
    const btn = screen.getByRole("button", { name: /セッションを開始/ }) as HTMLButtonElement;
    // Then
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onStartSession).toHaveBeenCalledTimes(1);
  });
});
