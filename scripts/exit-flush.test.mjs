/**
 * 検査スクリプトが `process.exit` で終わらないことのテスト(#540)。
 *
 * `scan-target-wiring.test.mjs`(当時 1 回 約 3.5 分。その後 #544 で `wiring-*.test.mjs` へ分けた)から分けた。変異 985・986・987 の tests がこのファイルだけで済み、
 * 変異ごとの対照実行・検出の実行が短くなる(CI の変異シャードの時間切れを避ける)。
 * 複製の置き方・掃除は `lib/script-copy-harness.mjs`(#547)。接頭辞は `wiring-*.test.mjs` の接頭辞(`.wiring-…-`)と分ける(互いの掃除で消し合わない)。
 * 子の起動だけは自前(親が stderr を遅れて読む)で、harness の `withScriptCopy` に載せる。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { SCRIPTS_DIR, createScriptCopyHarness, countOf, readScript } from "./lib/script-copy-harness.mjs";
import { findProcessExitUses, findExitCodeWithoutReturn } from "./lib/process-exit-scan.mjs";

const { withScriptCopy } = createScriptCopyHarness(".exit-flush-");

/**
 * 検査スクリプトは `process.exit` で終わらず、`process.exitCode` を立てて `main()` から戻る（#540）。
 *
 * **なぜか。** stderr / stdout が**パイプ**のとき（CI・`spawnSync`・`execFileSync` はすべてこの形）、
 * Node の書き出しは OS のパイプが満杯だと非同期に回る（EAGAIN で libuv のキューへ積む）。
 * `process.exit()` はそのキューを捨てるので、読み手が遅れると出力が途中で切れる。実測では、約 55KB の
 * 失敗の一覧が負荷の下で約 15KB で切れ、CI で変異 853 の対照実行が落ちた。`process.exitCode` を立てて戻れば、
 * イベントループが書き出しを終えてから Node が自然に終わる。終了コードと出力の中身は変わらない。
 *
 * 下の 1 つ目は切れ方を負荷に頼らず再現する。親は子の stderr を、**子の終了か十分長い待ちのどちらか早い方まで**読まない。
 * パイプの容量（Linux の既定 64KB）を超える量を書かせるので、`exitCode` で終わる実装は満杯で止まり、待ちの後に読めば
 * 完了する。`process.exit` で終わる実装は書き出しを捨てて先に終わり、残りを失う。合図の行や短い固定の遅れには頼らない
 * （負荷で子が 64KB を書くのが遅れると、パイプが満杯にならず `process.exit` 版が生き残るため）。
 * 2 つ目以降は同じ形が戻らないことを、構文木（`scripts/lib/process-exit-scan.mjs`）で導出して見る
 * （個別の検査ごとに大量出力のテストを書かない。出力の形は各検査の単体テストが見ている）。
 */
