/**
 * 画面（`.tsx`）は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2・`docs/guides/architecture.md`）。
 * `@tasuki/sync-client` を読んでよいのは同期フック（`src/hooks/use-topic-sync.ts`）だけである。
 *
 * **`scripts/audit-web-sync-boundary.mjs` はこれを見ない**（`new WebSocket(` と、アプリ内の相対パスの
 * 同期モジュールだけを見る）。検査を広げる代わりに、このアプリの中で持つ。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED = new Set(['hooks/use-topic-sync.ts']);

/** `src` 配下の `.ts` / `.tsx` を再帰で集める（`src` からの相対パス）。 */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [path.relative(SRC, full).split(path.sep).join('/')] : [];
  });
}

/**
 * @requirements #91 spec §5.4（web 層の 3 責務）
 */
describe('同期クライアントを読むのは同期フックだけ', () => {
  it('Given src のファイル / When import を見る / Then 同期フック以外は @tasuki/sync-client を読まない', () => {
    // Given
    const files = sourceFiles();
    // When
    const offenders = files.filter(
      (file) => !ALLOWED.has(file) && /from\s+['"]@tasuki\/sync-client['"]/.test(readFileSync(path.join(SRC, file), 'utf8')),
    );
    // Then（走査が空振りしていないことも固定する）
    expect(offenders).toEqual([]);
    expect(files).toContain('hooks/use-topic-sync.ts');
    expect(files.length).toBeGreaterThan(5);
  });
});
