/**
 * 公開パスの 4 か所を揃えるテスト（#91 spec §5.6）。
 *
 * timer の `apps/timer-web/test/ui/room-url.test.ts` が #76 F-1 の再発防止に持つ
 * 3 点比較と同じ考え方。**4 か所のうち 1 つでも取り残すと白画面か 404 になる**のに、
 * 揃っていることを機械で見る場所が無かった。
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/tools.js';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** ツール ID → アプリと配備資材のディレクトリ（名前の形で導出しない。載っていない ID は下のテストで落ちる）。 */
const LOCATIONS: Record<string, { app: string; deploy: string }> = {
  timer: { app: 'timer-web', deploy: 'timer' },
  poker: { app: 'poker-web', deploy: 'poker' },
  topic: { app: 'topic-web', deploy: 'topic' },
};

const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * @requirements #91 spec §5.6（公開パスは 4 か所を揃える）
 */
describe.each(TOOLS.map((tool) => [tool.id, tool.href] as const))('%s の公開パス', (id, href) => {
  const where = LOCATIONS[id];

  it('Given tools.ts の札 / When 置き場を引く / Then アプリと配備資材の対応がある', () => {
    expect(where).toBeDefined();
  });

  it('Given 札の href / When vite の base・app.env・Caddy 断片を読む / Then どれも同じ公開パスを指す', () => {
    // Given
    const { app, deploy } = where!;
    // When
    // 引用符は一重・二重の両方を拾う（timer は `base: "/timer/"`、poker と topic は一重）
    const base = /base:\s*['"]([^'"]+)['"]/.exec(read(`apps/${app}/vite.config.ts`))?.[1];
    const publicPath = /^PUBLIC_PATH=(.+)$/m.exec(read(`deploy/${deploy}/app.env`))?.[1];
    const caddyDir = path.join(REPO_ROOT, 'deploy', deploy, 'caddy');
    const fragments = readdirSync(caddyDir).map((name) => readFileSync(path.join(caddyDir, name), 'utf8')).join('\n');
    // Then
    expect(base).toBe(href);
    expect(publicPath).toBe(href);
    expect(fragments).toContain(`handle_path ${href}*`);
  });
});
