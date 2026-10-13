/**
 * アダプタがアプリケーション層から取り込んでよいもの（#368 Task 2）。
 *
 * アダプタ（`src/adapters/**`）は外の世界との受け渡しを持ち、業務の判断はアプリケーション層が持つ
 * （`docs/adr/0004`）。ところが `audit-dependency-direction.mjs` はパッケージの単位で見ていて、
 * アプリの中の層（`adapters/` → `application/`）は見ていない。そこで、アダプタがアプリケーション層から
 * 取り込むものを**許可表で固定する**。表に無い取り込みを足すときは、表を直す差分がレビューに出る。
 *
 * 表に載っているのは、業務の判断ではないものだけである: ログの語彙と出口・接続層の文言の正本・
 * ツールの綴り・poker のメッセージ層の型・名簿の DTO。**表示名の正規化（業務の検証）は載せない**
 * （#368 でアダプタからアプリケーション層の受け口へ戻した）。
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { Glob } from "bun";

const SRC_DIR = join(import.meta.dir, "..", "src");
const ADAPTERS_DIR = join(SRC_DIR, "adapters");

/** アプリケーション層のうち、アダプタが取り込んでよいもの（`src/application/` からの相対・拡張子なし）。 */
const ALLOWED_FROM_ADAPTERS = [
  "connection-errors",
  "log/log-safe",
  "log/logger",
  "log/vocabulary",
  "poker-handlers",
  "roster-dto",
  // timer の受け口の型（ブランド）だけ。正規化そのものは取り込まない（型で「正規化を通した受け口しか渡せない」を守るため）
  "timer-command-receiver",
  "tool-id",
] as const;

/**
 * `file`（`src/` からの相対）の本文から、アプリケーション層の取り込み先を拾う
 * （`src/application/` からの相対・拡張子なし）。`from "…"`・副作用だけの `import "…"`・
 * 動的な `import("…")` を、二重引用符でも一重引用符でも拾う。
 */
export function applicationImportsOf(text: string, file: string): string[] {
  const fromDir = posix.dirname(file);
  return [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)]
    .map((m) => posix.normalize(posix.join(fromDir, m[1]!)))
    .filter((target) => target.startsWith("application/"))
    .map((target) => target.slice("application/".length).replace(/\.js$/, ""));
}

describe("アダプタがアプリケーション層から取り込むもの", () => {
  it("Given adapters/ と adapters/ws/ の取り込み / When 拾う / Then src/application/ からの相対で拾う（検出が空振りしないことの確かめ）", () => {
    // Given
    // 字面を分けて書く（`audit-dependency-direction.mjs` がテストの本文の取り込みの形も走査するため）。
    const fromClause = (path: string) => `from ${JSON.stringify(path)}`;
    const top = `import { a } ${fromClause("../application/log/logger.js")};\nimport type { B } ${fromClause("../ports/b.js")};`;
    const nested = `import { c } ${fromClause("../../application/tool-id.js")};`;
    // When / Then
    expect(applicationImportsOf(top, "adapters/x.ts")).toEqual(["log/logger"]);
    expect(applicationImportsOf(nested, "adapters/ws/y.ts")).toEqual(["tool-id"]);
  });

  it("Given 一重引用符・副作用だけの取り込み・動的な取り込み / When 拾う / Then どれも拾う（抜け道を作らない）", () => {
    // Given（字面を分けて書く理由は上と同じ）
    const q = (path: string, quote: string) => `${quote}${path}${quote}`;
    const text = [
      `import { a } from ${q("../application/a.js", "'")};`,
      `import ${q("../application/b.js", '"')};`,
      `const c = await import(${q("../application/c.js", '"')});`,
    ].join("\n");
    // When / Then
    expect(applicationImportsOf(text, "adapters/x.ts")).toEqual(["a", "b", "c"]);
  });

  it("Given src/adapters の全ファイル / When アプリケーション層の取り込みを拾う / Then 全て許可表に載っている", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(ADAPTERS_DIR)];
    // When
    const notAllowed = files.flatMap((f) => {
      const file = relative(SRC_DIR, join(ADAPTERS_DIR, f)).split("\\").join("/");
      return applicationImportsOf(readFileSync(join(ADAPTERS_DIR, f), "utf8"), file)
        .filter((target) => !(ALLOWED_FROM_ADAPTERS as readonly string[]).includes(target))
        .map((target) => `${file} → application/${target}`);
    });
    // Then
    expect(notAllowed).toEqual([]);
  });

  it("Given 許可表 / When 実在を確かめる / Then 全て src/application に在る（陳腐化した項目を残さない）", () => {
    for (const target of ALLOWED_FROM_ADAPTERS) {
      expect(() => readFileSync(join(SRC_DIR, "application", `${target}.ts`))).not.toThrow();
    }
  });
});
