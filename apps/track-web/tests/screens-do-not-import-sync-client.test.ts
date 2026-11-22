/**
 * 画面（`.tsx`）は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2・`docs/guides/architecture.md`）。
 * `@tasuki/sync-client` と、同期フックの共通の部品 `@tasuki/web-kit/sync` を読んでよいのは同期フック（`src/hooks/use-track-sync.ts`）だけである。
 *
 * **`scripts/audit-web-sync-boundary.mjs` はこれを見ない**（`new WebSocket(` と、アプリ内の相対パスの
 * 同期モジュールだけを見る）。検査を広げる代わりに、このアプリの中で持つ（agenda-web と同じ形）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED = new Set(['hooks/use-track-sync.ts']);

/** `src` 配下の `.ts` / `.tsx` を再帰で集める（`src` からの相対パス）。 */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [path.relative(SRC, full).split(path.sep).join('/')] : [];
  });
}

const read = (file: string): string => readFileSync(path.join(SRC, file), 'utf8');

/**
 * @requirements #476 設計 §4（web 層の責務の分け方）
 */
describe('同期クライアントを読むのは同期フックだけ', () => {
  it('Given src のファイル / When import を見る / Then 同期フック以外は @tasuki/sync-client も @tasuki/web-kit/sync も読まない', () => {
    const files = sourceFiles();
    const offenders = files.filter(
      (file) =>
        !ALLOWED.has(file) &&
        read(file)
          .split('\n')
          // 型だけの取り込み（`import type`）は実行時に同期クライアントを読まないので数えない
          .some((line) => !/^\s*import\s+type\b/.test(line) && /from\s+['"]@tasuki\/(?:sync-client|web-kit\/sync)['"]/.test(line)),
    );
    // 走査が空振りしていないことも固定する
    expect(offenders).toEqual([]);
    expect(files).toContain('hooks/use-track-sync.ts');
    expect(files.length).toBeGreaterThan(15);
  });
});

/**
 * 純粋な判断（`.ts`）は端末を読まない（`docs/guides/architecture.md` の層の表）。
 * `document`・`location`・`performance`・`navigator`・`window` に触ってよいのは、フック・端末 I/O・画面・ルーターだけ。
 */
describe('純粋な判断は端末を読まない', () => {
  it.each(['track-view.ts', 'time-input.ts', 'copy.ts', 'server-message.ts'])('Given %s / When 字面を見る / Then 端末のグローバルに触らない', (file) => {
    const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(document|location|performance|navigator|window|localStorage|Date\.now|new Date)\b/);
  });

  it('Given キーの判定 / When 字面を見る / Then 要素は引数で受け、document には触らない', () => {
    const code = read('keys.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(document|window)\b/);
  });
});

/**
 * 利用者の入力（作業名）をログへ出さない（設計 §6）。
 */
describe('画面はログを書かない', () => {
  it('Given src のファイル / When 字面を見る / Then console を使わない', () => {
    const offenders = sourceFiles().filter((file) => /\bconsole\./.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
