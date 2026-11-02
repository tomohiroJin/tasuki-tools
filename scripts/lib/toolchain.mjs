import path from "node:path";

/**
 * 開発環境の版の宣言と、環境の版との突き合わせ（#487・docs/adr/0031）。
 *
 * ## 宣言の置き場（どの版も 1 か所にだけ書く）
 *
 * | 道具     | 正本                                       | 比べ方                     |
 * |----------|--------------------------------------------|----------------------------|
 * | Node     | `toolchain.json` の `node`                 | 宣言以上・同じ major       |
 * | Bun      | `toolchain.json` の `bun`                  | 完全一致                   |
 * | Caddy    | `toolchain.json` の `caddy`                | 完全一致                   |
 * | pnpm     | `package.json` の `packageManager`         | 完全一致                   |
 * | Chromium | `e2e/package.json` の `@playwright/test`   | revision の実在（両方の dir）|
 * | ffmpeg   | `e2e/package.json` の `@playwright/test`   | revision の実在              |
 *
 * ffmpeg は Playwright が動画を記録するために使う（`e2e/playwright.config.ts` の `video`）。revision は
 * Chromium と同じく playwright-core の `browsers.json` が決め、`playwright install chromium` が一緒に入れる。
 * 見ないと、Chromium だけを揃えた環境で OK を出し、ブラウザを使う spec が全件「ffmpeg が無い」で落ちる（#509）。
 *
 * pnpm と Chromium を `toolchain.json` に書かないのは、**道具自身がそこを読むから**である
 * （corepack は `packageManager` を読み、Chromium の revision は Playwright の版に 1 対 1 で
 * 紐づく）。`toolchain.json` に写すと、同じ版が 2 か所に書かれてずれる。
 *
 * Node を「以上」で比べるのは、`engines` が範囲で、手元・devcontainer の Node を
 * patch ごとに揃えさせるのは重いから。CI は宣言の版そのもの（下限）で流す。
 *
 * 設計方針: 判定は純粋関数。I/O（コマンドの起動・ファイルの読み取り）は
 * `scripts/check-toolchain.mjs` の `main()` に置く。追加依存は禁止。
 */

/** `toolchain.json` が持つ道具。**足すときは、比べる処理（{@link evaluateStage}）も足す。** */
export const TOOLCHAIN_KEYS = Object.freeze(["node", "bun", "caddy"]);

/** 段ごとに比べる道具。 */
export const STAGES = Object.freeze({
  test: Object.freeze(["node", "pnpm", "bun"]),
  mutation: Object.freeze(["node", "pnpm", "bun"]),
  e2e: Object.freeze(["node", "pnpm", "bun", "chromium", "ffmpeg", "caddy"]),
});

/**
 * **プレリリースとビルドの付記を許さない**（#492 のレビュー 1）。`1.4.3-canary.1+x` は 1.4.3 ではなく、
 * semver では `22.22.2-nightly` は 22.22.2 より低い。付記を落として読むと、「完全一致」が付記つきの版を通す。
 */
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;
const EXACT_RE = /^\d+\.\d+\.\d+$/;

/** `x.y.z`（先頭の `v` だけを許す）を数の組にする。付記つき・読めなければ null。 */
export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const m = VERSION_RE.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function formatVersion(v) {
  return v.join(".");
}

/**
 * `toolchain.json` の本文を検証する。**例外を投げず**、`{ ok, value | problems }` を返す。
 * `//` で始まるキーは注記として読み飛ばす。
 */
export function parseToolchain(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`JSON として読めません: ${e.message}`] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, problems: ["最上位がオブジェクトではありません"] };
  }
  const problems = [];
  const value = {};
  for (const key of TOOLCHAIN_KEYS) {
    const v = raw[key];
    if (typeof v !== "string" || !EXACT_RE.test(v)) {
      problems.push(`${key}: x.y.z の形の版がありません（実際: ${JSON.stringify(v)}）`);
    } else {
      value[key] = v;
    }
  }
  for (const key of Object.keys(raw)) {
    if (key.startsWith("//") || TOOLCHAIN_KEYS.includes(key)) continue;
    if (key === "pnpm") {
      problems.push("pnpm: ここに書かない。正本は package.json の packageManager（corepack がそこを読む）");
    } else if (key === "chromium" || key === "playwright") {
      problems.push(`${key}: ここに書かない。正本は e2e/package.json の @playwright/test（revision は版に 1 対 1）`);
    } else {
      problems.push(`${key}: 知らない道具です（比べる処理が無いまま宣言だけが増える）`);
    }
  }
  return problems.length === 0 ? { ok: true, value } : { ok: false, problems };
}

