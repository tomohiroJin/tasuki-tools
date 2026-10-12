/**
 * 接続状態を告知の種類に翻訳する規則（#76 F-2・#212）。poker-web・お題ツール・ルーレットが
 * 写しで持っていた規則と閾値をここへ寄せた（#94 PR 2 のレビュー）。文言は各アプリが持つ。
 *
 * @requirements #76 #212
 */
import { describe, expect, it } from "vitest";
import { connectionNoticeKind } from "../src/connection-notice.js";

const base = { status: "closed", everConnected: true, failedAttempts: 0, syncStale: false } as const;

describe("接続の告知の種類", () => {
  it("Given 繋ぎに行っている最初の一瞬 / When 決める / Then 何も出さない（正常時にちらつかせない）", () => {
    expect(connectionNoticeKind({ ...base, status: "connecting", everConnected: false })).toBe("none");
  });

  it("Given 一度も繋がらないまま 1 回失敗した / When 決める / Then 繋がらない（待っても直らない）", () => {
    expect(connectionNoticeKind({ ...base, everConnected: false, failedAttempts: 1 })).toBe("unreachable");
  });

  it("Given 使えていた接続が切れた / When 失敗が 2 回までと 3 回目 / Then 再接続中から繋がらないへ切り替える", () => {
    // 閾値の境で見る（2 回目までは自動復帰に賭け、3 回目で諦めて言い方を変える）
    expect(connectionNoticeKind({ ...base, failedAttempts: 1 })).toBe("reconnecting");
    expect(connectionNoticeKind({ ...base, failedAttempts: 2 })).toBe("reconnecting");
    expect(connectionNoticeKind({ ...base, failedAttempts: 3 })).toBe("unreachable");
  });

  it("Given 繋がっている / When 同期が古いか / Then 古いときだけ同期できていない", () => {
    expect(connectionNoticeKind({ ...base, status: "open", failedAttempts: 3 })).toBe("none");
    expect(connectionNoticeKind({ ...base, status: "open", syncStale: true })).toBe("stale");
  });

  it("Given 切れていて同期も古い / When 決める / Then 切断の方を先に伝える", () => {
    expect(connectionNoticeKind({ ...base, failedAttempts: 1, syncStale: true })).toBe("reconnecting");
  });
});
