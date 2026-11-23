import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBaseUrl,
  parseAppEnv,
  parseAppStates,
  planTargets,
  extractAssets,
  verifyProd,
  formatReport,
} from "./prod-verify.mjs";

/** `scripts/lib/prod-verify.mjs` の自己テスト（#675）。取得と手元の読み取りは偽物を渡し、ネットワークを叩かない。 */

const BASE = "https://tasuki.example.com";
const html = (...assets) => `<!doctype html><html><head>${assets.map((a) => `<script type="module" src="/x/${a}"></script>`).join("")}</head></html>`;
const JS = "assets/index-AAAA1111.js";
const CSS = "assets/index-BBBB2222.css";
const OTHER_JS = "assets/index-ZZZZ9999.js";

const appEnv = (name, publicPath, dist = `apps/${name}-web/dist`) => `# コメント\nAPP_NAME=${name}\nSTATIC_ONLY=1\n\nWEB_DIST=${dist}\nPUBLIC_PATH=${publicPath}\n`;
const readme = (rows) =>
  `# デプロイ手順\n\n## アプリ一覧\n\n| アプリ | サービス | ポート | 配置先 | 公開パス | 状態 |\n|---|---|---|---|---|---|\n${rows
    .map(([name, state]) => `| \`${name}\` | （無し・静的） | — | \`/var/www/x\` | \`/${name}/\` | ${state} |`)
    .join("\n")}\n\n> 注記の中の | \`ghost\` | は表ではない\n\n## 通常運用\n\n| \`later\` | a | b | c | d | 公開中 |\n`;

const target = (app, publicPath = `/${app}/`) => ({ app, publicPath, webDist: `apps/${app}-web/dist` });

/**
 * 偽の取得。`pages` は URL → 応答（`{ status, contentType, body }`）か、投げる Error。
 * 載っていない URL は 404 を返す。
 */
function fakeFetch(pages) {
  const calls = [];
  const fetchText = async (url) => {
    calls.push(url);
    const hit = pages[url];
    if (hit instanceof Error) throw hit;
    return hit ?? { status: 404, contentType: "text/plain", body: "" };
  };
  return { fetchText, calls };
}

