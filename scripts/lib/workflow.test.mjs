/** `scripts/lib/workflow.mjs` の補助（コメントの除去・workflow 直下の env の塊）の自己テスト（#562）。 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stripComments, topLevelEnvBlock } from "./workflow.mjs";

describe("stripComments", () => {
  test("行頭の # の行だけを外す。run の中の ` #` は残す", () => {
    assert.equal(stripComments("a\n  # c\nb # d\n"), "a\nb # d\n");
  });
  test("dropBlank で空行も外す", () => {
    assert.equal(stripComments("a\n\n  # c\nb", { dropBlank: true }), "a\nb");
  });
});

describe("topLevelEnvBlock", () => {
  test("workflow 直下の env の塊を返す。ジョブの env（4 字下げ）は拾わない", () => {
    const wf = 'name: x\nenv:\n  A: "1"\n  B: "2"\njobs:\n  j:\n    env:\n      C: 3\n';
    assert.equal(topLevelEnvBlock(wf), '  A: "1"\n  B: "2"\n');
    assert.equal(topLevelEnvBlock("name: x\njobs:\n  j:\n    env:\n      C: 3\n"), undefined);
  });
});
