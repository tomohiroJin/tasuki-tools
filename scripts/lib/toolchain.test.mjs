import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  STAGES,
  parseVersion,
  compareVersions,
  parseToolchain,
  parsePackageManager,
  parsePnpmUserAgent,
  parseCaddyVersionOutput,
  chromiumBrowsersDir,
  chromiumDirNames,
  checkNode,
  checkExact,
  checkChromium,
  checkFfmpeg,
  evaluateStage,
  formatProblems,
} from "./toolchain.mjs";

const DECLARED = Object.freeze({
  node: "22.22.2",
  pnpm: "11.28.8",
  bun: "1.4.3",
  caddy: "2.11.7",
  chromium: "1248",
  ffmpeg: "1013",
});

describe("parseVersion / compareVersions: 版の読み方", () => {
  test("x.y.z を数の組として読む。先頭の v は落とす", () => {
    assert.deepEqual(parseVersion("22.22.2"), [22, 22, 2]);
    assert.deepEqual(parseVersion("v22.23.4"), [22, 23, 4]);
  });

  test("プレリリース・ビルドの付記つきは読まない（落として読むと 1.4.3-canary が 1.4.3 になる。#492 のレビュー 1）", () => {
    assert.equal(parseVersion("1.4.3+abc"), null);
    assert.equal(parseVersion("1.4.3-canary.12+deadbeef"), null);
    assert.equal(parseVersion("v22.22.2-nightly20261031"), null);
  });

  test("x.y.z の形でなければ null（勝手に 0 で埋めない）", () => {
    assert.equal(parseVersion("22"), null);
    assert.equal(parseVersion("22.x"), null);
    assert.equal(parseVersion(""), null);
    assert.equal(parseVersion(undefined), null);
  });

  test("文字列ではなく数で比べる（22.9.0 < 22.10.0）", () => {
    assert.ok(compareVersions([22, 9, 0], [22, 10, 0]) < 0);
    assert.ok(compareVersions([22, 22, 2], [22, 22, 0]) > 0);
    assert.equal(compareVersions([1, 4, 3], [1, 4, 3]), 0);
  });
});

describe("parseToolchain: toolchain.json を境界で検証する", () => {
  test("node・bun・caddy が x.y.z なら読める", () => {
    const r = parseToolchain(JSON.stringify({ "//": "注記", node: "22.22.2", bun: "1.4.3", caddy: "2.11.7" }));
    assert.deepEqual(r, { ok: true, value: { node: "22.22.2", bun: "1.4.3", caddy: "2.11.7" } });
  });

  test("欠けた道具を名指しする", () => {
    const r = parseToolchain(JSON.stringify({ node: "22.22.2", caddy: "2.11.7" }));
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes("bun")), r.problems.join("\n"));
  });

  test("範囲や major だけの書き方を拒む（CI に同じ版を渡せなくなる）", () => {
    for (const bad of ["22", ">=22.22.2", "^1.4.3", "latest"]) {
      const r = parseToolchain(JSON.stringify({ node: "22.22.2", bun: bad, caddy: "2.11.7" }));
      assert.equal(r.ok, false, `${bad} が通っています`);
    }
  });

  test("知らない道具を拒む（宣言したのに誰も比べない版を作らない）", () => {
    const r = parseToolchain(JSON.stringify({ node: "22.22.2", bun: "1.4.3", caddy: "2.11.7", deno: "2.0.0" }));
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes("deno")));
  });

  test("pnpm を書かせない（正本は package.json の packageManager。写すとずれる）", () => {
    const r = parseToolchain(JSON.stringify({ node: "22.22.2", bun: "1.4.3", caddy: "2.11.7", pnpm: "11.28.8" }));
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes("packageManager")), r.problems.join("\n"));
  });

  test("JSON でなければ ok: false（例外を投げない）", () => {
    const r = parseToolchain("{");
    assert.equal(r.ok, false);
  });
});

