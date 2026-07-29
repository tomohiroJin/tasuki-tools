/**
 * aRoomView() — apps/web のテスト共有 Room ビルダー（新設6・G2-c）
 *
 * apps/web の各テストは Lobby/Session 等へ渡す `Room`（snapshot の形）を
 * 丸ごと手で組み立てており、これが web の Given が長い主因（plan.md 新設6）。
 * aRoomView() は既定値の Room を返し、渡した項目だけを上書きできるようにする。
 *
 * 既定値は「テスト専用の都合のよい値」ではなく、実際に App.tsx が room.create で
 * 送る config（language: "TypeScript" / difficulty: "easy" / intervalMinutes: 7 —
 * handleCreateRoom 参照）に合わせる。
 *
 * @requirements FR-096, FR-097, US2
 */

import { describe, it, expect } from "vitest";
import { aRoomView } from "./room-view.js";

describe("aRoomView()", () => {
  it("既定値の Room を返す（App.tsx の room.create 既定 config に一致）", () => {
    // Given（上書きなし）
    // When
    const room = aRoomView();

    // Then
    expect(room.config.language).toBe("TypeScript");
    expect(room.config.difficulty).toBe("easy");
    expect(room.config.intervalMinutes).toBe(7);
    expect(room.phase).toBe("setup");
    expect(room.problem).toBeNull();
    expect(room.sessionRecords).toEqual([]);
    expect(room.handoffNote).toBe("");
    expect(room.onBreak).toBe(false);

    // 既定は host 1 名のみで、rotation にも入っている（App の handleCreateRoom は
    // 作成者名を members[0] にし、参加者としても host が最初に居る想定）。
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]?.role).toBe("host");
    expect(room.hostParticipantId).toBe(room.participants[0]?.participantId);
    expect(room.session.rotation).toEqual([room.hostParticipantId]);

    // clock の間隔は config.intervalMinutes（既定7分）から導出される（秒換算）。
    expect(room.clock.intervalSeconds).toBe(7 * 60);
    expect(room.clock.running).toBe(false);
  });

  it("トップレベルの上書きは指定した項目だけが変わり、他は既定のまま", () => {
    // Given
    const overrides = { phase: "session" as const, handoffNote: "引き継ぎメモ" };
    // When
    const room = aRoomView(overrides);

    // Then
    expect(room.phase).toBe("session");
    expect(room.handoffNote).toBe("引き継ぎメモ");
    // 上書きしていない項目は既定のまま
    expect(room.config.language).toBe("TypeScript");
    expect(room.onBreak).toBe(false);
  });

  it("config の部分上書きは、渡した項目だけが変わり残りは既定のまま", () => {
    // Given
    const overrides = { config: { difficulty: "hard" as const } };
    // When
    const room = aRoomView(overrides);

    // Then
    expect(room.config.difficulty).toBe("hard");
    // 渡していない config の項目は既定のまま
    expect(room.config.language).toBe("TypeScript");
    expect(room.config.intervalMinutes).toBe(7);
  });

  it("session / clock の部分上書きも、渡した項目だけが変わり残りは既定のまま", () => {
    // Given
    const overrides = {
      session: { isPaused: true },
      clock: { running: true },
    };
    // When
    const room = aRoomView(overrides);

    // Then
    expect(room.session.isPaused).toBe(true);
    expect(room.session.rotation).toEqual([room.hostParticipantId]);
    expect(room.clock.running).toBe(true);
    expect(room.clock.intervalSeconds).toBe(7 * 60);
  });

  it("participants を丸ごと上書きすると、その配列がそのまま使われる", () => {
    // Given
    const custom = [
      {
        participantId: "p1",
        connId: "c1",
        displayName: "Alice",
        role: "host" as const,
        presence: "online" as const,
        hasAiKey: false,
        joinedAt: 0,
      },
    ];
    // When
    const room = aRoomView({ participants: custom });

    // Then
    expect(room.participants).toBe(custom);
  });
});