/** 道具 1 つぶんの、揃っている本番の応答。 */
function healthyPages(apps, assets = [JS, CSS]) {
  const pages = { [`${BASE}/ws`]: { status: 426, contentType: "text/plain", body: "Upgrade Required" } };
  for (const t of apps) {
    pages[`${BASE}${t.publicPath}`] = { status: 200, contentType: "text/html; charset=utf-8", body: html(...assets) };
    for (const a of assets) {
      pages[`${BASE}${t.publicPath}${a}`] = { status: 200, contentType: a.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", body: "x" };
    }
  }
  return pages;
}

const localOf = (map) => (webDist) => map[webDist] ?? null;
const healthyLocal = (apps, assets = [JS, CSS]) => localOf(Object.fromEntries(apps.map((t) => [t.webDist, html(...assets)])));

describe("resolveBaseUrl", () => {
  test("https の公開ドメインを受け取り、末尾の / を落とす", () => {
    assert.deepEqual(resolveBaseUrl({ TASUKI_E2E_BASE_URL: " https://tasuki.example.com/ " }), { ok: true, baseUrl: BASE });
  });

  test("未設定・空・URL でない値は、既定に倒さず理由を返す", () => {
    for (const env of [{}, { TASUKI_E2E_BASE_URL: "  " }, { TASUKI_E2E_BASE_URL: "tasuki.example.com" }]) {
      const r = resolveBaseUrl(env);
      assert.equal(r.ok, false, JSON.stringify(env));
      assert.match(r.problem, /TASUKI_E2E_BASE_URL/);
    }
  });

  test("http とローカル宛は拒む（本番を見たつもりで手元を見ない。e2e/harness/target.ts と同じ）", () => {
    for (const url of ["http://tasuki.example.com", "https://localhost", "https://127.0.0.1:8443", "https://192.168.1.5", "https://10.0.0.1", "https://172.16.0.1", "https://[::1]"]) {
      assert.equal(resolveBaseUrl({ TASUKI_E2E_BASE_URL: url }).ok, false, url);
    }
  });

  test("パス・問い合わせ・資格情報の付いた URL は拒む（公開パスを後ろへ足すので、根だけを受け取る）", () => {
    for (const url of ["https://tasuki.example.com/timer/", "https://tasuki.example.com/?a=1", "https://user:pw@tasuki.example.com"]) {
      assert.equal(resolveBaseUrl({ TASUKI_E2E_BASE_URL: url }).ok, false, url);
    }
  });
});

describe("parseAppEnv", () => {
  test("コメントと空行を除き、KEY=値 を読む", () => {
    assert.deepEqual(parseAppEnv(appEnv("poker", "/poker/")), { APP_NAME: "poker", STATIC_ONLY: "1", WEB_DIST: "apps/poker-web/dist", PUBLIC_PATH: "/poker/" });
  });
});

describe("parseAppStates", () => {
  test("「アプリ一覧」の表の行だけから、道具ごとの状態を読む", () => {
    const states = parseAppStates(readme([["timer", "公開中"], ["track", "未公開（#476。配る順は NOTES）"], ["odd", "準備中"]]));
    assert.deepEqual([...states], [["timer", "published"], ["track", "unpublished"], ["odd", "unknown"]]);
  });

  test("節が無ければ空（呼び出し側が道具の欠けとして止める）", () => {
    assert.equal(parseAppStates("# 別の文書\n").size, 0);
  });
});

describe("planTargets", () => {
  const envs = (names) => names.map((n) => ({ dir: n, text: appEnv(n, `/${n}/`) }));

  test("公開中の道具を対象にし、未公開は飛ばしたと名指しする", () => {
    const plan = planTargets({ appEnvs: envs(["timer", "track"]), readme: readme([["timer", "公開中"], ["track", "未公開"]]) });
    assert.deepEqual(plan.problems, []);
    assert.deepEqual(plan.targets, [target("timer")]);
    assert.deepEqual(plan.skipped, ["track"]);
  });

  test("表に無い道具は、黙って飛ばさず名指しする", () => {
    const plan = planTargets({ appEnvs: envs(["timer", "poker"]), readme: readme([["timer", "公開中"]]) });
    assert.equal(plan.problems.length, 1);
    assert.match(plan.problems[0], /poker/);
  });

  test("表にあって app.env の無い道具も名指しする", () => {
    const plan = planTargets({ appEnvs: envs(["timer"]), readme: readme([["timer", "公開中"], ["poker", "公開中"]]) });
    assert.equal(plan.problems.length, 1);
    assert.match(plan.problems[0], /poker/);
  });

  test("状態が読めない道具は、公開中とも未公開ともせず名指しする", () => {
    const plan = planTargets({ appEnvs: envs(["timer"]), readme: readme([["timer", "準備中"]]) });
    assert.equal(plan.problems.length, 1);
    assert.match(plan.problems[0], /timer/);
    assert.deepEqual(plan.targets, []);
  });

  test("WEB_DIST・PUBLIC_PATH が欠けた app.env、/ で囲まれていない公開パスは名指しする", () => {
    const broken = [
      { dir: "a", text: "APP_NAME=a\nPUBLIC_PATH=/a/\n" },
      { dir: "b", text: "APP_NAME=b\nWEB_DIST=apps/b-web/dist\n" },
      { dir: "c", text: appEnv("c", "/c") },
      { dir: "d", text: appEnv("x", "/d/") },
    ];
    const plan = planTargets({ appEnvs: broken, readme: readme([["a", "公開中"], ["b", "公開中"], ["c", "公開中"], ["d", "公開中"]]) });
    assert.equal(plan.problems.length, 4, plan.problems.join("\n"));
    assert.deepEqual(plan.targets, []);
  });

  test("公開中の道具が 1 つも無ければ止める（確かめが空振りする）", () => {
    const none = planTargets({ appEnvs: [], readme: readme([]) });
    assert.equal(none.problems.length, 1);
    const allSkipped = planTargets({ appEnvs: envs(["track"]), readme: readme([["track", "未公開"]]) });
    assert.equal(allSkipped.problems.length, 1);
  });
});

describe("extractAssets", () => {
  test("assets/ の js と css を、重複なく並べて返す", () => {
    assert.deepEqual(extractAssets(html(JS, CSS, JS)), [JS, CSS].sort());
  });

  test("空の応答・別のページからは何も取らない", () => {
    assert.deepEqual(extractAssets(""), []);
    assert.deepEqual(extractAssets("<html><body>502 Bad Gateway</body></html>"), []);
  });
});

describe("verifyProd", () => {
  const apps = [target("landing", "/"), target("timer")];

  test("揃っていれば、道具ごとの一致と /ws の 426 を ok で返す", async () => {
    const { fetchText, calls } = fakeFetch(healthyPages(apps));
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText });
    assert.equal(report.ok, true, formatReport(report));
    assert.deepEqual(report.checks.map((c) => [c.label, c.ok]), [["landing", true], ["timer", true], ["/ws", true]]);
    // 公開パスの応答・js と css の 1 本ずつ・/ws を、道具ごとに実際に取りに行っている
    const expected = [`${BASE}/`, `${BASE}/${JS}`, `${BASE}/${CSS}`, `${BASE}/timer/`, `${BASE}/timer/${JS}`, `${BASE}/timer/${CSS}`, `${BASE}/ws`];
    assert.deepEqual(calls.sort(), expected.sort());
  });

  test("配信のハッシュが手元と違えば、道具と両方の名前を名指しする", async () => {
    const pages = healthyPages(apps);
    pages[`${BASE}/timer/`] = { status: 200, contentType: "text/html", body: html(OTHER_JS, CSS) };
    pages[`${BASE}/timer/${OTHER_JS}`] = { status: 200, contentType: "text/javascript", body: "" };
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
    assert.equal(report.ok, false);
    const timer = report.checks.find((c) => c.label === "timer");
    assert.equal(timer.ok, false);
    assert.match(timer.detail, new RegExp(JS.replace(".", "\\.")));
    assert.match(timer.detail, new RegExp(OTHER_JS.replace(".", "\\.")));
    assert.equal(report.checks.find((c) => c.label === "landing").ok, true, "ずれていない道具まで巻き込まない");
  });

  test("css だけが違っても、ずれとして名指しする", async () => {
    const pages = healthyPages(apps);
    pages[`${BASE}/timer/`] = { status: 200, contentType: "text/html", body: html(JS, "assets/index-CCCC3333.css") };
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
    assert.equal(report.checks.find((c) => c.label === "timer").ok, false);
  });

  test("空どうしを「一致」にしない（手元も配信も assets を持たない）", async () => {
    const pages = healthyPages(apps);
    pages[`${BASE}/timer/`] = { status: 200, contentType: "text/html", body: "" };
    const local = localOf({ "apps/landing-web/dist": html(JS, CSS), "apps/timer-web/dist": "" });
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: local, fetchText: fakeFetch(pages).fetchText });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((c) => c.label === "timer").ok, false);
  });

  test("css だけで js の無い index.html どうしも「一致」にしない", async () => {
    const one = [target("timer")];
    const report = await verifyProd({ baseUrl: BASE, targets: one, readLocalIndex: healthyLocal(one, [CSS]), fetchText: fakeFetch(healthyPages(one, [CSS])).fetchText });
    assert.equal(report.ok, false);
  });

  test("dist が無い道具は「一致」にせず、ビルドを促す", async () => {
    const local = localOf({ "apps/landing-web/dist": html(JS, CSS) });
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: local, fetchText: fakeFetch(healthyPages(apps)).fetchText });
    assert.equal(report.ok, false);
    const timer = report.checks.find((c) => c.label === "timer");
    assert.equal(timer.ok, false);
    assert.match(timer.detail, /apps\/timer-web\/dist/);
    assert.match(timer.detail, /build/);
  });

  test("公開パスが 200 でなければ、本文にハッシュがあっても通さない", async () => {
    const pages = healthyPages(apps);
    pages[`${BASE}/timer/`] = { status: 503, contentType: "text/html", body: html(JS, CSS) };
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
    const timer = report.checks.find((c) => c.label === "timer");
    assert.equal(timer.ok, false);
    assert.match(timer.detail, /503/);
  });

  test("js・css の実体が取れない・html が返る（SPA のフォールバックに吸われた）ときは通さない", async () => {
    const brokens = [
      { status: 404, contentType: "text/plain", body: "" },
      // 種類は名前どおりでも、200 でなければ通さない（状態コードと種類を別々に見る。#675 のレビュー）
      { status: 404, contentType: "text/javascript", body: "" },
      { status: 404, contentType: "text/css", body: "" },
      { status: 200, contentType: "text/html", body: html(JS) },
      new Error("reset"),
    ];
    for (const name of [JS, CSS]) {
      for (const broken of brokens) {
        const pages = healthyPages(apps);
        pages[`${BASE}/timer/${name}`] = broken;
        const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
        const timer = report.checks.find((c) => c.label === "timer");
        assert.equal(timer.ok, false, `${name} ${JSON.stringify(broken)}`);
        assert.match(timer.detail, new RegExp(name.replace(".", "\\.")));
        assert.equal(report.checks.find((c) => c.label === "landing").ok, true);
      }
    }
  });

  test("/ws が 426 でなければ通さない（200 は SPA のフォールバックに吸われている）", async () => {
    for (const status of [200, 404, 502]) {
      const pages = healthyPages(apps);
      pages[`${BASE}/ws`] = { status, contentType: "text/html", body: "" };
      const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
      assert.equal(report.ok, false, String(status));
      const ws = report.checks.find((c) => c.label === "/ws");
      assert.equal(ws.ok, false);
      assert.match(ws.detail, new RegExp(String(status)));
    }
  });

  test("取得が失敗しても投げずに、その道具を名指しして残りを確かめる", async () => {
    const pages = healthyPages(apps);
    pages[`${BASE}/timer/`] = new Error("fetch failed");
    pages[`${BASE}/ws`] = new Error("timeout");
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
    assert.deepEqual(report.checks.map((c) => [c.label, c.ok]), [["landing", true], ["timer", false], ["/ws", false]]);
    assert.match(report.checks[1].detail, /fetch failed/);
  });

  test("対象が 0 本なら ok にしない", async () => {
    const report = await verifyProd({ baseUrl: BASE, targets: [], readLocalIndex: localOf({}), fetchText: fakeFetch(healthyPages([])).fetchText });
    assert.equal(report.ok, false);
  });
});

describe("formatReport", () => {
  test("道具ごとの行と、ずれの件数を出す", async () => {
    const apps = [target("landing", "/"), target("timer")];
    const pages = healthyPages(apps);
    pages[`${BASE}/ws`] = { status: 200, contentType: "text/html", body: "" };
    const report = await verifyProd({ baseUrl: BASE, targets: apps, readLocalIndex: healthyLocal(apps), fetchText: fakeFetch(pages).fetchText });
    const text = formatReport(report);
    assert.match(text, /OK\s+landing/);
    assert.match(text, /OK\s+timer/);
    assert.match(text, /NG\s+\/ws/);
    assert.match(text, /1 件/);
  });
});
