#!/usr/bin/env node
/**
 * 文書のリンク検査（#70）。
 *
 *   node scripts/check-links.mjs
 *
 * 3 種を検査する。
 *   1. 相対リンク  [text](path)         全 *.md
 *   2. アンカー    [text](path#anchor)  全 *.md
 *   3. コードパス  `packages/foo.ts`    LIVE_DOCS に属する文書のみ
 *
 * **Markdown のコード領域（フェンス・インラインコード）はリンク検査の対象外。**
 * 検査手順を説明する文書が `[x](no-such-file.md)` のような例示を含むため、
 * ここを読むと「意図的に壊れたリンク」を実害として報告してしまう。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { listRepoFiles, hasZeroScanTargets } from "./lib/scan-targets.mjs";

/**
 * 各行がコードフェンスの内側（フェンス行自体を含む）かどうかを返す。
 *
 * **閉じフェンスは「開いたフェンスと同じ文字」「同じ長さ以上」「他に内容が無い」の
 * 3 つを満たす必要がある**（CommonMark）。長さを見ないと、```` で開いたブロックの
 * 中にある ``` が外側を閉じてしまい、コード領域の中身が本文として漏れる。
 * リポジトリの `docs/superpowers/plans/2026-06-07-tasuki-vps-deployment.md`（425 行で
 * ```` で開き、495 行に ```bash がある）で実際に再現した欠陥。
 *
 * フェンス判定はここ 1 箇所に集約する。stripCodeRegions と findInlineCodePaths が
 * 別々に持つと、片方だけ直したときに同じ穴が残る。
 */
export function fenceMask(src) {
  const mask = [];
  let fence = null; // { char, length }
  for (const line of src.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && fence === null) {
      fence = { char: marker[0], length: marker.length };
      mask.push(true);
      continue;
    }
    // ```bash のような情報文字列つきの行は開始フェンスであって閉じフェンスではない
    if (
      marker &&
      fence !== null &&
      marker[0] === fence.char &&
      marker.length >= fence.length &&
      line.trim() === marker
    ) {
      fence = null;
      mask.push(true);
      continue;
    }
    mask.push(fence !== null);
  }
  return mask;
}

/**
 * フェンス内の行を空文字にし、本文中のインラインコードを同じ長さの空白へ置き換える。
 * 行番号を報告できるように、行数と各行の文字数は保つ。
 */
export function stripCodeRegions(src) {
  const mask = fenceMask(src);
  return src
    .split("\n")
    .map((line, i) => (mask[i] ? "" : line.replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length))));
}

/**
 * 見出しの文字列を GitHub のアンカーへ変換する。
 *
 * **空白の連続を 1 個のハイフンへ潰さない**（`\s+` ではなく `\s`）。
 * GitHub は空白 1 個につきハイフン 1 個を出すため、`a — b` は `a--b` になる。
 * ws-protocol.md の 18 見出しで GitHub のレンダリング結果と一致を確認済み。
 */
export function toAnchor(heading) {
  return heading
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** 文書中の見出しから、GitHub と同じ規則でアンカーの集合を作る（同名は -1, -2 …）。 */
export function collectAnchors(src) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of stripCodeRegions(src)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!m) continue;
    const base = toAnchor(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/** リポジトリのルート直下で、コードパスの引用があり得るディレクトリ。 */
const REPO_TOP_LEVEL = /^(packages|apps|scripts|docs|deploy|e2e|\.github|\.specify)\//;

/** バッククォートの中身がリポジトリ内のファイルパスに見えるか。 */
export function isRepoPathLike(text) {
  if (!REPO_TOP_LEVEL.test(text)) return false;
  if (/\s/.test(text)) return false;
  // グロブ・変数展開・リダイレクトを含むものはコマンド例なので対象外
  if (/[*?<>{}$|]/.test(text)) return false;
  // 拡張子が無いものは参照記法（`docs/adr/0002` のような ADR 番号の接頭辞）とみなす
  return /\.[a-z0-9]+(:\d+(-\d+)?)?$/i.test(text);
}

/** コード領域の外にある相対リンクを、行番号つきで拾う。 */
export function findRelativeLinks(src) {
  const found = [];
  stripCodeRegions(src).forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      found.push({ target, line: i + 1 });
    }
  });
  return found;
}

/**
 * フェンスの外にあるインラインコードからパスを拾う。
 *
 * フェンスの判定は fenceMask に委ねる（Task 1）。ここで独自に持つと、
 * 片方だけ直したときに同じ穴が残る。
 */