describe("parsePackageManager / parsePnpmUserAgent: pnpm の版の読み方", () => {
  test("pnpm@x.y.z と、ハッシュつきの形を読む", () => {
    assert.equal(parsePackageManager("pnpm@11.28.8"), "11.28.8");
    assert.equal(parsePackageManager("pnpm@11.28.8+sha512.abc"), "11.28.8");
  });

  test("pnpm 以外・範囲は読まない", () => {
    assert.equal(parsePackageManager("npm@10.0.0"), null);
    assert.equal(parsePackageManager("pnpm@11"), null);
    assert.equal(parsePackageManager(undefined), null);
  });

  test("pnpm が起動したときの user agent から版を読む。pnpm でなければ null", () => {
    assert.equal(parsePnpmUserAgent("pnpm/11.28.8 npm/? node/v22.23.4 linux x64"), "11.28.8");
    // 付記を落とさずに返す（比べる側が完全一致で止める）
    assert.equal(parsePnpmUserAgent("pnpm/11.28.8-rc.1 npm/? node/v22.23.4 linux x64"), "11.28.8-rc.1");
    assert.equal(parsePnpmUserAgent("npm/10.9.0 node/v22.23.4 linux x64"), null);
    assert.equal(parsePnpmUserAgent(undefined), null);
  });
});

describe("parseCaddyVersionOutput: caddy version の出力", () => {
  test("先頭の v つきの版を読む", () => {
    assert.equal(parseCaddyVersionOutput("v2.11.7 h1:abcdef=\n"), "2.11.7");
  });
  test("付記つきは付記ごと返す（比べる側が止める）", () => {
    assert.equal(parseCaddyVersionOutput("v2.11.7-beta.1 h1:x"), "2.11.7-beta.1");
  });
  test("空なら null", () => {
    assert.equal(parseCaddyVersionOutput(""), null);
  });
});

describe("checkNode: Node は宣言の版以上・同じ major", () => {
  test("宣言と同じ版・それより新しい同じ major の版は通す", () => {
    assert.equal(checkNode("v22.22.2", "22.22.2"), null);
    assert.equal(checkNode("v22.23.4", "22.22.2"), null);
  });

  test("宣言より古い版を止める（#487 で観測した 22.22.0）", () => {
    const p = checkNode("v22.22.0", "22.22.2");
    assert.equal(p?.tool, "node");
    assert.equal(p?.actual, "22.22.0");
    assert.match(p?.fix ?? "", /22\.22\.2/);
  });

  test("付記つきの版は止め、付記ごと示す（semver では 22.22.2-nightly は 22.22.2 より低い）", () => {
    const p = checkNode("v22.22.2-nightly20261031", "22.22.2");
    assert.equal(p?.tool, "node");
    assert.equal(p?.actual, "22.22.2-nightly20261031");
  });

  test("major が違えば止める（新しくても。CI と違う major で試すことになる）", () => {
    assert.equal(checkNode("v24.1.0", "22.22.2")?.tool, "node");
    assert.equal(checkNode("v20.19.0", "22.22.2")?.tool, "node");
  });
});

describe("checkExact: Bun・pnpm・Caddy は宣言と同じ版だけを通す", () => {
  test("同じなら null", () => {
    assert.equal(checkExact("bun", "1.4.3", "1.4.3"), null);
  });

  test("新しい版でも止める（#487 で Bun 1.4.4 が無関係のテストを落とした）", () => {
    const p = checkExact("bun", "1.4.4", "1.4.3");
    assert.deepEqual([p?.tool, p?.declared, p?.actual], ["bun", "1.4.3", "1.4.4"]);
    assert.match(p?.fix ?? "", /bun-v1\.4\.3/);
  });

  test("付記つきの版を止める（#492 のレビュー 1: カナリア版の Bun が素通りした）", () => {
    const p = checkExact("bun", "1.4.3-canary.12+deadbeef", "1.4.3");
    assert.equal(p?.actual, "1.4.3-canary.12+deadbeef");
    assert.equal(checkExact("pnpm", "11.28.8-rc.1", "11.28.8")?.tool, "pnpm");
    assert.equal(checkExact("caddy", "2.11.7-beta.1", "2.11.7")?.tool, "caddy");
  });

  test("無いとき（actual が null）は「無い」と言い、入れ方を示す", () => {
    const p = checkExact("bun", null, "1.4.3");
    assert.equal(p?.actual, null);
    assert.match(formatProblems([p]), /bun: 宣言 1\.4\.3 \/ 環境 見つからない/);
  });

  test("pnpm の揃え方は corepack を指す", () => {
    assert.match(checkExact("pnpm", "10.0.0", "11.28.8")?.fix ?? "", /corepack enable/);
  });
});

