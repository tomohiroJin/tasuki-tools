import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { isProcessAlive, parseStatState } from "./process-alive.mjs";

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

test("isProcessAlive: ゾンビ（死んだが親が回収していない）は false", { timeout: 10000 }, async () => {
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
      parent.on("exit", () => reject(new Error("子の PID を出す前に親が終わった")));
    });
    await wait(300); // 子が死ぬのを待つ。親は SIGSTOP で止まっているので wait されずゾンビのまま
    assert.equal(isProcessAlive(pid), false);
    assert.equal(isProcessAlive(parent.pid), true, "止まっているだけの親は生きている（Z ではない）");
  } finally {
    parent.kill("SIGCONT");
    parent.kill("SIGKILL");
  }
});

test("isProcessAlive: 状態を読めない（null）ときは生きていると数える", () => {
  assert.equal(isProcessAlive(process.pid, { readState: () => null }), true);
});

test("isProcessAlive: 読めた状態が Z なら false、それ以外なら true", () => {
  assert.equal(isProcessAlive(process.pid, { readState: () => "Z" }), false);
  assert.equal(isProcessAlive(process.pid, { readState: () => "S" }), true);
});

test("parseStatState: comm に ')' や空白が入っても最後の ')' の後ろから状態を読む", () => {
  assert.equal(parseStatState("123 (x) Z y) S 1 2 3"), "S");
  assert.equal(parseStatState("123 (sleep) Z 1 2 3"), "Z");
  assert.equal(parseStatState("123 (a b) R 1"), "R");
});

test("parseStatState: 状態が読めない文字列は null", () => {
  assert.equal(parseStatState(""), null);
  assert.equal(parseStatState("123 (x)"), null);
});
