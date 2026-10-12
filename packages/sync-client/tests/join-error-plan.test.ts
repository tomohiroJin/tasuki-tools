/**
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。ツールの画面は失敗を見て、
 * 玄関へ戻すか・待って入り直すか・その場で伝えるかだけを決める。
 *
 * お題ツール（#91）とルーレット（#94）が写しで持っていた規則をここへ寄せた（#94 PR 2 のレビュー）。
 * 利用側の配線（失敗が届いたら玄関へ戻る等）は各アプリの同期フックのテストが見る。
 *
 * @requirements #91 spec §5.4・#94 spec §5.6
 */
import { describe, expect, it } from "vitest";
import { planForJoinError } from "../src/join-error-plan.js";

const DEFAULT_TEXT = "既定の文";

describe("参加の失敗から次の一手を決める", () => {
  it("Given ルームが見つからない / When 決める / Then 消えたルームの案内にする", () => {
    expect(planForJoinError("ROOM_NOT_FOUND", "x", DEFAULT_TEXT)).toEqual({ kind: "gone" });
  });

  it("Given 自分で抜けた・外された知らせ / When 決める / Then 理由を持って玄関へ戻す", () => {
    // Given: 自分のタブで抜けた・別のタブで抜けた（サーバーはその人の全接続へ知らせる。participant-remove.ts・#290）
    // When / Then
    expect(planForJoinError("LEFT_ROOM", "x", DEFAULT_TEXT)).toEqual({ kind: "left", reason: "self" });
    expect(planForJoinError("REMOVED_FROM_ROOM", "x", DEFAULT_TEXT)).toEqual({ kind: "left", reason: "removed" });
    expect(planForJoinError("REMOVED_BY_HOST", "x", DEFAULT_TEXT)).toEqual({ kind: "left", reason: "removed" });
  });

  it("Given 合言葉を求められた・合わなかった / When 決める / Then 玄関へ戻す", () => {
    expect(planForJoinError("PASSPHRASE_REQUIRED", "x", DEFAULT_TEXT)).toEqual({ kind: "to-hub" });
    expect(planForJoinError("PASSPHRASE_MISMATCH", "x", DEFAULT_TEXT)).toEqual({ kind: "to-hub" });
  });

  it("Given 混雑で拒まれた / When 決める / Then 待って入り直す", () => {
    expect(planForJoinError("JOIN_RATE_LIMITED", "x", DEFAULT_TEXT)).toEqual({ kind: "retry" });
  });

  it("Given それ以外 / When 決める / Then サーバーの文をその場で伝える", () => {
    expect(planForJoinError("GENERATION_COOLDOWN", "しばらく待って", DEFAULT_TEXT)).toEqual({
      kind: "show",
      message: "しばらく待って",
    });
  });

  it("Given 文が空白だけ / When 決める / Then 受け取った既定の文で伝える", () => {
    expect(planForJoinError("INTERNAL_ERROR", "  ", DEFAULT_TEXT)).toEqual({ kind: "show", message: DEFAULT_TEXT });
  });
});
