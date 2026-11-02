/**
 * 手元の検査（`scripts/local-check.mjs`）の赤を、「失敗」と「未実行」に分ける（#508）。
 *
 * 高負荷の手元では、vitest がテストのワーカーを起動できずに
 * `[vitest-pool]: Failed to start forks worker for test files … Timeout waiting for worker to respond`
 * を出し、そのファイルを 1 件も走らせないまま exit 1 になる。テストの失敗ではないのに、結果の一覧では
 * 失敗と区別できなかった（#491 の振り返りの罠 6）。
 *
 * **未実行と言うのは、赤の理由が起動の失敗だけと読めたときに限る。** 本物の失敗の印が 1 つでもあれば失敗のまま。
 * 読み違えても未実行は緑にならない（終了コードは失敗と同じ非ゼロ）。迷ったら失敗へ倒す。
 *
 * 判定は純粋関数で、出力の文字列だけを見る。
 */

const ANSI = /\u001b\[[0-9;]*m/g;
const START_FAILURE = /\[vitest-pool\]: Failed to start \S+ worker for test files (.+?)\.?$/;
/** vitest の「捕まえた未処理のエラー」の数。起動の失敗もここに数えられる。 */
const UNHANDLED_COUNT = /Vitest caught (\d+) unhandled errors?/;
/**
 * 本物の失敗の印（vitest・bun test・node --test・型検査）。
 * 起動の失敗だけのときは、vitest はファイルの行も `Tests N failed` も出さない（2026-11-02 に turbo 越しで実測）。
 */
const REAL_FAILURE = [
  /^\s*FAIL\s/,
  /^\s*×\s/,
  /\b(?:Test Files|Tests)\s+\d+ failed\b/,
  /^\s*\(fail\)\s/,
  /^not ok\b/,
  /^# fail [1-9]/,
  /\berror TS\d+:/,
];
/** turbo の行の頭（`@tasuki/sync-client:test: `）。 */
const TURBO_PREFIX = /^(\S+?):([\w:-]+): ?(.*)$/;
/** turbo の最後の要約の、失敗したタスクの行（`Failed:    @tasuki/a#test, @tasuki/b#test`）。 */
const TURBO_FAILED = /^\s*Failed:\s+(.+)$/;

/** 1 つのまとまり（turbo のタスク 1 つ、または出力全体）を見る。 */
function inspectBlock(lines) {
  const files = [];
  let unhandled = 0;
  let real = false;
  for (const line of lines) {
    const start = START_FAILURE.exec(line);
    if (start && !files.includes(start[1])) files.push(start[1]);
    const count = UNHANDLED_COUNT.exec(line);
    if (count) unhandled += Number(count[1]);
    if (REAL_FAILURE.some((re) => re.test(line))) real = true;
  }
  // 起動の失敗より多い未処理のエラーは、テストが投げた本物のエラーとして扱う
  const onlyStartFailures = files.length > 0 && !real && unhandled <= files.length;
  return { files, onlyStartFailures };
}

/**
 * 失敗した検査の出力を分類する。
 *
 * - turbo の要約（`Failed:`）があれば、失敗したタスクごとに見る。**すべて**が起動の失敗だけなら未実行
 * - 要約が無ければ（vitest を直に流した等）、出力全体を 1 つのまとまりとして見る
 *
 * @param {string} output - 検査の標準出力と標準エラーをまとめたもの
 * @returns {{ kind: "not-run" | "failed", notStarted: { task: string | null, files: string[] }[] }}
 *   `notStarted` は、起動しなかったファイルを持つまとまり（失敗のときも、見つけたものは返す）
 */
export function classifyFailure(output) {
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  const failedLine = lines.map((l) => TURBO_FAILED.exec(l)).find(Boolean);
  let blocks;
  if (failedLine) {
    const tasks = failedLine[1].split(",").map((s) => s.trim()).filter(Boolean);
    blocks = tasks.map((task) => {
      const [pkg, name] = task.split("#");
      const own = lines
        .map((l) => TURBO_PREFIX.exec(l))
        .filter((m) => m && m[1] === pkg && m[2] === name)
        .map((m) => m[3]);
      return { task, ...inspectBlock(own) };
    });
  } else {
    blocks = [{ task: null, ...inspectBlock(lines) }];
  }
  const notStarted = blocks.filter((b) => b.files.length > 0).map(({ task, files }) => ({ task, files }));
  const kind = blocks.length > 0 && blocks.every((b) => b.onlyStartFailures) ? "not-run" : "failed";
  return { kind, notStarted };
}
