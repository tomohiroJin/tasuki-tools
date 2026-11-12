/**
 * 構造監査（`scripts/audit-structure.mjs`）の、合否を持たない指標の後退を知らせる（#578・docs/adr/0037）。
 *
 * 構造監査の表の、合否を持たない指標・未達でも落ちない指標（一覧は {@link METRICS}）は、
 * 悪くなっても監査は緑のままである（合否の列が「—」か、未達でも落ちない）。そこで `pnpm check:fast` が、
 * merge-base（`origin/main` と HEAD の共通の祖先）での値と今の値を比べ、後退していれば最後の知らせに出す。**落とさない。**
 *
 * - 基準値は、merge-base のコミットを `git archive` で一時ディレクトリへ展開して、**そのコミットの構造監査**を走らせて得る
 *   （手書きの基準の記録は古くなる。監査自身の変更で測り方が変わっても、両方を各自の版で測るので食い違わない）。
 *   結果は merge-base の SHA で OS の一時ディレクトリへ控え、同じ基準では二度走らせない
 * - 比べる向きは {@link METRICS} が持つ。表の形が変わって読めなくなった指標は、黙って外れず ⚠ で知らせる（原則 VII）
 * - 差分にコードの変更が無ければ呼ばない（呼び出し側。文書だけの差分は指標を動かさない）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

/** 比べる指標。`better`: 小さいほど良い（lower）か大きいほど良い（higher）。 */
export const METRICS = {
  SC027: { better: "lower" },
  SC028: { better: "lower" },
  SC029: { better: "lower" },
  SC030: { better: "lower" },
  SC031: { better: "lower" },
  SC032: { better: "higher", unit: "%" },
  SC035: { better: "lower" },
  SC036: { better: "higher" },
  "SC039.分岐": { better: "lower" },
  "SC039.データ行": { better: "lower" },
  "SC039.公開記号": { better: "lower" },
  "SC039.公開契約": { better: "lower" },
};

/**
 * 構造監査の出力から、指標の数値を取る。読めない指標は欠ける。
 * @param {string} output
 * @returns {Record<string, number>}
 */
export function parseMetrics(output) {
  const metrics = {};
  for (const line of output.split("\n")) {
    const cells = line.split(" | ");
    const id = /^(SC\d+)$/.exec(cells[0]?.trim() ?? "")?.[1];
    if (!id || cells.length < 2) continue;
    const value = cells[1];
    if (id === "SC032") {
      const m = /（(\d+(?:\.\d+)?)%）/.exec(value);
      if (m) metrics[id] = Number(m[1]);
    } else if (id === "SC039") {
      for (const [key, re] of [["分岐", /分岐\s*(\d+)/], ["データ行", /データ\s*(\d+)\s*行/], ["公開記号", /公開記号\s*(\d+)/], ["公開契約", /公開契約\s*(\d+)/]]) {
        const m = re.exec(value);
        if (m) metrics[`SC039.${key}`] = Number(m[1]);
      }
    } else {
      const m = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
      if (m) metrics[id] = Number(m[1]);
    }
  }
  return metrics;
}

/** 基準（控え）として使える出力か。宣言した指標の過半が読めること（空・途中までの控えを使い続けない）。 */
export function isUsableBaseline(output) {
  return Object.keys(parseMetrics(output)).length * 2 > Object.keys(METRICS).length;
}

/**
 * 基準と今の値を比べる。
 * @returns {{ regressions: string[], unreadable: string[], baseUnreadable: string[] }} 後退した指標の説明と、今の側・基準の側で読めなかった指標
 */
export function findMetricRegressions(base, current, baseOutput = null) {
  const regressions = [];
  const unreadable = [];
  const baseUnreadable = [];
  for (const [key, spec] of Object.entries(METRICS)) {
    if (typeof base[key] !== "number") {
      // 基準の監査が古くてその指標の行自体を持たないなら比べようがない。行はあるのに数が読めないなら、黙って外さず知らせる
      if (baseOutput !== null && new RegExp(`^${key.split(".")[0]} \\|`, "m").test(baseOutput)) baseUnreadable.push(key);
      continue;
    }
    if (typeof current[key] !== "number") {
      unreadable.push(key);
      continue;
    }
    const worse = spec.better === "lower" ? current[key] > base[key] : current[key] < base[key];
    if (worse) {
      const unit = spec.unit ?? "";
      regressions.push(`${key} ${base[key]}${unit} → ${current[key]}${unit}（${spec.better === "lower" ? "増えた。小さいほど良い" : "減った。大きいほど良い"}）`);
    }
  }
  return { regressions, unreadable, baseUnreadable };
}

/**
 * check:fast の知らせの行を作る。
 * @param {{ baseline: () => Promise<{ output: string, label: string }>, current: () => Promise<string> }} deps
 * @returns {Promise<string[]>} `⚠` で始まる行は最後の一覧でもう一度出る
 */
