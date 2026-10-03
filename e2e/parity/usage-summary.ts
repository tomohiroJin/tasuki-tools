/**
 * 規則の使用状況（E8・#321・設計正本 §5.5・計画 P4）の突き合わせ。足した CSS の規則が、比較の実行中に 1 回以上当たるかを見る。
 *
 * CDP が返すのは**当たった規則だけ**（`usage.ts`）なので、分母はソースの CSS から数える。ソースの規則とビルドの規則は、
 * {@link ruleKey}（`@layer` を除いた祖先の at-rule とセレクタ）で突き合わせる。ビルドは `@import … layer(timer)` で
 * `@layer timer { … }` の囲いを足すが、ソースには囲いが無いので、`@layer` は鍵に入れない。
 *
 * 分母は `apps/timer-web/src/styles/*.css` のうち `base.css`（PR 1 で移しただけ・正本 §5.5 の対象外）と `reset.css`
 * （PR 4）を除いたもの。`@keyframes` の中の段は除く（キーフレームは比較の本体が別に突き合わせている）。
 *
 * **`states.ts` を import しない**（Playwright を読み込み、vitest の照合から使えなくなる）。束ねるキーは期待値の JSON
 * （`expected/base-summary.json`）のキー（状態とタッチ）を使う。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { loadExpected } from './expected';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** リポジトリの根（`e2e/parity/` の 2 つ上）。 */
export const REPO_ROOT = path.resolve(HERE, '..', '..');

/** 比較の出力置き場（`timer.parity.ts` が `out/<キー>/usage.json` を書く）。 */
const OUT = path.join(HERE, 'out');

/** 1 テストの書き出しのファイル名。 */
export const USAGE_FILE = 'usage.json';

/** `out/<キー>/usage.json` の形。`generation` は流したときの作業ツリーの世代（`git-head.ts`）。 */
export interface UsageRecord {
  readonly generation: string;
  readonly used: string[];
}

/** 分母の 1 件。`file` はリポジトリの根からの相対パス、`line` は規則の始まりの行。 */
export interface SourceRule {
  readonly key: string;
  readonly file: string;
  readonly line: number;
}

/** 分母から外すファイル（正本 §5.5 の対象外）。 */
const EXCLUDED_SOURCES = new Set(['base.css', 'reset.css']);

/** 最小化しないビルドの CSS の行数の下限（これ未満なら最小化されたビルドとみなして止める）。 */
const MIN_UNMINIFIED_LINES = 100;

/** 空白の並びを 1 つに畳み、`,` の前後の空白を消す（結合子の前後の空白 1 つは残す）。 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
}

/** `@keyframes`（`@-webkit-keyframes` なども）の中の規則か。 */
function insideKeyframes(rule: postcss.Rule): boolean {
  for (let node = rule.parent; node !== undefined && node.type !== 'root'; node = node.parent) {
    if (node.type === 'atrule' && (node as postcss.AtRule).name.toLowerCase().endsWith('keyframes')) return true;
  }
  return false;
}

/**
 * 規則の鍵。`@layer` を除いた祖先の at-rule を外側から `@name params` で並べ、最後にセレクタを置き、`\u0000` で繋ぐ。
 * `params` とセレクタは {@link normalize} で畳む（ソースの書き方とビルドの書き方の空白の差を消す）。
 */
export function ruleKey(rule: postcss.Rule): string {
  const parts = [normalize(rule.selector)];
  for (let node = rule.parent; node !== undefined && node.type !== 'root'; node = node.parent) {
    if (node.type !== 'atrule') continue;
    const at = node as postcss.AtRule;
    if (at.name.toLowerCase() === 'layer') continue;
    parts.unshift(normalize(`@${at.name} ${at.params}`));
  }
  return parts.join('\u0000');
}

/** `@keyframes` の外の規則を順に渡す。 */
function walkCountedRules(root: postcss.Root, fn: (rule: postcss.Rule) => void): void {
  root.walkRules((rule) => {
    if (!insideKeyframes(rule)) fn(rule);
  });
}

/**
 * ソースの規則（分母）。**鍵が重複したら止める**（同じ鍵の 2 つの規則は、どちらが当たったかを鍵で見分けられない）。
 * ファイルの読み込みは持たない（{@link listUsageSources} が読む）。
 */