/** `packageManager` の `pnpm@x.y.z`（`+sha…` つきも可）から版を読む。 */
export function parsePackageManager(field) {
  if (typeof field !== "string") return null;
  const m = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(field);
  return m ? m[1] : null;
}

/** pnpm がスクリプトを起動したときの `npm_config_user_agent` から pnpm の版を読む。 */
export function parsePnpmUserAgent(agent) {
  if (typeof agent !== "string") return null;
  // 版の字句をそのまま返す（付記つきでも落とさない。比べる側が完全一致で見る）
  const m = /^pnpm\/(\S+)/.exec(agent);
  return m ? m[1] : null;
}

/** `caddy version` の出力（`v2.11.7 h1:…`）から版の字句を読む（先頭の `v` だけを落とす）。 */
export function parseCaddyVersionOutput(text) {
  const token = String(text).trim().split(/\s+/)[0] ?? "";
  return token === "" ? null : token.replace(/^v/, "");
}

/**
 * Playwright がブラウザを探す場所。**Playwright の解き方をそのまま写す**（playwright-core の
 * `registryDirectory` と `computeDefaultCacheDirectory`。#492 のレビュー 2）。
 *
 * - 変数は `PLAYWRIGHT_BROWSERS_PATH`、無ければ `npm_config_…`・`npm_package_config_…`（Playwright の `getFromENV`）
 * - `0` は playwright-core の中の `.local-browsers`（`coreDir` が要る）
 * - 相対パスは `INIT_CWD`（無ければ `cwd`）から解く
 * - 既定は Linux が `XDG_CACHE_HOME` か `~/.cache`、macOS が `~/Library/Caches`、Windows が `LOCALAPPDATA` か
 *   `~/AppData/Local` の下の `ms-playwright`
 *
 * Playwright 自身が「Unsupported platform」で落ちる OS では null を返す。**null は止める理由**であって、
 * 比べずに通す理由ではない（{@link evaluateStage}）。
 */
/**
 * {@link chromiumBrowsersDir} が読む環境変数。**turbo の e2e・e2e:prod の `passThroughEnv` にすべて要る**
 * （turbo は既定で環境変数を絞る。無いと、ルートの検査とハーネスの中の検査・Playwright が別の置き場を見る。
 * #492 の Codex レビュー 1 で XDG_CACHE_HOME が実際に落ちた）。`scripts/check-toolchain.test.mjs` が、
 * 解き方が実際に読んだキーと突き合わせる。
 */
export const BROWSERS_LOCATION_ENV = Object.freeze([
  "PLAYWRIGHT_BROWSERS_PATH",
  "npm_config_playwright_browsers_path",
  "npm_package_config_playwright_browsers_path",
  "XDG_CACHE_HOME",
  "LOCALAPPDATA",
]);

/**
 * {@link chromiumBrowsersDir} が読むが、**turbo へ渡しても効かない**変数。pnpm はスクリプトを起動するたびに
 * `INIT_CWD` を自分の cwd で上書きするので、turbo の中のハーネスと Playwright は、いつも `e2e/` から
 * 相対パスを解く（#492 の再レビューで、渡しても使われないと実測）。そこでルートの検査も、`INIT_CWD` を
 * `e2e/` に置いて解く（`scripts/check-toolchain.mjs`）。`passThroughEnv` には入れない（効くと誤読させる）。
 */
export const PNPM_SET_ENV = Object.freeze(["INIT_CWD"]);

