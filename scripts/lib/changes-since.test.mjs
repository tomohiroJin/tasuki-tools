import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LOG_ARGS, parseLog, classifyCommit, summarize, formatChanges } from "./changes-since.mjs";

/** `scripts/lib/changes-since.mjs` の自己テスト（#675）。git は叩かず、`git log` の出力の形の文字列を渡す。 */

const sha = (c) => c.repeat(40);
/** `git log -z --format=%x01%H%x02%s%x02 --name-only` の 1 コミットぶん（実物の出力の形。名前は NUL で終わる）。 */
const entry = (hash, subject, files) => `\x01${hash}\x02${subject}\x02\0${files.length === 0 ? "" : `\n${files.map((f) => `${f}\0`).join("")}`}`;
const commit = (subject, files, hash = sha("a")) => classifyCommit({ sha: hash, subject, files });

describe("LOG_ARGS", () => {
  test("改名を追わず、main の一本道だけを古い順にたどる", () => {
    for (const flag of ["-z", "--no-renames", "--first-parent", "--reverse", "--name-only"]) assert.ok(LOG_ARGS.includes(flag), flag);
    assert.ok(LOG_ARGS.some((a) => a.startsWith("--format=")));
  });
});

describe("parseLog", () => {
  test("コミットごとに、ハッシュ・題・触れたファイルを読む", () => {
    const raw = entry(sha("a"), "feat(x): 一つ目 (#10)", ["a.ts", "docs/b.md"]) + entry(sha("b"), "chore: 二つ目 (#11)", ["c.ts"]);
    assert.deepEqual(parseLog(raw), [
      { sha: sha("a"), subject: "feat(x): 一つ目 (#10)", files: ["a.ts", "docs/b.md"] },
      { sha: sha("b"), subject: "chore: 二つ目 (#11)", files: ["c.ts"] },
    ]);
  });

  test("ファイルの無いコミット（空のコミット・マージ）も 1 件として残す", () => {
    assert.deepEqual(parseLog(entry(sha("a"), "空のコミット", [])), [{ sha: sha("a"), subject: "空のコミット", files: [] }]);
  });

  test("日本語・空白・引用符・改行を含むパスも、そのままの字で読む（引用符つきの形に化けない）", () => {
    const files = ["packages/checkin-core/src/やり方.ts", "deploy/timer/a b.conf", 'apps/tasuki-sync/src/"x".ts', "deploy/timer/改\n行.env"];
    assert.deepEqual(parseLog(entry(sha("a"), "feat: 字 (#70)", files))[0].files, files);
  });

  test("出力が空なら 0 件", () => {
    assert.deepEqual(parseLog(""), []);
    assert.deepEqual(parseLog("\n"), []);
  });

  test("形の違う出力（区切りが無い・ハッシュでない）は、黙って 0 件にせず投げる", () => {
    assert.throws(() => parseLog("abc def\nfile.ts\n"), /git log/);
    assert.throws(() => parseLog("\x01nothash\x02subject\x02\0"), /git log/);
    // 題に区切りの字が紛れた（区切りが 2 つでない）ときも、ずれたまま読まない
    assert.throws(() => parseLog(`\x01${sha("a")}\x02題\x02の中\x02\0`), /git log/);
  });
});

describe("classifyCommit", () => {
  test("題の末尾の (#番号) を PR の番号として取る（本文の中の #番号 は取らない）", () => {
    assert.equal(commit("feat(track): うちわけを足す（#476） (#683)", []).pr, 683);
    assert.equal(commit("chore: 末尾に空白 (#12) ", []).pr, 12);
    assert.equal(commit("fix: 番号が題の中だけ（#476）", []).pr, null);
    assert.equal(commit("docs: 番号なし", []).pr, null);
  });

  test("packages/<名前>-core/src の下に触れたら wire とし、文脈の名前を重複なく並べる", () => {
    const c = commit("x (#1)", ["packages/checkin-core/src/schemas.ts", "packages/checkin-core/src/methods.ts", "packages/topic-core/src/index.ts"]);
    assert.deepEqual(c.wire, ["checkin-core", "topic-core"]);
  });

  test("core のテスト・core でないパッケージ・src の外は wire にしない", () => {
    const c = commit("x (#1)", ["packages/checkin-core/tests/a.test.ts", "packages/ui/src/a.ts", "packages/checkin-core/package.json", "apps/x/packages/y-core/src/a.ts"]);
    assert.deepEqual(c.wire, []);
  });

  test("apps/tasuki-sync/src の下に触れたら同期サーバーとする（テストだけなら違う）", () => {
    assert.equal(commit("x (#1)", ["apps/tasuki-sync/src/config.ts"]).sync, true);
    assert.equal(commit("x (#1)", ["apps/tasuki-sync/test/config.test.ts", "apps/timer-web/src/a.ts"]).sync, false);
  });

  test("deploy/ は、文書（.md）だけか、それ以外（スクリプト・断片・app.env）に触れたかを分ける", () => {
    assert.deepEqual(commit("x (#1)", ["deploy/README.md", "deploy/track/NOTES.md"]).deploy, { docs: ["deploy/README.md", "deploy/track/NOTES.md"], other: [] });
    assert.deepEqual(commit("x (#1)", ["deploy/track/caddy/80-track.conf", "deploy/README.md", "deploy/deploy.sh"]).deploy, {
      docs: ["deploy/README.md"],
      other: ["deploy/track/caddy/80-track.conf", "deploy/deploy.sh"],
    });
    assert.deepEqual(commit("x (#1)", ["docs/deploy/a.md", "scripts/deploy/x.sh"]).deploy, { docs: [], other: [] });
  });
});