describe("検査スクリプトは process.exit で終わらない（#540）", () => {
  /**
   * 親が子の stderr を読み始めるまでの待ちの上限。子が先に終われば、その時点で読み始める（パイプに残った分は読める）。
   * 子が `exitCode` で終わる実装だと、パイプが満杯で止まるので、この待ちの後に読めば完了する。
   * 余裕: 子が起動して終わるまで、無負荷で約 0.15〜0.2 秒、CPU ループ 6 本の下で約 0.15〜0.35 秒（8 回ずつ実測）。
   * 5 秒はその十数倍。待ちを過ぎても子がまだ書いていれば、親の読み出しと重なって `process.exit` 版が生き残りうる（偽の緑側に倒れる）。
   */
  const READ_WAIT_MAX_MS = 5000;

  /** 検査スクリプトの複製を、親が stderr を**遅れて**読む形で走らせる。stdout は流し続ける。 */
  function runCopyWithLateStderrReader(scriptName, mutate, args = []) {
    return withScriptCopy(scriptName, mutate, (copyPath, mutated) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [copyPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
        const stderrChunks = [];
        let resumed = false;
        const resumeStderr = () => {
          if (resumed) return;
          resumed = true;
          child.stderr.resume();
        };
        child.stderr.pause();
        child.stderr.on("data", (d) => stderrChunks.push(d));
        child.stdout.resume();
        const wait = setTimeout(resumeStderr, READ_WAIT_MAX_MS);
        child.on("exit", () => {
          clearTimeout(wait);
          resumeStderr();
        });
        const guard = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`子が ${READ_WAIT_MAX_MS + 10000} ミリ秒で終わりませんでした（stderr を読み始めた後も止まっている）`));
        }, READ_WAIT_MAX_MS + 10000);
        const clearTimers = () => {
          clearTimeout(wait);
          clearTimeout(guard);
        };
        child.on("close", (status) => {
          clearTimers();
          resolve({ status, stderr: Buffer.concat(stderrChunks).toString("utf8"), source: mutated });
        });
        child.on("error", (e) => {
          clearTimers();
          reject(e);
        });
      }),
    );
  }

  test("失敗の一覧がパイプの容量を超えても、親の読み出しが遅れても、末尾まで届いて exit 1 になる（audit-plan-gate）", async () => {
    // Given: 宣言の境界日を過去へ（#506 の要求経路）＋ 一覧を 2 万件ふくらませる（約 280KB。パイプの 64KB を超える）
    const mutate = (s) =>
      s
        .replace('export const DECLARATION_BOUNDARY_DATE = "2026-11-03";', 'export const DECLARATION_BOUNDARY_DATE = "2000-01-01";')
        .replace(
          "  const problems = [];\n  for (const rel of undated) {",
          '  const problems = Array.from({ length: 20000 }, (_, i) => ({ file: `pad-${i}`, message: "pad" }));\n  for (const rel of undated) {',
        );
    // When
    const r = await runCopyWithLateStderrReader("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "length: 20000"), 1, "一覧をふくらませられていません");
    assert.equal(countOf(r.source, '"2000-01-01"'), 1, "境界日を動かせていません");
    // Then: 終了コードは変わらず 1。出力は先頭から末尾（様式の正本・根拠）まで届く
    assert.equal(r.status, 1, `exit 1 になりません。stderr 末尾:\n${r.stderr.slice(-300)}`);
    assert.match(r.stderr, /pad-19999: pad/, "一覧の最後の行まで届いていません（stderr が途中で切れた）");
    assert.match(r.stderr, /様式の正本: docs\/guides\/plan-writing\.md/, "末尾の「様式の正本」が届いていません");
    assert.match(r.stderr, /根拠: docs\/constitution\.md Governance/);
  });

  test("変異検査（mutation-check）も、長い失敗の出力の後に終わるとき、親の読み出しが遅れても末尾まで届いて exit 1 になる（#542）", async () => {
    // Given: 選び方の誤り（宣言に無い番号）。ロックより前（何も触らない）でエラーを書いて終わる経路。
    // 番号を 1.5 万件渡し、エラーの書き出しを 3 倍にふくらませる（約 360KB。パイプ代わりのソケットの容量を超える）。
    // 実際の終わり方（書き出しの後の `exit` / `return`）は書き換えない
    const ids = Array.from({ length: 15000 }, (_, i) => 100000 + i).join(",");
    const needle = "console.error(`[mutation-check] ${e.message}`);";
    const mutate = (s) => s.replace(needle, "console.error(`[mutation-check] ${e.message}`.repeat(3));");
    // When
    const r = await runCopyWithLateStderrReader("mutation-check.mjs", mutate, ["--id", ids]);
    // Then: まず「ふくらませられたこと」を確かめる
    assert.equal(countOf(readScript("mutation-check.mjs"), needle), 1, "ふくらませる対象が実装にありません");
    assert.equal(countOf(r.source, needle), 0, "ふくらませられていません");
    // Then: 終了コードは 1。ふくらませた 3 つ分が最後の番号まで届く
    assert.equal(r.status, 1, `exit 1 になりません。stderr 末尾:\n${r.stderr.slice(-300)}`);
    assert.equal(countOf(r.stderr, "宣言に無い変異の番号です"), 3, "3 つ分が届いていません（stderr が途中で切れた）");
    assert.match(r.stderr, /114999\n$/, "最後の番号まで届いていません（stderr が途中で切れた）");
  });

  /**
   * `process.exit(` を残してよい scripts と、その理由。**理由のない追加は検査を弱める変更**（AGENTS.md）。
   * 実在しない名前・もう `process.exit(` を持たない名前が載っていると落ちる（陳腐化した例外を残さない）。
   */
  const EXIT_ALLOWED = {
    "lib/exit-after-flush.mjs":
      "書き出しが終わるのを待ってから exit する関数そのもの（#542）。mutation-check.mjs のシグナル・uncaughtException のハンドラは、子プロセスとイベントループが生きたまま終わらせる『戻る先の無い』経路で、exitCode を立てて戻れない。待ってから exit するので出力は切れない（自己テストは lib/exit-after-flush.test.mjs）",
  };

  /** 守る対象: scripts/ 直下と scripts/lib/ の *.mjs（テストと、このテストが作る複製を除く）。`lib/…` の形で返す。 */
  const scriptsUnderGuard = () =>
    ["", "lib"].flatMap((dir) =>
      fs
        .readdirSync(path.join(SCRIPTS_DIR, dir))
        .filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && !n.startsWith("."))
        .map((n) => (dir ? `${dir}/${n}` : n)),
    ).sort();
  const hasProcessExit = (n) => findProcessExitUses(readScript(n)).length > 0;

  test("scripts/ と scripts/lib/ の *.mjs（テストを除く）は、例外表に理由のあるものを除き、コードで process.exit を使わない（構文木）", () => {
    // Given: 導出（新しいスクリプトも自動で対象になる）。文字列・正規表現・コメントの中は数えない
    const targets = scriptsUnderGuard();
    assert.ok(targets.length >= 40, `対象が少なすぎます（導出が外れている）: ${targets.length} 件`);
    assert.ok(targets.some((n) => n.startsWith("lib/")), "scripts/lib/ が対象に入っていません");
    // When
    const offenders = targets.filter((n) => !(n in EXIT_ALLOWED) && hasProcessExit(n));
    // Then
    assert.deepEqual(
      offenders,
      [],
      "process.exit で終わっています。stderr がパイプのとき、書き出し途中の出力を捨てます。" +
        "`process.exitCode = N; return;` に替えてください（#540）。残す必要があるなら EXIT_ALLOWED へ理由つきで載せる",
    );
  });

  test("process.exitCode を非 0 にした直後は return か、関数の最後に実行される文である（立てた後も検査が続いて OK を出さない）", () => {
    // When
    const offenders = scriptsUnderGuard().flatMap((n) =>
      findExitCodeWithoutReturn(readScript(n)).map((u) => `${n}:${u.line}`),
    );
    // Then
    assert.deepEqual(offenders, [], "process.exitCode = N; の後に return が無く、処理が続きます。return を足してください（#540）");
  });

  test("process.exit( の例外表は、実在し、いまも process.exit( を持つスクリプトだけを載せ、理由が空でない", () => {
    const targets = new Set(scriptsUnderGuard());
    for (const [name, reason] of Object.entries(EXIT_ALLOWED)) {
      assert.ok(targets.has(name), `${name} が scripts/ に実在しません（例外表を直す）`);
      assert.ok(reason.trim().length > 0, `${name} の理由が空です`);
      assert.ok(hasProcessExit(name), `${name} はもう process.exit( を持ちません（例外表から外す）`);
    }
  });
});
