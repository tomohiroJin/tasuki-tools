import path from "node:path";
import { partitionMutations } from "./mutation-partition.mjs";

/**
 * 変異検査の「選んで流す」指定（#387・設計正本 `docs/superpowers/specs/2026-10-14-test-weight-design.md` §4）。
 *
 * 判定は純粋関数で、git にも fs にも触らない。材料（差分のファイル一覧・パッチが触るファイル）は
 * 呼び出し側（`scripts/mutation-check.mjs`）が集めて渡す。
 *
 * **`--changed` / `--id` / `--pkg` は手元の実装中のための仕組みであり、CI は全件のまま流す。** 選び漏れは CI の全件が拾う。
 * そのため選び方は「迷ったら多めに」へ倒し、同じパッケージの中だけを見る（パッケージ間の依存はたどらない）。
 *
 * **`--shard k/n` は CI のための仕組みで、絞り込みではない**（#481・設計正本
 * `docs/superpowers/specs/2026-10-31-ci-wait-design.md` §4.1）。全件を n 個に分けた k 番目を流す。
 * n 個のシャードを合わせると全件になる（分け方は `scripts/lib/mutation-partition.mjs`）。
 */

/** 選び方の指定。1 回に 1 つだけ使える。 */
const SELECTOR_FLAGS = ["--changed", "--id", "--pkg", "--shard"];
/** 値を取るが選び方ではない指定。`--jobs` の値の解釈は `scripts/lib/mutation-parallel.mjs` の parseJobs。 */
const KNOWN_FLAGS = new Set(["--full", "--base", "--jobs", ...SELECTOR_FLAGS]);

/**
 * 引数（`process.argv.slice(2)`）から選び方を組む。
 *
 * **知らない引数はエラーにする。** 以前の `main()` は `--full` 以外を黙って無視したので、
 * `--help` や打ち間違いで全件（CI で約 9 分）が走った。
 */
