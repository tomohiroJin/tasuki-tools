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
  e2e: Object.freeze(["node", "pnpm", "bun", "chromium", "caddy"]),
});

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const EXACT_RE = /^\d+\.\d+\.\d+$/;

/** `x.y.z`（先頭の `v`・後ろの付記を許す）を数の組にする。読めなければ null。 */
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
  const m = /^pnpm\/(\d+\.\d+\.\d+)\b/.exec(agent);
  return m ? m[1] : null;
}

/** `caddy version` の出力（`v2.11.7 h1:…`）から版を読む。 */
export function parseCaddyVersionOutput(text) {
  const v = parseVersion(String(text).trim().split(/\s+/)[0] ?? "");
  return v ? formatVersion(v) : null;
}

/**
 * Playwright がブラウザを探す場所（Playwright の文書「Managing browser binaries」）。
 * `0`（node_modules の中へ入れる指定）と、知らない OS では null を返す。**null は「比べない」**
 * であって「入っている」ではない。呼び出し側がそう伝える。
 */
export function chromiumBrowsersDir(env, platform, homedir) {
  const configured = env["PLAYWRIGHT_BROWSERS_PATH"];
  if (configured === "0") return null;
  if (configured !== undefined && configured !== "") return configured;
  switch (platform) {
    case "linux":
      return path.join(env["XDG_CACHE_HOME"] || path.join(homedir, ".cache"), "ms-playwright");
    case "darwin":
      return path.join(homedir, "Library", "Caches", "ms-playwright");
    case "win32":
      return env["LOCALAPPDATA"] ? path.join(env["LOCALAPPDATA"], "ms-playwright") : null;
    default:
      return null;
  }
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
    actual: actual ? formatVersion(actual) : null,
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
 * 段に要る道具を比べる。`actual` は環境から集めた値:
 * `{ node, pnpm, bun, chromium: { dir, entries }, caddy: { present, version, dir } }`
 * （pnpm・bun は見つからなければ null）。
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
        if (dir === null) {
          notes.push("Chromium の置き場を決められないため、revision を比べていません（PLAYWRIGHT_BROWSERS_PATH=0 か、知らない OS）");
        } else {
          problems.push(checkChromium(declared.chromium, dir, entries));
        }
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
