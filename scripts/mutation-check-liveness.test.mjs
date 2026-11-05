/**
 * 変異検査が「別の実行が動いているか」を読むとき、ゾンビを生きているとしない（#542）。
 *
 * クラウドのコンテナは PID 1 が孤児を回収しない。中断された `--jobs` の子や SIGKILL された実行はゾンビとして残り、
 * `kill(pid, 0)` だけの判定は「まだ動いている」と読み続ける。ロックの拒否（`lockRefusalReason`）が永久に拒み、
 * 古い作業ツリーの掃除（`staleWorktreeDirs`）が拾えなくなる。判定は `lib/process-alive.mjs` の `isProcessAlive` の 1 本
 * （ゾンビ・EPERM・名前空間の扱いはそちらが決める）。ここは、変異検査の 2 つの使い道がそれを通ることを見る。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import { lockRefusalReason } from "./lib/mutation-lock.mjs";
import { staleWorktreeDirs } from "./lib/mutation-parallel.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ゾンビを 1 つ作って `fn(ゾンビの pid, 止めた親の pid)` を呼び、終わったら親を起こして回収させる。
 * 親の node が子を作って SIGKILL し、wait しないまま SIGSTOP で止まる。子はゾンビになる
 * （`lib/process-alive.test.mjs` と同じ作り方。SIGCONT で node が子を回収して親は普通に終わる）。
 */
async function withZombie(fn) {
  const parentScript =
    `const { spawn } = require("node:child_process"); const fs = require("node:fs");` +
    `const c = spawn("sleep", ["30"], { stdio: "ignore" }); c.on("exit", () => process.exit(0));` +
    `c.kill("SIGKILL");` +
    `setTimeout(() => process.exit(2), 20000);` +
    `fs.writeSync(1, String(c.pid) + "\\n");` +
    `process.kill(process.pid, "SIGSTOP");`;
  const parent = spawn(process.execPath, ["-e", parentScript], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise((r) => parent.on("exit", r));
  try {
    const pid = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("子の PID が 5 秒以内に届かない")), 5000);
      timer.unref();
      let buf = "";
      parent.stdout.on("data", (d) => {
        buf += d;
        if (buf.includes("\n")) {
          clearTimeout(timer);
          resolve(Number(buf.trim()));
        }
      });
      parent.on("error", reject);
      parent.on("exit", () => reject(new Error("子の PID を出す前に親が終わった")));
    });
    await wait(300); // 子が死ぬのを待つ。親は SIGSTOP で止まっているので wait されずゾンビのまま
    return await fn(pid, parent.pid);
  } finally {
    parent.kill("SIGCONT");
    const timer = setTimeout(() => parent.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  }
}

const porcelainOwnedBy = (pid, host) =>
  `worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n` +
  `worktree /tmp/tasuki-mutation-${pid}-1\nHEAD abc\ndetached\nlocked tasuki-mutation pid=${pid} host=${host}\n`;

describe("変異検査の生死の判定は、ゾンビを生きているとしない（#542）", { timeout: 20000 }, () => {
  test("ゾンビの PID が書かれたロックは拒まない（既定の判定）", async () => {
    await withZombie((zombie) => {
      assert.equal(lockRefusalReason(String(zombie)), null, "ゾンビを生きていると読んで、実行を拒んでいる");
    });
  });

  test("止まっているだけの（ゾンビでない）親の PID が書かれたロックは拒む（既定の判定）", async () => {
    await withZombie((_zombie, parent) => {
      assert.match(lockRefusalReason(String(parent)) ?? "", new RegExp(`PID ${parent}`));
    });
  });

  test("持ち主がゾンビの作業ツリーは、古いものとして拾う（既定の判定）", async () => {
    await withZombie((zombie, parent) => {
      const host = os.hostname();
      assert.deepEqual(staleWorktreeDirs(porcelainOwnedBy(zombie, host), host), [`/tmp/tasuki-mutation-${zombie}-1`]);
      assert.deepEqual(staleWorktreeDirs(porcelainOwnedBy(parent, host), host), [], "生きている持ち主の作業ツリーを拾っている");
    });
  });

  test("pid が正の整数でない（pid=0・桁あふれ）ものは、ロックの拒否も作業ツリーの掃除も『死んだ』と同じに扱い、投げない", () => {
    const host = os.hostname();
    for (const bad of ["0", "00", "4294967296", "99999999999999999999"]) {
      assert.equal(lockRefusalReason(bad), null, `ロック ${bad} を拒んでいる`);
      const porcelain =
        `worktree /tmp/tasuki-mutation-1-1\nHEAD abc\ndetached\nlocked tasuki-mutation pid=${bad} host=${host}\n`;
      assert.deepEqual(staleWorktreeDirs(porcelain, host), ["/tmp/tasuki-mutation-1-1"], `pid=${bad} を古いものとして拾わない`);
    }
  });
});
