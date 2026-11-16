/**
 * web 層と同期サーバーの層の向き（`docs/adr/0015` の追記（2026-11-14・#598）の許可表・#592）。
 *
 * `audit-dependency-direction.mjs` が package 間の向きを見るのに対し、ここは**ファイル単位の層**を見る。
 * 純粋な関数だけを持ち、ファイルの列挙と終了コードは呼び出し側（監査）に置く。
 *
 * ## 賢くしない
 *
 * 無状態の許可リスト。「テストだけは別」のような例外を足さない。型だけの例外は ADR 0015 の追記（#592）が決めた 1 行（{@link LAYER_TYPE_ONLY_ALLOWED}）に限る。
 * 層の決め方は**パスの規則**（拡張子・置き場・名前。同期フックは `use` で始まる名前のファイル）と、**名指しの宣言**（{@link WEB_IO_FILES}・{@link WEB_HOOK_FILES}）だけで、
 * 本文の字面から「I/O をしていそうか」を推し量らない。
 * 許可表（{@link LAYER_ALLOWED}）に無い**層**（`@tasuki/*` と相対 import の読み先）は、未知の層も含めて違反に倒す。
 * 同期サーバーの組み立て（`src` 直下・`assembly/`。層 `sync/assembly`）は、読み先としては許可表のどの行にも無いので、
 * ports・application・adapters が読むと違反になる。**解決できない相対 import も違反**（rule `unresolved`）にする。
 * 層を持たない読み元（テスト・型宣言・web でないパッケージ・組み立て・web の設定）は、層の向きを裁かない
 * （入口外の参照と、解決できない相対 import だけは見る）。層を持たない読み先（css・json などのコードでないファイル、型宣言）は飛ばす。
 *
 * import の取り方は、字面ではなく TypeScript の字句解析（`typescript` の `createSourceFile`）で行う
 * （コメント・文字列・テンプレートの中の `/*` や `import` 風の字面に左右されない）。
 * 外部パッケージは別で、純粋判断・端末 I/O が `react`・`react-dom`・`partysocket` を読む辺だけを止める（rule `external`）。
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
 * - 上の 3 つ以外の外部パッケージ（`neverthrow`・`valibot` など）。純粋判断・端末 I/O に何を入れてよいかは、ここでは決めない
 * - テスト・`e2e/`・設定ファイル（`vite.config.ts` など）。層で裁いていない
 * - 同期サーバーの組み立て（`src` 直下）。組み立ては `audit-assembly-wiring.mjs` の管轄で、全層を読んでよい
 * - 動的な指定子（変数）・`require()` の呼び出し（`import S = require(…)` は見る）・`import.meta.glob`・CSS の `@import`
 */
import path from "node:path";
import ts from "typescript";

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
 * 「web の同期フック」の層に入る、`use` で始まらない名前のファイル（**名指しの宣言**。名前の規則 `use…` の例外）。
 * 同期クライアントの値・端末 I/O・フックを読む `.ts` で、`sync/`・`hooks/` の下にあるが `use` で始まらないもの。
 * 実在しなくなった行は監査が落とす（{@link findStaleIoFiles}）。純粋なファイルをここへ足さない（足すと純粋判断の規則の外に出る）。
 */
export const WEB_HOOK_FILES = new Set([
  "apps/poker-web/src/hooks/plan-join-retry.ts",
  "apps/timer-web/src/sync/client.ts",
  "apps/timer-web/src/sync/sync-url.ts",
  "apps/timer-web/src/sync/timer-actions.ts",
]);

/**
 * 層 → 読んでよい層。**同じ層の中は常に可**（表に書かない）。ここに無い層（組み立て・テスト・設定）は見ない。
 * 読む先の層名: `domain`（`*-core`・`room-core`）・`protocol`・`rate-limit`・`sync-client`・`ui`・`invite-ui`・`markdown`・
 * `web-kit/{sync,room,reader,other}`・`web/*`・`sync/*`（`sync/assembly` は組み立て。読み元としては何でも読める）。
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
 * 根拠は `docs/adr/0015` の追記（2026-11-16・#592。Accepted）。
 * 純粋判断が `@tasuki/sync-client` の接続状態の型を取る形（#369: 型の正本は sync-client で、web アプリが書き直すのは
 * `audit-web-sync-boundary.mjs` が止める）。型だけの import は実行時の依存を持たない。**ここに足す行は最小に保つ**。
 */
export const LAYER_TYPE_ONLY_ALLOWED = {
  "web/pure": ["sync-client"],
};

/**
 * 純粋判断・端末 I/O が読んではいけない外部パッケージ（React と WebSocket の持ち物は画面・同期フックだけ。ADR 0015 の追記の表）。
 * `react`・`react-dom`（サブパス含む）・`partysocket`。**これ以外の外部パッケージは見ない**。
 */
const FORBIDDEN_EXTERNAL_LAYERS = new Set(["web/pure", "web/io"]);
const FORBIDDEN_EXTERNAL = /^(react|react-dom|partysocket)(\/|$)/;

const CORE_DIR = /^packages\/[a-z-]+-core$/;
const SYNC_DIR = "apps/tasuki-sync";
// テストの判定は他の検査と同じ形
const isTestFile = (f) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f) || /(^|\/)(tests?|e2e)\//.test(f);

const pkgOf = (file) => {
  const m = /^((?:apps|packages)\/[^/]+|e2e)\//.exec(file);
  return m ? m[1] : null;
};

