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
import {
  ERROR_MESSAGES,
  DEFAULT_ERROR_MESSAGE,
  displayMessageFor,
  SYNC_ERROR_CODES,
} from "@tdd-mob/core";

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
  // ↓ 以下 9 件。**いずれも現状は既定文言が表示されている。**ここに列挙するのは
  //   「今そうなっている」という現状の固定であって、「そのままでよい」という是認ではない。
  //   利用者向けに具体的な文言を与えるのは**挙動の変更**であり、
  //   本仕様（Issue #28・挙動不変）ではなく Issue #29 が扱う。
  //   https://github.com/tomohiroJin/tasuki-tools/issues/29
  "INTERNAL_ERROR",
  "INVALID",
  "INVALID_COMMAND",
  "INVALID_JSON",
  "MESSAGE_TOO_LARGE",
  "ROOM_LIMIT_EXCEEDED",
  "ROOM_NOT_FOUND",
  "STALE_SUBMISSION",
  "UNKNOWN_COMMAND",
]);

/**
 * **変数経由で送られるため、正規表現の走査（`collectServerErrorCodes()`）には
 * 載らないが、実際にサーバーからクライアントへ送られているコード。**
 *
 * 走査は `code: "..."` / `err("...")` という静的なリテラルの形だけを拾う。
 * `handlers.ts` では次の理由でリテラルが現れず、走査から漏れる:
 *
 * - `PASSPHRASE_REQUIRED` / `PASSPHRASE_MISMATCH`: 変数 `code` へ代入してから
 *   `sendError(connId, code, ...)` として送るため（`code === "PASSPHRASE_REQUIRED"` という
 *   比較の形でしか現れない）。
 * - `LEFT_ROOM` / `REMOVED_FROM_ROOM`: `removalNotificationFor()` が返す変数
 *   `removalCode` を経由して `sendError(target.connId, removalCode, ...)` として送るため
 *   （`messageForRemoval()` 内の `code === "REMOVED_FROM_ROOM"` という比較と
 *   `errorMessageFor("LEFT_ROOM")` という引数の形でしか現れない）。
 *
 * **この集合は手で保守するため実態と乖離しうる。** 乖離を検出するため、下の
 * 「変数経由コードの整合性」で (1) 各コードがソースに文字列リテラルとして実在すること
 * （送出をやめてリテラルが消えたら検出される）、(2) 各コードが `collectServerErrorCodes()`
 * には含まれないこと（将来リテラル形式に戻って走査が拾えるようになったら、この集合から
 * 外すべきだと分かる）を両方検証する。
 *
 * **迷ったら、走査に掛かる静的なリテラル形式（`code: "..."` / `err("...")`）で書けないか
 * 先に検討すること。** 変数経由はこの手動集合というコストを伴うため、リテラルで書ける
 * ならそちらの方が良い。
 */
const EMITTED_VIA_VARIABLE = new Set(["PASSPHRASE_REQUIRED", "PASSPHRASE_MISMATCH", "LEFT_ROOM", "REMOVED_FROM_ROOM"]);

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
    // Given（apps/sync/src 配下の全ソースを走査対象にし、正規表現走査には載らない
    //   変数経由送出コード EMITTED_VIA_VARIABLE を合流させる）
    // When（コードの出現パターンを走査して収集する）
    const codes = [...collectServerErrorCodes(), ...EMITTED_VIA_VARIABLE].sort();
    // 走査が 1 件も拾えないなら、正規表現が実装とズレている（検査が空振りしている）
    expect(codes.length).toBeGreaterThan(0);

    const undecided = codes.filter(
      (code) => ERROR_MESSAGES[code] === undefined && !INTENTIONALLY_NOT_SHOWN.has(code),
    );
    expect(undecided).toEqual([]);
  });

  it("意図的に画面へ出さないコードは、既定文言が表示される", () => {
    // Given（意図的に画面へ出さないコードの集合 INTENTIONALLY_NOT_SHOWN を対象にする）
    // When（各コードについて表示文言を求める）
    for (const code of INTENTIONALLY_NOT_SHOWN) {
      expect(displayMessageFor(code)).toBe(DEFAULT_ERROR_MESSAGE);
    }
  });
});

/**
 * `EMITTED_VIA_VARIABLE`（手で保守する集合）と実装の乖離を検出する。
 *
 * @requirements FR-105, FR-107, FR-114
 */
describe("変数経由コードの整合性", () => {
  it("EMITTED_VIA_VARIABLE の各コードは、ソースに文字列リテラルとして実在する", () => {
    // Given（apps/sync/src 配下の全ソースを走査対象にする）
    const sources = readAllTsFiles(SRC_DIR).join("\n");
    // When（EMITTED_VIA_VARIABLE の各コードがソース中にリテラルとして実在するか調べる）
    const absent = [...EMITTED_VIA_VARIABLE].filter((code) => !sources.includes(`"${code}"`)).sort();
    // Then（送出をやめてリテラルが消えたら、ここで検出される）
    expect(absent).toEqual([]);
  });

  it("EMITTED_VIA_VARIABLE の各コードは、正規表現の走査結果には含まれない", () => {
    // Given（正規表現による走査結果を用意する）
    const scanned = collectServerErrorCodes();
    // When（EMITTED_VIA_VARIABLE の各コードが走査結果に含まれるか調べる）
    const nowScannable = [...EMITTED_VIA_VARIABLE].filter((code) => scanned.has(code)).sort();
    // Then（将来リテラル形式に戻って走査が拾えるようになったら、この集合から外すべきだと分かる）
    expect(nowScannable).toEqual([]);
  });
});

/**
 * `SyncErrorCode`（`packages/core/src/errors.ts`）の列挙と、実際のソースの突き合わせ。
 *
 * 型だけでは実行時に照合できないため、列挙は値（`SYNC_ERROR_CODES`）としても持たせてある。
 * 双方向に検査することで「ソースに足したのに列挙し忘れた」「列挙に残っているのに
 * ソースから消えた」の両方を検出する。
 *
 * @requirements FR-101, FR-114
 */
describe("エラーコードの列挙", () => {
  it("ソースから見つかるコードは、すべて列挙に含まれている", () => {
    // Given（列挙側 SYNC_ERROR_CODES を集合として用意する）
    const enumerated = new Set<string>(SYNC_ERROR_CODES);
    // When（ソースを走査して、列挙に無いコードを探す）
    const missing = [...collectServerErrorCodes()].filter((code) => !enumerated.has(code)).sort();
    expect(missing).toEqual([]);
  });

  it("列挙されたコードは、すべてソースに実在する", () => {
    // Given（apps/sync/src 配下の全ソースを走査対象にする）
    const sources = readAllTsFiles(SRC_DIR).join("\n");
    // When（列挙側 SYNC_ERROR_CODES の各コードがソース中に実在するか調べる）
    const absent = SYNC_ERROR_CODES.filter((code) => !sources.includes(`"${code}"`));
    expect(absent).toEqual([]);
  });
});
