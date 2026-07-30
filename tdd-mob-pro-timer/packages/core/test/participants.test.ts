/**
 * countManagers / canDemote / canRemoveParticipant のテスト
 * （Issue #22: 「編集者以上が1名以上」不変条件・plan.md D3）
 *
 * 権限（誰が実行できるか）ではなく、操作後の状態が妥当かを検証するドメインガード。
 * 役割変更・退出という別々の経路から呼ばれても同じ述語が効くことを確認する。
 */

import { describe, it, expect } from "vitest";
import type { Participant } from "../src/aggregate.js";
import { countManagers, canDemote, canRemoveParticipant } from "../src/participants.js";

/** テスト用の参加者を組み立てる小ヘルパー。差分だけを書けば済むようにする。 */
function participant(overrides: Partial<Participant> & { participantId: string }): Participant {
  return {
    connId: "conn-1",
    displayName: "no-name",
    role: "editor",
    presence: "online",
    hasAiKey: false,
    joinedAt: 0,
    ...overrides,
  };
}

describe("countManagers", () => {
  it("host / editor を数え、viewer は数えない", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "editor" }),
      participant({ participantId: "p3", role: "viewer" }),
    ];
    // When / Then
    expect(countManagers(participants)).toBe(2);
  });

  it("isPlaceholder: true の代理参加者は role が editor でも数えない", () => {
    // Given（代理参加者は connId: null / isPlaceholder: true / role: "editor" で登録されるが
    // Web 非接続で自分では操作できないため、不変条件の頭数に入れると意味を失う（plan.md D3 注意1））
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "editor" }),
      participant({
        participantId: "proxy-1",
        connId: null,
        role: "editor",
        presence: "offline",
        isPlaceholder: true,
      }),
    ];
    // When / Then
    expect(countManagers(participants)).toBe(1);
  });
});

describe("canDemote", () => {
  it("実在の editor が1名のとき、その1名の降格を拒否する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "editor" }),
      participant({ participantId: "p2", role: "viewer" }),
    ];
    // When / Then
    expect(canDemote(participants, "p1")).toBe(false);
  });

  it("代理 editor が別に1名いても、実在editor1名の降格は同じく拒否する", () => {
    // Given（代理は countManagers に数えられないため、実在1名の降格を許してしまうと
    // 「編集者以上0名」の状態に落ちる。代理は自分で操作できず詰む）
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "editor" }),
      participant({
        participantId: "proxy-1",
        connId: null,
        role: "editor",
        presence: "offline",
        isPlaceholder: true,
      }),
    ];
    // When / Then
    expect(canDemote(participants, "p1")).toBe(false);
  });

  it("editor が2名いれば、そのうち1名の降格は許可する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "editor" }),
    ];
    // When / Then
    expect(canDemote(participants, "p2")).toBe(true);
  });

  it("対象が viewer（元々編集者以上でない）なら降格は当然許可する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "viewer" }),
    ];
    // When / Then
    expect(canDemote(participants, "p2")).toBe(true);
  });

  it("対象が participants に存在しない場合は影響がないので許可する", () => {
    // Given
    const participants: Participant[] = [participant({ participantId: "p1", role: "editor" })];
    // When / Then
    expect(canDemote(participants, "unknown")).toBe(true);
  });
});

describe("canRemoveParticipant", () => {
  it("実在の editor が1名のとき、その1名の退出を拒否する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "editor" }),
      participant({ participantId: "p2", role: "viewer" }),
    ];
    // When / Then
    expect(canRemoveParticipant(participants, "p1")).toBe(false);
  });

  it("代理 editor が別に1名いても、実在editor1名の退出は同じく拒否する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "editor" }),
      participant({
        participantId: "proxy-1",
        connId: null,
        role: "editor",
        presence: "offline",
        isPlaceholder: true,
      }),
    ];
    // When / Then
    expect(canRemoveParticipant(participants, "p1")).toBe(false);
  });

  it("editor が2名いれば、そのうち1名の退出は許可する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "editor" }),
    ];
    // When / Then
    expect(canRemoveParticipant(participants, "p2")).toBe(true);
  });

  it("対象が viewer なら退出は当然許可する", () => {
    // Given
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({ participantId: "p2", role: "viewer" }),
    ];
    // When / Then
    expect(canRemoveParticipant(participants, "p2")).toBe(true);
  });

  it("対象が participants に存在しない場合は影響がないので許可する", () => {
    // Given
    const participants: Participant[] = [participant({ participantId: "p1", role: "editor" })];
    // When / Then
    expect(canRemoveParticipant(participants, "unknown")).toBe(true);
  });
});

