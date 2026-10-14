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
  if (selector.kind === "changed") return { kind: "changed", base: base ?? "origin/main" };
  if (base !== null) throw new Error("--base は --changed と一緒にだけ使えます");
  return selector;
}
