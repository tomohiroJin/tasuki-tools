/**
 * web 層と同期サーバーの層の向き（`docs/adr/0015` の追記（2026-11-14・#598）の許可表・#592）。
 *
 * `audit-dependency-direction.mjs` が package 間の向きを見るのに対し、ここは**ファイル単位の層**を見る。
 * 純粋な関数だけを持ち、ファイルの列挙と終了コードは呼び出し側（監査）に置く。
 *
 * ## 賢くしない
 *
 * 無状態の許可リスト。「型だけなら許す」「テストだけは別」のような例外を足さない。
 * 層の決め方は**パスの規則**（拡張子・置き場・名前）と、**名指しの宣言**（{@link WEB_IO_FILES}）だけで、
 * 本文の字面から「I/O をしていそうか」を推し量らない。
 * 許可表（{@link LAYER_ALLOWED}）に無い層を読む辺は、未知の層も含めてすべて違反に倒す。
 *
 * ## 何を見るか
 *
 *   1. **層の向き**: 製品コード（テスト・型宣言を除く）の import が、許可表に無い層を読んでいないか。
 *      `import type` も同じに数える（型でも向きは同じ依存である）
 *   2. **入口外の参照**: `@tasuki/<pkg>/<sub>` が、その package の `package.json` の `exports` に無い入口を指していないか
 *      （層に属さないファイルも含む製品コードの全部）
 *
 * ## 何を見ていないか
 *
 * - テスト・`e2e/`・設定ファイル（`vite.config.ts` など）。層で裁いていない
 * - 同期サーバーの組み立て（`src` 直下）。組み立ては `audit-assembly-wiring.mjs` の管轄で、全層を読んでよい
 * - 動的な指定子（変数）・`require`・CSS の `@import`
 */
import path from "node:path";

/**
 * 「web の端末 I/O」の層に入るファイル（`docs/adr/0015` 追記の実測の 14 本）。**名指しの宣言**で、字面からは決めない。
 * 純粋な値と I/O が同じファイルにあるときは、純粋な側を別のファイルへ分けて純粋判断の層に置く（例: `roulette-web/src/regulars-rules.ts`）。
 * 実在しなくなった行は監査が落とす（{@link findStaleIoFiles}）。新しく I/O のファイルを足したら、ここへ足す。
 */
export const WEB_IO_FILES = new Set([
  "apps/agenda-web/src/platform/sound.ts",
  "apps/agenda-web/src/router.ts",
  "apps/agenda-web/src/storage/saved-scenarios.ts",
  "apps/checkin-web/src/router.ts",
  "apps/poker-web/src/router.ts",
  "apps/roulette-web/src/router.ts",
  "apps/roulette-web/src/storage/regulars.ts",
  "apps/topic-web/src/router.ts",
  "apps/landing/src/hub/departure.ts",
  "apps/timer-web/src/platform/location.ts",
  "apps/timer-web/src/platform/notify.ts",
  "apps/timer-web/src/platform/sound.ts",
  "apps/timer-web/src/prefs/local-prefs.ts",
  "apps/timer-web/src/records/indexeddb.ts",
]);

/**
 * 層 → 読んでよい層。**同じ層の中は常に可**（表に書かない）。ここに無い層（組み立て・テスト・設定）は見ない。
 * 読む先の層名: `domain`（`*-core`・`room-core`）・`protocol`・`rate-limit`・`sync-client`・`ui`・`invite-ui`・`markdown`・
 * `web-kit/{sync,room,reader,other}`・`web/*`・`sync/*`。
 */
export const LAYER_ALLOWED = {
  "web/pure": ["domain", "protocol"],
  "web/io": ["domain", "web/pure"],
  "web/hook": ["domain", "protocol", "web/pure", "web/io", "sync-client", "web-kit/sync", "web-kit/room", "web-kit/reader", "markdown", "invite-ui"],
  "web/screen": ["domain", "web/hook", "web/pure", "web/io", "web-kit/reader", "web-kit/room", "invite-ui", "ui"],
  "sync/ports": ["domain"],
  "sync/application": ["domain", "protocol", "sync/ports", "rate-limit"],
  "sync/adapters": ["domain", "protocol", "sync/ports", "sync/application", "rate-limit"],
};

/**
 * 層 → **型だけの import（`import type`）なら読んでよい**層。値の import は {@link LAYER_ALLOWED} だけで決まる。
 * 純粋判断が `@tasuki/sync-client` の接続状態の型を取る形（#369: 型の正本は sync-client で、web アプリが書き直すのは
 * `audit-web-sync-boundary.mjs` が止める）。型だけの import は実行時の依存を持たない。**ここに足す行は最小に保つ**。
 */
export const LAYER_TYPE_ONLY_ALLOWED = {
  "web/pure": ["sync-client"],
};

const CORE_DIR = /^packages\/[a-z-]+-core$/;
const SYNC_DIR = "apps/tasuki-sync";
// テストの判定は他の検査と同じ形
const isTestFile = (f) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f) || /(^|\/)(tests?|e2e)\//.test(f);

const pkgOf = (file) => {
  const m = /^((?:apps|packages)\/[^/]+|e2e)\//.exec(file);
  return m ? m[1] : null;
};

