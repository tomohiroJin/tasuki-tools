import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  stripCodeRegions,
  toAnchor,
  collectAnchors,
  findRelativeLinks,
  findInlineCodePaths,
  isRepoPathLike,
  LIVE_DOCS,
  MISSING_PATH_EXCEPTIONS,
  isLiveDoc,
  checkConstants,
  checkStaleExceptions,
  DORMANT_DOCS,
  classifyDocs,
} from "./check-links.mjs";

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

  test("4 個で開いたフェンスは 3 個の行では閉じない", () => {
    // Given: バッククォート 4 個の中に 3 個のフェンスがネストしている
    //        （docs/superpowers/plans/2026-06-07-tasuki-vps-deployment.md の実例）
    const src = ["````markdown", "```bash", "# コメント", "```", "````", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then: 外側フェンスの中身はすべて空になり、閉じた後の本文だけ残る
    assert.deepEqual(lines, ["", "", "", "", "", "[ok](./a.md)"]);
  });

  test("情報文字列つきの行は閉じフェンスにならない", () => {
    // Given
    const src = ["```", "text", "```bash", "まだフェンス内", "```", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[3], "");
    assert.equal(lines[5], "[ok](./a.md)");
  });

  test("開いたフェンスより長い行でも閉じられる", () => {
    // Given: CommonMark は「同じ長さ以上」を閉じフェンスとして認める
    const src = ["```", "text", "`````", "[ok](./a.md)"].join("\n");
    // When / Then
    assert.equal(stripCodeRegions(src)[3], "[ok](./a.md)");
  });

  test("チルダで開いたフェンスはバッククォートでは閉じない", () => {
    // Given
    const src = ["~~~", "```", "まだフェンス内", "~~~", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[2], "");
    assert.equal(lines[4], "[ok](./a.md)");
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

describe("findRelativeLinks", () => {
  test("相対リンクを行番号つきで拾う", () => {
    // Given
    const src = ["# 見出し", "本文 [a](./a.md) と [b](../b.md#節)", "[外](https://example.com)"].join("\n");
    // When
    const links = findRelativeLinks(src);
    // Then: http は対象外
    assert.deepEqual(links, [
      { target: "./a.md", line: 2 },
      { target: "../b.md#節", line: 2 },
    ]);
  });

  test("フェンス内のリンクは拾わない", () => {
    // Given
    const src = ["```", "[x](no-such-file.md)", "```"].join("\n");
    // When / Then
    assert.deepEqual(findRelativeLinks(src), []);
  });

  test("同一文書内のアンカーだけのリンクも拾う", () => {
    // Given
    const src = "[節へ](#見出し)";
    // When / Then
    assert.deepEqual(findRelativeLinks(src), [{ target: "#見出し", line: 1 }]);
  });
});

describe("isRepoPathLike", () => {
  test("拡張子つきのリポジトリ内パスを受け入れる", () => {
    assert.equal(isRepoPathLike("packages/timer-core/src/evolve.ts"), true);
    assert.equal(isRepoPathLike("docs/adr/0002-document-system-three-layers.md"), true);
  });

  test("ADR 番号の接頭辞参照を弾く", () => {
    // Given: 拡張子が無い。実ファイルは 0002-document-system-three-layers.md
    // When / Then
    assert.equal(isRepoPathLike("docs/adr/0002"), false);
  });

  test("グロブ・変数展開・空白を含むものを弾く", () => {
    assert.equal(isRepoPathLike("packages/*/src/index.ts"), false);
    assert.equal(isRepoPathLike("apps/${APP}/dist/main.js"), false);
    assert.equal(isRepoPathLike("docs/a b.md"), false);
  });

  test("リポジトリ外に見えるものを弾く", () => {
    assert.equal(isRepoPathLike("node_modules/foo/index.js"), false);
    assert.equal(isRepoPathLike("./relative.md"), false);
  });
});

describe("findInlineCodePaths", () => {
  test("行番号を落として拾う", () => {
    // Given: 行番号つきの引用
    const src = "詳細は `packages/timer-core/src/problem.ts:70` と `scripts/audit-structure.mjs:5-6` を見る";
    // When
    const found = findInlineCodePaths(src);
    // Then: 突き合わせ用に行番号を落とし、原文も残す
    assert.deepEqual(found, [
      { path: "packages/timer-core/src/problem.ts", raw: "packages/timer-core/src/problem.ts:70", line: 1 },
      { path: "scripts/audit-structure.mjs", raw: "scripts/audit-structure.mjs:5-6", line: 1 },
    ]);
  });

  // 次の 2 件は対照実験。フェンスの有無だけが違う。
  // フェンス内の行にバッククォート引用を置かないと、fenceMask への委譲を丸ごと
  // 無効化してもテストが通ってしまう（恒真になる）。
  test("フェンス内のバッククォート引用は拾わない", () => {
    // Given: フェンスの中に、バッククォートで囲んだリポジトリパスがある
    const src = ["```bash", "詳細は `scripts/nonexistent.mjs` を見る", "```"].join("\n");
    // When / Then
    assert.deepEqual(findInlineCodePaths(src), []);
  });

  test("同じ内容でもフェンスの外なら拾う", () => {
    // Given: 上のテストからフェンスだけを外したもの
    const src = "詳細は `scripts/nonexistent.mjs` を見る";
    // When / Then
    assert.deepEqual(findInlineCodePaths(src), [
      { path: "scripts/nonexistent.mjs", raw: "scripts/nonexistent.mjs", line: 1 },
    ]);
  });
});

describe("isLiveDoc", () => {
  test("現役の規範文書を受け入れる", () => {
    assert.equal(isLiveDoc("README.md"), true);
    assert.equal(isLiveDoc("docs/adr/0009-ci-scope-and-checks.md"), true);
    assert.equal(isLiveDoc("deploy/README.md"), true);
  });

  test("履歴文書と vendor を弾く", () => {
    // Given: monorepo 統合前の表記で書かれた当時の記録、および spec-kit の vendor
    // When / Then
    assert.equal(isLiveDoc("docs/superpowers/plans/2026-08-04-monorepo-s0-s1.md"), false);
    assert.equal(isLiveDoc("docs/poker/specs/001-planning-poker-mvp/tasks.md"), false);
    assert.equal(isLiveDoc("docs/timer/adr/0009-test-conventions.md"), false);
    assert.equal(isLiveDoc(".claude/skills/speckit-plan/SKILL.md"), false);
  });

  test("poker の ADR は現役の規範文書なので LIVE に含む", () => {
    // Given: poker の ADR は docs/poker/ 配下だが、休眠の作業記録ではなく現役の規範
    // When / Then
    assert.equal(isLiveDoc("docs/poker/adr/0001-poker-domain-direct-transition.md"), true);
  });

  test("poker の specs は休眠のまま（ADR だけを LIVE にする）", () => {
    // Given: 同じ docs/poker/ 配下でも specs は当時の作業記録
    // When / Then
    assert.equal(isLiveDoc("docs/poker/specs/001-planning-poker-mvp/spec.md"), false);
  });

  test("docs/README.md は現役だが docs/ 全体は現役ではない", () => {
    // Given: 完全一致のエントリと前方一致のエントリを混ぜている
    // When / Then
    assert.equal(isLiveDoc("docs/README.md"), true);
    assert.equal(isLiveDoc("docs/BACKLOG.md"), false);
  });

  test("完全一致のエントリを前方一致で判定しない", () => {
    // Given: 完全一致エントリの名前で始まるだけの別ファイル
    //        （この 2 行が無いと、完全一致の条件を前方一致へ壊しても検出できない）
    // When / Then
    assert.equal(isLiveDoc("docs/README.md.bak"), false);
    assert.equal(isLiveDoc("AGENTS.md.bak"), false);
  });
});

describe("checkConstants", () => {
  test("LIVE_DOCS に実在しないパスがあれば報告する", () => {
    // Given: 実在しないと答える exists
    const exists = (p) => p !== "docs/guides/";
    // When
    const errors = checkConstants({ exists });
    // Then
    assert.equal(errors.length, 1);
    assert.match(errors[0], /docs\/guides\//);
  });

  test("すべて実在すれば空", () => {
    // Given
    const exists = () => true;
    // When / Then
    assert.deepEqual(checkConstants({ exists }), []);
  });
});

describe("checkStaleExceptions", () => {
  test("一度も使われなかった例外を報告する", () => {
    // Given: 例外表のどのパスにも触れなかった走査
    const used = new Set();
    // When
    const errors = checkStaleExceptions(used);
    // Then
    assert.equal(errors.length, MISSING_PATH_EXCEPTIONS.length);
    assert.match(errors[0], /docs\/BACKLOG\.md/);
  });

  test("使われた例外は報告しない", () => {
    // Given
    const used = new Set(MISSING_PATH_EXCEPTIONS.map((e) => e.path));
    // When / Then
    assert.deepEqual(checkStaleExceptions(used), []);
  });
});

describe("classifyDocs", () => {
  test("LIVE_DOCS に属する文書は無所属にならない", () => {
    // Given
    const tracked = ["docs/guides/development.md", "README.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, []);
  });

  test("除外接頭辞に属する文書は無所属にならない", () => {
    // Given
    const tracked = ["docs/plans/2026-01-01-x.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, []);
  });

  test("どちらにも属さない文書を無所属として出す", () => {
    // Given: 新設ディレクトリの文書
    const tracked = ["docs/newarea/notes.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, ["docs/newarea/notes.md"]);
  });

  test("LIVE_DOCS からエントリを消すと、その配下が無所属になる", () => {
    // Given: docs/guides/ を失った状態を模す
    const live = LIVE_DOCS.filter((e) => e !== "docs/guides/");
    const tracked = ["docs/guides/development.md"];
    // When
    const { unclassified } = classifyDocs(tracked, { live });
    // Then: 経路③ — 以前はエントリごと消えて緑になっていた
    assert.deepEqual(unclassified, ["docs/guides/development.md"]);
  });

  test("docs/poker/adr/ を LIVE_DOCS から消すと、poker の ADR が無所属になる", () => {
    // Given: docs/poker/adr/ を失った状態を模す。docs/poker/ を覆う DORMANT エントリは
    //        specs/ と README.md のみなので、adr/ 配下は他のどのエントリにも属さなくなる
    const live = LIVE_DOCS.filter((e) => e !== "docs/poker/adr/");
    const tracked = ["docs/poker/adr/0001-poker-domain-direct-transition.md"];
    // When
    const { unclassified } = classifyDocs(tracked, { live });
    // Then: 経路③ — 以前は docs/poker/ という広い DORMANT エントリに吸収されて緑のままだった
    assert.deepEqual(unclassified, ["docs/poker/adr/0001-poker-domain-direct-transition.md"]);
  });

  test("DORMANT_DOCS のどのエントリも LIVE_DOCS のエントリを包含しない", () => {
    // Given: 包含があると、LIVE の行を消したとき配下が休眠へ吸収され無所属にならない（#135 経路③）
    // When / Then
    for (const d of DORMANT_DOCS) {
      const swallowed = LIVE_DOCS.filter((e) => e.startsWith(d.prefix));
      assert.deepEqual(swallowed, [], `${d.prefix} が LIVE_DOCS の ${swallowed.join(", ")} を包含しています`);
    }
  });

  test("除外には理由が書かれている", () => {
    // Given / When / Then
    for (const d of DORMANT_DOCS) {
      assert.ok(d.reason && d.reason.length > 0, `${d.prefix} に理由がありません`);
    }
  });
});
