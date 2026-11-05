import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { restoreVerdict } from "./mutation-restore-verdict.mjs";

test("restoreVerdict: 戻った（true）か、戻すものが無かった（null 相当を含む真）なら進み、成功の終了コードを返す", () => {
  assert.deepEqual(restoreVerdict(true), { proceed: true, exitCode: 0 });
  assert.deepEqual(restoreVerdict(true, 130), { proceed: true, exitCode: 130 });
});

test("restoreVerdict: 戻らなかった（false）なら進まず、成功の終了コードが何でも 1 を返す", () => {
  assert.deepEqual(restoreVerdict(false), { proceed: false, exitCode: 1 });
  assert.deepEqual(restoreVerdict(false, 130), { proceed: false, exitCode: 1 });
});

test("配線: mutation-check.mjs の 3 か所（逐次ループ・シグナル・前回の復旧）が restoreVerdict を通る", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../mutation-check.mjs", import.meta.url)), "utf8");
  const count = (needle) => src.split(needle).length - 1;
  assert.equal(count('from "./lib/mutation-restore-verdict.mjs"'), 1, "取り込みがありません");
  assert.equal(count("restoreVerdict(restored, 130)"), 1, "シグナルのハンドラが通っていません");
  assert.equal(count("restoreVerdict(recoverFromCrashedRun())"), 1, "前回の復旧が通っていません");
  assert.equal(count("restoreVerdict(restored)"), 1, "逐次ループが通っていません");
  assert.equal(count("restoreVerdict("), 3, "restoreVerdict を使う場所が 3 か所ではありません");
});