export function findInlineCodePaths(src) {
  const found = [];
  const mask = fenceMask(src);
  src.split("\n").forEach((line, i) => {
    if (mask[i]) return;
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const raw = m[1].trim();
      if (!isRepoPathLike(raw)) continue;
      found.push({ path: raw.replace(/:\d+(-\d+)?$/, ""), raw, line: i + 1 });
    }
  });
  return found;
}

/**
 * コードパス検査の対象になる「現役の規範文書」。
 *
 * 設定ファイルではなく定数として持つ。設定ファイルにすると
 * 「対象から外した」変更がコード差分に出ず、静かに検査が痩せるため。
 * 末尾が "/" のものは前方一致、そうでないものは完全一致。
 */
export const LIVE_DOCS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "SECURITY.md",
  "docs/README.md",
  "docs/adr/",
  "docs/guides/",
  "deploy/",
  ".github/",
  "e2e/",
  ".specify/memory/",
];

/**
 * コードパス検査の対象にしない文書。**理由が要る。**
 *
 * LIVE_DOCS と合わせて**追跡下の全 `*.md` を分割する**（#135 経路③・ADR-0014）。
 * 「各エントリが 1 件以上に一致すること」では経路③を塞げない — 経路③の攻撃は
 * エントリの**削除**であり、削除すれば照合対象ごと消えて緑のままになるため。
 * 実体側を全分割すれば、エントリを消した瞬間にその配下が無所属になって落ちる。
 */
export const DORMANT_DOCS = [
  { prefix: "docs/superpowers/", reason: "設計正本・実装計画。作業中に頻繁に増減する" },
  { prefix: "docs/plans/", reason: "旧世代の実装計画。記録として保持する" },
  { prefix: "docs/timer/", reason: "timer の作業記録。記録として保持する" },
  { prefix: "docs/poker/", reason: "poker の作業記録。記録として保持する" },
  { prefix: "docs/retrospectives/", reason: "振り返り。当時の記述を保つのが正しい" },
  { prefix: ".claude/skills/", reason: "AI CLI のスキル定義。リポジトリの文書ではない" },
  { prefix: ".specify/templates/", reason: "spec-kit の vendor テンプレート" },
  { prefix: "packages/protocol/README.md", reason: "パッケージ README。LIVE_DOCS の粒度に合わない" },
  { prefix: "packages/ui/README.md", reason: "パッケージ README。LIVE_DOCS の粒度に合わない" },
];

/**
 * 追跡下の `*.md` を LIVE / 休眠 / 無所属に分ける。
 *
 * 無所属が 1 件でもあれば検査は落ちる。新しい文書ディレクトリを作ったとき、
 * 「リンク検査の対象にするか、理由つきで外すか」を人が必ず決めることになる。
 */
export function classifyDocs(tracked, { live = LIVE_DOCS, dormant = DORMANT_DOCS } = {}) {
  const matches = (rel, entry) => (entry.endsWith("/") ? rel.startsWith(entry) : rel === entry);
  const unclassified = tracked.filter(
    (rel) =>
      !live.some((e) => matches(rel, e)) && !dormant.some((d) => matches(rel, d.prefix)),
  );
  return { unclassified };
}

/**
 * 「実在しないことが正しい」パス。
 *
 * 削除されたファイルへの言及が、決定の記録として正しい場合がある。
 * コードフェンスの除外では救えない（記法で区別できない）ため例外表を持つ。
 * **使われなくなったエントリは checkStaleExceptions が落とす。**
 */
export const MISSING_PATH_EXCEPTIONS = [
  {
    path: "docs/BACKLOG.md",
    reason: "docs/adr/0003 の決定により廃止済み。ADR 本文の言及は記録として正しい",
  },
  {
    path: "apps/timer-sync/.env",
    reason: "gitignore 対象。deploy/timer/NOTES.md は、この実 env を各自で作る手順を案内している",
  },
];

export function isLiveDoc(relPath) {
  return LIVE_DOCS.some((entry) =>
    entry.endsWith("/") ? relPath.startsWith(entry) : relPath === entry,
  );
}

/**
 * 定数が実在しないパスを指していないか検査する。
 *
 * 構造監査が存在しないパスを走査して全指標 0 で PASS した過去、および
 * .specify/feature.json が実在しないディレクトリを指してスクリプトを
 * 全滅させている現状と同型の事故を、最初から塞ぐ。
 */
export function checkConstants({ exists }) {
  const errors = [];
  for (const entry of LIVE_DOCS) {
    if (!exists(entry)) errors.push(`LIVE_DOCS が実在しないパスを指しています: ${entry}`);
  }
  for (const d of DORMANT_DOCS) {
    if (!exists(d.prefix)) {
      errors.push(`DORMANT_DOCS が実在しないパスを指しています: ${d.prefix}（${d.reason}）`);
    }
  }
  return errors;
}

