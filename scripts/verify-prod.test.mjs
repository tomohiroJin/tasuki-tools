/**
 * `scripts/verify-prod.mjs` の配線（#675）。
 *
 * 判定そのものは `scripts/lib/prod-verify.test.mjs` が見る。ここは、`main()` が実際に `deploy/<app>/app.env`・
 * `deploy/README.md`・手元の `dist` を読み、取得した応答と比べ、**ずれがあれば非 0 で終わる**ことを、
 * 複製を子プロセスで起動して見る。本番は叩かない。複製の中で、リポジトリの根を一時ディレクトリへ、
 * 取得を偽物（一時ファイルの対応表を読む）へ差し替える。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";
import { planTargets } from "./lib/prod-verify.mjs";
import { findGuardedCommands } from "./lib/agent-guard.mjs";

const SCRIPT = "verify-prod.mjs";
const { runScriptCopy } = createScriptCopyHarness(".verify-prod-", { timeoutMs: 60_000 });

const ROOT_LINE = 'const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");';
const FETCH_LINE = "const fetchImpl = globalThis.fetch;";
const E2E_COMMAND = 'const E2E_COMMAND = ["pnpm", ["e2e:prod"]];';

const BASE = "https://tasuki.example.com";
const JS = "assets/index-AAAA1111.js";
const OTHER_JS = "assets/index-ZZZZ9999.js";
const html = (js) => `<!doctype html><script type="module" src="/x/${js}"></script>`;

const APPS = [
  { name: "landing", publicPath: "/", state: "公開中" },
  { name: "timer", publicPath: "/timer/", state: "公開中" },
  { name: "track", publicPath: "/track/", state: "未公開（まだ配っていない）" },
];

/** 偽の取得。対応表（URL → 応答）に無い URL は 404。 */
const STUB = `import fs from "node:fs";
const pages = JSON.parse(fs.readFileSync(new URL("./pages.json", import.meta.url), "utf8"));
export const fetchImpl = async (url, init) => {
  // リダイレクトを追わない・時間切れを持つ、の 2 つを入口が渡しているか（渡していなければ取得の失敗にする。#675 のレビュー）
  if (init?.redirect !== "manual") throw new Error("redirect: manual が渡されていません");
  if (!(init?.signal instanceof AbortSignal)) throw new Error("時間切れの signal が渡されていません");
  const hit = pages[String(url)] ?? { status: 404, contentType: "text/plain", body: "" };
  return new Response(hit.body, { status: hit.status, headers: { "content-type": hit.contentType } });
};
`;

/**
 * 一時のリポジトリ（deploy と dist）と偽の本番を作り、複製を起動する。
 * `tweak({ root, pages })` で、起動の前に壊す。
 */
