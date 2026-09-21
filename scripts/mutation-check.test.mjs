import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  detectRunner,
  buildCommand,
  isPidAlive,
  lockRefusalReason,
  restoreWithRetry,
  formatRestoreFailureMessage,
  decideCrashRecovery,
  verifyRestoreAndClearMarker,
  decideMutationRestore,
  MUTATIONS,
} from "./mutation-check.mjs";

/**
 * `scripts/mutation-check.mjs` の自己テスト（#174）。
 *
 * 主題は**ランナーの決め方**である。`detectRunner` が `<pkg>/package.json` の
 * `scripts.test` だけを手がかりにしていたため、`package.json` を持たない
 * `scripts/` は変異対象にできなかった（例外で落ちた）。
 *
 * ここでは次の 2 つを分けて見る。
 *
 * 1. **既定の規則そのもの** — 「`package.json` が無いディレクトリは `node --test`」。
 *    設定を持たないディレクトリで設定なしに動く唯一のランナーだからこう決めた。
 *    `pkgDir` の名前を見て `scripts` なら node、という特別扱いではないことを、
 *    実在しない一時ディレクトリでも同じ結果になることで示す。
 * 2. **宣言から実行コマンドまでの配線** — 宣言（`MUTATIONS`）に並ぶすべての対象で
 *    ランナーが決まり、絞り込み・全体の両モードでコマンドが組めること。対象を
 *    足したときに落ちるのはここである。**件数は書かない**（宣言そのものを回す）。
 * 3. **宣言した変異が実際に当たること** — パッチが `git apply` できること。変異は
 *    **製品コードの文脈（直前・直後の行）を含む diff** なので、**その周りを触っただけで
 *    静かに当たらなくなる**。しかも当たらない変異は結果表に「未検出」として並ばず、
 *    `git apply` の失敗で検査ごと異常終了するため、**全件検出という結論には決して
 *    現れない**。実際 #95 S5c で `m07`（直後の docstring が増えた）と `m13`
 *    （直後のコメントが変わった）の 2 件がこの形で死んでいた。読み取り専用の
 *    `--check` で全件を見る。
 * 4. **エントリポイントの判定の配線** — 直接実行のときだけ `main()` を呼ぶ判定が、
 *    symlink 経由の起動でも成立すること。ここが壊れると検査は何も実行せず
 *    exit 0 で終わる（憲法 VII が最も嫌う失敗の型）。判定そのものの単体テストは
 *    共有ヘルパ側（`scripts/lib/direct-run.test.mjs`）にある。このスクリプトは
 *    起動に数分かかるため `entry-point-wiring.test.mjs` の実起動から外してあり、
 *    **symlink 経由で走ることを見るのはここだけ**である（#197）。
 */

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPTS_DIR, "..");

/** package.json の中身を指定した一時ディレクトリを作る。null なら置かない。 */
function makePkgDir(pkgJsonText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-test-"));
  if (pkgJsonText !== null) fs.writeFileSync(path.join(dir, "package.json"), pkgJsonText, "utf8");
  return dir;
}

