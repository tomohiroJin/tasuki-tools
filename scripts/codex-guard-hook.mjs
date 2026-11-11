#!/usr/bin/env node
/**
 * Codex の PreToolUse フック（#578・docs/adr/0032 の追記）。`.codex/hooks.json` から呼ばれる。
 *
 * 判定は Claude Code と同じ `scripts/lib/agent-guard.mjs` の `findGuardedCommands`（本番デプロイに当たるか）で、写さない。`decideHookOutput` は使わない（PR #583 のあと、サブエージェントの判定も返すため。`scripts/lib/codex-guard.mjs`）。
 * 違うのは返す値だけ。Codex は `permissionDecision: "ask"` を扱わず、フックの失敗として**コマンドをそのまま走らせる**
 * （codex-cli 0.154.0 の実測）ので、当たったら `deny` に換えて返す。入力が読めないときも `deny`（Claude Code 側は ask に倒す）。
 *
 * 範囲は**本番デプロイだけ**。`gh pr create` の先行 PR の確認ほか、Claude Code の入口が持つ ask の判定は配線しない
 * （ask が使えず、deny にすると日常の作業を止めるため。docs/adr/0032 の追記）。
 *
 * 常に exit 0 で終わる（止めるのは標準出力の JSON。exit 2 でも止まるが、理由を返せる JSON に揃える）。
 * この入口の前後は `.codex/hooks.json` のコマンド（`scripts/lib/codex-guard.mjs` の `CODEX_HOOK_COMMAND`）が受け持つ:
 * Git のルートが引けなければ `ROOT_FAILURE_OUTPUT`（deny）、入口が通常のファイルとして無いときは `.codex/hooks.json` が在れば
 * `ENTRY_MISSING_OUTPUT`（deny）・無ければ何も出さない（歯止めの無い版）、入口が起動に失敗したら `LAUNCH_FAILURE_OUTPUT`（deny）。
 */
import fs from "node:fs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { CODEX_NOTE, deny, productionDenyReason } from "./lib/codex-guard.mjs";

/**
 * Codex の PreToolUse フックの入力から、返す JSON を決める。当たらなければ `null`。
 * 判定が想定外に投げたときも deny に倒す（黙って通さない）。
 * @param {string} raw 標準入力の中身
 * @param {(raw: string) => string | null} [decide] 判定（テストで差し替える）
 * @returns {object | null}
 */
export function decideCodexHookOutput(raw, decide = productionDenyReason) {
  let reason;
  try {
    reason = decide(raw);
  } catch {
    return deny(`判定が失敗したため、念のため拒みます。${CODEX_NOTE}`);
  }
  if (reason === null) return null;
  return deny(`${reason}\n${CODEX_NOTE}`);
}

function main() {
  try {
    let raw = "";
    try {
      raw = fs.readFileSync(0, "utf8");
    } catch {
      // 標準入力が無い・閉じている。空として扱い、deny に倒す
    }
    const out = decideCodexHookOutput(raw);
    if (out !== null) process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch {
    // 書いた後に投げても exit 0 で終わる（フックの失敗は Codex ではコマンドが走る。出力が途中なら、配線側の包みが deny に倒す）
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
