/**
 * 前のタグから HEAD までのコミットを、配る順を決める材料として並べる判定（#675）。
 *
 * 入口は `scripts/changes-since.mjs`（`pnpm changes:since <前のタグ>`）。ここは `git log` の出力を読む純粋関数だけを置く。
 *
 * ## 何を出すか
 *
 * コミット（main では PR の squash が 1 つ）ごとに、次に触れたかを印にする。
 *
 * - **wire**: `packages/<名前>-core/src/` の下（境界のスキーマと、コマンド・フレームの picklist がここにある）
 * - **同期サーバー**: `apps/tasuki-sync/src/` の下
 * - **deploy/**: 文書（`.md`）だけか、それ以外（スクリプト・Caddy 断片・`app.env`・テンプレート）か
 *
 * ## 何を決めないか — **順は人が決める**
 *
 * 印は「読むべき PR」を漏らさないための一覧で、配る順そのものは出さない。
 *
 * - `packages/<名前>-core/src/` に触れても、wire が変わったとは限らない（内部の整理だけのことがある）。
 *   逆に、ここに触れずに wire の意味が変わることもある（同期サーバーの受け方だけを変える PR）。**各 PR 本文の「配布の注意」を読む**
 * - PR 本文は読まない（GitHub への取得が要る。番号を出すので、人が読む）
 * - 画面だけの変更に印は付かない（静的アプリは順を選ばない。印が無いコミットも一覧には出す）
 *
 * 設計方針: 純粋関数だけを置く。追加依存は禁止。
 */

/**
 * `git log` に渡す引数（範囲は入口が後ろに足す）。
 * 改名を追わない（消えた側のパスも出す）・main の一本道だけ・古い順。コミットの頭は `\x01<ハッシュ>\x00<題>`。
 */
export const LOG_ARGS = Object.freeze(["log", "--no-renames", "--first-parent", "--reverse", "--format=%x01%H%x00%s", "--name-only"]);

/**
 * `git log`（{@link LOG_ARGS}）の出力を読む。形が違えば、0 件にせず投げる。
 * @returns {{ sha: string, subject: string, files: string[] }[]}
 */
export function parseLog(raw) {
  if (raw.trim() === "") return [];
  if (!raw.startsWith("\x01")) throw new Error("git log の出力が想定の形ではありません（コミットの区切りで始まらない）");
  return raw
    .split("\x01")
    .slice(1)
    .map((chunk) => {
      const [head, ...rest] = chunk.split("\n");
      const at = head.indexOf("\x00");
      const sha = at === -1 ? "" : head.slice(0, at);
      if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`git log の出力が想定の形ではありません（ハッシュを読めない: ${head.slice(0, 60)}）`);
      return { sha, subject: head.slice(at + 1), files: rest.filter((line) => line !== "") };
    });
}

const WIRE_PATH = /^packages\/([a-z0-9-]+-core)\/src\//;
const SYNC_PATH = /^apps\/tasuki-sync\/src\//;

/**
 * コミット 1 つに印を付ける。
 * @param {{ sha: string, subject: string, files: string[] }} commit
 */
export function classifyCommit({ sha, subject, files }) {
  // squash の題は「<題> (#<PR 番号>)」。題の中の #番号（ISSUE）は PR ではないので、末尾だけを見る
  const pr = /\(#(\d+)\)\s*$/.exec(subject);
  const wire = [...new Set(files.map((f) => WIRE_PATH.exec(f)?.[1]).filter((name) => name !== undefined))].sort();
  const inDeploy = files.filter((f) => f.startsWith("deploy/"));
  return {
    sha,
    subject: subject.trim(),
    pr: pr ? Number(pr[1]) : null,
    wire,
    sync: files.some((f) => SYNC_PATH.test(f)),
    deploy: { docs: inDeploy.filter((f) => f.endsWith(".md")), other: inDeploy.filter((f) => !f.endsWith(".md")) },
  };
}

/** 種類ごとに、触れたコミットを集める。 */
export function summarize(commits) {
  return {
    total: commits.length,
    wire: commits.filter((c) => c.wire.length > 0),
    sync: commits.filter((c) => c.sync),
    deployOther: commits.filter((c) => c.deploy.other.length > 0),
    deployDocs: commits.filter((c) => c.deploy.other.length === 0 && c.deploy.docs.length > 0),
    unnumbered: commits.filter((c) => c.pr === null),
  };
}

const short = (sha) => sha.slice(0, 7);
const label = (c) => (c.pr === null ? "番号なし" : `#${c.pr}`);
const refs = (commits) => (commits.length === 0 ? "なし" : commits.map((c) => (c.pr === null ? short(c.sha) : `#${c.pr}`)).join(" "));

function marks(c) {
  const out = [];
  if (c.wire.length > 0) out.push(`[wire: ${c.wire.join(", ")}]`);
  if (c.sync) out.push("[同期サーバー]");
  if (c.deploy.other.length > 0) out.push(`[deploy（文書以外）: ${c.deploy.other.join(", ")}]`);
  else if (c.deploy.docs.length > 0) out.push("[deploy（文書だけ）]");
  return out.join(" ");
}

/** 一覧とまとめを、行ごとの文章にする。 */
export function formatChanges(commits) {
  const s = summarize(commits);
  if (s.total === 0) return "コミットは 0 件です（前のタグと HEAD が同じか、HEAD の方が古い）";
  const width = Math.max(...commits.map((c) => label(c).length));
  const lines = commits.map((c) => `  ${label(c).padEnd(width)}  ${short(c.sha)}  ${c.subject}${marks(c) === "" ? "" : `  ${marks(c)}`}`);
  lines.push(
    "",
    `まとめ（${s.total} 件。印の付いた PR の本文の「配布の注意」を読む。順は人が決める）`,
    `  wire（packages/*-core/src）に触れた: ${refs(s.wire)}`,
    `  同期サーバー（apps/tasuki-sync/src）に触れた: ${refs(s.sync)}`,
    `  deploy/ の文書以外に触れた（root の作業がありうる）: ${refs(s.deployOther)}`,
    `  deploy/ の文書だけに触れた: ${refs(s.deployDocs)}`,
    `  番号を取れなかったコミット: ${s.unnumbered.length} 件${s.unnumbered.length === 0 ? "" : `（${s.unnumbered.map((c) => short(c.sha)).join(" ")}）`}`,
  );
  return lines.join("\n");
}