describe("detectRunner: ランナーの決め方", () => {
  test("package.json を持たないディレクトリは node を既定にする", () => {
    // Given: package.json を置かない一時ディレクトリ（名前に scripts を含まない）
    const dir = makePkgDir(null);
    try {
      // When / Then: 名前ではなく「設定が無いこと」で決まる
      assert.equal(detectRunner(dir), "node");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scripts/ 自身が node と判定される（#174 の回帰）", () => {
    // Given: まず前提を確かめる。scripts/package.json は実在しない
    assert.equal(
      fs.existsSync(path.join(SCRIPTS_DIR, "package.json")),
      false,
      "scripts/package.json が生えています。この前提が崩れるとこのテストは意味を失います",
    );
    // When / Then
    assert.equal(detectRunner(SCRIPTS_DIR), "node");
  });

  test("scripts.test から bun / node / vitest を判定する（既存の規則は変えない）", () => {
    // Given / When / Then
    for (const [testScript, expected] of [
      ["bun test", "bun"],
      ["node --test tests/*.test.mjs", "node"],
      ["vitest run", "vitest"],
    ]) {
      const dir = makePkgDir(JSON.stringify({ scripts: { test: testScript } }));
      try {
        assert.equal(detectRunner(dir), expected, `"${testScript}" の判定`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test("package.json はあるが判定できないときは例外（既定へ倒さない）", () => {
    // Given: 未知のランナー
    const dir = makePkgDir(JSON.stringify({ scripts: { test: "jest" } }));
    try {
      // When / Then: 黙って node で走らせると「テストを 1 件も実行せずに検出」になる
      assert.throws(() => detectRunner(dir), /未知のテストランナー/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("package.json が壊れているときは例外（『無い』と『読めない』を混ぜない）", () => {
    // Given: JSON として壊れた package.json
    const dir = makePkgDir("{ this is not json");
    try {
      // When / Then: 既定へ倒れると、読めない設定を黙って無視することになる
      assert.throws(() => detectRunner(dir), /package.json の読み込みに失敗しました/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("宣言から実行コマンドまでの配線", () => {
  // 件数は書かない。宣言（MUTATIONS）そのものを回すので、対象を足せば自動で増える。
  test("宣言したすべての変異でランナーが決まる", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const pkgDir = path.join(WORKSPACE_ROOT, m.pkg);
      assert.doesNotThrow(() => detectRunner(pkgDir), `変異 #${m.id}（${m.pkg}）`);
    }
  });

  test("宣言したすべての変異で絞り込み実行のコマンドが組め、対応表のテストを引数に持つ", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const runner = detectRunner(path.join(WORKSPACE_ROOT, m.pkg));
      const { cmd, args } = buildCommand(runner, m, false);
      assert.ok(cmd, `変異 #${m.id} のコマンドが空`);
      for (const t of m.tests) {
        assert.ok(args.includes(t), `変異 #${m.id} の引数に ${t} が無い（args: ${args.join(" ")}）`);
      }
    }
  });

  test("宣言したすべての変異でパッケージ全体実行のコマンドが組める", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const runner = detectRunner(path.join(WORKSPACE_ROOT, m.pkg));
      assert.doesNotThrow(() => buildCommand(runner, m, true), `変異 #${m.id}（${m.pkg}）`);
    }
  });

  test("package.json を持たない対象の --full は node --test をファイル指定なしで走らせる", () => {
    // Given: scripts/ を対象にした変異（scripts.test が無いので読み出せない）
    const mutation = { id: 0, pkg: "scripts", tests: ["list-scan-targets.test.mjs"] };
    // When
    const { cmd, args } = buildCommand("node", mutation, true);
    // Then: node 自身の探索に任せる（対象の列挙をここへ持ち込まない）
    assert.equal(cmd, "node");
    assert.deepEqual(args, ["--test"]);
  });
});

/**
 * 宣言した変異が**実際に当たる**こと（#95 S5c）。
 *
 * 変異パッチは製品コードの diff なので、**変異させる行そのものを誰も触らなくても、
 * その前後の行を変えるだけで当たらなくなる**。#95 S5c では `m07` と `m13` の 2 件が
 * この形で死んでいた（片方は直後の docstring が増え、片方は直後のコメントが変わった）。
 *
 * **この死に方は結果表に出ない。** `applyMutation` の `git apply` が非 0 で終わると
 * `execFileSync` が投げ、検査は「変異 #N は未検出」ではなく**その場で異常終了**する。
 * したがって「全変異が検出されました」という結論からは**永久に見えない**。
 * 気づけるのは `node scripts/mutation-check.mjs` を最後まで流したときだけで、
 * 実装を変えた段でそれを回さなければ次の段まで残る（実際そうなった）。
 *
 * ここは `--check` だけを使う。**作業ツリーを一切変えない**ので、
 * 未コミット変更があっても・他の検査と並走しても安全である。
 */
describe("宣言した変異が当たること", () => {
  // 件数は書かない。宣言（MUTATIONS）そのものを回すので、対象を足せば自動で増える。
  test("宣言したすべての変異のパッチが、いまの製品コードへ適用できる", () => {
    // Given: 対応表が指すパッチファイル
    const failures = [];

    // When: 1 件ずつ `git apply --check`（読み取りのみ。作業ツリーは変わらない）
    for (const m of MUTATIONS) {
      const patch = path.join(SCRIPTS_DIR, "mutations", m.patch);
      const result = spawnSync("git", ["apply", "--check", patch], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        failures.push(`変異 #${m.id}（${m.patch}）: ${String(result.stderr).trim()}`);
      }
    }

    // Then: 1 件でも当たらなければ、その変異は**検出の結果表に現れないまま死んでいる**
    assert.deepEqual(
      failures,
      [],
      `当たらない変異パッチがあります。変異させた行の周りを触ると起きます。\n` +
        `パッチを作り直してください（変異そのものは変えないこと）:\n${failures.join("\n")}`,
    );
  });
});


/**
 * mutation-check.mjs の複製だけを置いた使い捨てのリポジトリを作る。
 *
 * **なぜ本物の `scripts/mutation-check.mjs` を直接起動しないか。** `main()` の先頭は
 * `recoverFromCrashedRun()` であり、適用中マーカー（`scripts/mutations/.applied`）が
 * あれば `git checkout --` で作業ツリーを復元する。`mutation-check --full` は
 * `scripts/` 全体のテストを走らせるので、その中からここが本物を起動すると、
 * 実行中の変異を横から戻して検査そのものを壊す。複製を置いた別リポジトリなら、
 * マーカーも変異も存在しないのでその経路に触れない。
 *
 * 複製した `main()` は `assertMutationTestsExist()` で必ず落ちる（対応表のテストが
 * 1 件も無いため）。**「main() が走ったこと」の観測点はこの出力である。**
 */
function makeMutationCheckSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-entry-"));
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  // lib は**列挙せずディレクトリごと**写す。名前を並べると、取り込みを 1 本足した
  // だけで足場が壊れ、原因が「解決できないモジュール」として遠くに出る（#197）。
  const libFiles = fs
    .readdirSync(path.join(SCRIPTS_DIR, "lib"))
    .filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))
    .map((n) => path.join("lib", n));
  for (const rel of ["mutation-check.mjs", ...libFiles]) {
    fs.copyFileSync(path.join(SCRIPTS_DIR, rel), path.join(root, "scripts", rel));
  }
  // 複製先でも `git rev-parse --show-toplevel` が解決できるようにする。
  execFileSync("git", ["init", "-q", root]);
  return root;
}

/** main() が走ったことを示す出力（assertMutationTestsExist の第一声）。 */
const MAIN_RAN = /検出を期待するテストファイルが見つかりません/;

describe("エントリポイントの判定", () => {
  test("symlink 経由で起動しても main() が走る（#191 の回帰）", () => {
    // Given: 複製リポジトリと、その複製を指す symlink
    const root = makeMutationCheckSandbox();
    const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-link-"));
    const real = path.join(root, "scripts", "mutation-check.mjs");
    const link = path.join(linkDir, "linked-mutation-check.mjs");
    fs.symlinkSync(real, link);
    try {
      // 対照: 実体パスで起動したとき、この足場から本当に出力が出ることを先に見る。
      const control = spawnSync(process.execPath, [real], { encoding: "utf8" });
      assert.match(control.stderr, MAIN_RAN, "対照（実体パス起動）で main() が走っていません。足場が壊れています");
      assert.equal(control.status, 1, "対照の exit code");

      // When: symlink 経由で起動する
      const viaLink = spawnSync(process.execPath, [link], { encoding: "utf8" });

      // Then: 無出力・exit 0 で素通りしてはならない
      assert.match(
        viaLink.stderr,
        MAIN_RAN,
        `symlink 経由で main() が走っていません（exit ${viaLink.status} / stdout ${JSON.stringify(viaLink.stdout)} / stderr ${JSON.stringify(viaLink.stderr)}）`,
      );
      assert.equal(viaLink.status, 1, "symlink 経由の exit code");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  });
});

/**
 * 同時実行のロック（#95 S2 のレビューで踏んだ事故への対処）。
 *
 * **なぜ要るのか。** 同じ作業ツリーで 2 つ走ると、片方の `git apply` を
 * もう片方の `git checkout --` が消し、互いの帳簿（`currentlyAppliedFiles` と
 * マーカー `.applied`）が食い違う。結果は**変異が当たったまま残り、マーカーも消える**
 * ——どちらの復旧経路でも拾えない状態である。2026-09-08 に実際に起き、
 * `apps/timer-web/src/sync/stale-frame.ts` に変異 #16 が残った。
 *
 * 判定（`lockRefusalReason`）は純粋関数に切ってある。ロックの有無で分岐する経路は
 * 本来 2 つ同時に走らせないと再現できず、そのままではテストが書けないため。
 * **配線（main が実際に拒むこと）は下のサブプロセス起動で見る。**
 */
describe("同時実行のロック", () => {
  test("ロックが無ければ拒まない", () => {
    // Given: ロックファイルが存在しない
    // When / Then
    assert.equal(lockRefusalReason(null), null);
  });

  test("生きている PID のロックがあれば拒み、PID と消し方を伝える", () => {
    // Given: 生きているプロセスが書いたロック
    const reason = lockRefusalReason("4242", () => true);
    // Then: 理由に PID と、消してよい条件が入っている
    assert.notEqual(reason, null);
    assert.match(reason, /4242/);
    assert.match(reason, /scripts\/mutations\/\.lock/);
    assert.match(reason, /待って/);
  });

  test("死んだ PID のロックは拒まない（前回の置き土産を引き取る）", () => {
    // Given: もう居ないプロセスが残したロック
    // When / Then: 拒む理由は無い
    assert.equal(lockRefusalReason("4242", () => false), null);
  });

  test("PID として読めない中身は拒まない（消し方を知らない人が詰まないように）", () => {
    // Given: 書き込みの途中で殺された等で壊れたロック
    // When / Then: 生死を問わず拒まない（書き手はもう居ない公算が大きい）
    for (const broken of ["", "   ", "abc", "-1", "0"]) {
      assert.equal(
        lockRefusalReason(broken, () => true),
        null,
        `壊れたロック ${JSON.stringify(broken)} で拒んでいる`,
      );
    }
  });

  test("isPidAlive は自分自身を生きていると判定し、あり得ない PID を死んでいると判定する", () => {
    // Given / When / Then: 自分は必ず生きている
    assert.equal(isPidAlive(process.pid), true);
    // Linux の PID 上限（/proc/sys/kernel/pid_max の既定は 4194304）を超える値は割り当たらない
    assert.equal(isPidAlive(2 ** 31 - 1), false);
  });

  test("配線: 生きているロックがあると main は何も実行せずに非 0 で終わる", () => {
    // Given: 自分自身（確実に生きている）の PID を書いたロック
    const lockPath = path.join(WORKSPACE_ROOT, "scripts/mutations/.lock");
    assert.equal(fs.existsSync(lockPath), false, "先行するロックが残っている");
    fs.writeFileSync(lockPath, String(process.pid), "utf8");
    try {
      // When: 変異検査を起動する
      const r = spawnSync("node", ["scripts/mutation-check.mjs"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        timeout: 60_000,
      });
      // Then: 走り出す前に落ちる（変異の適用も復元も行わない）
      assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
      assert.match(r.stderr, /別の実行（PID \d+）が走っています/);
      assert.doesNotMatch(r.stdout ?? "", /変異#?\s*1\b|モード:/, "本体が走り出しています");
      // Then: 他人のロックを消していない
      assert.equal(fs.readFileSync(lockPath, "utf8").trim(), String(process.pid));
    } finally {
      if (fs.existsSync(lockPath)) fs.rmSync(lockPath);
    }
  });
});

/**
 * 復元の再試行と検証（Task 7b / #290）。
 *
 * **背景（実測で判明）**: `.git/index.lock` の競合で `git checkout --` による復元が
 * 3 回失敗し、変異（合言葉チェックの短絡・不可視文字除去の削除）が製品コードに
 * 当たったまま残った。当時のコードは `catch` で `console.error` するだけで、
 * 再試行も「実際に戻ったか」の検証も終了コードの変更もしていなかった。
 *
 * **「コマンドが成功した」と「実際に戻った」は別の事実である。** ここでは、
 * `git checkout --` を叩く実 I/O（`checkoutFn`）・戻ったかを確かめる実 I/O
 * （`isRestoredFn`）・再試行の待機（`waitFn`）をすべて注入できる形にして、
 * 判定（何回試すか・いつ諦めるか）だけを取り出して検証する。`lockRefusalReason`
 * と同じ形（判定を純粋関数へ、実 I/O は呼び出し側）。git のロック競合そのものは
 * 再現しない——見たいのは「コマンドは成功を返した（＝例外を投げなかった）のに
 * ファイルが戻っていない」という状況での振る舞いである。
 */
describe("復元の再試行と検証", () => {
  test("checkout が例外を投げずに終わっても、ファイルが戻っていなければ最大試行回数まで再試行する", () => {
    // Given: checkoutFn は毎回「成功」する（例外を投げない）が、isRestoredFn は常に
    // 「戻っていない」を返す —— index.lock 競合で checkout 自体が空振りし続ける状況を模す
    let checkoutCalls = 0;
    let waitCalls = 0;
    // When
    const result = restoreWithRetry(["a.ts", "b.ts"], {
      checkoutFn: () => {
        checkoutCalls += 1;
      },
      isRestoredFn: () => false,
      waitFn: () => {
        waitCalls += 1;
      },
      maxAttempts: 3,
    });
    // Then: 諦めるまで指定回数分だけ叩き、戻ったとは判定しない
    assert.equal(result.restored, false);
    assert.equal(result.attempts, 3);
    assert.equal(checkoutCalls, 3, "checkoutFn の呼び出し回数");
    assert.equal(waitCalls, 2, "待機は試行の間だけ（最後の失敗の後には待たない）");
  });

  test("再試行の途中で戻れば、そこで打ち切り正常な結果を返す", () => {
    // Given: 2 回目の checkout の後に isRestoredFn が true になる
    let attempts = 0;
    // When
    const result = restoreWithRetry(["a.ts"], {
      checkoutFn: () => {
        attempts += 1;
      },
      isRestoredFn: () => attempts >= 2,
      waitFn: () => {},
      maxAttempts: 5,
    });
    // Then: 3 回目以降は試みない
    assert.equal(result.restored, true);
    assert.equal(result.attempts, 2);
    assert.equal(attempts, 2, "戻った後は checkoutFn を追加で呼ばない");
  });

  test("checkoutFn が例外を投げても、直後に戻っていれば異常とは扱わない（index.lock は一過性）", () => {
    // Given: 1 回目は例外（index.lock 競合を模す）、2 回目で戻る
    let calls = 0;
    // When
    const result = restoreWithRetry(["a.ts"], {
      checkoutFn: () => {
        calls += 1;
        if (calls === 1) throw new Error("index.lock");
      },
      isRestoredFn: () => calls >= 2,
      waitFn: () => {},
      maxAttempts: 5,
    });
    // Then
    assert.equal(result.restored, true);
    assert.equal(result.attempts, 2);
  });

  test("checkoutFn が最後まで例外を投げ続けても、最大試行回数で致命的な結果を返す", () => {
    // Given: checkout が一度も成功しない（＝例外を投げ続ける）
    let calls = 0;
    // When
    const result = restoreWithRetry(["a.ts"], {
      checkoutFn: () => {
        calls += 1;
        throw new Error("index.lock");
      },
      isRestoredFn: () => false,
      waitFn: () => {},
      maxAttempts: 4,
    });
    // Then
    assert.equal(result.restored, false);
    assert.equal(result.attempts, 4);
    assert.equal(calls, 4);
  });

  test("致命的な結果のメッセージに、残っているファイル名がすべて出る", () => {
    // Given / When
    const msg = formatRestoreFailureMessage(
      ["apps/tasuki-sync/src/x.ts", "packages/timer-core/src/y.ts"],
      5,
    );
    // Then: ファイル名が省略されずに並ぶ
    assert.match(msg, /apps\/tasuki-sync\/src\/x\.ts/);
    assert.match(msg, /packages\/timer-core\/src\/y\.ts/);
    // Then: 見逃しようのない書き方であること（致命的だと分かる語と試行回数）
    assert.match(msg, /手動/);
    assert.match(msg, /5/);
  });
});

/**
 * クラッシュからの復旧（recoverFromCrashedRun の判定部分）の再試行・検証・マーカー
 * 消去のタイミング（修正ラウンド 1 / #290）。
 *
 * **背景**: `recoverFromCrashedRun()` は旧実装では `restoreWithRetry` を使わず、
 * `git checkout --` が例外を投げなければ「復元しました。」と report するだけだった
 * （検証も再試行も無い）。しかもマーカー（`.applied`）を復元の**前**に消していたため、
 * 復元が失敗しても次回の起動は「前回は異常終了した」という記録を失っていた
 * （`process.exit(1)` で人には見えても、状態としては失われる）。
 *
 * ここでは両方を見る。git のロック競合そのものは再現しない —— 見たいのは
 * 「復元コマンドが成功を返したのにファイルが戻っていない」状況での振る舞いと、
 * そのときマーカーを消していないかである。
 */
describe("クラッシュからの復旧の判定（decideCrashRecovery）", () => {
  test("マーカーの中身が空なら、復元を試みずマーカーだけ消す", () => {
    // Given: 壊れたマーカー（中身が空）を模す
    let checkoutCalls = 0;
    let clearCalls = 0;
    // When
    const outcome = decideCrashRecovery([], {
      checkoutFn: () => {
        checkoutCalls += 1;
      },
      isRestoredFn: () => true,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
    });
    // Then: 戻すものが無いので checkout は 1 度も呼ばれず、マーカーだけ消える
    assert.equal(outcome.restored, null);
    assert.equal(checkoutCalls, 0);
    assert.equal(clearCalls, 1);
  });

  test("checkout が成功を返してもファイルが戻っていなければ、マーカーを消さずに致命的な結果を返す", () => {
    // Given: checkoutFn は例外を投げない（「成功」を装う）が、isRestoredFn は常に false
    let clearCalls = 0;
    const logs = [];
    // When
    const outcome = decideCrashRecovery(["apps/timer-web/src/sync/use-timer-sync.ts"], {
      checkoutFn: () => {},
      isRestoredFn: () => false,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      logFn: (msg) => logs.push(msg),
      maxAttempts: 3,
    });
    // Then: 致命的として扱い、マーカーは**消さない**（次回の起動が拾えるように残す）
    assert.equal(outcome.restored, false);
    assert.equal(clearCalls, 0, "戻っていないのにマーカーを消している");
    // Then: 残っているファイル名がログに出る
    assert.ok(
      logs.some((m) => /apps\/timer-web\/src\/sync\/use-timer-sync\.ts/.test(m)),
      "致命的なログにファイル名が出ていない",
    );
  });

  test("再試行の末に戻れば、そこでマーカーを消し正常な結果を返す", () => {
    // Given: 2 回目の checkout の後に isRestoredFn が true になる
    let attempts = 0;
    let clearCalls = 0;
    // When
    const outcome = decideCrashRecovery(["a.ts"], {
      checkoutFn: () => {
        attempts += 1;
      },
      isRestoredFn: () => attempts >= 2,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      maxAttempts: 5,
    });
    // Then: 戻った後にだけマーカーを消す
    assert.equal(outcome.restored, true);
    assert.equal(outcome.attempts, 2);
    assert.equal(clearCalls, 1);
  });
});

/**
 * マーカーを消すタイミングの規則そのもの（修正ラウンド 3 / #290 のレビュー指摘）。
 *
 * **なぜこの節が要るか**: 上の「decideCrashRecovery」の 3 件は `verifyRestoreAndClearMarker`
 * を間接的に通るが、それは `recoverFromCrashedRun` 経路だけである。`restoreCurrentMutation`
 * （通常サイクルの復元）も同じ関数を通るが、上の 3 件は一切そちらを通らない。
 * つまり誰かが `restoreCurrentMutation` の中だけを元の「無条件 `clearMarker()`」へ
 * 書き戻しても、上の 3 件は全部緑のままだった —— 正しい実装と誤実装が同じ結果を
 * 返す位置にしかアサーションが無い状態。ここでは `verifyRestoreAndClearMarker` を
 * **直接 import** し、`clearMarkerFn` の**呼び出し回数**を数える形で「いつ呼ばれるか／
 * いつ呼ばれないか」を固定する。
 */
describe("マーカーを消すタイミング（verifyRestoreAndClearMarker を直接検証）", () => {
  test("files が空なら、検証を待たずに clearMarkerFn を 1 回だけ呼ぶ（m05 のケース）", () => {
    // Given/When
    let checkoutCalls = 0;
    let clearCalls = 0;
    const outcome = verifyRestoreAndClearMarker([], {
      checkoutFn: () => {
        checkoutCalls += 1;
      },
      isRestoredFn: () => true,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
    });
    // Then: 戻すものが無いので checkout は 1 度も呼ばれず、マーカーだけ消える。
    // ここが消えると、次回の起動が「前回は異常終了した」と誤報告し続ける。
    assert.equal(outcome.restored, null);
    assert.equal(checkoutCalls, 0);
    assert.equal(clearCalls, 1);
  });

  test("files が非空で復元が成功すれば、戻ったと確認できてから clearMarkerFn を 1 回だけ呼ぶ", () => {
    // Given
    let clearCalls = 0;
    const restoredAttempts = [];
    // When
    const outcome = verifyRestoreAndClearMarker(["a.ts"], {
      checkoutFn: () => {},
      isRestoredFn: () => true,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      onRestored: (attempts) => restoredAttempts.push(attempts),
      maxAttempts: 3,
    });
    // Then
    assert.equal(outcome.restored, true);
    assert.equal(clearCalls, 1);
    assert.deepEqual(restoredAttempts, [1]);
  });

  test("files が非空で復元が失敗し続ければ、clearMarkerFn は一度も呼ばれない（この修正の核心）", () => {
    // Given: checkout は例外を投げない（「成功」を装う）が、isRestoredFn は常に false
    //   —— これが今回のバグの再現条件そのもの。ここで clearMarkerFn が呼ばれてしまう
    //   実装（＝ restoreCurrentMutation を無条件 clearMarker() へ書き戻した状態と同値）
    //   なら、このアサーションが落ちる。
    let clearCalls = 0;
    // When
    const outcome = verifyRestoreAndClearMarker(["a.ts"], {
      checkoutFn: () => {},
      isRestoredFn: () => false,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      maxAttempts: 3,
    });
    // Then: マーカーを残したまま致命的な結果を返す
    assert.equal(outcome.restored, false);
    assert.equal(
      clearCalls,
      0,
      "戻っていないのに clearMarkerFn が呼ばれている（無条件 clearMarker() への退行を検知できていない）",
    );
  });
});

/**
 * `restoreCurrentMutation`（通常サイクルの復元）の判定部分を直接検証する
 * （修正ラウンド 3 / #290）。`restoreCurrentMutation` 自身は module-level 変数
 * （`currentlyAppliedFiles`）と実 I/O（`execFileSync`・`process.exit`）に直接
 * 依存しており安く注入できないため対象にしていない（この節の直後のコメント、
 * および `mutation-check.mjs` 側の `restoreCurrentMutation` 直前のコメントを参照）。
 * ここで検証するのは、その配線が委ねる判定ロジック（`decideMutationRestore`）である。
 */
describe("通常サイクルの復元判定（decideMutationRestore）", () => {
  test("戻れば、ファイル名入りの復元ログを出しマーカーを消す", () => {
    // Given
    let clearCalls = 0;
    const logs = [];
    // When
    const outcome = decideMutationRestore(["a.ts", "b.ts"], {
      checkoutFn: () => {},
      isRestoredFn: () => true,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      logFn: (msg) => logs.push(msg),
    });
    // Then
    assert.equal(outcome.restored, true);
    assert.equal(clearCalls, 1);
    assert.ok(
      logs.some((m) => m.includes("復元しました: a.ts, b.ts")),
      "復元ログにファイル名が出ていない",
    );
  });

  test("戻らなければ、マーカーを消さず致命的なログを出す", () => {
    // Given
    let clearCalls = 0;
    const logs = [];
    // When
    const outcome = decideMutationRestore(["a.ts"], {
      checkoutFn: () => {},
      isRestoredFn: () => false,
      waitFn: () => {},
      clearMarkerFn: () => {
        clearCalls += 1;
      },
      logFn: (msg) => logs.push(msg),
      maxAttempts: 2,
    });
    // Then
    assert.equal(outcome.restored, false);
    assert.equal(clearCalls, 0, "戻っていないのにマーカーを消している");
    assert.ok(
      logs.some((m) => /a\.ts/.test(m)),
      "致命的なログにファイル名が出ていない",
    );
  });
});
