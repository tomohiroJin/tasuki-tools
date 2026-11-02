/**
 * `--changed` の基準（既定は `origin/main`）が、リモートの今の枝と同じかを確かめる（#508）。
 *
 * 基準の追跡ブランチが古いと、取り込み済みのコミットまで差分に入り、関係の無い変異まで選んで長く走る
 * （#491 の準備のセッションで、クラウドの clone の `origin/main` が約 10 コミット前を指していた）。
 * **知らせるだけで止めない。** fetch するかは人が決める（手元の追跡ブランチを勝手に動かさない）。
 *
 * git は引数で受け取る（`git(args) => stdout`。失敗なら投げる）。テストは偽の git を渡す。
 */

const short = (sha) => sha.slice(0, 8);
const firstLine = (text) => String(text).trim().split("\n")[0];

/**
 * @param {string} base - `--changed` の基準（`origin/main`・`HEAD`・コミットなど）
 * @param {(args: string[]) => string} git
 * @returns {{ state: "fresh" | "stale" | "unknown", message: string } | null}
 *   リモートの追跡ブランチでない基準（`HEAD`・コミット・手元の枝）は見ないので null
 */
export function checkBaseFreshness(base, git) {
  const m = /^([^/\s]+)\/(\S+)$/.exec(base);
  if (!m) return null;
  const [, remote, branch] = m;
  let local;
  try {
    const remotes = git(["remote"]).split("\n").map((s) => s.trim());
    if (!remotes.includes(remote)) return null;
    local = git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).trim();
  } catch {
    return null; // 基準が無いことは呼び出し側（差分が取れない → 全件）が扱う
  }
  let remoteSha;
  try {
    remoteSha = git(["ls-remote", remote, `refs/heads/${branch}`]).trim().split(/\s+/)[0] ?? "";
  } catch (error) {
    return {
      state: "unknown",
      message:
        `基準 ${base} がリモートと同じか確かめられませんでした（git ls-remote ${remote}: ${firstLine(error.message)}）。` +
        `古いかもしれないときは git fetch ${remote} を流してください`,
    };
  }
  if (remoteSha === "") {
    return { state: "unknown", message: `リモート ${remote} に枝 ${branch} が見つからず、基準 ${base} が古いか確かめられませんでした` };
  }
  if (remoteSha === local) return { state: "fresh", message: `基準 ${base} はリモートと同じです（${short(local)}）` };
  return {
    state: "stale",
    message:
      `⚠ 基準 ${base}（${short(local)}）が、リモートの ${branch}（${short(remoteSha)}）と違います。` +
      `取り込み済みのコミットの変異まで選んで長く走ることがあります。git fetch ${remote} で更新してから流してください`,
  };
}
