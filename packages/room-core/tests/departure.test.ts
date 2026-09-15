/**
 * 退出の理由を玄関へ運ぶ言葉（#95 S5c・I-1）。
 *
 * **綴りが 1 つであること**がこの語彙の存在理由である。URL に載せて読み戻す往復そのものは
 * 送る側（`apps/timer-web/test/ui/entry.test.ts` の `hubRoomPath`）と読む側
 * （`apps/landing/tests/hub/departure.test.ts` の `readDepartureNotice`）が、
 * **どちらもここの定数を取り込んだうえで**確かめる。ここが見るのは理由と文言の対応である。
 * 文言は `@tasuki/timer-core` の `error-messages.ts` と一字一句同じにしてあるが、
 * そちらへは依存しない（`docs/adr/0017`）。
 */
import { describe, it, expect } from "vitest";
import { departureNoticeFor, parseDepartureReason } from "../src/departure.js";

describe("parseDepartureReason", () => {
  it("知っている値はそのまま理由になる", () => {
    // Given: ツールが載せうる 2 つの値
    // When / Then（問い合わせがそのまま検証になる）
    expect(parseDepartureReason("self")).toBe("self");
    expect(parseDepartureReason("removed")).toBe("removed");
  });

  it("知らない値と不在は null（告知を出さない）", () => {
    // Given: 綴りが割れた値・空・不在
    // When / Then
    expect(parseDepartureReason("kicked")).toBeNull();
    expect(parseDepartureReason("")).toBeNull();
    expect(parseDepartureReason(null)).toBeNull();
  });
});

describe("departureNoticeFor", () => {
  it("自分で抜けたときと外されたときで文が分かれる", () => {
    // Given: 2 つの理由
    // When
    const self = departureNoticeFor("self");
    const removed = departureNoticeFor("removed");

    // Then: 外された人には**再参加の手立て**まで伝える
    expect(self).toBe("ルームから抜けました。");
    expect(removed).toBe("ルームから退出しました。再参加するには名前を入力してください。");
    expect(self).not.toBe(removed);
  });
});