/** 製品コードの層を返す。見ないファイル（テスト・型宣言・src の外・組み立て・web でないパッケージ）は null。 */
export function layerOfFile(file, ctx) {
  if (isTestFile(file) || file.endsWith(".d.ts")) return null;
  const pkg = pkgOf(file);
  if (pkg === null) return null;
  if (pkg === SYNC_DIR) {
    const m = /^apps\/tasuki-sync\/src\/(application|ports|adapters)\//.exec(file);
    return m ? `sync/${m[1]}` : null;
  }
  if (!ctx.webApps.has(pkg) || !file.startsWith(`${pkg}/src/`)) return null;
  if (ctx.ioFiles.has(file)) return "web/io";
  if (/\.tsx$/.test(file)) return "web/screen";
  if (!/\.ts$/.test(file)) return null;
  const base = path.posix.basename(file);
  if (/(^|\/)(sync|hooks)\//.test(file) || /^use[-A-Z]/.test(base)) return "web/hook";
  return "web/pure";
}

/** 読まれる側の層（見ないファイルは null）。パッケージは名前、web アプリ・同期サーバーはファイルで決める。 */
function layerOfPackageDir(dir, sub) {
  if (CORE_DIR.test(dir)) return "domain";
  switch (dir) {
    case "packages/protocol": return "protocol";
    case "packages/rate-limit": return "rate-limit";
    case "packages/sync-client": return "sync-client";
    case "packages/ui": return "ui";
    case "packages/invite-ui": return "invite-ui";
    case "packages/markdown": return "markdown";
    case "packages/web-kit": {
      const m = /^\.\/(sync|room|reader)$/.exec(sub);
      return m ? `web-kit/${m[1]}` : "web-kit/other";
    }
    default: return `package:${dir}`; // 許可表のどの行にも無い。読む側が許さない限り違反に倒す
  }
}

function stripComments(text) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  t = t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  return t;
}
const STMT = /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?((?:[\w$*\s,]|\{[^}]*\})*?)\s*from\s*["']([^"'\n]+)["']/g;
const SIDE = /(?:^|[;\n}])\s*import\s*["']([^"'\n]+)["']/g;
const DYN = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;

/** import / export-from / 副作用 import / 文字列リテラルの動的 import の指定子・行・型だけか（`import type`。`export type … from` は再 export なので値と同じに扱う）を取る。 */
export function extractSpecifiers(text) {
  const t = stripComments(text);
  const lineAt = (idx) => {
    let n = 1;
    for (let i = 0; i < idx; i++) if (t.charCodeAt(i) === 10) n++;
    return n;
  };
  const out = [];
  for (const m of t.matchAll(STMT)) out.push({ spec: m[4], line: lineAt(m.index + m[0].lastIndexOf(m[4])), typeOnly: m[1] === "import" && !!m[2] });
  for (const m of t.matchAll(SIDE)) out.push({ spec: m[1], line: lineAt(m.index + m[0].lastIndexOf(m[1])), typeOnly: false });
  for (const m of t.matchAll(DYN)) out.push({ spec: m[1], line: lineAt(m.index + m[0].indexOf(m[1])), typeOnly: false });
  return out;
}

const EXT_TRY = ["", ".ts", ".tsx", ".mjs", ".js", ".d.mts", "/index.ts", "/index.tsx", "/index.mjs"];
function resolveRelative(file, spec, tracked) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  const stems = [base];
  const m = /^(.*)\.(js|mjs|jsx)$/.exec(base);
  if (m) stems.push(m[1]);
  for (const s of stems) for (const e of EXT_TRY) if (tracked.has(s + e)) return s + e;
  return null;
}

/**
 * 層の向きと入口外の参照の違反を返す（純粋）。
 *
 * @param {Map<string, string>} files リポジトリ相対パス → 本文（走査する製品コードとテストの全部。テストは読み飛ばす）
 * @param {{ webApps: Set<string>, ioFiles: Set<string>, nameToDir: Map<string, string>,
 *           exportsOf: Map<string, Set<string>>, tracked: Set<string> }} ctx
 *   `exportsOf` は package のディレクトリ → `exports` のキー集合（`.` を含む）。`exports` を持たない package は載せない（入口を検めない）
 * @returns {{ rule: "layer" | "deep-import", file: string, line: number, to: string, fromLayer: string | null, toLayer: string | null }[]}
 */
export function findLayerViolations(files, ctx) {
  const violations = [];
  for (const [file, text] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (isTestFile(file) || file.endsWith(".d.ts")) continue;
    const fromLayer = layerOfFile(file, ctx);
    const allowed = fromLayer === null ? null : LAYER_ALLOWED[fromLayer];
    for (const { spec, line, typeOnly } of extractSpecifiers(text)) {
      let toLayer = null;
      if (spec.startsWith(".")) {
        const target = resolveRelative(file, spec, ctx.tracked);
        if (target !== null) toLayer = layerOfFile(target, ctx);
      } else {
        const m = /^(@tasuki\/[a-z0-9-]+)(\/.*)?$/.exec(spec);
        if (!m) continue;
        const dir = ctx.nameToDir.get(m[1]);
        if (dir === undefined) continue;
        const sub = m[2] ? `.${m[2]}` : ".";
        const entries = ctx.exportsOf.get(dir);
        if (entries !== undefined && !entries.has(sub)) {
          violations.push({ rule: "deep-import", file, line, to: spec, fromLayer, toLayer: null });
          continue;
        }
        toLayer = layerOfPackageDir(dir, sub);
      }
      if (allowed === null || toLayer === null || toLayer === fromLayer) continue;
      if (!allowed.includes(toLayer) && !(typeOnly && (LAYER_TYPE_ONLY_ALLOWED[fromLayer] ?? []).includes(toLayer))) {
        violations.push({ rule: "layer", file, line, to: spec.startsWith(".") ? resolveRelative(file, spec, ctx.tracked) : spec, fromLayer, toLayer });
      }
    }
  }
  return violations;
}

/** 宣言した I/O のファイルのうち、追跡下に無いもの（改名・削除で宣言だけが残った）を返す。 */
export function findStaleIoFiles(ioFiles, tracked) {
  return [...ioFiles].filter((f) => !tracked.has(f)).sort();
}
