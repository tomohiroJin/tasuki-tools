/**
 * rotation（参加者IDの配列・D6b）→ 表示用ビューへの写像。
 * 同定は識別子、表示は名前という一方向の流れを守るための境界。
 */

import { describe, it, expect } from "vitest";
import { rotationMembers } from "../../src/ui/rotation-names.js";
import type { Participant } from "@tasuki/timer-core";

const p = (participantId: string, displayName: string): Participant => ({
  participantId,
  displayName,
  presence: "online",
  hasAiKey: false,
  joinedAt: 1000,
});

describe("rotationMembers", () => {
  it("rotation の順序どおりに識別子と表示名を対にして返す", () => {
    // Given
    const participants = [p("p2", "Bob"), p("p1", "Alice")];
    // When / Then
    expect(rotationMembers(["p1", "p2"], participants)).toEqual([
      { participantId: "p1", displayName: "Alice", label: "Alice", isAway: false },
      { participantId: "p2", displayName: "Bob", label: "Bob", isAway: false },
    ]);
  });

  it("同名が並んでも識別子で区別できる（React の key に使えることを保証する）", () => {
    // Given（表示名だけの配列にすると key が衝突し、同名の行が取り違えられる）
    const members = rotationMembers(["p1", "p2"], [p("p1", "Bob"), p("p2", "Bob")]);
    // When / Then
    expect(members.map((m) => m.displayName)).toEqual(["Bob", "Bob"]);
    expect(members.map((m) => m.participantId)).toEqual(["p1", "p2"]);
    // 呼び名には識別子が付き、画面上でも区別できる。
    expect(members.map((m) => m.label)).toEqual(["Bob（ID: p1）", "Bob（ID: p2）"]);
  });

  it("participants に居ない ID は表示名が空になる（枠は落とさない）", () => {
    // Given（枠を落とすと currentIndex や driverCounts と長さがずれるため、詰めてはいけない）
    const members = rotationMembers(["p1", "ghost"], [p("p1", "Alice")]);
    // When / Then
    expect(members).toHaveLength(2);
    expect(members[1]).toEqual({
      participantId: "ghost",
      displayName: "",
      label: "",
      isAway: true,
    });
  });

  it("参加者の並び順には依存しない（rotation が唯一の順序の源）", () => {
    // Given
    const shuffled = [p("p3", "Carol"), p("p1", "Alice"), p("p2", "Bob")];
    // When / Then
    expect(rotationMembers(["p2", "p3", "p1"], shuffled).map((m) => m.displayName)).toEqual([
      "Bob",
      "Carol",
      "Alice",
    ]);
  });

  it("timer を離れた席の表示名を config.members から補い、離席として印を付ける", () => {
    // Given（S5a で participants は timer の在席者に絞られる。選択画面へ戻った Bob は
    // 一覧から消えるが、輪の席と config.members は残る）
    const participants = [p("p1", "Alice")];
    const memberNames = ["Alice", "Bob"];

    // When
    const members = rotationMembers(["p1", "p2"], participants, memberNames);

    // Then（名前が引けて、その席が timer に居ないと分かる）
    expect(members[1]).toEqual({
      participantId: "p2",
      displayName: "Bob",
      label: "Bob",
      isAway: true,
    });
  });

  it("在席している席は従来どおり participants の表示名を使い、離席の印も付かない（対照）", () => {
    // Given（config.members は改名前の古い名前を持っている）
    const participants = [p("p1", "Alice"), p("p2", "Bob")];
    const memberNames = ["旧Alice", "旧Bob"];

    // When
    const members = rotationMembers(["p1", "p2"], participants, memberNames);

    // Then（在席者の名前の正本は participants のままで、全員が離席になったりしない）
    expect(members.map((m) => m.displayName)).toEqual(["Alice", "Bob"]);
    expect(members.map((m) => m.isAway)).toEqual([false, false]);
  });

  it("代理（Web 非接続の席）は participants に載るので離席にならない", () => {
    // Given（代理はサーバーが participants へ合成する・timer-snapshot-dto.ts）
    const proxy: Participant = { ...p("proxy-1", "モブ太郎"), presence: "offline", isPlaceholder: true };
    const participants = [p("p1", "Alice"), proxy];

    // When
    const members = rotationMembers(["p1", "proxy-1"], participants, ["Alice", "モブ太郎"]);

    // Then（対面に居る人なのでドライバーは回る。離席扱いにすると永久に飛ばされて見える）
    expect(members[1]).toEqual({
      participantId: "proxy-1",
      displayName: "モブ太郎",
      label: "モブ太郎",
      isAway: false,
    });
  });

  it("config.members と rotation の長さが違えば添字で対応づけない（別人の名前を貼らない）", () => {
    // Given（wire の型もスキーマも長さの一致を要求していない。ずれた配列から引くと
    // 席に別人の名前が出るため、長さが違うときは補わない）
    const participants = [p("p1", "Alice")];

    // When
    const members = rotationMembers(["p1", "p2", "p3"], participants, ["Alice", "Bob"]);

    // Then
    expect(members.map((m) => m.displayName)).toEqual(["Alice", "", ""]);
    expect(members.map((m) => m.isAway)).toEqual([false, true, true]);
  });
});
