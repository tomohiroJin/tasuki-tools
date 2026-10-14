/**
 * 名前の申し出（代理の追加・改名）の状態と判定（#370。`RosterPanel.tsx` から出した純粋関数）。
 *
 * 「送る前に拒む → 送ったら名簿に現れるのを待つ → 拒んだ理由は名簿に追随する」を、
 * 代理の追加と改名で 1 つにした（#291 とそのレビューの指摘 1〜4）。
 */
import { describe, expect, it } from "vitest";
import {
  INITIAL_NAME_REQUEST,
  activeRejection,
  holdsName,
  inputStillMatches,
  nameRequestReducer,
  planNameSubmit,
  someoneHolds,
  type NameRequestState,
  type ProxyPending,
  type RenamePending,
} from "../../src/ui/name-request.js";

const pool = [
  { participantId: "a", displayName: "あや" },
  { participantId: "i", displayName: "いずみ" },
  { participantId: "s", displayName: "" },
];

describe("someoneHolds / holdsName", () => {
  it.each([
    ["あや", undefined, true],
    ["あや", "a", false],
    ["うた", undefined, false],
    ["", undefined, false],
  ] as const)("「%s」（除く %s）→ %s。空の正規形は突き合わせない", (name, exclude, expected) => {
    expect(someoneHolds(pool, name, exclude)).toBe(expected);
  });

  it.each([
    ["a", "あや", true],
    ["i", "あや", false],
    ["s", "", false],
  ])("%s が「%s」を持っているか → %s（その人だけを見る）", (id, name, expected) => {
    expect(holdsName(pool, id, name)).toBe(expected);
  });
});

describe("planNameSubmit", () => {
  it("空白だけなら送らない", () => {
    expect(planNameSubmit("  ", pool)).toEqual({ kind: "empty" });
  });

  it("誰かが持っている名前は送る前に拒む（打った文字は前後の空白を落として持つ）", () => {
    expect(planNameSubmit(" あや ", pool)).toEqual({ kind: "reject", typed: "あや", normalized: "あや" });
  });

  it("自分を除けば、自分の今の名前への改名は送る", () => {
    expect(planNameSubmit("あや", pool, "a")).toEqual({ kind: "send", typed: "あや", normalized: "あや" });
  });

  it("誰も持っていなければ送る", () => {
    expect(planNameSubmit("うた", pool)).toEqual({ kind: "send", typed: "うた", normalized: "うた" });
  });
});

describe("nameRequestReducer", () => {
  it("拒むたびに通し番号が進み、待ちはそのまま", () => {
    const waiting: NameRequestState<ProxyPending> = { pending: { normalized: "うた" }, rejection: null };
    const once = nameRequestReducer(waiting, { type: "rejected", typed: "あや", normalized: "あや" });
    const twice = nameRequestReducer(once, { type: "rejected", typed: "あや", normalized: "あや" });
    expect(twice).toEqual({ pending: { normalized: "うた" }, rejection: { typed: "あや", normalized: "あや", attempt: 2 } });
  });

  it("送ったら理由を下ろし、名簿に現れるのを待つ", () => {
    const rejected: NameRequestState<RenamePending> = { pending: null, rejection: { typed: "あや", normalized: "あや", attempt: 1 } };
    expect(nameRequestReducer(rejected, { type: "sent", pending: { normalized: "うた", participantId: "i" } })).toEqual({
      pending: { normalized: "うた", participantId: "i" },
      rejection: null,
    });
  });

  it("正規形が空の名前は待たない（サーバーが規約で弾く）", () => {
    expect(nameRequestReducer<ProxyPending>(INITIAL_NAME_REQUEST, { type: "sent", pending: { normalized: "" } })).toEqual(
      INITIAL_NAME_REQUEST,
    );
  });

  it("改名の送りは、相手の識別子を持たないと型が通さない（着いたかを識別子で確かめるため）", () => {
    const rename = (action: Parameters<typeof nameRequestReducer<RenamePending>>[1]) =>
      nameRequestReducer<RenamePending>(INITIAL_NAME_REQUEST, action);
    // @ts-expect-error 改名の待ちには participantId が要る
    expect(rename({ type: "sent", pending: { normalized: "うた" } }).pending).toEqual({ normalized: "うた" });
  });

  it("名簿に現れたら待ちを下ろす（理由はそのまま）", () => {
    const state: NameRequestState<ProxyPending> = { pending: { normalized: "うた" }, rejection: { typed: "x", normalized: "x", attempt: 1 } };
    expect(nameRequestReducer(state, { type: "arrived" })).toEqual({ pending: null, rejection: state.rejection });
  });

  it("打ち直したら理由だけを下ろす（待ちはそのまま）", () => {
    const state: NameRequestState<ProxyPending> = { pending: { normalized: "うた" }, rejection: { typed: "x", normalized: "x", attempt: 1 } };
    expect(nameRequestReducer(state, { type: "retyped" })).toEqual({ pending: state.pending, rejection: null });
  });

  it("やめたら待ちも理由も下ろす", () => {
    const state: NameRequestState<ProxyPending> = { pending: { normalized: "うた" }, rejection: { typed: "x", normalized: "x", attempt: 1 } };
    expect(nameRequestReducer(state, { type: "reset" })).toEqual(INITIAL_NAME_REQUEST);
  });
});

describe("activeRejection", () => {
  const rejection = { typed: "あや", normalized: "あや", attempt: 1 };

  it("まだ誰かが持っていれば理由を出す", () => {
    expect(activeRejection(rejection, pool)).toBe(rejection);
  });

  it("持ち主が居なくなれば出さない（名簿に追随する）", () => {
    expect(activeRejection(rejection, pool.filter((p) => p.participantId !== "a"))).toBeNull();
  });

  it("持ち主が自分（改名中の人）なら出さない", () => {
    expect(activeRejection(rejection, pool, "a")).toBeNull();
  });

  it("理由が無ければ null", () => {
    expect(activeRejection(null, pool)).toBeNull();
  });
});

describe("inputStillMatches", () => {
  it.each([
    [" うた ", "うた", true],
    ["うたこ", "うた", false],
  ])("入力「%s」は送った「%s」のまま → %s（打ち直していたら畳まない）", (input, pending, expected) => {
    expect(inputStillMatches(input, pending)).toBe(expected);
  });
});
