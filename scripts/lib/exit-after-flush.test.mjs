import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exitAfterFlush } from "./exit-after-flush.mjs";

const SELF = fileURLToPath(new URL("./exit-after-flush.mjs", import.meta.url));

/** 書き出しの完了を、呼び出し側が好きな時に通知できる偽のストリーム。 */
function fakeStream() {
  const callbacks = [];
  return { write: (_chunk, cb) => void callbacks.push(cb), flush: () => callbacks.splice(0).forEach((cb) => cb()) };
}

test("exitAfterFlush: すべてのストリームの書き出しが終わるまで exit しない", () => {
  const out = fakeStream();
  const err = fakeStream();
  const exits = [];
  exitAfterFlush(7, { streams: [out, err], exit: (c) => exits.push(c) });
  assert.deepEqual(exits, [], "書き出しの完了を待たずに exit した");
  out.flush();
  assert.deepEqual(exits, [], "stderr の完了を待たずに exit した");
  err.flush();
  assert.deepEqual(exits, [7]);
});

test("exitAfterFlush: 通知が来ない読み手には timeoutMs で打ち切って exit し、後から通知が来ても 1 回だけ", async () => {
  const stuck = fakeStream();
  const exits = [];
  exitAfterFlush(130, { streams: [stuck], exit: (c) => exits.push(c), timeoutMs: 20 });
  assert.deepEqual(exits, []);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(exits, [130]);
  stuck.flush();
  assert.deepEqual(exits, [130], "exit が 2 回呼ばれた");
});

test("exitAfterFlush: write が投げても待ち続けず exit する", () => {
  const exits = [];
  exitAfterFlush(1, {
    streams: [
      {
        write: () => {
          throw new Error("EPIPE");
        },
      },
    ],
    exit: (c) => exits.push(c),
  });
  assert.deepEqual(exits, [1]);
});

test("exitAfterFlush: パイプの容量を超える出力を書いた直後でも、親の読み出しが遅れても、末尾まで届いて指定の終了コードになる", async () => {
  // 子は 400KB（パイプの 64KB を超える）を stderr へ書いた直後に exitAfterFlush する。
  // 親は子の stderr を十分遅れて読む。待たずに exit する実装は、書き出しを捨てて末尾を失う。
  const script =
    `import { exitAfterFlush } from ${JSON.stringify(SELF)};` +
    `process.stderr.write("x".repeat(400000) + "\\nEND-MARK\\n");` +
    `exitAfterFlush(3);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  child.stderr.pause();
  child.stderr.on("data", (d) => chunks.push(d));
  child.stdout.resume();
  // 子が先に終わればその時点で、終わらなければ 3 秒後に読み始める（満杯で止まっている子は、読み始めて初めて進む）
  const resumeAt = setTimeout(() => child.stderr.resume(), 3000);
  child.on("exit", () => child.stderr.resume());
  const status = await new Promise((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });
  clearTimeout(resumeAt);
  const text = Buffer.concat(chunks).toString("utf8");
  assert.equal(status, 3);
  assert.ok(text.endsWith("END-MARK\n"), `末尾が届いていません（${text.length} 文字で切れた）`);
  assert.equal(text.length, 400000 + "\nEND-MARK\n".length);
});
