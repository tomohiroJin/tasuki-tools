/**
 * 入場の門（#368 Task 4）。`?tool=` の判定と、接続を受け入れるかの判定を純粋な関数として固定する。
 *
 * 守りの要（`docs/adr/0011`）なので、**拒否ごとの close コード・理由の文・ログの理由と、判定の順番**を
 * 表で固定する。拒否はどれも 1008 なので、順番が入れ替わると「直結が拒否される」ことを確かめる
 * テストが、別の拒否を見ているだけの空振りになる。実 WS 越しの固定は `ws-adapter.reject-log.test.ts`・
 * `ws-adapter.integration.test.ts`・`ws-adapter.client-key.test.ts` にある。
 */
import { describe, expect, it } from "bun:test";
import {
  admit,
  protocolFromRequestUrl,
  type Admission,
  type AdmissionPolicy,
} from "../../src/adapters/ws/connection-gate.js";

/** ログの理由（`LogSafe` のブランド型）を素の文字列に直して比べる。期待値はテストに直書きする。 */
function plain(admission: Admission): unknown {
  return admission.kind === "accept"
    ? admission
    : { ...admission, logReason: admission.logReason === null ? null : String(admission.logReason) };
}

describe("protocolFromRequestUrl（?tool= の判定）", () => {
  for (const [query, expected] of [
    ["", "hub"],
    ["?tool=timer", "timer"],
    ["?tool=poker", "poker"],
    ["?tool=topic", "topic"],
    ["?tool=roulette", "roulette"],
    ["?tool=agenda", "agenda"],
    ["?tool=hub", "unknown"],
    ["?tool=Timer", "unknown"],
    ["?tool=", "unknown"],
  ] as const) {
    it(`Given /ws${query} / When 判定する / Then ${expected}`, () => {
      expect(protocolFromRequestUrl(new URL(`http://127.0.0.1/ws${query}`))).toBe(expected);
    });
  }
});

describe("admit（入場の判定）", () => {
  /** 全ての検査が効く設定。 */
  const strict: AdmissionPolicy = {
    requireClientAddress: true,
    allowedOrigins: ["https://example.com"],
    maxConnections: 2,
  };
  const good = { protocol: "timer", clientKey: "k", origin: "https://example.com" } as const;

  it("Given 全ての検査を満たす接続 / When 判定する / Then 受け入れる", () => {
    expect(admit(good, strict, 1)).toEqual({ kind: "accept" });
  });

  for (const [label, request, count, expected] of [
    [
      "知らないツール（他の全ても満たさない）",
      { protocol: "unknown", clientKey: null, origin: "https://evil.example.com" },
      2,
      { kind: "reject", code: 1008, reason: "Unknown tool", logReason: "tool" },
    ],
    [
      "鍵なし（Origin も上限も満たさない）",
      { protocol: "timer", clientKey: null, origin: "https://evil.example.com" },
      2,
      { kind: "reject", code: 1008, reason: "Client address required", logReason: "client-address" },
    ],
    [
      "Origin 不許可（上限も満たさない）",
      { protocol: "timer", clientKey: "k", origin: "https://evil.example.com" },
      2,
      { kind: "reject", code: 1008, reason: "Origin not allowed", logReason: "origin" },
    ],
    [
      "上限に達している",
      good,
      2,
      { kind: "reject", code: 1013, reason: "Server connection limit reached", logReason: null },
    ],
  ] as const) {
    it(`Given ${label} / When 判定する / Then ${expected.reason}（${expected.code}・ログの理由 ${String(expected.logReason)}）`, () => {
      expect(plain(admit(request, strict, count))).toEqual(expected);
    });
  }

  it("Given 鍵を求めない設定 / When 鍵の無い接続を判定する / Then 受け入れる", () => {
    expect(admit({ ...good, clientKey: null }, { ...strict, requireClientAddress: false }, 0)).toEqual({ kind: "accept" });
  });

  it("Given Origin の許可表が空（開発） / When どの Origin でも / Then 受け入れる", () => {
    expect(admit({ ...good, origin: "" }, { ...strict, allowedOrigins: [] }, 0)).toEqual({ kind: "accept" });
  });

  it("Given 上限の設定が無い / When 何本目でも / Then 受け入れる", () => {
    const policy: AdmissionPolicy = { requireClientAddress: true, allowedOrigins: ["https://example.com"] };
    expect(admit(good, policy, 10_000)).toEqual({ kind: "accept" });
  });
});
