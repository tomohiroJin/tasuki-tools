/**
 * 失敗の説明を、実際に行った操作と一致させる（Issue #29・H1）。
 *
 * 同一のコードが複数の操作から返っていたために、説明がどちらか一方の操作に
 * 寄っていた（またはどちらにも当てはまらないほど曖昧だった）5 種類を、
 * 操作ごとに区別できる新コードへ分ける。ここではその新コードのうち
 * #95 S3（役割とホストの廃止）を生き延びた 3 件に文言が定義されていること、
 * その文言が「実行した操作」を正しく指し「別の操作」を指さないことを検証する。
 * 残り 5 件（HOST_TRANSFER_OFFLINE / CANNOT_CHANGE_HOST_ROLE / ALREADY_HOST /
 * LAST_MANAGER_LEAVE / LAST_MANAGER_DEMOTE）は S3 で発行元ごと消えたため、
 * 文言も語彙も残っていない。
 *
 * 文言の性質（何を含み、何を含まないか）を検証するのは、`sendError` の
 * 引数を別の文字列リテラルへ差し替えるだけの「型が変わらない意味変更」を
 * 検出する唯一の手段だからである（#28 で `NOT_IN_ROOM` の表示が変わる退行を
 * 型検査もテストも素通しさせた反省）。
 *
 * @requirements FR-131, FR-132, FR-134, FR-136, FR-137, SC-045, SC-047
 */

import { describe, it, expect } from "vitest";
import { displayMessageFor, DEFAULT_ERROR_MESSAGE } from "../src/error-messages.js";

const NEW_CODES = [
  "DRIVER_ASSIGN_OFFLINE",
  "NOT_IN_ROTATION",
  "JOIN_RATE_LIMITED",
] as const;

/**
 * @requirements FR-131, US3-1
 */
describe("S3 を生き延びた新コードの文言が定義されている", () => {
  it.each(NEW_CODES)("%s の文言は既定文言ではない", (code) => {
    const shown = displayMessageFor(code);
    expect(shown).not.toBe(DEFAULT_ERROR_MESSAGE);
  });
});

/**
 * @requirements FR-132, US1-1
 */
describe("DRIVER_ASSIGN_OFFLINE の文言（指名の失敗を移譲と取り違えない）", () => {
  it("「移譲」を含まない", () => {
    const shown = displayMessageFor("DRIVER_ASSIGN_OFFLINE");
    expect(shown).not.toContain("移譲");
  });

  it("「指名」を含む", () => {
    const shown = displayMessageFor("DRIVER_ASSIGN_OFFLINE");
    expect(shown).toContain("指名");
  });
});

/**
 * @requirements FR-134, US2-1
 */
describe("NOT_IN_ROTATION の文言（解消の手がかりを示す）", () => {
  it("「見つかりません」を含まない", () => {
    const shown = displayMessageFor("NOT_IN_ROTATION");
    expect(shown).not.toContain("見つかりません");
  });

  // driver.assign の NOT_IN_ROTATION 判定は対象が session.rotation に居るかだけを見ており、
  // 対象の役割（viewer/editor/host）は見ていない。role=editor のまま member.remove で
  // 輪の外に出た参加者にも同じコードが返るため、「見学者」固定の文言は実態と一致しない
  // （役割と輪の所属は独立した2層モデル。SelfDriverToggle.tsx 参照）。
  it("「見学者」を含まない", () => {
    const shown = displayMessageFor("NOT_IN_ROTATION");
    expect(shown).not.toContain("見学者");
  });

  // 否定だけでは文言が空になっても通ってしまうため、何を示すべきかも固定する。
  it("輪に加わっていないことを示す", () => {
    const shown = displayMessageFor("NOT_IN_ROTATION");
    expect(shown).toContain("輪");
  });

  it("指名の失敗であることを示す", () => {
    const shown = displayMessageFor("NOT_IN_ROTATION");
    expect(shown).toContain("指名");
  });
});

/**
 * @requirements FR-136, US2-4
 */
describe("JOIN_RATE_LIMITED の文言（参加の試行過多だと分かる）", () => {
  it("「参加」を含む", () => {
    const shown = displayMessageFor("JOIN_RATE_LIMITED");
    expect(shown).toContain("参加");
  });
});

/**
 * 配備前から開かれた画面が旧サーバーの応答（旧コード）を受け取ったときのため、
 * 語彙（`SYNC_ERROR_CODES`）から外した後も文言だけは引けなければならない（FR-137・SC-047）。
 *
 * @requirements FR-137, SC-047, US4-1
 */
describe("旧 3 コードの文言は残置されている（後方互換）", () => {
  it.each(["PARTICIPANT_OFFLINE", "CANNOT_CHANGE_HOST", "LAST_MANAGER"] as const)(
    "%s の文言は既定文言ではない",
    (code) => {
      // Given: code の各値を渡す呼び出し自体が前提の指定を兼ねる
      // When
      const shown = displayMessageFor(code);
      // Then
      expect(shown).not.toBe(DEFAULT_ERROR_MESSAGE);
    },
  );
});
