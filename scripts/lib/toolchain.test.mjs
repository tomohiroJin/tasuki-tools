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
  evaluateStage,
  formatProblems,
} from "./toolchain.mjs";

const DECLARED = Object.freeze({
  node: "22.22.2",
  pnpm: "11.28.8",
  bun: "1.4.3",
  caddy: "2.11.7",
  chromium: "1248",
});

describe("parseVersion / compareVersions: 版の読み方", () => {
  test("x.y.z を数の組として読む。先頭の v と後ろの付記は落とす", () => {
    assert.deepEqual(parseVersion("22.22.2"), [22, 22, 2]);
    assert.deepEqual(parseVersion("v22.23.4"), [22, 23, 4]);
    assert.deepEqual(parseVersion("1.4.3+abc"), [1, 4, 3]);
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
    assert.equal(parsePnpmUserAgent("npm/10.9.0 node/v22.23.4 linux x64"), null);
    assert.equal(parsePnpmUserAgent(undefined), null);
  });
});

describe("parseCaddyVersionOutput: caddy version の出力", () => {
  test("先頭の v つきの版を読む", () => {
    assert.equal(parseCaddyVersionOutput("v2.11.7 h1:abcdef=\n"), "2.11.7");
  });
  test("読めなければ null", () => {
    assert.equal(parseCaddyVersionOutput("unknown"), null);
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

  test("無いとき（actual が null）は「無い」と言い、入れ方を示す", () => {
    const p = checkExact("bun", null, "1.4.3");
    assert.equal(p?.actual, null);
    assert.match(formatProblems([p]), /bun: 宣言 1\.4\.3 \/ 環境 見つからない/);
  });

  test("pnpm の揃え方は corepack を指す", () => {
    assert.match(checkExact("pnpm", "10.0.0", "11.28.8")?.fix ?? "", /corepack enable/);
  });
});

describe("chromiumBrowsersDir: Playwright がブラウザを探す場所", () => {
  test("PLAYWRIGHT_BROWSERS_PATH が指定されていればそこ", () => {
    assert.equal(chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "/opt/pw" }, "linux", "/home/u"), "/opt/pw");
  });

  test("Linux の既定は XDG_CACHE_HOME か ~/.cache の下の ms-playwright", () => {
    assert.equal(chromiumBrowsersDir({}, "linux", "/home/u"), path.join("/home/u", ".cache", "ms-playwright"));
    assert.equal(
      chromiumBrowsersDir({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u"),
      path.join("/xdg", "ms-playwright"),
    );
  });

  test("macOS の既定は ~/Library/Caches/ms-playwright", () => {
    assert.equal(
      chromiumBrowsersDir({}, "darwin", "/Users/u"),
      path.join("/Users/u", "Library", "Caches", "ms-playwright"),
    );
  });

  test("0（node_modules の中へ入れる指定）と、知らない OS は null（比べない。黙って通したことは呼び出し側が言う）", () => {
    assert.equal(chromiumBrowsersDir({ PLAYWRIGHT_BROWSERS_PATH: "0" }, "linux", "/home/u"), null);
    assert.equal(chromiumBrowsersDir({}, "aix", "/home/u"), null);
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

describe("evaluateStage: 段ごとに見る道具", () => {
  const ok = {
    node: "v22.23.4",
    pnpm: "11.28.8",
    bun: "1.4.3",
    chromium: { dir: "/opt/pw", entries: ["chromium-1248", "chromium_headless_shell-1248"] },
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
    assert.deepEqual(tools.sort(), ["caddy", "chromium"]);
  });

  test("Caddy がまだ無いだけなら止めない（ハーネスが宣言の版を取りに行く）が、そう伝える", () => {
    const actual = { ...ok, caddy: { present: false, version: null } };
    const r = evaluateStage("e2e", DECLARED, actual);
    assert.deepEqual(r.problems, []);
    assert.ok(r.notes.some((n) => n.includes("Caddy 2.11.7")), r.notes.join("\n"));
  });

  test("Chromium の置き場を決められないときは止めずに、比べなかったと伝える", () => {
    const actual = { ...ok, chromium: { dir: null, entries: null } };
    const r = evaluateStage("e2e", DECLARED, actual);
    assert.deepEqual(r.problems, []);
    assert.ok(r.notes.some((n) => n.includes("Chromium")));
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

describe("formatProblems: 何が・どの版で・どう揃えるか", () => {
  test("道具・宣言・環境・揃え方を 1 件ずつ並べる", () => {
    const text = formatProblems([checkExact("bun", "1.4.4", "1.4.3"), checkNode("v22.22.0", "22.22.2")]);
    assert.match(text, /bun: 宣言 1\.4\.3 \/ 環境 1\.4\.4/);
    assert.match(text, /node: 宣言 22\.22\.2 以上（22 系） \/ 環境 22\.22\.0/);
    assert.match(text, /揃え方:/);
  });
});
