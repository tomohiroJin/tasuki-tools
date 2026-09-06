#!/usr/bin/env node
/**
 * 文書のリンク検査（#70）。
 *
 *   node scripts/check-links.mjs
 *
 * 4 種を検査する。
 *   1. 相対リンク  [text](path)         全 *.md
 *                 （ネストした角括弧の外側・題名つきも含む。#156 ③④）
 *   2. アンカー    [text](path#anchor)  全 *.md
 *   3. コードパス  `packages/foo.ts`    LIVE_DOCS に属する文書のみ
 *                 （拡張子の無いディレクトリ参照・ADR 番号の接頭辞も含む。#156 ①）
 *   4. 行番号      `packages/foo.ts:70` LIVE_DOCS に属する文書のみ（#156 ②）
 *
 * **Markdown のコード領域（フェンス・インラインコード）はリンク検査の対象外。**
 * 検査手順を説明する文書が `[x](no-such-file.md)` のような例示を含むため、
 * ここを読むと「意図的に壊れたリンク」を実害として報告してしまう。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { listRepoFiles, findEmptyScanDimensions } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

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
const REPO_TOP_LEVEL = /^(packages|apps|scripts|docs|deploy|e2e|\.github)\//;

/**
 * バッククォートの中身がリポジトリ内のパス（ファイルまたはディレクトリ）に見えるか。
 *
 * **拡張子は要求しない**（#156 ①）。要求していたころは
 * `apps/poker-sync/src/application` のようなディレクトリ参照が丸ごと網から落ち、
 * 書いてあるのに一度も検査されなかった。拡張子で切るのをやめた代わりに、
 * ADR 番号の接頭辞参照（`docs/adr/0002`）だけを isAdrNumberRef で名指しし、
 * 別の解決規則（resolveAdrNumberRef）へ回す。
 */
export function isRepoPathLike(text) {
  if (!REPO_TOP_LEVEL.test(text)) return false;
  if (/\s/.test(text)) return false;
  // グロブ・変数展開・リダイレクト・メタ変数（`packages/<pkg>/src`）は
  // コマンド例・記法例なので対象外
  if (/[*?<>{}$|]/.test(text)) return false;
  return true;
}

/**
 * `docs/adr/0002` のような **ADR 番号の接頭辞参照**か。
 *
 * 拡張子を要求しなくなった以上、ディレクトリ参照とこの参照記法は記法だけでは
 * 区別できない。**「`adr/` の直下にある 4 桁数字で終わる」ものだけ**を接頭辞参照と定め、
 * それ以外はすべてファイルまたはディレクトリとしての実在を要求する。
 * 判定は無状態で、許可する形をこの 1 行が全部書いている。
 */
export function isAdrNumberRef(text) {
  return /(^|\/)adr\/\d{4}$/.test(text);
}

/**
 * ADR 番号の接頭辞が実在の ADR（`docs/adr/0002-….md`）へ解決できるか。
 *
 * **存在確認をしない割り切りではない。** 番号が飛べば赤になる。
 * ハイフンまで含めて前方一致させるのは、`0002` が `00021-…` に当たらないようにするため。
 */
export function resolveAdrNumberRef(text, paths) {
  const prefix = `${text}-`;
  for (const rel of paths) {
    if (rel.startsWith(prefix)) return true;
  }
  return false;
}

/** ファイル内容の行数（末尾の改行 1 個は行を増やさない）。 */
export function countLines(src) {
  if (src === "") return 0;
  return src.replace(/\n$/, "").split("\n").length;
}

/**
 * `path/to/file.ts:70` / `:5-6` を本体と行番号へ分ける。
 *
 * 従来は行番号を捨てるだけで、**その行が実在するかは一切見ていなかった**（#156 ②）。
 * 範囲のときは終端を返す（そこまで実在することを要求する）。
 */
export function parseLineRef(raw) {
  const m = raw.match(/:(\d+)(?:-(\d+))?$/);
  if (!m) return { path: raw, lineRef: null };
  return {
    path: raw.slice(0, m.index),
    lineRef: Math.max(Number(m[1]), Number(m[2] ?? m[1])),
  };
}

/**
 * コード領域の外にある相対リンクを、行番号つきで拾う。
 *
 * **ラベル側を一切見ない**（#156 ③④）。`\[[^\]]*\]` でラベルを噛ませていたころは
 * `[![alt](img.png)](link.md)` の内側の画像だけが一致し、外側の `link.md` を見逃した。
 * `](` を起点に括弧の中身だけを取れば、内側・外側の両方が別々に一致する
 * （ネストを数える状態を持たずに済む）。
 *
 * 括弧の中身は「最初の空白まで」が参照先で、その先は題名
 * （`[a](./a.md "title")`。空白を許さない文字クラスは一致すらしなかった）。
 * **賢い正規表現 1 本より、単純な規則 2 つの重ね掛けを選ぶ。**
 */
