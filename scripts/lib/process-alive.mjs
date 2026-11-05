import fs from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * プロセスが「生きている」かを返す（#525）。
 *
 * `process.kill(pid, 0)` はゾンビ（死んだが親が wait していない）にも成功する。
 * クラウドのコンテナは PID 1 が孤児を回収しないので、SIGKILL で死んだ孫がゾンビのまま残り、
 * 「生き残った」と誤読される。ゾンビは死んだものとして数える。
 *
 * 状態の読み方: Linux は `/proc/<pid>/stat`。`/proc` が無い環境（macOS など）は `ps -o stat= -p <pid>`
 * に落とす（どちらも先頭の字が `Z` ならゾンビ）。どちらでも読めなければ、存在の確認（kill 0）だけに頼って
 * 「生きている」と数える。読めないときに死んだと見ると、本当に生き残った孫を見逃すため。
 */
export function isProcessAlive(pid, { readState = readProcessState } = {}) {
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e?.code !== "EPERM") return false; // ESRCH: 存在しない。EPERM は存在するので続ける
  }
  const state = readState(pid);
  return state === null ? true : state !== "Z";
}

/** `/proc/<pid>/stat` の文字列から状態の 1 字を取る。形は "pid (comm) S ..."。comm に ")" や空白が入りうるので、最後の ")" の後ろを読む。読めなければ null。 */
export function parseStatState(stat) {
  const close = stat.lastIndexOf(")");
  if (close < 0) return null;
  return stat.slice(close + 2, close + 3).trim() || null;
}

function readProcessState(pid) {
  try {
    return parseStatState(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    // /proc が無い、または読めない
  }
  try {
    const out = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out ? out[0] : null;
  } catch {
    return null;
  }
}
