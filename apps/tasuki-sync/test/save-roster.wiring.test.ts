/**
 * 名簿の保管が 1 箇所に閉じていることを固定する（#95 S5a・R3）。
 *
 * ## なぜ要るか
 *
 * 名簿を書く経路は S4b の時点で 3 つあった（`handlers.ts` の `commit` /
 * `presence.ts` の切断処理 / `poker-handlers.ts`）。ハブ（選択画面）への配信を
 * その 3 つに書き足す形にすると、**次に 4 つ目を足す人が配信を忘れる** ——
 * しかも timer と poker は正しく動くので、選択画面だけが黙って古いままになる。
 *
 * 保管と配信を対にした `save-roster.ts` に `store.put` を閉じ込め、**その外で
 * 呼んだら赤くする**のがこの検査である。判定は無状態の行単位にする（賢い検査ほど穴が増える）。
 *
 * ## 何を見ていないか
 *
 * - **別名束縛はすり抜ける**（`const put = store.put; put(room)`）。字句解析が要り、
 *   このプロジェクトは採らない。塞ぐ代わりに、この検査が「うっかり」を止める
 * - **ポートの実装（`adapters/in-memory-room-store.ts`）の `put(` 定義**は対象外。
 *   呼び出し（`store.put(`）だけを見る
 */
import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");

/** `src` 配下の `.ts` を集める（製品コードだけ。テストは対象外）。 */
function listSources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...listSources(full));
    } else if (name.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

/** 名簿の保管を呼んでいる行（`store.put(` の字面）。 */
function callsOfStorePut(): string[] {
  const hits: string[] = [];
  for (const file of listSources(SRC)) {
    const rel = path.relative(SRC, file);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (/\bstore\.put\(/.test(line)) hits.push(rel);
    }
  }
  return [...new Set(hits)].sort();
}

describe("名簿の保管の配線", () => {
  it("Given 製品コード / When store.put の呼び出しを数える / Then save-roster.ts だけが呼ぶ", () => {
    // Given / When: src 配下の実体（宣言ではなく字面を見る）
    const callers = callsOfStorePut();

    // Then: 経路が増えたらここが赤くなる。**配信を忘れた実装を通さない**
    expect(callers).toEqual(["application/save-roster.ts"]);
  });

  it("Given この検査自身 / When 走査対象を数える / Then 0 件ではない（空振りの検出）", () => {
    // Given / When: 走査の母数
    const files = listSources(SRC);

    // Then: パスがずれて 1 件も読んでいないなら、上の検査は何も守っていない
    expect(files.length).toBeGreaterThan(50);
  });
});