export function parseSelector(args) {
  const found = [];
  let base = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!KNOWN_FLAGS.has(arg)) {
      throw new Error(`未知の指定です: ${arg}（使えるのは ${[...KNOWN_FLAGS].join(" / ")}）`);
    }
    if (arg === "--full") continue;
    if (arg === "--changed") {
      found.push({ kind: "changed" });
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} には値が要ります`);
    i++;
    if (arg === "--base") {
      base = value;
    } else if (arg === "--jobs") {
      continue;
    } else if (arg === "--shard") {
      found.push(parseShard(value));
    } else if (arg === "--id") {
      const parts = value.split(",");
      if (!parts.every((p) => /^[1-9]\d*$/.test(p))) {
        throw new Error(`--id は正の整数をカンマで区切って書きます: ${value}`);
      }
      found.push({ kind: "id", ids: parts.map(Number) });
    } else {
      const pkg = value.replace(/\/+$/, "");
      if (pkg === "") throw new Error(`--pkg の値が空です: ${value}`);
      found.push({ kind: "pkg", pkg });
    }
  }
  if (found.length > 1) {
    throw new Error(`選び方の指定（${SELECTOR_FLAGS.join(" / ")}）は 1 回に 1 つだけです`);
  }
  const selector = found[0] ?? { kind: "all" };
  if (selector.kind === "changed") return { kind: "changed", base: base ?? "origin/main", baseExplicit: base !== null };
  if (base !== null) throw new Error("--base は --changed と一緒にだけ使えます");
  return selector;
}

/** `--shard` の値 `k/n` を読む。`1 ≤ k ≤ n` の正の整数でなければエラー（打ち間違いで 0 件の緑にしない）。 */
function parseShard(value) {
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  const index = m ? Number(m[1]) : NaN;
  const total = m ? Number(m[2]) : NaN;
  if (!m || index > total) {
    throw new Error(`--shard は k/n（1 ≤ k ≤ n の正の整数）で書きます: ${value}`);
  }
  return { kind: "shard", index, total };
}

/**
 * 変異を選ぶ。`resolved` は {@link parseSelector} の結果に、`--changed` のときだけ材料を足したもの。
 * 返す順は宣言（`mutations`）の順。
 */
export function selectMutations(mutations, resolved) {
  const pick = (list, reasons) => list.map((mutation) => ({ mutation, reasons }));
  switch (resolved.kind) {
    case "all":
      return { selected: pick(mutations, []), fallbackToAll: null };
    case "id": {
      const known = new Set(mutations.map((m) => m.id));
      const unknown = resolved.ids.filter((id) => !known.has(id));
      if (unknown.length > 0) throw new Error(`宣言に無い変異の番号です: ${unknown.join(", ")}`);
      const wanted = new Set(resolved.ids);
      return { selected: pick(mutations.filter((m) => wanted.has(m.id)), ["--id"]), fallbackToAll: null };
    }
    case "pkg": {
      const hits = mutations.filter((m) => m.pkg === resolved.pkg);
      if (hits.length === 0) {
        throw new Error(`--pkg ${resolved.pkg} に属する変異はありません（宣言の pkg と完全一致で比べます）`);
      }
      return { selected: pick(hits, ["--pkg"]), fallbackToAll: null };
    }
    case "changed":
      return selectByChange(mutations, resolved);
    case "shard": {
      const part = partitionMutations(mutations, resolved.total, resolved.weightOf)[resolved.index - 1];
      return { selected: pick(part, [`--shard ${resolved.index}/${resolved.total}`]), fallbackToAll: null };
    }
    default:
      throw new Error(`未対応の選び方です: ${resolved.kind}`);
  }
}

/**
 * `--changed` の選び方（設計正本 §4.2）。次のどれかに当たる変異を選ぶ。
 *
 * 1. 差分に、その変異の `pkg` 配下のファイルがある（パッケージ単位で多めに選ぶ）
 * 2. 差分に、そのパッチが触るファイルがある（`pkg` の外を変異させる場合）
 * 3. 差分に、そのパッチのファイル自体がある
 *
 * 条件 1 から `${patchDir}/` 配下は外す。`pkg` が `scripts` の変異は、無関係なパッチの変更でも
 * `scripts/` 配下に当たって全部選ばれてしまうため（パッチの変更は条件 3 が扱う）。
 *
 * **全件に倒す**: 差分が取れない（`changedFiles === null`）か、変異検査の機構が差分にあるか、
 * リポジトリのルート直下の `.md` 以外のファイル（lockfile・`package.json`・`tsconfig.base.json` など、
 * 全パッケージのテストに効く共通設定）が差分にあるとき。
 * 迷ったら多く流す（`scripts/ci-scope.mjs` と同じ fail-open の向き）。
 */
function selectByChange(mutations, { changedFiles, mechanismFiles, patchDir, affectedFilesOf }) {
  const all = (reason) => ({
    selected: mutations.map((mutation) => ({ mutation, reasons: [reason] })),
    fallbackToAll: reason,
  });
  if (changedFiles === null) return all("差分が取れない");
  const changed = new Set(changedFiles);
  const touchedMechanism = mechanismFiles.filter((f) => changed.has(f));
  if (touchedMechanism.length > 0) return all(`変異検査の機構が変わった（${touchedMechanism.join(", ")}）`);
  const rootConfigs = changedFiles.filter((f) => !f.includes("/") && !f.endsWith(".md"));
  if (rootConfigs.length > 0) return all(`ルートの共通設定が変わった（${rootConfigs.join(", ")}）`);

  const selected = [];
  for (const mutation of mutations) {
    const reasons = [];
    // `${pkg}/` で比べる。`apps/a` が `apps/a-x` に前方一致で当たらないように。パッチの置き場は除く
    if (changedFiles.some((f) => f.startsWith(`${mutation.pkg}/`) && !f.startsWith(`${patchDir}/`))) reasons.push(`pkg 配下の変更（${mutation.pkg}）`);
    if (affectedFilesOf(mutation).some((f) => changed.has(f))) reasons.push("パッチが触るファイルの変更");
    if (changed.has(`${patchDir}/${mutation.patch}`)) reasons.push("パッチ自体の変更");
    if (reasons.length > 0) selected.push({ mutation, reasons });
  }
  return { selected, fallbackToAll: null };
}

/**
 * 変異検査の機構のファイル（自分自身と、その相対 import）を、ソースから導く。
 * 一覧をコードに列挙しない —— 列挙は import を足したときに腐る。
 *
 * 副作用 import（`import "./x.mjs"`）と動的 import は拾わない。機構に足すときは from 形で書く。
 *
 * **`readSource` を渡すと再帰にたどる**（#481 で lib が lib を import するようになった。
 * `mutation-select.mjs` と `mutation-parallel.mjs` が `mutation-partition.mjs` を読む）。
 * 渡さなければ 1 段だけ。同じファイルは 1 回だけ数え、見つけた順に並べる。
 *
 * @param {(relPath: string) => string} [readSource] - リポジトリのルートからの相対パスを受け取り、中身を返す
 */
export function mechanismFilesFrom(source, selfRelPath, readSource = null) {
  const files = [selfRelPath];
  const visit = (text, relPath) => {
    const dir = path.posix.dirname(relPath);
    for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const dep = path.posix.join(dir, m[1]);
      if (files.includes(dep)) continue;
      files.push(dep);
      if (readSource !== null) visit(readSource(dep), dep);
    }
  };
  visit(source, selfRelPath);
  return files;
}

/** 結果の表題。**全件の緑と絞り込みの緑を取り違えない**ために、絞り込みは必ずそう書く。 */
export function formatSelectionHeader(selector, { selected, fallbackToAll }, total) {
  if (selector.kind === "all") return `全件実行: ${total} 件`;
  if (selector.kind === "shard") {
    return `分割実行（--shard ${selector.index}/${selector.total}）: ${total} 件中 ${selected.length} 件`;
  }
  const label =
    selector.kind === "changed"
      ? `--changed・基準 ${selector.base}`
      : selector.kind === "pkg"
        ? `--pkg ${selector.pkg}`
        : `--id ${selector.ids.join(",")}`;
  if (fallbackToAll !== null) return `絞り込み実行（${label}）: 全件に倒しました —— ${fallbackToAll}（${total} 件）`;
  return `絞り込み実行（${label}）: ${total} 件中 ${selected.length} 件`;
}

/**
 * 緑で終わるときの最後の 1 行。**全件の緑と、分けた・絞った緑を取り違えない**ように言い分ける。
 */
export function successMessage(selector, fallbackToAll, count) {
  if (selector.kind === "all" || fallbackToAll !== null) return "全変異が検出されました（ベースラインとして妥当）。";
  if (selector.kind === "shard") {
    return (
      `シャード ${selector.index}/${selector.total} の ${count} 件の変異がすべて検出されました` +
      `（全件ではありません。全件は ${selector.total} 個のシャードの合計です）。`
    );
  }
  return `選んだ ${count} 件の変異がすべて検出されました（全件ではありません。全件は CI が流します）。`;
}