export function sourceRules(files: readonly { path: string; css: string }[]): SourceRule[] {
  const rules: SourceRule[] = [];
  const seen = new Map<string, SourceRule>();
  const duplicates: string[] = [];
  for (const file of files) {
    walkCountedRules(postcss.parse(file.css, { from: file.path }), (rule) => {
      const entry: SourceRule = { key: ruleKey(rule), file: file.path, line: rule.source?.start?.line ?? 0 };
      const prior = seen.get(entry.key);
      if (prior !== undefined) duplicates.push(`${prior.file}:${prior.line} と ${entry.file}:${entry.line}（${entry.key}）`);
      else seen.set(entry.key, entry);
      rules.push(entry);
    });
  }
  if (duplicates.length > 0) throw new Error(`ソースの規則の鍵が重複している（鍵で突き合わせられない）: ${duplicates.join(' / ')}`);
  return rules;
}

/** ビルドの CSS の、鍵ごとの出現回数（`@keyframes` の段は数えない）。 */
export function rulesInBuiltCss(css: string): Map<string, number> {
  const counts = new Map<string, number>();
  walkCountedRules(postcss.parse(css), (rule) => {
    const key = ruleKey(rule);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

/** 当たらなかった分母の規則を `file:line key` で返す（当たりが空なら全件）。 */
export function usageProblems(source: readonly SourceRule[], used: ReadonlySet<string>): string[] {
  return source.filter((r) => !used.has(r.key)).map((r) => `${r.file}:${r.line} ${r.key}`);
}

/** timer のビルドの CSS の置き場（`vite.config.ts` の `base: "/timer/"` と Vite の `assets/`）。 */
const TIMER_BUILD_CSS = /^\/timer\/assets\/[^/]+\.css$/;

/**
 * CDP のシートの `sourceURL` が、timer のビルドの CSS（`/timer/assets/*.css`）か。撮影の `style` や
 * `animations: 'disabled'` が差し込む一時の `<style>`（`sourceURL` が空）・ほかのパッケージの CSS は対象にしない。
 */
export function isTimerBuildSheet(sourceURL: string): boolean {
  if (!URL.canParse(sourceURL)) return false;
  return TIMER_BUILD_CSS.test(new URL(sourceURL).pathname);
}

/** 追加されたシートのうち、timer のビルドの CSS のシートの id。**ちょうど 1 本でなければ止める**（同じ id の重複通知は 1 本）。 */
export function timerSheetId(headers: readonly { styleSheetId: string; sourceURL: string }[]): string {
  const ids = [...new Set(headers.filter((h) => isTimerBuildSheet(h.sourceURL)).map((h) => h.styleSheetId))];
  if (ids.length !== 1) {
    const urls = headers.map((h) => `${h.styleSheetId}=${h.sourceURL === '' ? '(空)' : h.sourceURL}`).join(', ');
    throw new Error(`timer のビルドの CSS のシートが 1 本でない（${ids.length} 本・追加されたシート: ${urls}）`);
  }
  return ids[0] ?? '';
}

/**
 * E8 のゲートの断定（`e2e/tests/usage-summary.test.ts`）。空なら緑。分母が空・分母の鍵がビルドの CSS にちょうど 1 回ずつ
 * 現れない（0 回なら写し損ね、2 回以上なら鍵で見分けられない）・当たらなかった規則、を返す。
 */
export function usageGateProblems(
  source: readonly SourceRule[],
  built: ReadonlyMap<string, number>,
  used: ReadonlySet<string>,
): string[] {
  if (source.length === 0) return ['分母が空（ソースの CSS から規則を 1 つも読めていない）'];
  return [
    ...source
      .filter((r) => built.get(r.key) !== 1)
      .map((r) => `ビルドの CSS に 1 回ずつ現れない: ${r.file}:${r.line} ${r.key} → ${built.get(r.key) ?? 0} 回`),
    ...usageProblems(source, used).map((p) => `当たらなかった: ${p}`),
  ];
}

/** 分母のソース（`git ls-files` で追跡下のものだけを引き、`base.css` と `reset.css` を除く）。 */
export function listUsageSources(repoRoot: string): { path: string; css: string }[] {
  const listed = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', 'apps/timer-web/src/styles/*.css'], { encoding: 'utf8' });
  return listed
    .split('\n')
    .filter((f) => f !== '' && !EXCLUDED_SOURCES.has(path.basename(f)))
    .sort()
    .map((f) => ({ path: f, css: readFileSync(path.join(repoRoot, f), 'utf8') }));
}

/**
 * ブランチの timer の dist の CSS を読む。**`dist/index.html` の `<link rel="stylesheet">` が参照する 1 本だけを読む**
 * （`assets/` の glob で読まない。turbo はキャッシュから dist を戻すとき古い資産を消さないので、切り替えを行き来すると
 * 別のビルドの CSS が残る）。参照が 1 本でなければ止める。最小化されていれば（行数が {@link MIN_UNMINIFIED_LINES} 未満）止める。
 */
export function readBuiltTimerCss(repoRoot: string): string {
  const dist = path.join(repoRoot, 'apps', 'timer-web', 'dist');
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\brel\s*=\s*["']?stylesheet["']?/i.test(tag))
    .map((tag) => /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? '');
  if (hrefs.length !== 1) throw new Error(`dist/index.html の stylesheet の参照が 1 本でない（${hrefs.length} 本: ${hrefs.join(', ')}）`);
  const href = hrefs[0] ?? '';
  const base = '/timer/';
  if (!href.startsWith(base)) throw new Error(`dist/index.html の CSS の参照が ${base} で始まらない: ${href}`);
  const file = path.join(dist, href.slice(base.length));
  if (!existsSync(file)) throw new Error(`dist/index.html が参照する CSS が無い: ${file}`);
  const css = readFileSync(file, 'utf8');
  const lines = css.split('\n').length;
  if (lines < MIN_UNMINIFIED_LINES) {
    throw new Error(`${file} は ${lines} 行で、最小化しないビルドではない（-c parity/parity.usage.config.ts で流した直後に照合する）`);
  }
  return css;
}

/** {@link collectUsage} の結果。 */
export interface CollectedUsage {
  /** 全キーで揃った世代。 */
  readonly generation: string;
  /** どれかのキーで当たった規則の鍵。 */
  readonly used: ReadonlySet<string>;
}

/** 期待値の JSON のキー（状態とタッチ）。期待値が無ければ止める。 */
function expectedKeys(): string[] {
  const table = loadExpected();
  if (table === null) throw new Error('期待値の JSON（expected/base-summary.json）が無い（束ねるキーが決まらない）');
  return Object.keys(table).sort();
}

/**
 * `out/<キー>/usage.json` を全キー分読んで束ねる。次のどれかで止める: 欠けたキーがある・`used` が文字列の配列でない・
 * 世代が文字列でない・`-dirty`・全キーで揃わない（`-g` で一部だけ流し直した・前の実行の残りが混ざった）。
 */
export function collectUsage(dir = OUT, keys: readonly string[] = expectedKeys()): CollectedUsage {
  const missing = keys.filter((k) => !existsSync(path.join(dir, k, USAGE_FILE)));
  if (missing.length > 0) {
    throw new Error(`usage.json が欠けているキー: ${missing.join(', ')}（-c parity/parity.usage.config.ts で全件流し直す）`);
  }
  const records = keys.map((k) => {
    const parsed: unknown = JSON.parse(readFileSync(path.join(dir, k, USAGE_FILE), 'utf8'));
    const record = parsed as Partial<Record<keyof UsageRecord, unknown>>;
    if (!Array.isArray(record.used) || record.used.some((u) => typeof u !== 'string')) {
      throw new Error(`${k}/${USAGE_FILE} の used が文字列の配列でない`);
    }
    if (typeof record.generation !== 'string') throw new Error(`${k}/${USAGE_FILE} に世代が無い`);
    return { key: k, generation: record.generation, used: record.used as string[] };
  });
  const dirty = records.filter((r) => r.generation.endsWith('-dirty')).map((r) => `${r.key}=${r.generation}`);
  if (dirty.length > 0) {
    throw new Error(`作業ツリーが汚れたまま（dirty）流した結果: ${dirty.join(' ')}（コミットしてから全件流し直す）`);
  }
  const generations = new Set(records.map((r) => r.generation));
  if (generations.size > 1) {
    throw new Error(`usage.json の世代が揃わない: ${records.map((r) => `${r.key}=${r.generation}`).join(' ')}（全件流し直す）`);
  }
  return { generation: records[0]?.generation ?? '', used: new Set(records.flatMap((r) => r.used)) };
}
