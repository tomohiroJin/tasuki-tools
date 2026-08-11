import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stripCodeRegions, toAnchor, collectAnchors } from "./check-links.mjs";

describe("stripCodeRegions", () => {
  test("フェンス内の行を空にする", () => {
    // Given: フェンスに囲まれた壊れたリンクを含む文書
    const src = ["本文の [ok](./a.md)", "```bash", "[x](no-such-file.md)", "```", "末尾"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then: 行数は保たれ、フェンスの中身は消える
    assert.equal(lines.length, 5);
    assert.equal(lines[0], "本文の [ok](./a.md)");
    assert.equal(lines[2], "");
    assert.equal(lines[4], "末尾");
  });

  test("本文中のインラインコードを空白で潰す", () => {
    // Given: 説明文としてインラインコードに入れた壊れたリンク
    const src = "実在しないリンク `[x](no-such-file.md)` を一時的に書く";
    // When
    const lines = stripCodeRegions(src);
    // Then: 元の文字数は保たれ、リンク記法は残らない
    assert.equal(lines[0].length, src.length);
    assert.ok(!lines[0].includes("no-such-file.md"));
  });

  test("チルダのフェンスも閉じる", () => {
    // Given
    const src = ["~~~", "[x](no.md)", "~~~", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[1], "");
    assert.equal(lines[3], "[ok](./a.md)");
  });
});

describe("toAnchor", () => {
  // GitHub の HTML レンダリング API と突き合わせて 18/18 一致を確認した対応表
  const CASES = [
    ["Contract: WebSocket メッセージプロトコル", "contract-websocket-メッセージプロトコル"],
    ["共通事項", "共通事項"],
    ["C→S メッセージ", "cs-メッセージ"],
    ["create-room — ルーム作成（FR-001, FR-002）", "create-room--ルーム作成fr-001-fr-002"],
    ["vote — 投票・票の変更（FR-005〜007）", "vote--投票票の変更fr-005007"],
    ["公開に耐えるための防御（#63）", "公開に耐えるための防御63"],
    ["サーバー内部イベント（メッセージ以外の契約）", "サーバー内部イベントメッセージ以外の契約"],
    ["結合テスト観点（apps/sync, research R7）", "結合テスト観点appssync-research-r7"],
  ];
  for (const [heading, expected] of CASES) {
    test(`${heading} → ${expected}`, () => {
      assert.equal(toAnchor(heading), expected);
    });
  }

  test("空白の連続を 1 個に潰さない", () => {
    // Given: 記号を挟んで空白が 2 つ並ぶ見出し（GitHub はハイフン 2 個を出す）
    // When / Then
    assert.equal(toAnchor("a — b"), "a--b");
  });
});

describe("collectAnchors", () => {
  test("フェンス内の # 行を見出しと誤認しない", () => {
    // Given: シェルのコメントがフェンス内にある
    const src = ["# 本物の見出し", "```bash", "# これはコメント", "```"].join("\n");
    // When
    const anchors = collectAnchors(src);
    // Then
    assert.deepEqual([...anchors], ["本物の見出し"]);
  });

  test("同名の見出しには連番を付ける", () => {
    // Given
    const src = ["## 決定", "## 決定", "## 決定"].join("\n");
    // When
    const anchors = collectAnchors(src);
    // Then: GitHub と同じく 2 個目以降へ -1 / -2 が付く
    assert.deepEqual([...anchors].sort(), ["決定", "決定-1", "決定-2"]);
  });
});
