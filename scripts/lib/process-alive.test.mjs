import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { isProcessAlive, parseStatState, readProcessState } from "./process-alive.mjs";

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
  // 親の node が子を作って SIGKILL し、wait しないまま SIGSTOP で止まる。子はゾンビになる。
  // SIGCONT を受けたら node が子を回収し、親は普通に終わる（ゾンビを PID 1 に残さない）。
  const parentScript =
    `const { spawn } = require("node:child_process"); const fs = require("node:fs");` +
    `const c = spawn("sleep", ["30"], { stdio: "ignore" }); c.on("exit", () => process.exit(0));` +
    `c.kill("SIGKILL");` +
    `setTimeout(() => process.exit(2), 20000);` +
    // 同期に書く（SIGSTOP の前に PID を確実に出す）
    `fs.writeSync(1, String(c.pid) + "\\n");` +
    `process.kill(process.pid, "SIGSTOP");`;
  const parent = spawn(process.execPath, ["-e", parentScript], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise((r) => parent.on("exit", r));
  try {
    // PID が届かないときも自分で reject し、finally を必ず走らせる
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
    assert.equal(isProcessAlive(pid), false);
    assert.equal(isProcessAlive(parent.pid), true, "止まっているだけの親は生きている（Z ではない）");
  } finally {
    parent.kill("SIGCONT"); // 親が子を回収して終わる
    const timer = setTimeout(() => parent.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
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
  assert.equal(parseStatState("123 garbage"), null); // ')' が無い
});

test("isProcessAlive: 状態 X（死亡）は false", () => {
  assert.equal(isProcessAlive(process.pid, { readState: () => "X" }), false);
});

test("isProcessAlive: 正の整数でない pid は投げる", () => {
  for (const bad of [0, -1, NaN, "123", 1.5, null, undefined]) {
    assert.throws(() => isProcessAlive(bad), TypeError, String(bad));
  }
});

const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

test("readProcessState: /proc があるのに stat が ENOENT なら、ps へ落ちず死んだ（X）と読む", () => {
  let psCalled = false;
  const state = readProcessState(123, {
    procExists: () => true,
    readFile: () => { throw enoent(); },
    ps: () => { psCalled = true; return ""; },
  });
  assert.equal(state, "X");
  assert.equal(psCalled, false);
});

test("readProcessState: /proc が無ければ ps で読む。ps が読めなければ null", () => {
  const io = { procExists: () => false, readFile: () => { throw enoent(); } };
  assert.equal(readProcessState(123, { ...io, ps: () => "Z+\n" }), "Z");
  assert.equal(readProcessState(123, { ...io, ps: () => { throw new Error("timeout"); } }), null);
});

test("readProcessState: /proc の stat が読めればその状態", () => {
  assert.equal(readProcessState(123, { procExists: () => true, readFile: () => "123 (x) S 1" }), "S");
});