describe("summarize", () => {
  const commits = [
    commit("a (#1)", ["packages/checkin-core/src/schemas.ts"], sha("a")),
    commit("b (#2)", ["apps/tasuki-sync/src/config.ts", "deploy/README.md"], sha("b")),
    commit("c (#3)", ["deploy/timer/app.env"], sha("c")),
    commit("d", ["README.md"], sha("d")),
    commit("e (#5)", ["apps/timer-web/src/App.tsx"], sha("e")),
  ];

  test("deploy/ の文書と文書以外の両方に触れたコミットは、「文書だけ」に数えない", () => {
    const both = commit("x (#8)", ["deploy/README.md", "deploy/deploy.sh"], sha("f"));
    const s = summarize([both]);
    assert.deepEqual(s.deployOther.map((c) => c.pr), [8]);
    assert.deepEqual(s.deployDocs, []);
  });

  test("種類ごとに、触れたコミットを数える", () => {
    const s = summarize(commits);
    assert.equal(s.total, 5);
    assert.deepEqual(s.wire.map((c) => c.pr), [1]);
    assert.deepEqual(s.sync.map((c) => c.pr), [2]);
    assert.deepEqual(s.deployOther.map((c) => c.pr), [3]);
    assert.deepEqual(s.deployDocs.map((c) => c.pr), [2]);
    assert.deepEqual(s.unnumbered.map((c) => c.sha), [sha("d")]);
  });
});

describe("formatChanges", () => {
  const commits = [
    commit("feat: wire を変える (#1)", ["packages/checkin-core/src/schemas.ts", "apps/tasuki-sync/src/config.ts"], sha("a")),
    commit("chore: 断片を足す (#3)", ["deploy/track/caddy/80-track.conf", "deploy/README.md"], sha("c")),
    commit("docs: 直に積んだ", ["README.md"], sha("d")),
  ];

  test("コミットごとに、番号・短いハッシュ・題・印を 1 行で出す", () => {
    const text = formatChanges(commits);
    assert.match(text, /#1\s+aaaaaaa\s+feat: wire を変える \(#1\)\s+\[wire: checkin-core\] \[同期サーバー\]/);
    assert.match(text, /#3\s+ccccccc\s+chore: 断片を足す \(#3\)\s+\[deploy（文書以外）: deploy\/track\/caddy\/80-track\.conf\]/);
    assert.match(text, /番号なし\s+ddddddd\s+docs: 直に積んだ$/m);
  });

  test("文書だけの deploy/ は、文書以外と取り違えない印にする", () => {
    const text = formatChanges([commit("docs: 記録 (#9)", ["deploy/README.md"], sha("e"))]);
    assert.match(text, /\[deploy（文書だけ）\]/);
    assert.doesNotMatch(text, /\[deploy（文書以外）/);
    assert.match(text, /deploy\/ の文書以外.*: なし$/m);
    assert.match(text, /deploy\/ の文書だけ.*: #9$/m);
  });

  test("まとめに、種類ごとの PR の番号と、番号を取れなかった件数を出す", () => {
    const text = formatChanges(commits);
    assert.match(text, /wire.*: #1$/m);
    assert.match(text, /同期サーバー.*: #1$/m);
    assert.match(text, /deploy\/ の文書以外.*: #3$/m);
    assert.match(text, /番号を取れなかったコミット: 1 件（ddddddd）/);
  });

  test("どれにも触れていない種類は「なし」と出す（行ごと消さない。見落としと区別できない）", () => {
    const text = formatChanges([commit("docs: 直す (#7)", ["README.md"], sha("f"))]);
    assert.match(text, /wire.*: なし$/m);
    assert.match(text, /同期サーバー.*: なし$/m);
    assert.match(text, /deploy\/ の文書以外.*: なし$/m);
  });

  test("0 件なら、0 件と出す（起きるのは前のタグと HEAD が同じときだけ。古い HEAD は入口が先に止める）", () => {
    assert.match(formatChanges([]), /0 件/);
    assert.doesNotMatch(formatChanges([]), /古い/);
  });
});
