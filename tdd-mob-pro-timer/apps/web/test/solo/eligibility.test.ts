/**
 * ソロモードのドライバー対象外インデックス算出のテスト
 * 項目2: 共有時と同じ「driverEligible=false → 交代対象外」を soloRosterRef 差分から導く。
 */

import { describe, it, expect } from "vitest";
import { computeSoloIneligibleIndices } from "../../src/solo/eligibility.js";

const HOST_ID = "solo";

describe("computeSoloIneligibleIndices", () => {
  it("離脱が無ければ空集合を返す", () => {
    const set = computeSoloIneligibleIndices(["Alice", "Bob"], {
      hostId: HOST_ID,
      hostName: "Alice",
      skips: new Set(),
      proxyNames: {},
    });
    expect(set.size).toBe(0);
  });

  it("ホストを skip するとホスト名の rotation インデックスが対象外になる", () => {
    const set = computeSoloIneligibleIndices(["Alice", "Bob"], {
      hostId: HOST_ID,
      hostName: "Alice",
      skips: new Set([HOST_ID]),
      proxyNames: {},
    });
    expect(set.has(0)).toBe(true);
    expect(set.has(1)).toBe(false);
  });

  it("改名後のホスト名でも rotation と突き合わせて対象外にできる", () => {
    // ホストを "Renamed" に改名済み。rotation も改名後の名前で構成される前提。
    const set = computeSoloIneligibleIndices(["Renamed", "Bob"], {
      hostId: HOST_ID,
      hostName: "Renamed",
      skips: new Set([HOST_ID]),
      proxyNames: {},
    });
    expect(set.has(0)).toBe(true);
  });

  it("skip された代理参加者の名前も rotation にあれば対象外になる", () => {
    const set = computeSoloIneligibleIndices(["Alice", "Carol"], {
      hostId: HOST_ID,
      hostName: "Alice",
      skips: new Set(["px-1"]),
      proxyNames: { "px-1": "Carol" },
    });
    expect(set.has(1)).toBe(true);
    expect(set.has(0)).toBe(false);
  });
});
