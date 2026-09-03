#!/usr/bin/env node
/**
 * `pnpm install` を包み、**供給網ポリシーの検証が実際に走ったこと**を確かめる
 * （#154・#135 経路⑫）。
 *
 * ## なぜ要るか
 *
 * `minimumReleaseAge` と `trustPolicy` は lockfile の各エントリへ毎回再適用される、
 * という前提の上に `docs/adr/0008` と `docs/adr/0010` が立っている。ところが
 * **その検証は 2 段の短絡で、無警告のまま走らなくなる**（設計正本 §3.2 の実測）。
 *
 * 1. `optimisticRepeatInstall`（既定 **有効**）。`checkDepsStatus` が最新と判定すると
 *    `Already up to date` を出して return する。これは検証器が作られるより手前なので、
 *    **検証キャッシュを消しても走らない**。
 * 2. `~/.cache/pnpm/lockfile-verified.jsonl`。lockfile のハッシュ＋ポリシーを鍵に
 *    検証結果を保持し、鍵が変わらないと検証段を飛ばす。
 *
 * CI は新規チェックアウトなので 1 段目が成立せず、現在は毎回検証が走っている
 * （main の run 33697032958 で確認）。**問題は、それを確かめている主体がいないこと**である。
 * `node_modules` を CI キャッシュへ載せる・`--trust-lockfile` が紛れ込む
 * （`docs/adr/0008` の MUST NOT）・pnpm の既定が変わる、のいずれでも
 * **CI は緑のまま検証をやめる**。
 *
 * ## どう見るか
 *
 * **CI が実際に走らせる install そのものを包む。** 検査が自前で
 * `--config.optimistic-repeat-install=false` 付きの install を走らせる形も採れるが、
 * それが確かめるのは合成した経路であって、CI が現に通る経路ではない
 * （設計正本 D5）。したがって {@link INSTALL_ARGS} に短絡を無効化するフラグを**入れない**。
 *
 * 手元で `node_modules` が温まった状態で走らせると落ちるが、それは
 * 「このインストールでは検証が走らなかった」という**正しい報告**である。
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 */
import { spawn } from "node:child_process";
import { isDirectRun } from "./lib/direct-run.mjs";

/**
 * 包む対象。**CI の install と同じ形にする。**
 *
 * 短絡を無効化するフラグ（`--config.optimistic-repeat-install=false`）も、
 * 検証段ごと飛ばすフラグ（`--trust-lockfile`）も入れない。前者を入れると
 * 実経路ではなく合成した経路を判定することになり、後者は `docs/adr/0008` の MUST NOT。
 */
export const INSTALL_ARGS = ["install", "--frozen-lockfile"];

/**
 * 検証が通った証跡を探す。
 *
 * pnpm 11.5.0 が出す行は `✓ Lockfile passes supply-chain policies (445 entries in 8.3s)`。
 * `✓` には色が付くので、記号ではなく**文言と件数**で見る。
 *
 * **「検証を始めた」行（`? Verifying lockfile against supply-chain policies (N entries)...`）を
 * 証跡にしてはならない。** 始めて落ちた・途中で切れた出力まで緑にしてしまう。
 * そのため `passes` と `entries in` の両方を要求する。
 */
export function findVerificationEvidence(output) {
  const m = /Lockfile[^\n]* passes supply-chain policies \((\d+) entries in /.exec(output ?? "");
  return m ? { verified: true, entries: Number(m[1]) } : { verified: false, entries: null };
}

/** 検証が走らなかったときに出す説明。**2 段ある短絡の両方を名指しする。** */
export function formatMissingVerification() {
  return [
    "[install-with-supply-chain-check] 供給網ポリシーの検証が走っていません",
    "  pnpm install は成功しましたが、`Lockfile passes supply-chain policies` の行が出ていません。",
    "  minimumReleaseAge と trustPolicy はこの検証で lockfile の各エントリへ再適用されます",
    "  （docs/adr/0008 / docs/adr/0010）。走らなければ、その防御は無いのと同じです。",
    "",
    "  短絡は 2 段あります:",
    "    1. optimisticRepeatInstall（既定で有効）。node_modules が最新なら",
    "       `Already up to date` を出して検証器を作る前に return します。",
    "       **検証キャッシュを消しても走りません。** 手元で強制するには",
    "       `--config.optimistic-repeat-install=false` を付けてください。",
    "    2. ~/.cache/pnpm/lockfile-verified.jsonl。lockfile のハッシュ＋ポリシーが",
    "       前回と同じなら検証段を飛ばします。1 を無効化しても飛ぶ場合はこれを消してください。",
    "",
    "  CI でこれが出た場合は、node_modules をキャッシュから復元していないか、",
    "  --trust-lockfile が紛れ込んでいないかを見てください（docs/adr/0008 の MUST NOT）。",
  ].join("\n");
}

/**
 * 終了コードを決める。
 *
 * **install 自体の失敗を検証の失敗にすり替えない。** pnpm が既に理由を出しているので、
 * その終了コードをそのまま返す。シグナルで死んだとき（`status === null`）も落とす。
 */
export function decideOutcome({ status, evidence }) {
  if (status === null) {
    return { code: 1, message: "[install-with-supply-chain-check] pnpm install が異常終了しました" };
  }
  if (status !== 0) return { code: status, message: null };
  if (!evidence.verified || evidence.entries === 0) {
    return { code: 1, message: formatMissingVerification() };
  }
  return { code: 0, message: null };
}

function main() {
  // 呼び出し側が足したフラグはそのまま渡す（CI の形を YAML 側で変えられるようにする）。
  const args = [...INSTALL_ARGS, ...process.argv.slice(2)];
  const child = spawn("pnpm", args, { stdio: ["inherit", "pipe", "pipe"] });

  // **出力はそのまま流しつつ溜める。** 溜めるだけにすると、長いインストールの間
  // CI のログが無音になり、固まったのか進んでいるのか分からなくなる。
  let output = "";
  for (const [stream, sink] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output += chunk;
      sink.write(chunk);
    });
  }

  child.on("error", (error) => {
    console.error(`[install-with-supply-chain-check] pnpm を起動できません: ${error.message}`);
    process.exit(1);
  });

  child.on("close", (status) => {
    const evidence = findVerificationEvidence(output);
    const outcome = decideOutcome({ status, evidence });
    if (outcome.message) console.error(outcome.message);
    if (outcome.code === 0) {
      console.log(
        `[install-with-supply-chain-check] 供給網ポリシーの検証を確認しました（${evidence.entries} entries）`,
      );
    }
    process.exit(outcome.code);
  });
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