/** 一度も検出を抑えなかった例外を報告する（腐った例外表を残さない）。 */
export function checkStaleExceptions(usedPaths) {
  return MISSING_PATH_EXCEPTIONS.filter((e) => !usedPaths.has(e.path)).map(
    (e) => `使われていない例外が残っています: ${e.path}（${e.reason}）`,
  );
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** git が知っているパスを NUL 区切りで取る。 */
function gitList(args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args, "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/**
 * 走査対象と存在判定は、**ファイルシステムではなく git の追跡対象**を見る。
 *
 * ファイルシステムを見ると、gitignore 対象のもの（`apps/timer-sync/.env`・`dist/`・
 * SDD の作業ディレクトリなど）が開発者の手元にはあり CI のフレッシュな checkout には
 * 無いため、**同じコミットでもローカルと CI で結果が食い違う**。PR-2 の初回 CI で
 * 実際に踏んだ（`deploy/timer/NOTES.md:104` の `apps/timer-sync/.env` がローカルでは
 * 緑・CI では赤）。git 基準なら両者が構造的に一致する。
 */
function trackedPaths() {
  const files = gitList(["ls-files"]);
  const set = new Set(files);
  // ディレクトリも「存在する」と答えられるように、各ファイルの親を末尾 "/" 付きで積む
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/") + "/");
  }
  return set;
}

function main() {
  const tracked = trackedPaths();
  const exists = (rel) => tracked.has(rel) || tracked.has(rel.endsWith("/") ? rel : `${rel}/`);
  const errors = checkConstants({ exists });

  // 全分割の検査は**追跡下**の .md に対して行う（#135 経路③）。
  const trackedDocs = gitList(["ls-files", "*.md"]).sort();
  for (const rel of classifyDocs(trackedDocs).unclassified) {
    errors.push(
      `LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: ${rel}` +
        "（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）",
    );
  }

  // 走査対象は**未追跡かつ gitignore 対象外**も含める（#135 経路⑧）。
  // 存在判定（trackedPaths）は広げない。広げるとローカル緑・CI 赤になる。
  const files = listRepoFiles(REPO_ROOT, ["*.md"]);
  // 0 件（空振り）の判定は共有モジュールへ寄せる（ADR-0014 決定 8・決定 10）。
  if (hasZeroScanTargets(files.length)) {
    errors.push("走査対象の .md が 1 件もありません（検査が空振りしています）");
  }

  const anchorCache = new Map();
  const anchorsFor = (abs) => {
    if (!anchorCache.has(abs)) {
      anchorCache.set(abs, fs.existsSync(abs) ? collectAnchors(fs.readFileSync(abs, "utf8")) : null);
    }
    return anchorCache.get(abs);
  };
  const usedExceptions = new Set();
  const exceptionPaths = new Set(MISSING_PATH_EXCEPTIONS.map((e) => e.path));

  for (const rel of files) {
    const abs = path.resolve(REPO_ROOT, rel);
    const src = fs.readFileSync(abs, "utf8");
    const dir = path.dirname(abs);

    for (const { target, line } of findRelativeLinks(src)) {
      const [filePart, hash] = target.split("#");
      const targetAbs = filePart ? path.resolve(dir, filePart) : abs;
      // 相対リンクの解決先も git 基準で見る（リポジトリ外を指すものは追跡集合に無い）
      if (filePart && !exists(path.relative(REPO_ROOT, targetAbs))) {
        errors.push(`${rel}:${line} 参照先がありません → ${target}`);
        continue;
      }
      if (!hash || !targetAbs.endsWith(".md")) continue;
      const anchors = anchorsFor(targetAbs);
      if (anchors && !anchors.has(decodeURIComponent(hash).toLowerCase())) {
        errors.push(`${rel}:${line} アンカーがありません → ${target}`);
      }
    }

    if (!isLiveDoc(rel)) continue;
    for (const { path: p, raw, line } of findInlineCodePaths(src)) {
      if (exceptionPaths.has(p)) {
        usedExceptions.add(p);
        continue;
      }
      if (!exists(p)) errors.push(`${rel}:${line} 実在しないパスです → \`${raw}\``);
    }
  }

  errors.push(...checkStaleExceptions(usedExceptions));

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} 件の問題があります（走査 ${files.length} ファイル）`);
    process.exitCode = 1;
    return;
  }
  console.log(`リンク検査 OK（走査 ${files.length} ファイル）`);
  console.log(`  走査対象: ${files.length} 件（うち追跡下 ${trackedDocs.length} 件）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
