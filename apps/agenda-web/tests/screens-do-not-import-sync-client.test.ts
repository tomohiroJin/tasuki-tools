/**
 * 画面（`.tsx`）は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2・`docs/guides/architecture.md`）。
 * `@tasuki/sync-client` と、同期フックの共通の部品 `@tasuki/web-kit/sync`（#369）を読んでよいのは同期フック（`src/hooks/use-agenda-sync.ts`）だけである。
 *
 * **`scripts/audit-web-sync-boundary.mjs` はこれを見ない**（`new WebSocket(` と、アプリ内の相対パスの
 * 同期モジュールだけを見る）。検査を広げる代わりに、このアプリの中で持つ。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED = new Set(['hooks/use-agenda-sync.ts']);

/** `src` 配下の `.ts` / `.tsx` を再帰で集める（`src` からの相対パス）。 */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [path.relative(SRC, full).split(path.sep).join('/')] : [];
  });
}

/**
 * @requirements #429 spec §5.6（web 層の 3 責務）
 */
describe('同期クライアントを読むのは同期フックだけ', () => {
  it('Given src のファイル / When import を見る / Then 同期フック以外は @tasuki/sync-client も @tasuki/web-kit/sync も読まない', () => {
    // Given
    const files = sourceFiles();
    // When
    const offenders = files.filter(
      (file) =>
        !ALLOWED.has(file) &&
        readFileSync(path.join(SRC, file), 'utf8')
          .split('\n')
          // 型だけの取り込み（`import type`）は実行時に同期クライアントを読まないので数えない（#369。接続状態の型の正本）。
          .some((line) => !/^\s*import\s+type\b/.test(line) && /from\s+['"]@tasuki\/(?:sync-client|web-kit\/sync)['"]/.test(line)),
    );
    // Then（走査が空振りしていないことも固定する）
    expect(offenders).toEqual([]);
    expect(files).toContain('hooks/use-agenda-sync.ts');
    expect(files.length).toBeGreaterThan(5);
  });
});