function runFixture({ tweak = () => {}, args = [], env = { TASUKI_E2E_BASE_URL: BASE }, e2eCommand } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-prod-"));
  try {
    const rows = APPS.map((a) => `| \`${a.name}\` | — | — | \`/var/www/${a.name}\` | \`${a.publicPath}\` | ${a.state} |`).join("\n");
    fs.mkdirSync(path.join(root, "deploy"), { recursive: true });
    fs.writeFileSync(path.join(root, "deploy", "README.md"), `# デプロイ手順\n\n## アプリ一覧\n\n| アプリ | サービス | ポート | 配置先 | 公開パス | 状態 |\n|---|---|---|---|---|---|\n${rows}\n\n## 通常運用\n`);
    const pages = { [`${BASE}/ws`]: { status: 426, contentType: "text/plain", body: "" } };
    for (const a of APPS) {
      const dist = `apps/${a.name}-web/dist`;
      fs.mkdirSync(path.join(root, "deploy", a.name), { recursive: true });
      fs.writeFileSync(path.join(root, "deploy", a.name, "app.env"), `APP_NAME=${a.name}\nSTATIC_ONLY=1\nWEB_DIST=${dist}\nPUBLIC_PATH=${a.publicPath}\n`);
      fs.mkdirSync(path.join(root, dist), { recursive: true });
      fs.writeFileSync(path.join(root, dist, "index.html"), html(JS));
      if (a.state.startsWith("公開中")) {
        pages[`${BASE}${a.publicPath}`] = { status: 200, contentType: "text/html", body: html(JS) };
        pages[`${BASE}${a.publicPath}${JS}`] = { status: 200, contentType: "text/javascript", body: "export {}" };
      }
    }
    // app.env の無いディレクトリ（caddy・lib ほか）は道具でない
    fs.mkdirSync(path.join(root, "deploy", "caddy"));
    tweak({ root, pages });
    fs.writeFileSync(path.join(root, "stub.mjs"), STUB);
    fs.writeFileSync(path.join(root, "pages.json"), JSON.stringify(pages));

    const replacements = [
      [ROOT_LINE, `const REPO_ROOT = ${JSON.stringify(root)};`],
      [FETCH_LINE, `const { fetchImpl } = await import(${JSON.stringify(pathToFileURL(path.join(root, "stub.mjs")).href)});`],
    ];
    if (e2eCommand !== undefined) replacements.push([E2E_COMMAND, `const E2E_COMMAND = ${JSON.stringify(e2eCommand)};`]);
    return runScriptCopy(
      SCRIPT,
      (source) =>
        replacements.reduce((src, [needle, to]) => {
          assert.equal(countOf(src, needle), 1, `差し替える行（${needle}）が実装に 1 か所ありません`);
          return src.replace(needle, to);
        }, source),
      { args, env },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** 何も差し替えない複製（接続先が決まらず、取得まで進まない形だけに使う）。 */
const runPlain = (args, env) => runScriptCopy(SCRIPT, (s) => s, { args, env: { TASUKI_E2E_BASE_URL: undefined, ...env } });

describe("verify-prod の起動", () => {
  test("接続先が無ければ、既定に倒さず exit 2 で終わる", () => {
    const r = runPlain([], {});
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /TASUKI_E2E_BASE_URL/);
  });

  test("http・ローカル宛は exit 2 で終わる", () => {
    for (const url of ["http://tasuki.example.com", "https://127.0.0.1"]) {
      assert.equal(runPlain([], { TASUKI_E2E_BASE_URL: url }).status, 2, url);
    }
  });

  test("知らない引数は exit 2 で終わる（--e2e の打ち間違いで、E2E を流したつもりにしない）", () => {
    const r = runPlain(["--e2"], { TASUKI_E2E_BASE_URL: BASE });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /--e2\b/);
  });
});

describe("verify-prod の確かめ", () => {
  test("揃っていれば exit 0。公開中の道具と /ws を並べ、未公開は飛ばしたと出す", () => {
    const r = runFixture();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /OK\s+landing/);
    assert.match(r.stdout, /OK\s+timer/);
    assert.match(r.stdout, /OK\s+\/ws/);
    assert.doesNotMatch(r.stdout, /(OK|NG)\s+track/);
    assert.match(r.stdout, /未公開.*track/);
  });

  test("揃っていても、確かめていないもの（NRestarts・e2e:prod）を案内する", () => {
    const r = runFixture();
    assert.match(r.stdout, /NRestarts/);
    assert.match(r.stdout, /pnpm verify:prod --e2e/);
  });

  test("配信のハッシュがずれていれば、道具を名指しして exit 1", () => {
    const r = runFixture({
      tweak: ({ pages }) => {
        pages[`${BASE}/timer/`].body = html(OTHER_JS);
      },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NG\s+timer/);
    assert.match(r.stdout, /OK\s+landing/);
  });

  test("dist が無ければ「一致」と出さず exit 1", () => {
    const r = runFixture({ tweak: ({ root }) => fs.rmSync(path.join(root, "apps/timer-web/dist"), { recursive: true }) });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NG\s+timer/);
    assert.doesNotMatch(r.stdout, /timer.*一致/);
  });

  test("手元も配信も空なら「一致」と出さず exit 1", () => {
    const r = runFixture({
      tweak: ({ root, pages }) => {
        fs.writeFileSync(path.join(root, "apps/timer-web/dist/index.html"), "");
        pages[`${BASE}/timer/`].body = "";
      },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NG\s+timer/);
  });

  test("表に無い道具があれば、取得を始めずに名指しして exit 1", () => {
    const r = runFixture({
      tweak: ({ root }) => {
        fs.mkdirSync(path.join(root, "deploy", "poker"));
        fs.writeFileSync(path.join(root, "deploy", "poker", "app.env"), "APP_NAME=poker\nWEB_DIST=apps/poker-web/dist\nPUBLIC_PATH=/poker/\n");
      },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /poker/);
    assert.doesNotMatch(r.stdout, /OK\s+landing/);
  });

  test("/ws が 426 でなければ exit 1", () => {
    const r = runFixture({
      tweak: ({ pages }) => {
        pages[`${BASE}/ws`].status = 200;
      },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NG\s+\/ws/);
  });
});

describe("verify-prod --e2e", () => {
  const fakeE2e = (code) => [process.execPath, ["-e", `console.log("E2E-RAN " + process.env.TASUKI_E2E_BASE_URL); process.exitCode = ${code};`]];

  test("揃っていれば続けて E2E を流し、その終了コードで終わる", () => {
    const ok = runFixture({ args: ["--e2e"], e2eCommand: fakeE2e(0) });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, new RegExp(`E2E-RAN ${BASE}`));
    const red = runFixture({ args: ["--e2e"], e2eCommand: fakeE2e(7) });
    assert.equal(red.status, 7, red.stdout + red.stderr);
    assert.match(red.stderr, /NG: E2E が通っていません（終了コード 7）/);
    assert.doesNotMatch(ok.stderr, /NG/);
  });

  test("E2E を起動できない・シグナルで落ちたときは、成功で終わらない", () => {
    const missing = runFixture({ args: ["--e2e"], e2eCommand: [path.join(os.tmpdir(), "verify-prod-no-such-command"), []] });
    assert.notEqual(missing.status, 0, missing.stdout + missing.stderr);
    assert.match(missing.stderr, /起動できません/);
    const killed = runFixture({ args: ["--e2e"], e2eCommand: [process.execPath, ["-e", 'process.kill(process.pid, "SIGKILL")']] });
    assert.notEqual(killed.status, 0, killed.stdout + killed.stderr);
    // 終了コードだけでなく、なぜ赤なのかが出力から分かる（揃ったときの終わり方と同じ見た目にしない。#675 の 2 回目のレビュー）
    assert.match(killed.stderr, /SIGKILL/);
    assert.match(killed.stderr, /NG: E2E が通っていません/);
  });

  test("揃っていなければ E2E を流さない", () => {
    const r = runFixture({
      args: ["--e2e"],
      e2eCommand: fakeE2e(0),
      tweak: ({ pages }) => {
        pages[`${BASE}/ws`].status = 200;
      },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /E2E-RAN/);
  });

  test("--e2e を付けなければ E2E を流さない", () => {
    const r = runFixture({ e2eCommand: fakeE2e(0) });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /E2E-RAN/);
  });
});

describe("フックの一覧との関係", () => {
  test("確かめのコマンドは、本番デプロイを止めるフックの一覧に当たらない（読むだけなので、人に聞かずに流せる）", () => {
    for (const command of [
      "TASUKI_E2E_BASE_URL=https://tasuki.example.com pnpm verify:prod",
      "TASUKI_E2E_BASE_URL=https://tasuki.example.com pnpm verify:prod --e2e",
      "node scripts/verify-prod.mjs",
    ]) {
      assert.deepEqual(findGuardedCommands(command), [], command);
    }
  });
});

describe("実物の deploy/ と README", () => {
  test("deploy/*/app.env のすべての道具が、対象か未公開のどちらかに入る（表との欠けが無い）", () => {
    const deployDir = path.join(REPO_ROOT, "deploy");
    const dirs = fs.readdirSync(deployDir).filter((d) => fs.existsSync(path.join(deployDir, d, "app.env")));
    assert.ok(dirs.length > 0, "deploy/*/app.env が 1 つも見つかりません");
    const plan = planTargets({
      appEnvs: dirs.map((dir) => ({ dir, text: fs.readFileSync(path.join(deployDir, dir, "app.env"), "utf8") })),
      readme: fs.readFileSync(path.join(deployDir, "README.md"), "utf8"),
    });
    assert.deepEqual(plan.problems, []);
    assert.deepEqual([...plan.targets.map((t) => t.app), ...plan.skipped].sort(), dirs.sort());
    assert.ok(plan.targets.length > 0);
  });
});
