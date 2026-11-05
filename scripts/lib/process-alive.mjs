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
 * に落とす（どちらも先頭の字が `Z` ならゾンビ）。どちらでも読めなければ（`ps` は 2 秒で打ち切る）、存在の確認（kill 0）だけに頼って
 * 「生きている」と数える。読めないときに死んだと見ると、本当に生き残った孫を見逃すため。
 * ただし `/proc` があるのに stat が無い（ENOENT）のは、kill 0 の後に回収されて消えたということなので死んだ（`X`）と読む。
 */
export function isProcessAlive(pid, { readState = readProcessState } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new TypeError(`pid は正の整数でなければならない: ${String(pid)}`);
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e?.code !== "EPERM") return false; // ESRCH: 存在しない。EPERM は存在するので続ける
  }
  const state = readState(pid);
  return state === null ? true : state !== "Z" && state !== "X";
}

/** `/proc/<pid>/stat` の文字列から状態の 1 字を取る。形は "pid (comm) S ..."。comm に ")" や空白が入りうるので、最後の ")" の後ろを読む。読めなければ null。 */
export function parseStatState(stat) {
  const close = stat.lastIndexOf(")");
  if (close < 0) return null;
  return stat.slice(close + 2, close + 3).trim() || null;
}

const defaultIo = {
  procExists: () => fs.existsSync("/proc/self"),
  readFile: (file) => fs.readFileSync(file, "utf8"),
  ps: (pid) => execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }),
};

/**
 * 状態の 1 字を返す。`/proc` の stat が ENOENT なら死んだ（"X"）。`/proc` が無いときだけ ps に落ちる。
 * どちらでも読めなければ null（呼び手は生きている側に倒す）。
 */
export function readProcessState(pid, io = {}) {
  const { procExists, readFile, ps } = { ...defaultIo, ...io };
  try {
    return parseStatState(readFile(`/proc/${pid}/stat`));
  } catch (e) {
    if (e?.code === "ENOENT" && procExists()) return "X";
  }
  try {
    const out = ps(pid).trim();
    return out ? out[0] : null;
  } catch {
    return null;
  }
}
