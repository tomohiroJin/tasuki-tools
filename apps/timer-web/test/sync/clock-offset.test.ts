/**
 * clockOffset 推定のテスト
 */

import { describe, it, expect } from "vitest";
import { estimateClockOffset } from "../../src/sync/clock-offset.js";

/**
 * @requirements T041, FR-007, SC-001
 */
describe("estimateClockOffset", () => {
  it("単一の ping から offset を推定する", () => {
    // Given
    const samples = [
      { clientSend: 1000, serverTime: 1010, clientReceive: 1020 },
    ];
    // When
    const offset = estimateClockOffset(samples);
    // Then（round-trip = 20ms, latency = 10ms, offset = serverTime - (clientSend + latency) = 1010 - 1010 = 0）
    expect(offset).toBe(0);
  });

  it("複数サンプルの中央値を使う", () => {
    // Given（いずれも offset = 0）
    const samples = [
      { clientSend: 1000, serverTime: 1010, clientReceive: 1020 },
      { clientSend: 2000, serverTime: 2015, clientReceive: 2030 },
      { clientSend: 3000, serverTime: 3100, clientReceive: 3200 },
    ];
    // When
    const offset = estimateClockOffset(samples);
    // Then
    expect(offset).toBe(0);
  });

  it("サーバーが進んでいる場合は正のオフセット", () => {
    // Given（サーバーは 50ms 進んでいる）
    const samples = [
      { clientSend: 1000, serverTime: 1060, clientReceive: 1020 },
    ];
    // When
    const offset = estimateClockOffset(samples);
    // Then（round-trip = 20ms, latency = 10ms, offset = 1060 - (1000 + 10) = 50）
    expect(offset).toBe(50);
  });

  it("サンプルが空の場合は 0 を返す", () => {
    expect(estimateClockOffset([])).toBe(0);
  });
});
