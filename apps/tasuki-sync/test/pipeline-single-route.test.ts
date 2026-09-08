/**
 * パイプライン単一経路の回帰テスト（フェーズ7・FR-155・SC-053）。
 *
 * 目的: 在室を前提とするコマンドが、旧専用ハンドラ由来の4コマンド
 * （`room.passphrase.set`/`ai.unlock`/`problem.request`/`problem.submit`）も含め、
 * すべて `handleCommand` の `default`（共通パイプライン）へ合流することを機械的に固定する。
 * 個別 `case` を復活させると、在室確認とアクター解決を迂回する経路が生まれる。
 *
 * ⚠ **#95 S3 で目的の半分が消えた。** 元はここで「`permissions.ts` の集合表を
 * 書き換えれば、その変更が個別ハンドラの重複実装によって迂回されずに全コマンドへ届く」
 * ことを、`checkPermission` の呼び出し箇所が 1 箇所であることによって保証していた。
 * S3 で可否判定そのものを撤去したため、その保証対象は無くなっている。
 * 代わりに置いたのが下の「権限判定の記号がどこにも残っていない」検査で、
 * **個別ハンドラに可否判定が復活していないこと**を同じ字句的手段で見る。
 *
 * 検証方法: `handlers.ts`/`command-handlers/*.ts` のソースを字句的に検査する。
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationDir = path.join(here, "..", "src", "application");

const handlersSource = readFileSync(path.join(applicationDir, "handlers.ts"), "utf8");

/** `src/application` 配下の全 `.ts` を「相対パス＋中身」で返す。 */
function readApplicationSources(): Array<{ file: string; source: string }> {
  const collected: Array<{ file: string; source: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) {
        collected.push({ file: path.relative(applicationDir, full), source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(applicationDir);
  return collected;
}

/**
 * 旧専用ハンドラを持っていたコマンド（Issue #26 前提節参照）。
 * 元は6件だったが、`role.set` と `host.transfer` は #95 S3 でコマンドごと廃止された。
 */
const FORMERLY_DEDICATED_COMMANDS = [
  "room.passphrase.set",
  "ai.unlock",
  "problem.request",
  "problem.submit",
] as const;

/** 在室を前提としないコマンド（`handleCommand` の switch に個別 case を持ってよい唯一の例外）。 */
const PRE_ROOM_CASE_LABELS = ["room.create", "room.join", "time.ping"];

describe("パイプライン単一経路（FR-155）", () => {
  it("handleCommand の switch は在室前コマンド3件のみを個別 case に持つ", () => {
    // Given: handleCommand 関数本体を切り出す
    const start = handlersSource.indexOf("async function handleCommand(");
    const switchStart = handlersSource.indexOf("switch (cmd.command) {", start);
    const switchEnd = handlersSource.indexOf("\n  }\n", switchStart);
    const switchBody = handlersSource.slice(switchStart, switchEnd);

    // When: case ラベルを列挙する
    const caseLabels = [...switchBody.matchAll(/case\s+"([^"]+)":/g)].map((m) => m[1]);

    // Then: 在室前コマンド3件だけが個別 case を持つ
    expect(caseLabels.sort()).toEqual([...PRE_ROOM_CASE_LABELS].sort());
  });

  it.each([...FORMERLY_DEDICATED_COMMANDS])(
    "%s は handleCommand の switch に個別 case を持たない（default 経由で共通パイプラインへ合流する）",
    (command) => {
      // Given（handlersSource はモジュール冒頭で読み込んだソースファイルの内容を直接使う）
      // When: handleCommand の switch 本体を取り出す
      const start = handlersSource.indexOf("async function handleCommand(");
      const switchStart = handlersSource.indexOf("switch (cmd.command) {", start);
      const switchEnd = handlersSource.indexOf("\n  }\n", switchStart);
      const switchBody = handlersSource.slice(switchStart, switchEnd);

      // Then
      expect(switchBody).not.toContain(`case "${command}":`);
    },
  );

  it("可否判定の記号は src/application のどこにも残っていない", () => {
    // Given: application 配下の全 .ts を走査対象にする（対照: 1 件も読めなければ検査が空振り）
    const sources = readApplicationSources();
    expect(sources.length).toBeGreaterThan(0);

    // When: 撤去した可否判定の記号が実際の呼び出しとして現れるファイルを探す
    const offenders = sources
      .filter(({ source }) =>
        /checkPermission\(/.test(source) ||
        /rejectIfUnauthorized\(/.test(source) ||
        /requireEditor\(/.test(source) ||
        /isAllowed\(/.test(source),
      )
      .map(({ file }) => file);

    // Then: 個別ハンドラであれ共通パイプラインであれ、可否判定は 1 箇所も無い
    expect(offenders).toEqual([]);
  });

  it.each([...FORMERLY_DEDICATED_COMMANDS])(
    "%s の専用ハンドラは自ら可否判定を行わない（在室確認とアクター解決は共通パイプラインの責務）",
    (command) => {
      // Given: コマンド名からファイル名を導出する（kebab-case）
      const fileName = `${command.replace(/\./g, "-")}.ts`;
      const source = readFileSync(path.join(applicationDir, "command-handlers", fileName), "utf8");

      // When/Then: 実際の呼び出し（開き括弧付き）が存在しないことを確認する。
      // docstring 中の言及（バッククォート・括弧なし）は許容する。
      expect(source).not.toMatch(/checkPermission\(/);
      expect(source).not.toMatch(/rejectIfUnauthorized\(/);
      expect(source).not.toMatch(/requireEditor\(/);
    },
  );
});
