import path from "node:path";

/**
 * 変異検査の「選んで流す」指定（#387・設計正本 `docs/superpowers/specs/2026-10-14-test-weight-design.md` §4）。
 *
 * 判定は純粋関数で、git にも fs にも触らない。材料（差分のファイル一覧・パッチが触るファイル）は
 * 呼び出し側（`scripts/mutation-check.mjs`）が集めて渡す。
 *
 * **手元の実装中のための仕組みであり、CI は全件のまま流す。** 選び漏れは CI の全件が拾う。
 * そのため選び方は「迷ったら多めに」へ倒し、同じパッケージの中だけを見る（パッケージ間の依存はたどらない）。
 */

/** 選び方の指定。1 回に 1 つだけ使える。 */
const SELECTOR_FLAGS = ["--changed", "--id", "--pkg"];
const KNOWN_FLAGS = new Set(["--full", "--base", ...SELECTOR_FLAGS]);

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
 * **たどるのは 1 段だけ。** いま `scripts/lib/*.mjs` は Node 標準以外を import していない。
 * lib が別の lib を import するようになったら、ここを再帰にする。
 */
export function mechanismFilesFrom(source, selfRelPath) {
  const dir = path.posix.dirname(selfRelPath);
  const files = [selfRelPath];
  for (const m of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    files.push(path.posix.join(dir, m[1]));
  }
  return files;
}

/** 結果の表題。**全件の緑と絞り込みの緑を取り違えない**ために、絞り込みは必ずそう書く。 */
export function formatSelectionHeader(selector, { selected, fallbackToAll }, total) {
  if (selector.kind === "all") return `全件実行: ${total} 件`;
  const label =
    selector.kind === "changed"
      ? `--changed・基準 ${selector.base}`
      : selector.kind === "pkg"
        ? `--pkg ${selector.pkg}`
        : `--id ${selector.ids.join(",")}`;
  if (fallbackToAll !== null) return `絞り込み実行（${label}）: 全件に倒しました —— ${fallbackToAll}（${total} 件）`;
  return `絞り込み実行（${label}）: ${total} 件中 ${selected.length} 件`;
}
