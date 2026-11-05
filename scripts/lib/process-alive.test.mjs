import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { isProcessAlive } from "./process-alive.mjs";

/** `scripts/lib/process-alive.mjs` の自己テスト（#525）。実プロセスで、生きている・ゾンビ・存在しない、を見る。 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("isProcessAlive: 生きているプロセスは true", async () => {
  const c = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    await wait(50);
    assert.equal(isProcessAlive(c.pid), true);
  } finally {
    c.kill("SIGKILL");
  }
});

test("isProcessAlive: 終わって回収された（存在しない）プロセスは false", async () => {
  const c = spawn("sleep", ["30"], { stdio: "ignore" });
  const closed = new Promise((r) => c.on("close", r));
  c.kill("SIGKILL");
  await closed; // 親（このテスト）が wait 済み
  assert.equal(isProcessAlive(c.pid), false);
});

test("isProcessAlive: ゾンビ（死んだが親が回収していない）は false", async () => {
  // 親の node が子を作って SIGKILL し、wait しないまま居続ける。子はゾンビになる。
  const parentScript =
    `const { spawn } = require("node:child_process");` +
    `const c = spawn("sleep", ["30"], { stdio: "ignore" }); c.kill("SIGKILL");` +
    `process.stdout.write(String(c.pid) + "\\n");` +
    // 親ごと SIGSTOP で止め、子の終了を回収（wait）させない
    `process.kill(process.pid, "SIGSTOP");`;
  const parent = spawn(process.execPath, ["-e", parentScript], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    const pid = await new Promise((resolve, reject) => {
      let buf = "";
      parent.stdout.on("data", (d) => {
        buf += d;
        if (buf.includes("\n")) resolve(Number(buf.trim()));
      });
      parent.on("error", reject);
    });
    await wait(300); // 子が死ぬのを待つ。親は SIGSTOP で止まっているので wait されずゾンビのまま
    assert.equal(isProcessAlive(pid), false);
    assert.equal(isProcessAlive(parent.pid), true, "止まっているだけの親は生きている（Z ではない）");
  } finally {
    parent.kill("SIGCONT");
    parent.kill("SIGKILL");
  }
});
