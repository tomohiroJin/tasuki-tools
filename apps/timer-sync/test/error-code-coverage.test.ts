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
 * ⚠ **さらに、その突き合わせを何を起点に行うかにも穴があった（PR #34 レビュー）。**
 * 最初の実装は対象を `collectServerErrorCodes()`（正規表現走査） ∪
 * `EMITTED_VIA_VARIABLE`（手で保守する集合）から集めていたため、新しいコードが
 * **変数経由で**送られ始めても `EMITTED_VIA_VARIABLE` への追記を忘れれば
 * どちらの経路にも載らず素通りした。`packages/timer-core/src/errors.ts` の
 * `SYNC_ERROR_CODES` は既にソースと双方向に照合されている権威列挙であるため、
 * これを起点に文言決定を検査すれば、手で保守する集合を経由せずに
 * 追記漏れを構造的に検出できる（詳細は「エラーコードの列挙」describe を参照）。
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
} from "@tasuki/timer-core";

const SRC_DIR = join(import.meta.dirname, "../src");

/**
 * サーバー専用として**意図的に**画面へ出さないコード。
 * 画面には既定文言（「操作を完了できませんでした。」）が出る。
 *
 * **ここに足すのは「利用者に詳細を見せない」という判断である。**
 * 迷ったら `packages/timer-core/src/error-messages.ts` の `ERROR_MESSAGES` 側に足して
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
 * ⚠ **もはや「文言が決まっているか」の検査の要ではない。** 以前はこの集合を
 * `collectServerErrorCodes()` の走査結果に合流させることで「文言が決まっているか」の
 * 検査対象へ加えていたが、この方式には穴があった: 新しいコードが変数経由で
 * 送られ始めても、走査には掛からず、かつこの集合への追記も忘れれば、
 * どちらの経路にも載らないまま「文言が決まっているか」の検査を素通りしてしまう
 * （＝この集合自体が手動保守であるため、対象漏れを検出できない）。
 * 下の「エラーコードの列挙」describe に追加した
 * 「SYNC_ERROR_CODES の全コードについて、画面に出す文言が決まっている」が、
 * 既に双方向照合済みの列挙 `SYNC_ERROR_CODES` を起点にすることでこの穴を構造的に塞いだため、
 * 文言決定の網羅性はもうこの集合に依存しない。
 *
 * **それでもこの集合を残すのは、別の2つの価値があるからである**:
 * 1. 「変数経由だと正規表現走査から漏れる」という盲点そのものの文書化
 *    （なぜ `collectServerErrorCodes()` だけでは不十分かの記録）。
 * 2. 下の「変数経由コードの整合性」で、(1) 送出をやめてリテラルがソースから消えていないか、
 *    (2) 将来リテラル形式に戻って走査が拾えるようになっていないか、を検出する対象になる。
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
 * `SyncErrorCode`（`packages/timer-core/src/errors.ts`）の列挙と、実際のソースの突き合わせ。
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

  /**
   * **文言の決定を、正規表現走査ではなく列挙 `SYNC_ERROR_CODES` を起点に検査する。**
   *
   * 上の「サーバーが送るエラーコード」describe の1つ目のテストは、対象を
   * `collectServerErrorCodes()`（正規表現走査） ∪ `EMITTED_VIA_VARIABLE`
   * （手で保守する集合）から集めている。このため、新しいエラーコードが
   * **変数経由で**送られ始めたのに `EMITTED_VIA_VARIABLE` への追記を忘れた場合、
   * 正規表現走査にも手動集合にも載らず、「利用者に何を見せるか」が
   * 決まっていなくてもそのテストは素通りしてしまう（=検出力の穴）。
   *
   * `SYNC_ERROR_CODES` はこの穴を塞ぐ起点になり得る。この列挙は既に
   * 上の「エラーコードの列挙」describe で双方向にソースと照合されている
   * （ソースにあるのに列挙に無い／列挙にあるのにソースに無い、の両方を検出）。
   * しかも (b) 側の照合（`sources.includes('"CODE"')`）は文字列リテラルの
   * **部分文字列**検索であるため、`code: "..."` や `err("...")` という
   * 特定の書き方に依存せず、変数経由の呼び出し（例:
   * `errorMessageFor("CODE")`）であってもリテラルさえソース中にあれば拾える。
   *
   * つまり「手で保守する集合に追記する」という運搬が不要になり、
   * 列挙に追記しさえすれば（追記漏れは上の describe が検出する）
   * 自動的にここでも検査対象になる。**構造的に**追記漏れを検出できるため、
   * 「対象集合を手で足す」という運用上のミスに検出力を依存させずに済む。
   *
   * ⚠ **この検査の限界**: `decide()` が返す `DomainError["type"]`
   * （`EmptyName` / `DuplicateName` 等）は `SYNC_ERROR_CODES` に含まれない
   * （値としての列挙が無いため）。ここではその範囲を検査対象にしない。
   *
   * @requirements FR-105, FR-107, FR-114
   */
  it("SYNC_ERROR_CODES の全コードについて、画面に出す文言が決まっている", () => {
    // Given（列挙 SYNC_ERROR_CODES を対象にする。手で保守する集合には頼らない）
    // When（各コードについて ERROR_MESSAGES に文言があるか、意図的に既定文言のままかを調べる）
    const undecided = SYNC_ERROR_CODES.filter(
      (code) => ERROR_MESSAGES[code] === undefined && !INTENTIONALLY_NOT_SHOWN.has(code),
    );
    // Then（新しいコードが変数経由で追加されても、追記漏れがあればここで検出される）
    expect(undecided).toEqual([]);
  });
});