export async function structureNotices({ baseline, current }) {
  let base;
  let now;
  try {
    // 基準と今は互いに待たない（どちらも構造監査 1 回分の時間がかかる）
    [base, now] = await Promise.all([baseline(), current()]);
  } catch (error) {
    return [`⚠ 構造監査の指標の比較は未実行です（${String(error.message).trim().split("\n")[0]}）`];
  }
  if (!isUsableBaseline(base.output)) {
    return [`⚠ 構造監査の指標は、基準 ${base.label} の出力から読めないため比べられません（空か途中までの可能性。後退の有無は分かりません）`];
  }
  const { regressions, unreadable, baseUnreadable } = findMetricRegressions(parseMetrics(base.output), parseMetrics(now), base.output);
  const lines = [];
  if (baseUnreadable.length > 0) {
    lines.push(`⚠ 構造監査の指標 ${baseUnreadable.join("・")} は、基準 ${base.label} の側で数が読めないため比べられません`);
  }
  if (regressions.length > 0) {
    lines.push(`⚠ 構造監査の合否の無い指標が後退しています（merge-base ${base.label} と比べて。落とさない）: ${regressions.join(" / ")}`);
  }
  if (unreadable.length > 0) {
    lines.push(`⚠ 構造監査の指標 ${unreadable.join("・")} を表から読めません（表の形が変わった可能性。scripts/lib/structure-metrics.mjs を直す）`);
  }
  if (lines.length === 0) lines.push(`構造監査の合否の無い指標は、merge-base ${base.label} から後退していません`);
  return lines;
}

/** 子プロセスを走らせて標準出力を返す（失敗なら投げる）。 */
function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} が ${code} で終わりました: ${err.trim().split("\n").at(-1) ?? ""}`))));
  });
}

/**
 * 今の作業ツリーの構造監査の出力。基準（`git archive` = 追跡下のファイルだけ）に近づけるため、**追跡下のファイルと、
 * 追跡外で .gitignore の対象でないファイル**（未コミットの変更・`git add` 前の新しいファイルを含む。
 * `git ls-files --cached --others --exclude-standard`）を一時ディレクトリへ写して測る。.gitignore の対象（coverage ほか）で
 * 偽の後退を出さず、新しいファイルによる後退を `git add` 前に見落とさない（コードレビュー 7・PR コメント 1）。
 * ignore されない試しの .ts は数えられる（残余。ADR-0037）。
 * 写しは**呼んだ時点で同期的に**取る（背景で測っている間に、後続の検査が作業ツリーを書き換えても影響しない。コードレビュー 8）。
 * @returns {Promise<string>}
 */
export function defaultCurrentOutput(root, tmp = os.tmpdir()) {
  const dir = fs.mkdtempSync(path.join(tmp, "tasuki-structure-cur-"));
  try {
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    // 削除済みで追跡下のファイルは写せないので読み飛ばす（tar の警告のみ）
    execFileSync("bash", ["-c", 'tar --null -T - --ignore-failed-read -cf - 2>/dev/null | tar -x -C "$1"', "copy", dir], { cwd: root, input: files, maxBuffer: 1024 * 1024 * 1024 });
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    return Promise.reject(error);
  }
  return run(process.execPath, ["scripts/audit-structure.mjs"], { cwd: dir }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

/** merge-base の構造監査の出力（SHA で控える）。 */
export async function defaultBaselineOutput(root, tmp = os.tmpdir()) {
  const sha = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const label = sha.slice(0, 7);
  const cache = path.join(tmp, `tasuki-structure-baseline-${sha}.txt`);
  try {
    const cached = fs.readFileSync(cache, "utf8");
    if (isUsableBaseline(cached)) return { output: cached, label };
    // 空・途中までの控えは捨てて取り直す
  } catch {
    // 控えが無ければ測る
  }
  const dir = fs.mkdtempSync(path.join(tmp, "tasuki-structure-base-"));
  try {
    await new Promise((resolve, reject) => {
      const archive = spawn("git", ["archive", sha], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      const tar = spawn("tar", ["-x", "-C", dir], { stdio: ["pipe", "ignore", "pipe"] });
      archive.stdout.pipe(tar.stdin);
      archive.on("error", reject);
      tar.on("error", reject);
      tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar が ${code} で終わりました`))));
    });
    const output = await run(process.execPath, ["scripts/audit-structure.mjs"], { cwd: dir });
    // 使える出力だけを控え、一時ファイルへ書いてから rename する（途中までの控えが他の作業ツリーから見えない。pid と乱数で衝突しない）
    if (isUsableBaseline(output)) {
      const part = `${cache}.${process.pid}.${Math.random().toString(36).slice(2)}.part`;
      fs.writeFileSync(part, output);
      fs.renameSync(part, cache);
    }
    return { output, label };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