export function chromiumBrowsersDir(env, platform, homedir, { coreDir = null, cwd = "/" } = {}) {
  const name = "PLAYWRIGHT_BROWSERS_PATH";
  const configured =
    env[name] ?? env[`npm_config_${name.toLowerCase()}`] ?? env[`npm_package_config_${name.toLowerCase()}`];
  let dir;
  if (configured === "0") {
    if (coreDir === null) return null;
    dir = path.join(coreDir, ".local-browsers");
  } else if (configured) {
    dir = configured;
  } else {
    let cache;
    switch (platform) {
      case "linux":
        cache = env["XDG_CACHE_HOME"] || path.join(homedir, ".cache");
        break;
      case "darwin":
        cache = path.join(homedir, "Library", "Caches");
        break;
      case "win32":
        cache = env["LOCALAPPDATA"] || path.join(homedir, "AppData", "Local");
        break;
      default:
        return null;
    }
    dir = path.join(cache, "ms-playwright");
  }
  return path.isAbsolute(dir) ? dir : path.resolve(env["INIT_CWD"] || cwd, dir);
}

/**
 * 要る置き場の名前。Playwright の既定のヘッドレスは本体ではなく headless shell で動くので、
 * 両方が要る（本体だけ入っていても、起動の瞬間に「実行ファイルが無い」で落ちる）。
 */
export function chromiumDirNames(revision) {
  return [`chromium-${revision}`, `chromium_headless_shell-${revision}`];
}

const FIX = {
  node: (declared) =>
    `Node ${declared} 以上の ${declared.split(".")[0]} 系を入れてください（例: \`nvm install ${declared}\` / \`fnm install ${declared}\`）。` +
    "宣言は toolchain.json の node",
  pnpm: (declared) =>
    `\`corepack enable\` を流し、corepack 経由の pnpm を使ってください（pnpm ${declared} を package.json の packageManager が決める）。` +
    "別に入れた pnpm が PATH の先にあるなら外してください",
  bun: (declared) =>
    `\`curl -fsSL https://bun.sh/install | bash -s "bun-v${declared}"\` で入れ直してください。` +
    "宣言は toolchain.json の bun（本番と同じ版。上げるときは deploy/README.md の「Bun を上げる」）",
  caddy: (declared, dir) =>
    `キャッシュの Caddy が宣言（${declared}）と違います。\`rm -rf ${dir ?? "~/.cache/tasuki-e2e"}\` で消すと、ハーネスが宣言の版を取り直します`,
};

/** Node は宣言以上・同じ major。合わなければ問題を返す。 */
export function checkNode(actualText, declared) {
  const actual = parseVersion(actualText);
  const min = parseVersion(declared);
  if (actual && min && actual[0] === min[0] && compareVersions(actual, min) >= 0) return null;
  return {
    tool: "node",
    declared: `${declared} 以上（${min ? min[0] : "?"} 系）`,
    actual: actual ? formatVersion(actual) : typeof actualText === "string" ? actualText.replace(/^v/, "") : null,
    fix: FIX.node(declared),
  };
}

/** 完全一致で比べる。`actual` が null なら「見つからない」。 */
export function checkExact(tool, actualText, declared, context) {
  const actual = actualText === null ? null : parseVersion(actualText);
  if (actual && formatVersion(actual) === declared) return null;
  return {
    tool,
    declared,
    actual: actual ? formatVersion(actual) : actualText === null ? null : String(actualText).trim(),
    fix: FIX[tool](declared, context),
  };
}

/**
 * Chromium の要求 revision が `dir` に入っているか。`entries` は `dir` の中の名前（無ければ null）。
 */
export function checkChromium(revision, dir, entries) {
  const names = chromiumDirNames(revision);
  const missing = names.filter((n) => !(entries ?? []).includes(n));
  if (missing.length === 0) return null;
  const others = [
    ...new Set(
      (entries ?? [])
        .map((e) => /^chromium-(\d+)$/.exec(e)?.[1])
        .filter((r) => r !== undefined && r !== revision),
    ),
  ].sort();
  return {
    tool: "chromium",
    declared: `revision ${revision}`,
    actual: others.length > 0 ? others.join(", ") : null,
    fix:
      `${dir} に ${missing.join(" と ")} がありません。` +
      "`pnpm --filter @tasuki/e2e exec playwright install chromium` で入れてください" +
      "（PLAYWRIGHT_BROWSERS_PATH を指定していれば、そこへ入る。書き込めない場所なら、書ける場所を指すか、置き場の持ち主が入れる）。" +
      "別の revision へのシンボリックリンクで回避しないでください（要求と違う版のブラウザで試すことになる）",
  };
}

