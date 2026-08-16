import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectTargets } from "./list-scan-targets.mjs";

/**
 * selectTargets の単体テスト（#135 経路⑬）。
 *
 * 「除外が 1 件も一致しなくなったら落とす」ロジックが本 Issue の主題そのもの
 * なので、ここは重点的に見る。listTrackedFiles（Task 2）を経由しない、
 * 純粋関数としての境界だけを確かめる。
 */
describe("selectTargets", () => {
  test("除外に一致しない対象だけが targets に残る", () => {
    // Given: 除外接頭辞に一致しない対象だけの一覧
    const all = ["scripts/foo.sh", "scripts/bar.sh"];
    const exclusions = [{ prefix: "deploy/", reason: "テスト用のダミー除外" }];
    // When
    const { targets } = selectTargets(all, exclusions);
    // Then
    assert.deepEqual(targets, ["scripts/foo.sh", "scripts/bar.sh"]);
  });

  test("除外接頭辞に一致する対象は targets から除かれる", () => {
    // Given: 一部が除外接頭辞に一致する一覧
    const all = ["vendor/scripts/common.sh", "scripts/gen-sounds.sh"];
    const exclusions = [{ prefix: "vendor/scripts/", reason: "テスト用の vendor 除外" }];
    // When
    const { targets } = selectTargets(all, exclusions);
    // Then
    assert.deepEqual(targets, ["scripts/gen-sounds.sh"]);
  });

  test("除外接頭辞が 1 件も一致しないとき problems に 1 件積まれる（死んだ除外の検知）", () => {
    // Given: 実在しない接頭辞を持つ除外（対象がリネーム・削除された想定）
    const all = ["scripts/foo.sh", "scripts/bar.sh"];
    const exclusions = [{ prefix: "does-not-exist/", reason: "テスト用のダミー除外" }];
    // When
    const { problems } = selectTargets(all, exclusions);
    // Then
    assert.equal(problems.length, 1);
  });

  test("除外が複数あり、そのうち 1 つだけが死んでいるとき、その 1 件だけが problems に出る", () => {
    // Given: 生きている除外と死んでいる除外が混在
    const all = ["vendor/scripts/common.sh", "scripts/gen-sounds.sh"];
    const exclusions = [
      { prefix: "vendor/scripts/", reason: "テスト用の vendor 除外" },
      { prefix: "does-not-exist/", reason: "テスト用のダミー除外" },
    ];
    // When
    const { problems } = selectTargets(all, exclusions);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /does-not-exist\//);
  });

  test("除外が空配列のとき problems は空で、targets は入力そのまま", () => {
    // Given: 除外なし
    const all = ["scripts/foo.sh", "scripts/bar.sh"];
    // When
    const { targets, problems } = selectTargets(all, []);
    // Then
    assert.deepEqual(targets, all);
    assert.deepEqual(problems, []);
  });

  test("problems のメッセージに接頭辞と理由の両方が含まれる（人が直せる情報になっていること）", () => {
    // Given: 実在しない接頭辞を持つ除外
    const all = ["scripts/foo.sh"];
    const exclusions = [{ prefix: "does-not-exist/", reason: "テスト用のダミー除外" }];
    // When
    const { problems } = selectTargets(all, exclusions);
    // Then
    assert.match(problems[0], /does-not-exist\//);
    assert.match(problems[0], /テスト用のダミー除外/);
  });
});
