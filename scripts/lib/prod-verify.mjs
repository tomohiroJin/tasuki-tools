/**
 * 本番に配った後の、読むだけの確かめの判定（#675）。
 *
 * 入口は `scripts/verify-prod.mjs`（`pnpm verify:prod`）。ここは判定だけを置き、取得（`fetchText`）と
 * 手元の読み取り（`readLocalIndex`）は引数で受け取る。テストは偽物を渡す。
 *
 * ## 何を確かめるか
 *
 * - **公開中の道具ごと**（`deploy/<app>/app.env` と `deploy/README.md` の「アプリ一覧」の表から導く）
 *   - 公開パスが 200 を返す
 *   - 配信の `index.html` が指す `assets/` の js・css の名前（ビルドのハッシュつき）が、手元の `dist/index.html` と同じ
 *   - その js・css の 1 本ずつが 200 で、名前どおりの種類として返る（SPA のフォールバックに吸われて html が返っていない）
 * - **`/ws` が 426**（唯一の WebSocket の入口。200 なら SPA のフォールバックに吸われている）
 *
 * ## 「一致」と言わない形（過去に、空どうしの比較で偽の「一致」が出た）
 *
 * 手元か配信のどちらかが空・js を 1 つも持たない・`dist` が無い・表に無い道具がある・対象が 0 本のときは、
 * 比べずに名指しして NG にする。**迷ったら NG に倒す。**
 *
 * ## 何を確かめないか
 *
 * - 同期サーバーの `ActiveState`・`NRestarts`（`ssh` が要る。入口が手で流すコマンドを案内する）
 * - 画面の動き（`pnpm e2e:prod`。入口が `--e2e` で続けて流す）
 * - 手元の `dist` が、配った時のビルドかどうか（作り直していれば、作り直した方と比べる）
 *
 * 設計方針: 純粋関数と、I/O を引数で受ける関数だけを置く。追加依存は禁止。
 */

/** ローカル宛と判断するホスト名・IP（`e2e/harness/target.ts` の `LOCAL_HOST_PATTERNS` と同じ並び）。 */
const LOCAL_HOST_PATTERNS = [/^localhost$/i, /^127\./, /^\[?::1\]?$/, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

const ENV_NAME = "TASUKI_E2E_BASE_URL";

/**
 * 接続先を環境変数から決める。**既定値を持たせない**（`pnpm e2e:prod` と同じ変数・同じ拒み方）。
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, baseUrl: string } | { ok: false, problem: string }}
 */
export function resolveBaseUrl(env) {
  const raw = env[ENV_NAME]?.trim() ?? "";
  if (raw === "") return { ok: false, problem: `${ENV_NAME} が必要です（例: ${ENV_NAME}=https://<公開ドメイン> pnpm verify:prod）` };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problem: `${ENV_NAME} が URL として解釈できません: ${raw}` };
  }
  if (url.protocol !== "https:") return { ok: false, problem: `${ENV_NAME} は https のみ受け取ります（受け取った値: ${raw}）` };
  if (LOCAL_HOST_PATTERNS.some((p) => p.test(url.hostname))) {
    return { ok: false, problem: `${ENV_NAME} にローカル宛の URL が指定されています（${raw}）。本番を確かめたつもりで手元を見ないよう拒みます` };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, problem: `${ENV_NAME} に資格情報を含めないでください` };
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return { ok: false, problem: `${ENV_NAME} はサイトの根だけを指定してください（公開パスは道具ごとに足します。受け取った値: ${raw}）` };
  }
  return { ok: true, baseUrl: url.origin };
}

/** `app.env` の `KEY=値` を読む（コメントと空行を除く。値の引用符は使っていないので剥がさない）。 */
export function parseAppEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

/**
 * `deploy/README.md` の「アプリ一覧」の表から、道具ごとの公開の状態を読む（表が正本。同 README「公開範囲の方針」）。
 * 見るのは見出し `## アプリ一覧` から次の `## ` までの、先頭のセルが `` `<名前>` `` の行だけ。
 * @returns {Map<string, "published" | "unpublished" | "unknown">}
 */