/**
 * 動画の記録に要る ffmpeg の要求 revision が `dir` に入っているか（#509）。`entries` は `dir` の中の名前（無ければ null）。
 */
export function checkFfmpeg(revision, dir, entries) {
  const name = `ffmpeg-${revision}`;
  if ((entries ?? []).includes(name)) return null;
  const others = (entries ?? [])
    .map((e) => /^ffmpeg-(\d+)$/.exec(e)?.[1])
    .filter((r) => r !== undefined && r !== revision)
    .sort();
  return {
    tool: "ffmpeg",
    declared: `revision ${revision}`,
    actual: others.length > 0 ? others.join(", ") : null,
    fix:
      `${dir} に ${name} がありません（Playwright が動画を記録するのに使う）。` +
      "`pnpm --filter @tasuki/e2e exec playwright install chromium` が Chromium と一緒に入れます。" +
      "別の revision へのシンボリックリンクで回避しないでください（要求と違う版で試すことになる）",
  };
}

/**
 * 段に要る道具を比べる。`actual` は環境から集めた値:
 * `{ node, pnpm, bun, chromium: { dir, entries }, caddy: { present, version, dir } }`
 * （pnpm・bun は見つからなければ null）。`chromium` はブラウザの置き場で、ffmpeg も同じ置き場から探す。
 *
 * 返すのは `{ problems, notes }`。problems が 1 件でもあれば検査を始めない。
 * notes は止めないが伝えること（比べられなかったこと・これから取りに行くもの）。
 */
export function evaluateStage(stage, declared, actual) {
  const tools = STAGES[stage];
  if (tools === undefined) {
    throw new Error(`知らない段です: ${stage}（${Object.keys(STAGES).join(" / ")} のどれか）`);
  }
  const problems = [];
  const notes = [];
  for (const tool of tools) {
    switch (tool) {
      case "node":
        problems.push(checkNode(actual.node, declared.node));
        break;
      case "pnpm":
      case "bun":
        problems.push(checkExact(tool, actual[tool], declared[tool]));
        break;
      case "chromium": {
        const { dir, entries } = actual.chromium;
        // 置き場を決められないときは止める（比べずに通すと、比較を飛ばす指定と同じになる。ADR-0031 決定 2）
        problems.push(
          dir === null
            ? {
                tool: "chromium",
                declared: `revision ${declared.chromium}`,
                actual: null,
                fix: "Playwright がブラウザを探す置き場を決められません（Playwright が対応しない OS）。Linux・macOS・Windows で流してください",
              }
            : checkChromium(declared.chromium, dir, entries),
        );
        break;
      }
      case "ffmpeg": {
        const { dir, entries } = actual.chromium;
        // 置き場を決められないときは chromium の側が止める（同じ理由を 2 度出さない）
        if (dir !== null) problems.push(checkFfmpeg(declared.ffmpeg, dir, entries));
        break;
      }
      case "caddy": {
        const { present, version, dir } = actual.caddy;
        if (!present) {
          notes.push(`Caddy ${declared.caddy} はまだ取得していません。ハーネスが起動の前に取得し、公式の checksums と照合します`);
        } else {
          problems.push(checkExact("caddy", version, declared.caddy, dir));
        }
        break;
      }
      default:
        throw new Error(`比べ方を知らない道具です: ${tool}`);
    }
  }
  return { problems: problems.filter((p) => p !== null), notes };
}

/** 問題を人が読む形にする。 */
export function formatProblems(problems) {
  return problems
    .map((p) => `  ${p.tool}: 宣言 ${p.declared} / 環境 ${p.actual ?? "見つからない"}\n    揃え方: ${p.fix}`)
    .join("\n");
}