describe("chromiumBrowsersDir: Playwright がブラウザを探す場所（Playwright と同じ規則。#492 のレビュー 2）", () => {
  const opts = { coreDir: "/repo/node_modules/playwright-core", cwd: "/repo/e2e" };

  test("PLAYWRIGHT_BROWSERS_PATH が指定されていればそこ", () => {
    assert.equal(chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "/opt/pw" }, "linux", "/home/u", opts), "/opt/pw");
  });

  test("npm_config_ と npm_package_config_ の別名も読む（Playwright の getFromENV）", () => {
    assert.equal(chromiumBrowsersDir({ npm_config_playwright_browsers_path: "/npm" }, "linux", "/home/u", opts), "/npm");
    assert.equal(chromiumBrowsersDir({ npm_package_config_playwright_browsers_path: "/pkg" }, "linux", "/home/u", opts), "/pkg");
    // 本名が先
    assert.equal(
      chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "/a", npm_config_playwright_browsers_path: "/b" }, "linux", "/home/u", opts),
      "/a",
    );
  });

  test("0 は playwright-core の中の .local-browsers（比べずに通さない）", () => {
    assert.equal(
      chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "0" }, "linux", "/home/u", opts),
      path.join(opts.coreDir, ".local-browsers"),
    );
    // playwright-core の場所が分からなければ決められない
    assert.equal(chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "0" }, "linux", "/home/u"), null);
  });

  test("相対パスは INIT_CWD（無ければ cwd）から解く", () => {
    assert.equal(chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "pw" }, "linux", "/home/u", opts), path.resolve("/repo/e2e", "pw"));
    assert.equal(
      chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "pw", INIT_CWD: "/repo" }, "linux", "/home/u", opts),
      path.resolve("/repo", "pw"),
    );
  });

  test("Linux の既定は XDG_CACHE_HOME か ~/.cache の下の ms-playwright", () => {
    assert.equal(chromiumBrowsersDir({}, "linux", "/home/u", opts), path.join("/home/u", ".cache", "ms-playwright"));
    assert.equal(chromiumBrowsersDir({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u", opts), path.join("/xdg", "ms-playwright"));
  });

  test("macOS の既定は ~/Library/Caches/ms-playwright", () => {
    assert.equal(
      chromiumBrowsersDir({}, "darwin", "/Users/u", opts),
      path.join("/Users/u", "Library", "Caches", "ms-playwright"),
    );
  });

  test("Windows の既定は LOCALAPPDATA、無ければ ~/AppData/Local の下", () => {
    assert.equal(chromiumBrowsersDir({ LOCALAPPDATA: "/L" }, "win32", "/U", opts), path.join("/L", "ms-playwright"));
    assert.equal(chromiumBrowsersDir({}, "win32", "/U", opts), path.join("/U", "AppData", "Local", "ms-playwright"));
  });

  test("Playwright が対応しない OS は null", () => {
    assert.equal(chromiumBrowsersDir({}, "aix", "/home/u", opts), null);
  });
});

describe("checkChromium: 要求の revision が入っているか", () => {
  test("ブラウザ本体とヘッドレス用の両方が要る（既定のヘッドレスは headless shell で動く）", () => {
    assert.deepEqual(chromiumDirNames("1248"), ["chromium-1248", "chromium_headless_shell-1248"]);
  });

  test("両方あれば null", () => {
    const entries = ["chromium-1248", "chromium_headless_shell-1248", "ffmpeg-1011"];
    assert.equal(checkChromium("1248", "/opt/pw", entries), null);
  });

  test("別の revision しか無いとき、入っている revision を示し、入れ方を示す（#487 で 1243 しか無かった）", () => {
    const entries = ["chromium-1243", "chromium_headless_shell-1243", "ffmpeg-1011"];
    const p = checkChromium("1248", "/opt/pw", entries);
    assert.equal(p?.tool, "chromium");
    assert.equal(p?.actual, "1243");
    assert.match(p?.fix ?? "", /playwright install chromium/);
    assert.match(p?.fix ?? "", /\/opt\/pw/);
    // 張り替えで回避しない（別の版のブラウザを、要求の revision だと偽ることになる）
    assert.match(p?.fix ?? "", /リンク/);
  });

  test("ヘッドレス用だけ欠けていても止める", () => {
    const p = checkChromium("1248", "/opt/pw", ["chromium-1248"]);
    assert.equal(p?.tool, "chromium");
    assert.match(p?.fix ?? "", /chromium_headless_shell-1248/);
  });

  test("置き場そのものが無いとき（entries が null）も止める", () => {
    const p = checkChromium("1248", "/home/u/.cache/ms-playwright", null);
    assert.equal(p?.actual, null);
  });
});

describe("checkFfmpeg: 動画の記録に要る ffmpeg の revision が入っているか（#509）", () => {
  test("要求の revision があれば null", () => {
    assert.equal(checkFfmpeg("1013", "/opt/pw", ["chromium-1248", "ffmpeg-1013"]), null);
  });

  test("別の revision しか無いとき、入っている revision を示し、入れ方を示す（#509 で 1011 しか無かった）", () => {
    const p = checkFfmpeg("1013", "/opt/pw", ["chromium-1248", "chromium_headless_shell-1248", "ffmpeg-1011"]);
    assert.deepEqual([p?.tool, p?.declared, p?.actual], ["ffmpeg", "revision 1013", "1011"]);
    // `playwright install chromium` は ffmpeg も入れる（ブラウザごとに ffmpeg を足す）
    assert.match(p?.fix ?? "", /playwright install chromium/);
    assert.match(p?.fix ?? "", /ffmpeg-1013/);
    assert.match(p?.fix ?? "", /\/opt\/pw/);
    assert.match(p?.fix ?? "", /リンク/);
  });

  test("置き場そのものが無いとき（entries が null）も止める", () => {
    const p = checkFfmpeg("1013", "/home/u/.cache/ms-playwright", null);
    assert.deepEqual([p?.tool, p?.actual], ["ffmpeg", null]);
  });
});

describe("evaluateStage: 段ごとに見る道具", () => {
  const ok = {
    node: "v22.23.4",
    pnpm: "11.28.8",
    bun: "1.4.3",
    chromium: { dir: "/opt/pw", entries: ["chromium-1248", "chromium_headless_shell-1248", "ffmpeg-1013"] },
    caddy: { present: true, version: "2.11.7" },
  };

  test("段の名前は test・e2e・mutation", () => {
    assert.deepEqual(Object.keys(STAGES).sort(), ["e2e", "mutation", "test"]);
  });

  test("全部合っていれば問題 0 件", () => {
    for (const stage of Object.keys(STAGES)) {
      assert.deepEqual(evaluateStage(stage, DECLARED, ok).problems, [], stage);
    }
  });

  test("test の段は Chromium と Caddy を見ない（単体テストには要らない）", () => {
    const actual = { ...ok, chromium: { dir: "/opt/pw", entries: [] }, caddy: { present: true, version: "2.0.0" } };
    assert.deepEqual(evaluateStage("test", DECLARED, actual).problems, []);
  });

  test("e2e の段は Chromium と Caddy の版も見る", () => {
    const actual = { ...ok, chromium: { dir: "/opt/pw", entries: [] }, caddy: { present: true, version: "2.0.0" } };
    const tools = evaluateStage("e2e", DECLARED, actual).problems.map((p) => p.tool);
    assert.deepEqual(tools.sort(), ["caddy", "chromium", "ffmpeg"]);
  });

  test("e2e の段は ffmpeg だけが欠けていても止める（#509: Chromium だけ揃えると OK を出し、全件が動画の記録で落ちた）", () => {
    const actual = { ...ok, chromium: { dir: "/opt/pw", entries: ["chromium-1248", "chromium_headless_shell-1248", "ffmpeg-1011"] } };
    const tools = evaluateStage("e2e", DECLARED, actual).problems.map((p) => p.tool);
    assert.deepEqual(tools, ["ffmpeg"]);
  });

  test("test・mutation の段は ffmpeg を見ない", () => {
    const actual = { ...ok, chromium: { dir: "/opt/pw", entries: [] } };
    for (const stage of ["test", "mutation"]) assert.deepEqual(evaluateStage(stage, DECLARED, actual).problems, [], stage);
  });

  test("Caddy がまだ無いだけなら止めない（ハーネスが宣言の版を取りに行く）が、そう伝える", () => {
    const actual = { ...ok, caddy: { present: false, version: null } };
    const r = evaluateStage("e2e", DECLARED, actual);
    assert.deepEqual(r.problems, []);
    assert.ok(r.notes.some((n) => n.includes("Caddy 2.11.7")), r.notes.join("\n"));
  });

  test("Chromium の置き場を決められないときは止める（比べずに通すと、比較を飛ばす指定と同じになる）", () => {
    const actual = { ...ok, chromium: { dir: null, entries: null } };
    const tools = evaluateStage("e2e", DECLARED, actual).problems.map((p) => p.tool);
    assert.deepEqual(tools, ["chromium"]);
  });

  test("Bun の差は test でも mutation でも止める", () => {
    for (const stage of ["test", "mutation"]) {
      const tools = evaluateStage(stage, DECLARED, { ...ok, bun: "1.4.4" }).problems.map((p) => p.tool);
      assert.deepEqual(tools, ["bun"], stage);
    }
  });

  test("知らない段は例外にする（綴りの誤りで何も見ずに通さない）", () => {
    assert.throws(() => evaluateStage("tests", DECLARED, ok), /tests/);
  });
});

describe("揃え方: 公式の取得先に届かない環境（クラウドのセッション）の案内（#509）", () => {
  const CLOUD_GUIDE = /docs\/guides\/development\.md の「クラウドのセッションで道具を揃える」/;

  test("Bun・Chromium・ffmpeg の揃え方は、届かないときの案内の節を指す", () => {
    const fixes = {
      bun: checkExact("bun", "1.4.4", "1.4.3")?.fix,
      chromium: checkChromium("1248", "/opt/pw", ["chromium-1243"])?.fix,
      ffmpeg: checkFfmpeg("1013", "/opt/pw", ["ffmpeg-1011"])?.fix,
    };
    for (const [tool, fix] of Object.entries(fixes)) assert.match(fix ?? "", CLOUD_GUIDE, tool);
  });

  test("Node・pnpm の揃え方は指さない（クラウドのコンテナで足りていて、取得先を確かめていない）", () => {
    assert.doesNotMatch(checkNode("v22.22.0", "22.22.2")?.fix ?? "", CLOUD_GUIDE);
    assert.doesNotMatch(checkExact("pnpm", "10.0.0", "11.28.8")?.fix ?? "", CLOUD_GUIDE);
  });
});

describe("formatProblems: 何が・どの版で・どう揃えるか", () => {
  test("道具・宣言・環境・揃え方を 1 件ずつ並べる", () => {
    const text = formatProblems([checkExact("bun", "1.4.4", "1.4.3"), checkNode("v22.22.0", "22.22.2")]);
    assert.match(text, /bun: 宣言 1\.4\.3 \/ 環境 1\.4\.4/);
    assert.match(text, /node: 宣言 22\.22\.2 以上（22 系） \/ 環境 22\.22\.0/);
    assert.match(text, /揃え方:/);
  });
});
