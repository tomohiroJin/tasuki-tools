/**
 * エラーコードの網羅テスト（メタテスト）。
 *
 * **サーバーがクライアントへ送る全てのエラーコードについて、
 * 「利用者に何が見えるか」が決まっていることを保証する。**
 *
 * ⚠ **このファイルは退行を受けて新設された。**
 * T066 でサーバー側の文言リテラルを 1 箇所へ集約した際、サーバー専用のコードを
 * 画面表示用の表へ追記してしまい、その画面表示が既定文言から変わる退行を作った。
 * そのとき型検査もテストも通ってしまったのは、
 * **「サーバーのコード語彙」と「クライアントの表示規則」を突き合わせる検査が
 * どこにも無かった**ためである。
 *
 * ここで突き合わせておけば、サーバーに新しいエラーコードを足したときに
 * 「このコードのとき利用者に何を見せるのか」を決めないまま素通しすることがなくなる。
 *
 * 本テストは `apps/web/test/ui/dev-artifacts.test.ts` と同じくソースを走査する
 * メタテストであり、前提・操作・検証という区切りが通常の意味では当てはまらない。
 *
 * @requirements FR-105, FR-107, FR-114
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ERROR_MESSAGES, DEFAULT_ERROR_MESSAGE, displayMessageFor } from "@tdd-mob/core";

const SRC_DIR = join(import.meta.dirname, "../src");

/**
 * サーバー専用として**意図的に**画面へ出さないコード。
 * 画面には既定文言（「操作を完了できませんでした。」）が出る。
 *
 * **ここに足すのは「利用者に詳細を見せない」という判断である。**
 * 迷ったら `packages/core/src/error-messages.ts` の `ERROR_MESSAGES` 側に足して
 * 文言を決めること。
 */
const INTENTIONALLY_NOT_SHOWN = new Set([
  "NOT_IN_ROOM",
  "DELEGATION_UNAVAILABLE",
  // ↓ 本テストの新設時に「表示が決まっていない」ものとして検出された 13 件。
  //   **いずれも現状は既定文言が表示されている。**ここに列挙するのは
  //   「今そうなっている」という現状の固定であって、「そのままでよい」という是認ではない。
  //   利用者向けに具体的な文言を与えるのは**挙動の変更**であり、
  //   本仕様（Issue #28・挙動不変）ではなく Issue #29 が扱う。
  //   https://github.com/tomohiroJin/tasuki-tools/issues/29
  "INTERNAL_ERROR",
  "INVALID",
  "INVALID_COMMAND",
  "INVALID_JSON",
  "MESSAGE_TOO_LARGE",
  "REMOVED_FROM_ROOM",
  "ROOM_LIMIT_EXCEEDED",
  "ROOM_NOT_FOUND",
  "STALE_SUBMISSION",
  "UNKNOWN_COMMAND",
]);

function readAllTsFiles(dir: string): string[] {
  const contents: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      contents.push(...readAllTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      contents.push(readFileSync(fullPath, "utf-8"));
    }
  }
  return contents;
}

/** `apps/sync/src` が `type: "error"` で送るエラーコードを集める。 */
function collectServerErrorCodes(): Set<string> {
  const codes = new Set<string>();
  for (const source of readAllTsFiles(SRC_DIR)) {
    for (const m of source.matchAll(/\bcode:\s*"([A-Z][A-Z0-9_]*)"/g)) codes.add(m[1]!);
    for (const m of source.matchAll(/\berr\(\s*"([A-Z][A-Z0-9_]*)"/g)) codes.add(m[1]!);
  }
  return codes;
}

describe("サーバーが送るエラーコード", () => {
  it("すべてのコードについて、画面に出す文言が決まっている", () => {
    const codes = [...collectServerErrorCodes()].sort();
    // 走査が 1 件も拾えないなら、正規表現が実装とズレている（検査が空振りしている）
    expect(codes.length).toBeGreaterThan(0);

    const undecided = codes.filter(
      (code) => ERROR_MESSAGES[code] === undefined && !INTENTIONALLY_NOT_SHOWN.has(code),
    );
    expect(undecided).toEqual([]);
  });

  it("意図的に画面へ出さないコードは、既定文言が表示される", () => {
    for (const code of INTENTIONALLY_NOT_SHOWN) {
      expect(displayMessageFor(code)).toBe(DEFAULT_ERROR_MESSAGE);
    }
  });
});