/** 製品コードの層を返す。見ないファイル（テスト・型宣言・src の外・web でないパッケージ）は null。 */
export function layerOfFile(file, ctx) {
  if (isTestFile(file) || file.endsWith(".d.ts")) return null;
  const pkg = pkgOf(file);
  if (pkg === null) return null;
  if (pkg === SYNC_DIR) {
    const m = /^apps\/tasuki-sync\/src\/(application|ports|adapters)\//.exec(file);
    if (m) return `sync/${m[1]}`;
    // src の下のそれ以外（`src` 直下の config.ts・create-sync-server.ts・assembly/ ほか）は組み立て
    return file.startsWith(`${SYNC_DIR}/src/`) && /\.[cm]?tsx?$/.test(file) ? "sync/assembly" : null;
  }
  if (!ctx.webApps.has(pkg) || !file.startsWith(`${pkg}/src/`)) return null;
  if (ctx.ioFiles.has(file)) return "web/io";
  if (!/\.tsx?$/.test(file)) return null;
  // 同期フックは名前の規則だけで決める（`use` で始まる名前。拡張子によらない）。sync/・hooks/ の下でも use で始まらない .ts は純粋判断
  if (/^use[-A-Z]/.test(path.posix.basename(file)) || ctx.hookFiles?.has(file)) return "web/hook";
  return /\.tsx$/.test(file) ? "web/screen" : "web/pure";
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

/**
 * import / export-from / 副作用 import / 文字列リテラルの動的 import の指定子・行・型だけか を取る。
 * 型だけ: `import type …`・`export type … from`。`import { type A, b }` は値（b がある）。
 * `fileName` は拡張子で `.tsx` かどうかを決めるために使う。
 */
export function extractSpecifiers(text, fileName = "x.ts") {
  if (!/\b(import|export)\b/.test(text)) return [];
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, line: lineOf(node.moduleSpecifier), typeOnly: !!node.importClause?.isTypeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, line: lineOf(node.moduleSpecifier), typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      out.push({ spec: node.arguments[0].text, line: lineOf(node.arguments[0]), typeOnly: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      // 型の位置の import('…')（`typeof import('…')` を含む）。型だけの依存
      out.push({ spec: node.argument.literal.text, line: lineOf(node.argument.literal), typeOnly: true });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      out.push({ spec: node.moduleReference.expression.text, line: lineOf(node.moduleReference.expression), typeOnly: !!node.isTypeOnly });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * `package.json` の `exports` から入口のキー集合を作る。`exports` が無ければ undefined（入口を検めない）。
 * 文字列と、`.` で始まらないキーだけの条件の map（`{"types":…,"default":…}`）は入口 `.` だけ。
 */
export function exportKeys(exportsField) {
  if (typeof exportsField === "string") return new Set(["."]);
  if (exportsField && typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    return new Set(keys.some((k) => k.startsWith(".")) ? keys : ["."]);
  }
  return undefined;
}

/** サブパス（`.`・`./x`）が入口のキー集合に宣言されているか。`*` を含むキーは、その前後に挟まれた文字列（`/` を含んでよい）に当たる。 */
export function isDeclaredEntry(keys, sub) {
  if (keys.has(sub)) return true;
  for (const k of keys) {
    const star = k.indexOf("*");
    if (star < 0) continue;
    const head = k.slice(0, star);
    const tail = k.slice(star + 1);
    if (sub.length > head.length + tail.length && sub.startsWith(head) && sub.endsWith(tail)) return true;
  }
  return false;
}

const EXT_TRY = ["", ".ts", ".tsx", ".mjs", ".js", ".d.mts", "/index.ts", "/index.tsx", "/index.mjs"];
function resolveRelative(file, spec, tracked) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec.replace(/\?.*$/, "")));
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
 * @returns {{ rule: "layer" | "deep-import" | "external" | "unresolved", file: string, line: number, to: string, fromLayer: string | null, toLayer: string | null }[]}
 */
export function findLayerViolations(files, ctx) {
  const violations = [];
  for (const [file, text] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (isTestFile(file) || file.endsWith(".d.ts")) continue;
    const fromLayer = layerOfFile(file, ctx);
    // 層を持たない読み元・組み立て（許可表に行が無い層）は層の向きを裁かない
    const allowed = fromLayer === null ? undefined : LAYER_ALLOWED[fromLayer];
    for (const { spec, line, typeOnly } of extractSpecifiers(text, file)) {
      let toLayer = null;
      if (spec.startsWith(".")) {
        const target = resolveRelative(file, spec, ctx.tracked);
        if (target === null) {
          violations.push({ rule: "unresolved", file, line, to: spec, fromLayer, toLayer: null });
          continue;
        }
        toLayer = layerOfFile(target, ctx);
      } else {
        const m = /^(@tasuki\/[a-z0-9-]+)(\/.*)?$/.exec(spec);
        if (!m) {
          if (fromLayer !== null && FORBIDDEN_EXTERNAL_LAYERS.has(fromLayer) && FORBIDDEN_EXTERNAL.test(spec)) {
            violations.push({ rule: "external", file, line, to: spec, fromLayer, toLayer: null });
          }
          continue;
        }
        const dir = ctx.nameToDir.get(m[1]);
        if (dir === undefined) continue;
        const sub = m[2] ? `.${m[2]}` : ".";
        const entries = ctx.exportsOf.get(dir);
        if (entries !== undefined && !isDeclaredEntry(entries, sub)) {
          violations.push({ rule: "deep-import", file, line, to: spec, fromLayer, toLayer: null });
          continue;
        }
        toLayer = layerOfPackageDir(dir, sub);
      }
      if (allowed === undefined || toLayer === null || toLayer === fromLayer) continue;
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
