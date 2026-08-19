/**
 * パイプライン単一経路の回帰テスト（フェーズ7・FR-155/FR-156・SC-053）。
 *
 * 目的: `permissions.ts` の集合表（`HOST_ONLY_BEFORE_START`/`EDITOR_PLUS_COMMANDS` 等）を
 * 変更したとき、その変更結果が旧専用ハンドラ6コマンド（`role.set`/`room.passphrase.set`/
 * `ai.unlock`/`host.transfer`/`problem.request`/`problem.submit`）を含む全ての在室前提
 * コマンドへ同一に反映されることを機械的に固定する。
 *
 * 「デッドコードの解消」ではない（旧6コマンドは元々 `checkPermission()` に到達していた。
 * `docs/plans/handlers-command-pipeline/spec.md` の「前提」節参照）。ここで固定するのは、
 * 判定の呼び出し箇所が構造的に1箇所へ集約されていること――つまり `permissions.ts` の
 * 集合表を書き換えれば、その変更が個別ハンドラの重複実装によって迂回されずに
 * 全コマンドへ届くこと――である。`packages/timer-core/test/permissions-differential.test.ts`
 * は「現在の判定が正しいか」を検証するオラクルだが、本ファイルは「その判定が
 * 単一の経路でしか呼ばれていないか」という経路側の構造を検証する。
 *
 * 検証方法: `handlers.ts`/`command-handlers/*.ts` のソースを字句的に検査する。
 * ユニットテストで「集合表を変更したら…」を動的に再現するには `permissions.ts` の
 * 内部集合を外部へ公開する必要があり、それ自体が「判定規則を1箇所に集約する」という
 * 設計（FR-071）に反する。したがって、規則を変更しても迂回できないことを、
 * 呼び出し箇所の構造（＝迂回する余地が無いこと）を機械的に検査することで保証する。
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationDir = path.join(here, "..", "src", "application");

const handlersSource = readFileSync(path.join(applicationDir, "handlers.ts"), "utf8");

/** 旧専用ハンドラを持っていた6コマンド（Issue #26 前提節参照）。 */
const FORMERLY_DEDICATED_COMMANDS = [
  "role.set",
  "room.passphrase.set",
  "ai.unlock",
  "host.transfer",
  "problem.request",
  "problem.submit",
] as const;

/** 在室を前提としないコマンド（`handleCommand` の switch に個別 case を持ってよい唯一の例外）。 */
const PRE_ROOM_CASE_LABELS = ["room.create", "room.join", "time.ping"];

describe("パイプライン単一経路（FR-155/FR-156）", () => {
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

  it.each(FORMERLY_DEDICATED_COMMANDS)(
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

  it("checkPermission の呼び出し箇所は handlers.ts 内に1箇所だけである", () => {
    // Given/When: 実際の呼び出し（オブジェクトリテラルを渡す形）だけを数える。
    // コメント中の `checkPermission()` という言及（空括弧）はここでは検出対象にしない。
    const callSites = handlersSource.match(/checkPermission\(\{/g) ?? [];

    // Then
    expect(callSites).toHaveLength(1);
  });

  it("rejectIfUnauthorized の呼び出し箇所は handlers.ts 内に1箇所だけである", () => {
    // Given/When: 関数定義（`function rejectIfUnauthorized(`）を除いた実際の呼び出しを数える。
    const callSites = handlersSource.match(/(?<!function )rejectIfUnauthorized\(connId/g) ?? [];

    // Then
    expect(callSites).toHaveLength(1);
  });

  it.each(FORMERLY_DEDICATED_COMMANDS)(
    "%s の専用ハンドラは自ら checkPermission/rejectIfUnauthorized を呼ばない（権限判定を重複させない）",
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
