/**
 * 名簿の wire の契約（#95 S5a）。
 *
 * **通る形と落ちる形を対で置く。** 片方だけだと、スキーマが何も検めていなくても
 * （あるいは何もかも落としていても）緑になる。
 */
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { HubCommandSchema, HubServerMsgSchema, type RosterRoom } from "../src/wire.js";

/**
 * 名簿は `roster` メッセージとしてだけ運ばれる（スキーマ単体は公開していない）。
 * 利用者が実際に通す経路で検証する。
 */
const parseRoster = (room: unknown) => v.safeParse(HubServerMsgSchema, { type: "roster", room });

const roster: RosterRoom = {
  code: "朝会モブ-a1b2",
  participants: [
    { participantId: "p1", displayName: "あや", presence: "online", tools: ["timer"] },
    { participantId: "p2", displayName: "いずみ", presence: "online", tools: [] },
  ],
};

describe("名簿の wire", () => {
  it("Given 名簿の形をした値 / When 検証する / Then 通る", () => {
    expect(parseRoster(roster).success).toBe(true);
  });

  it("Given 項目の欠けた参加者 / When 検証する / Then 落ちる", () => {
    // Given（準備）: displayName が無い
    const broken = {
      code: "R",
      participants: [{ participantId: "p1", presence: "online", tools: [] }],
    };

    // When / Then（操作）: 境界の検証はここで効く（原則 IV）
    expect(parseRoster(broken).success).toBe(false);
  });

  it("Given 未知の項目が増えた名簿 / When 検証する / Then 通る（古い画面を壊さない）", () => {
    // Given（準備）: サーバーが後から足した項目
    const future = { ...roster, hint: "後から足した" };

    // When / Then（操作）: 非 strict なので、項目が増えてもフレームごと捨てない
    expect(parseRoster(future).success).toBe(true);
  });

  it("Given 値域の外の presence / When 検証する / Then 落ちる", () => {
    // Given（準備）: S4b で導出にしたので idle は作れない
    const broken = {
      code: "R",
      participants: [{ participantId: "p1", displayName: "あ", presence: "idle", tools: [] }],
    };

    // When / Then（操作）
    expect(parseRoster(broken).success).toBe(false);
  });
});

describe("ハブのコマンド", () => {
  it("Given 作成と参加 / When 検証する / Then どちらも通る", () => {
    // Given（準備）: 復帰の組と合言葉は任意
    const create = { command: "room.create", roomName: "朝会モブ", displayName: "あや" };
    const join = { command: "room.join", code: "R", displayName: "いずみ", resumeToken: "t" };

    // When / Then（操作）
    expect(v.safeParse(HubCommandSchema, create).success).toBe(true);
    expect(v.safeParse(HubCommandSchema, join).success).toBe(true);
  });

  it("Given 知らないコマンド / When 検証する / Then 落ちる", () => {
    expect(v.safeParse(HubCommandSchema, { command: "timer.start" }).success).toBe(false);
  });

  it("Given ルームコードが空の参加 / When 検証する / Then 落ちる", () => {
    // Given（準備）: 空のコードで名簿を引かせない（存在しないルームの探索に使われる）
    const join = { command: "room.join", code: "", displayName: "あ" };

    // When / Then（操作）
    expect(v.safeParse(HubCommandSchema, join).success).toBe(false);
  });
});

describe("ハブへのサーバーメッセージ", () => {
  it("Given 4 種のメッセージ / When 検証する / Then すべて通る", () => {
    // Given（準備）: 復帰の組を返す 2 種・名簿・エラー
    const msgs = [
      { type: "room.created", code: "R", participantId: "p1", resumeToken: "t" },
      { type: "room.joined", code: "R", participantId: "p1", resumeToken: "t" },
      { type: "roster", room: roster },
      { type: "error", code: "ROOM_NOT_FOUND", message: "見つかりません" },
    ];

    // When / Then（操作）
    for (const msg of msgs) {
      expect(v.safeParse(HubServerMsgSchema, msg).success, JSON.stringify(msg)).toBe(true);
    }
  });

  it("Given 復帰トークンの無い room.joined / When 検証する / Then 落ちる", () => {
    // Given（準備）: トークンが欠けたまま保存すると、次に開いたとき別人として join する
    const msg = { type: "room.joined", code: "R", participantId: "p1" };

    // When / Then（操作）
    expect(v.safeParse(HubServerMsgSchema, msg).success).toBe(false);
  });
});