describe("在室者が0名になる場合の不変条件（FR-072は空虚に真）", () => {
  it("在室者がhost1名だけのとき、そのhostの退出は許可する", () => {
    // Given（退出後に在室者が0名になるため、「在室者が1名以上いる間」を前提とするFR-072の
    // 不変条件はそもそも適用対象がなく、空虚に真である）
    const participants: Participant[] = [participant({ participantId: "p1", role: "host" })];
    // When / Then
    expect(canRemoveParticipant(participants, "p1")).toBe(true);
  });

  it("在室者がeditor1名だけのとき、そのeditorの退出は許可する", () => {
    const participants: Participant[] = [participant({ participantId: "p1", role: "editor" })];
    expect(canRemoveParticipant(participants, "p1")).toBe(true);
  });

  it("在室者がeditor1名だけのとき、そのeditorの降格は拒否する（退出との非対称性）", () => {
    // Given（降格は退出と違い在室者数を減らさない。editor1名だけの部屋でその1名を降格すると、
    // 「操作できない人（viewerになった本人）だけが部屋に残る」状態になり、
    // 退出（誰も残らない＝誰も困らない）とは異なり詰みを作る。したがって拒否のままが正しい）
    const participants: Participant[] = [participant({ participantId: "p1", role: "editor" })];
    // When / Then
    expect(canDemote(participants, "p1")).toBe(false);
  });

  it("host1名+代理editor複数が在室のとき、hostの退出は拒否する（代理は在室者として残る）", () => {
    // Given（countManagers は代理を数えないが、「退出後に在室者が0名か」の判定では代理も
    // 在室者として数える必要がある。代理は自分では退出しないため部屋に残り続ける。
    // この2つの数え方を混同すると、代理だけが残る部屋でhostが抜けられてしまい、
    // 誰も操作できない部屋が残ってしまう）
    const participants: Participant[] = [
      participant({ participantId: "p1", role: "host" }),
      participant({
        participantId: "proxy-1",
        connId: null,
        role: "editor",
        presence: "offline",
        isPlaceholder: true,
      }),
      participant({
        participantId: "proxy-2",
        connId: null,
        role: "editor",
        presence: "offline",
        isPlaceholder: true,
      }),
    ];
    // When / Then
    expect(canRemoveParticipant(participants, "p1")).toBe(false);
  });
});

describe("役割変更と退出の両経路から同じ不変条件が効くこと", () => {
  it("同一の参加者構成に対し canDemote と canRemoveParticipant は常に同じ判定を返す", () => {
    // Given
    const scenarios: { participants: Participant[]; targetParticipantId: string }[] = [
      {
        participants: [
          participant({ participantId: "p1", role: "editor" }),
          participant({ participantId: "p2", role: "viewer" }),
        ],
        targetParticipantId: "p1",
      },
      {
        participants: [
          participant({ participantId: "p1", role: "host" }),
          participant({ participantId: "p2", role: "editor" }),
        ],
        targetParticipantId: "p2",
      },
      {
        participants: [
          participant({ participantId: "p1", role: "editor" }),
          participant({
            participantId: "proxy-1",
            connId: null,
            role: "editor",
            presence: "offline",
            isPlaceholder: true,
          }),
        ],
        targetParticipantId: "p1",
      },
    ];

    // When / Then
    for (const { participants, targetParticipantId } of scenarios) {
      expect(canDemote(participants, targetParticipantId)).toBe(
        canRemoveParticipant(participants, targetParticipantId),
      );
    }
  });
});
