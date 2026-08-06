/**
 * 主催者以外に見せる「開始待ち」の案内（#76 J-3）。
 *
 * 主催者がタブを閉じても、ホストの自動移譲は在席検出（heartbeat 15 秒 × 2）を待つため
 * 約 30〜40 秒かかる。その間、残った人には開始ボタンが出ず、画面には
 * 「主催者のセッション開始を待っています...」とだけ表示され続けた。
 * **待っている相手がもう居ないことが分からない**ので、壊れたように見える。
 */
import { describe, it, expect } from "vitest";
import { startWaitMessage } from "../../src/ui/start-wait-message";

describe("startWaitMessage", () => {
  it("主催者が居るときは、主催者の開始を待っていると伝える", () => {
    // Given: 主催者が接続している
    // When: 案内を決める
    // Then: 従来どおり
    expect(startWaitMessage("online")).toBe("主催者のセッション開始を待っています...");
  });

  it("主催者が離席中でも待ちの案内は変えない", () => {
    // Given: 主催者は居るが操作していない
    // When: 案内を決める
    // Then: 戻ってくる相手なので驚かせない
    expect(startWaitMessage("idle")).toBe("主催者のセッション開始を待っています...");
  });

  it("主催者が居ないときは、居ないことと引き継がれることを伝える", () => {
    // Given: 主催者がタブを閉じた
    // When: 案内を決める
    const message = startWaitMessage("offline");

    // Then: 待っても来ない相手を待たせない。まもなく引き継がれると分かれば待てる
    expect(message).not.toBe("主催者のセッション開始を待っています...");
    expect(message).toContain("主催者");
    expect(message).toMatch(/引き継/);
  });

  it("主催者が特定できないときも、居ないときと同じ扱いにする", () => {
    // Given: 主催者が参加者一覧から見つからない（退出直後など）
    // When: 案内を決める
    // Then: 「待っています」と言い続けるより、引き継ぎを案内するほうが実態に近い
    expect(startWaitMessage(null)).toBe(startWaitMessage("offline"));
  });
});
