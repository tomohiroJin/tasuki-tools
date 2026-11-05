/**
 * 検査スクリプトの**書き換えた複製**を作って子プロセスで走らせる補助（#135・#544）。
 *
 * `wiring-*.test.mjs` と `scan-target-wiring.test.mjs` が共有する。もとは 1 ファイルの
 * `scan-target-wiring.test.mjs` に在ったが、約 3.5 分かかるので検査スクリプトごとのファイルへ分けた
 * （変異の `tests` を関係するファイルだけにし、変異検査のシャードの偏りを小さくするため）。
 * 分けると同時に走るファイルが増えるので、**複製の接頭辞はファイルごとに分ける**。
 * 接頭辞が互いの前方一致になると、一方の起動時の掃除が他方の複製を消す。
 * `scripts/script-copy-harness.test.mjs` が、接頭辞が重ならないことを導出して見る。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

export const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");

/** 部分文字列の出現回数（「壊れたこと自体」を先に確かめるために使う）。 */
export function countOf(source, needle) {
  return source.split(needle).length - 1;
}

/**
 * 書き換える前の検査スクリプトを読む。
 *
 * **緑を期待する破壊検証には、書き換え「前」の確認が要る。** 書き換え後の出現回数が
 * 0 件であることだけを見ると、壊す対象の行がそもそも無いとき（ガードが未実装のとき）も
 * 通ってしまい、テストは偽の緑になる。
 */
export function readScript(scriptName) {
  return fs.readFileSync(path.join(SCRIPTS_DIR, scriptName), "utf8");
}

/**
 * 「壊す対象が実装に在った」ことと「壊れて消えた」ことの**両方**を見る。
 *
 * **書き換え後の 0 件だけを見てはならない。** 置換対象の文字列は、実装側の無害な変更
 * （引数名を `pkg` から `p` へ変えるなど）でずれる。ずれると `String.replace` は静かに
 * no-op になり、**走査も判定も健全なまま**テストが走る。緑を期待する破壊検証はそれを
 * そのまま通す（#253 のレビューで、この穴を実際に踏んだ）。
 *
 * 書き換えを重ねる場合は**重ねた分だけ呼ぶこと**。合成した書き換えのうち 1 つが no-op でも、
 * 「原文と違う」だけの判定では、他の書き換えが効いた分で成立してしまう。
 */
export function assertBrokenBy(scriptName, mutatedSource, needle, label) {
  assert.equal(countOf(readScript(scriptName), needle), 1, `${label}: 壊す対象が実装にありません`);
  assert.equal(countOf(mutatedSource, needle), 0, `${label}: 壊せていません`);
}

/**
 * 複製の接頭辞で縛った補助一式を返す。呼ぶと、前回の異常終了で残った**同じ接頭辞の**複製を掃除する。
 *
 * 複製は `finally` で消しているが、SIGKILL 等で落ちると残る。残ると
 * `mutation-check.mjs` の「作業ツリーが clean であること」の判定を赤にして、
 * 原因の分かりにくい失敗になる。**自分が汚した可能性のあるものだけ**を、
 * 接頭辞で限定して消す（広い範囲の削除はしない）。
 *
 * @param {string} copyPrefix 例 `.wiring-plan-gate-`。`.` で始まり `-` で終わり、他のファイルの接頭辞と前方一致しない
 */
export function createScriptCopyHarness(copyPrefix) {
  assert.match(copyPrefix, /^\.[a-z0-9-]+-$/, `複製の接頭辞の形が不正です: ${copyPrefix}`);
  let copyCounter = 0;

  for (const name of fs.readdirSync(SCRIPTS_DIR)) {
    if (name.startsWith(copyPrefix)) fs.rmSync(path.join(SCRIPTS_DIR, name), { force: true });
  }

  /**
   * 検査スクリプトの複製を `scripts/` 直下へ置き、子プロセスで実行する。
   *
   * **同じディレクトリへ置くことが必須。** 各スクリプトは `__dirname/..` を
   * リポジトリルートとみなすため、別の場所へ複製すると走査先が変わってしまう。
   * 複製名は `*.test.mjs` でも `*.sh` でもないので、自己テスト・shellcheck の
   * 導出対象（`scripts/list-scan-targets.mjs`）には入らない。
   *
   * @param {string} scriptName 複製元のファイル名
   * @param {(source: string) => string} mutate 書き換え。恒等関数なら対照実行になる
   */
  function runScriptCopy(scriptName, mutate) {
    const original = readScript(scriptName);
    const mutated = mutate(original);
    const copyPath = path.join(SCRIPTS_DIR, `${copyPrefix}${process.pid}-${copyCounter++}-${scriptName}`);
    fs.writeFileSync(copyPath, mutated);
    try {
      const r = spawnSync(process.execPath, [copyPath], { encoding: "utf8" });
      return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", source: mutated };
    } finally {
      fs.rmSync(copyPath, { force: true });
    }
  }

  return { runScriptCopy };
}