export function parseAppStates(readme) {
  const states = new Map();
  let inSection = false;
  for (const line of readme.split("\n")) {
    if (/^## /.test(line)) inSection = /^## アプリ一覧\s*$/.test(line);
    if (!inSection) continue;
    const m = /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(line);
    if (!m) continue;
    const cells = line.split("|").map((c) => c.trim());
    const state = cells[cells.length - 2] ?? "";
    states.set(m[1], state.startsWith("公開中") ? "published" : state.startsWith("未公開") ? "unpublished" : "unknown");
  }
  return states;
}

/**
 * 確かめる道具を決める。**道具の欠けを黙って飛ばさない。**
 * @param {{ appEnvs: { dir: string, text: string }[], readme: string }} input `dir` は `deploy/` の下のディレクトリ名
 * @returns {{ targets: { app: string, publicPath: string, webDist: string }[], skipped: string[], problems: string[] }}
 */
export function planTargets({ appEnvs, readme }) {
  const states = parseAppStates(readme);
  const targets = [];
  const skipped = [];
  const problems = [];
  for (const { dir, text } of appEnvs) {
    const env = parseAppEnv(text);
    const where = `deploy/${dir}/app.env`;
    if (env.APP_NAME !== dir) {
      problems.push(`${where}: APP_NAME（${env.APP_NAME ?? "無し"}）がディレクトリ名と違います`);
      continue;
    }
    const state = states.get(dir);
    if (state === undefined) {
      problems.push(`${dir}: deploy/README.md の「アプリ一覧」の表に行がありません（公開中か未公開かを決められない）`);
      continue;
    }
    if (state === "unknown") {
      problems.push(`${dir}: deploy/README.md の「アプリ一覧」の状態が「公開中」「未公開」のどちらでも始まりません`);
      continue;
    }
    if (state === "unpublished") {
      skipped.push(dir);
      continue;
    }
    if (!env.WEB_DIST) {
      problems.push(`${where}: WEB_DIST がありません`);
      continue;
    }
    if (!/^\/(?:[a-z0-9-]+\/)?$/.test(env.PUBLIC_PATH ?? "")) {
      problems.push(`${where}: PUBLIC_PATH（${env.PUBLIC_PATH ?? "無し"}）が / か /<名前>/ の形ではありません`);
      continue;
    }
    targets.push({ app: dir, publicPath: env.PUBLIC_PATH, webDist: env.WEB_DIST });
  }
  const dirs = new Set(appEnvs.map((a) => a.dir));
  for (const name of states.keys()) {
    if (!dirs.has(name)) problems.push(`${name}: deploy/README.md の「アプリ一覧」の表にあるのに、deploy/${name}/app.env がありません`);
  }
  if (problems.length === 0 && targets.length === 0) problems.push("公開中の道具が 1 つもありません（確かめが空振りします）");
  return { targets, skipped, problems };
}

/** `index.html` が指す `assets/` の js・css の名前（重複なし・並べ替え済み）。 */
export function extractAssets(html) {
  return [...new Set(String(html).match(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g) ?? [])].sort();
}

const isJs = (name) => name.endsWith(".js");
/** 比べてよい `index.html` か（js を 1 本も指さないものは、空の応答か別のページ。空どうしを「一致」にしない）。 */
const hasEntry = (assets) => assets.some(isJs);
const errorText = (e) => String(e?.cause?.message ?? e?.message ?? e).split("\n")[0];

/** `assets/` の 1 本が 200 で、名前どおりの種類（js・css）として返るか。揃っていれば null、そうでなければ理由。 */
async function checkAsset(pageUrl, name, fetchText) {
  let asset;
  try {
    asset = await fetchText(`${pageUrl}${name}`);
  } catch (e) {
    return `${name} の取得に失敗しました（${errorText(e)}）`;
  }
  if (asset.status !== 200) return `${name} が ${asset.status} を返しました（200 を期待）`;
  const expected = isJs(name) ? /javascript/i : /css/i;
  if (!expected.test(asset.contentType ?? "")) {
    return `${name} が ${isJs(name) ? "JavaScript" : "CSS"} として返りません（content-type: ${asset.contentType ?? "無し"}。SPA のフォールバックに吸われている疑い）`;
  }
  return null;
}

/** 道具 1 つを確かめる。 */
async function checkApp(baseUrl, { app, publicPath, webDist }, readLocalIndex, fetchText) {
  const fail = (detail) => ({ label: app, ok: false, detail: `${publicPath} ${detail}` });

  const localHtml = readLocalIndex(webDist);
  if (localHtml === null) return fail(`手元の ${webDist}/index.html がありません（先に pnpm build）`);
  const local = extractAssets(localHtml);
  if (!hasEntry(local)) return fail(`手元の ${webDist}/index.html に assets/ の js がありません（ビルドが不完全）`);

  const pageUrl = `${baseUrl}${publicPath}`;
  let page;
  try {
    page = await fetchText(pageUrl);
  } catch (e) {
    return fail(`取得に失敗しました（${errorText(e)}）`);
  }
  if (page.status !== 200) return fail(`が ${page.status} を返しました（200 を期待）`);
  const remote = extractAssets(page.body);
  if (!hasEntry(remote)) return fail("の応答に assets/ の js がありません（空の応答か、別のページ）");

  if (local.join("\n") !== remote.join("\n")) {
    const onlyLocal = local.filter((a) => !remote.includes(a));
    const onlyRemote = remote.filter((a) => !local.includes(a));
    return fail(`ずれ: 手元だけ [${onlyLocal.join(", ")}] / 配信だけ [${onlyRemote.join(", ")}]`);
  }

  // 名前が同じでも、実体が届いているとは限らない（転送が途中で止まると、index.html だけが新しい）
  const broken = (await Promise.all(remote.map((name) => checkAsset(pageUrl, name, fetchText)))).filter((p) => p !== null);
  if (broken.length > 0) return fail(broken.join(" / "));
  return { label: app, ok: true, detail: `${publicPath} 一致（${remote.length} 本: ${remote.join(", ")}）` };
}

/** `/ws` が 426 を返すか（WebSocket でない GET に、同期サーバーが Upgrade を求める）。 */
async function checkWs(baseUrl, fetchText) {
  let res;
  try {
    res = await fetchText(`${baseUrl}/ws`);
  } catch (e) {
    return { label: "/ws", ok: false, detail: `取得に失敗しました（${errorText(e)}）` };
  }
  if (res.status !== 426) {
    return { label: "/ws", ok: false, detail: `${res.status} を返しました（426 を期待。200 なら SPA のフォールバックに吸われている）` };
  }
  return { label: "/ws", ok: true, detail: "426" };
}

/**
 * 本番を読んで確かめる。投げない（取得の失敗も、その行の NG にする）。
 * @param {{
 *   baseUrl: string,
 *   targets: { app: string, publicPath: string, webDist: string }[],
 *   readLocalIndex: (webDist: string) => string | null,
 *   fetchText: (url: string) => Promise<{ status: number, contentType: string | null, body: string }>,
 * }} deps `readLocalIndex` は `<webDist>/index.html` の中身（無ければ null）
 * @returns {Promise<{ ok: boolean, baseUrl: string, checks: { label: string, ok: boolean, detail: string }[] }>}
 */
export async function verifyProd({ baseUrl, targets, readLocalIndex, fetchText }) {
  const checks = await Promise.all([...targets.map((t) => checkApp(baseUrl, t, readLocalIndex, fetchText)), checkWs(baseUrl, fetchText)]);
  return { ok: targets.length > 0 && checks.every((c) => c.ok), baseUrl, checks };
}

/** 結果を、行ごとの文章にする。 */
export function formatReport({ ok, checks }) {
  const width = Math.max(...checks.map((c) => c.label.length));
  const lines = checks.map((c) => `  ${c.ok ? "OK" : "NG"}  ${c.label.padEnd(width)}  ${c.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  const apps = checks.length - 1;
  lines.push(ok ? `OK: ${apps} 本の道具と /ws が揃っています` : failed > 0 ? `NG: ${failed} 件が揃っていません` : "NG: 確かめる道具が 0 本です");
  return lines.join("\n");
}