export function findRelativeLinks(src) {
  const found = [];
  stripCodeRegions(src).forEach((line, i) => {
    for (const m of line.matchAll(/\]\(([^)]*)\)/g)) {
      const target = m[1].trim().split(/\s+/)[0];
      if (!target) continue;
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
      found.push({ ...parseLineRef(raw), raw, line: i + 1 });
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
  "docs/constitution.md",
  "docs/poker/adr/",
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
  {
    prefix: "docs/timer/",
    reason:
      "epic #15 の改名前パス（packages/core・apps/sync・apps/web）を含む当時の記録。" +
      "ADR は追記のみで書き換えられないため LIVE にできない" +
      "（docs/timer/adr/ を LIVE にすると 15 件。docs/timer/ 全体なら 22 件。#72 E1 で実測）",
  },
  { prefix: "docs/poker/specs/", reason: "spec-kit 期の仕様・設計。当時の記述を保つのが正しい" },
  {
    prefix: "docs/poker/README.md",
    reason:
      "公開前の予定（公開 URL・未公開の注記）を書いた当時の記録。" +
      "poker の現役の規範は docs/poker/adr/ にあり、そちらは LIVE_DOCS に入れている",
  },
  { prefix: "docs/retrospectives/", reason: "振り返り。当時の記述を保つのが正しい" },
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
 *
 * `doc` を書くと**その文書の中でだけ**効く（書かなければ全文書に効く）。
 * `packages/core` のような「ありふれた誤りにもなり得る旧名」を全文書で免罪しないため。
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
  {
    doc: "docs/constitution.md",
    path: "packages/core",
    reason:
      "憲法 2.0.0 の Sync Impact Report が「原則 I の `packages/core` 限定を撤廃した」と" +
      "書くための旧名の引用。撤廃された名前なので実在しないことが正しい",
  },
  {
    doc: "docs/constitution.md",
    path: "apps/web",
    reason:
      "憲法 2.0.0 の Sync Impact Report が「原則 V の `apps/web` 限定を撤廃した」と" +
      "書くための旧名の引用。撤廃された名前なので実在しないことが正しい",
  },
  {
    doc: "docs/adr/0017-bounded-contexts-and-packages.md",
    path: "scripts/audit-dependency-direction.mjs",
    reason:
      "一時的。S1（#242）で scripts/audit-dependency-direction.mjs が実装されたら、checkStaleExceptions が「使われていない例外」として落とすため削除する",
  },
];

/**
 * 「行番号が実在しないことが正しい」`path:line` 参照。
 *
 * ADR は追記のみで書き換えない（`docs/adr/0002`）。当時の実測として書かれた行番号は、
 * その後のリファクタリングで実ファイルが縮んでも**そのままが正しい**。
 * **対象の記述が消えても、実ファイルが伸びて行番号が再び実在するようになっても、
 * この例外は「一度も赤を抑えなかった」ものとして checkStaleExceptions が落とす。**
 */
export const STALE_LINE_REF_EXCEPTIONS = [
  {
    doc: "docs/adr/0016-core-domain-representation.md",
    raw: "apps/poker-sync/src/server.ts:244",
    reason:
      "2026-08-17 実測時点の行番号。#165 のポート/アダプタ再編で server.ts が縮んだが、" +
      "ADR は追記のみで書き換えない",
  },
];

/** 文書とパスに一致する例外を返す（`doc` の無いものは全文書に効く）。 */
export function findMissingPathException(doc, target, entries = MISSING_PATH_EXCEPTIONS) {
  return entries.find((e) => e.path === target && (e.doc === undefined || e.doc === doc)) ?? null;
}

/** 文書と原文（行番号込み）が両方一致する例外を返す。 */
export function findLineRefException(doc, raw, entries = STALE_LINE_REF_EXCEPTIONS) {
  return entries.find((e) => e.doc === doc && e.raw === raw) ?? null;
}

/**
 * インラインコードのパス参照 1 件を判定し、`{ error }` か `{ exception }` か `{}` を返す。
 *
 * **main() の中に置かない。** 置いていたときは、ADR 番号の解決（`adrRef` を常に false へ）も
 * 行番号の比較（`lineRef <= total` を恒真へ）も潰したまま単体テスト 65 件が全緑だった。
 * 判定を関数へ出し、main は「呼んで結果を積む」だけにする。
 *
 * @param lineCount 対象パスの行数を返す。ファイルとして読めないときは null。
 */
export function checkCodePathRef(doc, ref, { exists, adrPaths, lineCount }) {
  const { path: target, raw, line, lineRef } = ref;
  // ① ADR 番号の接頭辞参照だけは、実在ではなく「その番号の ADR が在るか」で解決する
  const adrRef = isAdrNumberRef(target);
  if (!(adrRef ? resolveAdrNumberRef(target, adrPaths) : exists(target))) {
    const exception = findMissingPathException(doc, target);
    if (exception) return { exception };
    return {
      error: adrRef
        ? `${doc}:${line} 対応する ADR がありません → \`${raw}\``
        : `${doc}:${line} 実在しないパスです → \`${raw}\``,
    };
  }

  // ② 行番号は、対象がファイルとして読めるときだけ「その行まで在るか」を見る
  if (lineRef === null) return {};
  const total = lineCount(target);
  if (total === null || lineRef <= total) return {};
  const exception = findLineRefException(doc, raw);
  if (exception) return { exception };
  return { error: `${doc}:${line} 行番号が実在しません（対象は ${total} 行） → \`${raw}\`` };
}

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

/**
 * 一度も検出を抑えなかった例外を報告する（腐った例外表を残さない）。
 *
 * **鍵はパス文字列ではなくエントリそのもの**で、**「参照が現れたか」ではなく
 * 「実際に赤を 1 回でも抑えたか」で数える**。現れたかで数えると、対象が復活して
 * 例外が不要になったときに気づけない（この関数の説明文だけが正しく、
 * 実装が現れた回数を数えていた）。
 */
export function checkStaleExceptions(used, entries = MISSING_PATH_EXCEPTIONS) {
  return entries
    .filter((e) => !used.has(e))
    .map(
      (e) =>
        `使われていない例外が残っています: ${e.doc ? `${e.doc} の ` : ""}${e.raw ?? e.path}` +
        `（${e.reason}）`,
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
  return { files, set };
}

function main() {
  const { files: trackedFiles, set: tracked } = trackedPaths();
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

  // 0 件（空振り）の判定は共有モジュールへ寄せる（ADR-0014 決定 8。集約は #135 設計正本 D10）。
  //
  // **出力する走査量に内訳があるなら、内訳ごとに見る**（決定 8）。この検査は
  // 「走査対象 N 件（うち追跡下 M 件）」と 2 つ出しており、M が 0 になると
  // 上の全分割照合（決定 4・E3）が黙って空振りする — `classifyDocs([])` の
  // 無所属は空配列なので、LIVE_DOCS / DORMANT_DOCS を空にしても赤にならない。
  for (const label of findEmptyScanDimensions([
    { label: "走査対象の .md", count: files.length },
    { label: "追跡下の .md（全分割照合の対象）", count: trackedDocs.length },
  ])) {
    errors.push(`${label} が 1 件もありません（検査が空振りしています）`);
  }

  const anchorCache = new Map();
  const anchorsFor = (abs) => {
    if (!anchorCache.has(abs)) {
      anchorCache.set(abs, fs.existsSync(abs) ? collectAnchors(fs.readFileSync(abs, "utf8")) : null);
    }
    return anchorCache.get(abs);
  };
  // 例外の使用記録は 1 つの Set に集める（エントリそのものを鍵にするので混ざらない）。
  const usedExceptions = new Set();
  const lineCount = (rel) => {
    const abs = path.resolve(REPO_ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return countLines(fs.readFileSync(abs, "utf8"));
  };

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
    for (const ref of findInlineCodePaths(src)) {
      const { error, exception } = checkCodePathRef(rel, ref, {
        exists,
        adrPaths: trackedFiles,
        lineCount,
      });
      if (exception) usedExceptions.add(exception);
      if (error) errors.push(error);
    }
  }

  errors.push(...checkStaleExceptions(usedExceptions));
  errors.push(...checkStaleExceptions(usedExceptions, STALE_LINE_REF_EXCEPTIONS));

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} 件の問題があります（走査 ${files.length} ファイル）`);
    process.exitCode = 1;
    return;
  }
  console.log(`リンク検査 OK（走査 ${files.length} ファイル）`);
  console.log(`  走査対象: ${files.length} 件（うち追跡下 ${trackedDocs.length} 件）`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
