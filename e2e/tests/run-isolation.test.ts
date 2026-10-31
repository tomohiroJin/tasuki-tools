import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

function run(overrides: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, TASUKI_E2E_TARGET: 'local', ...overrides };
  delete env['TASUKI_E2E_RUN_ID'];
  return JSON.parse(execFileSync('bun', ['-e', `
    const p = await import('./harness/paths.ts');
    console.log(JSON.stringify({ ports: p.PORTS, config: p.CADDY_ETC_DIR, results: p.TEST_RESULTS_DIR }));
  `], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) as {
    ports: { caddy: number; sync: number }; config: string; results: string;
  };
}

it('独立した2実行がポート・設定・成果物を共有しない', () => {
  const a = run(); const b = run();
  expect(new Set([a.ports.caddy, a.ports.sync, b.ports.caddy, b.ports.sync]).size).toBe(4);
  expect(a.config).not.toBe(b.config);
  expect(a.results).not.toBe(b.results);
  expect(a.config.startsWith(a.results)).toBe(true);
});
it('明示した2ポートを使う', () => {
  expect(run({ TASUKI_E2E_CADDY_PORT: '21234', TASUKI_E2E_SYNC_PORT: '21235' }).ports)
    .toEqual({ caddy: 21234, sync: 21235 });
});
it.each(['0', '-1', '65536', 'abc', '1.5'])('不正なポート %s を拒否する', value => {
  expect(() => run({ TASUKI_E2E_CADDY_PORT: value })).toThrow();
});
it('同じポートを2用途へ指定できない', () => {
  expect(() => run({ TASUKI_E2E_CADDY_PORT: '21234', TASUKI_E2E_SYNC_PORT: '21234' })).toThrow();
});
