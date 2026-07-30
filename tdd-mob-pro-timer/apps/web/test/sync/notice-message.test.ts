/**
 * signal: "notice" の文言組み立てのテスト（host-spof-relaxation G4・T028）
 *
 * サーバーは意味（action と実行者・対象の識別子）だけを運ぶ。日本語への変換はここで行う。
 * 二重参加の幽霊は本人と同じ表示名を持つため、表示名だけでは
 * 「A さんが A さんを退出させました」となり本 Issue の主要シナリオで判別できない。
 * 同名が複数いるときに限り識別子を添える。
 */

import { describe, it, expect } from "vitest";
import { buildNoticeMessage, type NoticeSignal } from "../../src/sync/notice-message.js";

const roster = [
  { participantId: "pid-alice", displayName: "Alice" },
  { participantId: "pid-bob", displayName: "Bob" },
];

/** 妥当な notice の雛形。 */
const base: NoticeSignal = {
  action: "session-aborted",
  actorName: "Bob",
  actorParticipantId: "pid-bob",
};

/**
 * @requirements FR-077
 */
describe("buildNoticeMessage", () => {
  describe("操作ごとの文言", () => {
    const cases: Array<[NoticeSignal["action"], string]> = [
      ["session-aborted", "中断"],
      ["session-reset", "リセット"],
      ["session-completed", "完成"],
    ];

    for (const [action, keyword] of cases) {
      it(`${action} の文言に実行者名と「${keyword}」が含まれる`, () => {
        // Given
        const signal: NoticeSignal = { ...base, action };
        // When
        const text = buildNoticeMessage(
          signal,
          { selfParticipantId: "pid-alice", participants: roster },
        );

        // Then
        expect(text).toContain("Bob");
        expect(text).toContain(keyword);
      });
    }

    it("participant-removed は実行者と対象の両方を含む", () => {
      // Given
      const signal: NoticeSignal = {
        action: "participant-removed",
        actorName: "Bob",
        actorParticipantId: "pid-bob",
        targetName: "Carol",
        targetParticipantId: "pid-carol",
      };
      // When
      const text = buildNoticeMessage(
        signal,
        { selfParticipantId: "pid-alice", participants: roster },
      );

      // Then
      expect(text).toContain("Bob");
      expect(text).toContain("Carol");
    });

    it("自己退出（実行者＝対象）は「退出させた」ではなく「退出した」と表現する", () => {
      // Given
      const signal: NoticeSignal = {
        action: "participant-removed",
        actorName: "Carol",
        actorParticipantId: "pid-carol",
        targetName: "Carol",
        targetParticipantId: "pid-carol",
      };
      // When
      const text = buildNoticeMessage(
        signal,
        { selfParticipantId: "pid-alice", participants: roster },
      );

      // Then
      expect(text).toContain("退出しました");
      expect(text).not.toContain("退出させました");
    });
  });

  describe("自分が実行者のとき", () => {
    it("自分の名前ではなく「あなた」と表示する", () => {
      // Given（base は actorParticipantId="pid-bob"）
      // When
      const text = buildNoticeMessage(base, {
        selfParticipantId: "pid-bob",
        participants: roster,
      });

      // Then
      expect(text).toContain("あなた");
      expect(text).not.toContain("Bob");
    });
  });

  describe("同名参加者がいるとき（二重参加の幽霊）", () => {
    // 識別子は表示名と文字列が重ならないものにする。`pid-alice` の末尾4文字は "lice" で
    // 表示名 "Alice" の部分文字列になってしまい、ID が表示されていなくても
    // toContain が通る（偽陽性）。実際にそれで回帰を見逃す状態になっていた。
    const withGhost = [
      { participantId: "p-0001", displayName: "Alice" },
      { participantId: "p-0002", displayName: "Alice" },
    ];

    it("実行者と対象が同名でも識別子で区別できる", () => {
      // Given
      const signal: NoticeSignal = {
        action: "participant-removed",
        actorName: "Alice",
        actorParticipantId: "p-0001",
        targetName: "Alice",
        targetParticipantId: "p-0002",
      };
      // When
      const text = buildNoticeMessage(
        signal,
        { selfParticipantId: "p-9999", participants: withGhost },
      );

      // Then（「Alice さんが Alice さんを退出させました」では、どちらが幽霊か分からない。
      // 実行者側・対象側の両方に識別子が付くことを、注記の形ごと固定する）
      expect(text).toContain("（ID: 0001）");
      expect(text).toContain("（ID: 0002）");
    });

    it("同名がいなければ識別子を添えない（通常時に読みにくくしない）", () => {
      // Given
      const signal: NoticeSignal = {
        action: "participant-removed",
        actorName: "Bob",
        actorParticipantId: "pid-bob",
        targetName: "Alice",
        targetParticipantId: "pid-alice",
      };
      // When
      const text = buildNoticeMessage(
        signal,
        { selfParticipantId: "pid-carol", participants: roster },
      );

      // Then
      expect(text).not.toContain("ID:");
    });
  });

  describe("名簿に載っていない参加者", () => {
    it("退出直後で名簿から消えていても対象名を表示できる", () => {
      // Given（notice は退出を永続化した後に配信されるため、対象は既に participants にいない）
      const signal: NoticeSignal = {
        action: "participant-removed",
        actorName: "Bob",
        actorParticipantId: "pid-bob",
        targetName: "Carol",
        targetParticipantId: "pid-carol",
      };
      // When
      const text = buildNoticeMessage(
        signal,
        { selfParticipantId: "pid-alice", participants: roster },
      );

      // Then
      expect(text).toContain("Carol");
    });
  });
});
