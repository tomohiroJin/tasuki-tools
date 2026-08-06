/**
 * 再読込・タブ復元での復帰判定（#76 F-3）。
 *
 * これまで復帰は WS の自動再接続（onReconnected）経路にしか無く、ページを読み直すと
 * 必ず参加画面に戻された。sessionStorage には resumeToken が残っているのに使われず、
 * 名前と参加方法を入れ直し、ローテーションにも入り直す必要があった。
 * poker は再読込で復帰するため、同じ製品の中で挙動が割れていた。
 */
import { describe, it, expect } from "vitest";
import { shouldResumeOnLoad } from "../../src/sync/resume-identity";
import type { ResumeIdentity } from "../../src/sync/resume-identity";

const identity = (over: Partial<ResumeIdentity> = {}): ResumeIdentity => ({
  code: "ROOM01",
  participantId: "p_1",
  resumeToken: "rt_1",
  displayName: "ボブ",
  ...over,
});

describe("shouldResumeOnLoad", () => {
  it("同じルームの保存済み識別情報があれば復帰する", () => {
    // Given: セッション中に再読込した（sessionStorage は同一タブで生き残る）
    // When: URL のルームと保存済みのルームが一致する
    // Then: 名前を入れ直させず、そのまま戻す
    expect(shouldResumeOnLoad(identity(), "ROOM01")).toBe(true);
  });

  it("別のルームの識別情報では復帰しない", () => {
    // Given: 前のルームの情報が残っている
    // When: 別のルームの招待リンクを開く
    // Then: 前のルームへ勝手に戻さない
    expect(shouldResumeOnLoad(identity({ code: "OLD999" }), "ROOM01")).toBe(false);
  });

  it("保存が無ければ復帰しない（招待リンクで初めて来た人）", () => {
    expect(shouldResumeOnLoad(null, "ROOM01")).toBe(false);
  });

  it("復帰に必要な項目が欠けていれば復帰しない", () => {
    // 破損した保存値でトークン無しの join を送ると、別人として二重に参加してしまう
    expect(shouldResumeOnLoad(identity({ resumeToken: "" }), "ROOM01")).toBe(false);
    expect(shouldResumeOnLoad(identity({ displayName: "" }), "ROOM01")).toBe(false);
  });

  it("ルームコードが無い URL では復帰しない", () => {
    // 入口（?room= 無し）を開いたときに前のルームへ引き戻さない
    expect(shouldResumeOnLoad(identity(), null)).toBe(false);
  });

  it("ルーム名を含む日本語コードでも一致を判定できる", () => {
    expect(shouldResumeOnLoad(identity({ code: "朝会モブ-a1b2" }), "朝会モブ-a1b2")).toBe(true);
  });
});
