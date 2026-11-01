import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureCaddyBinary, installCaddyConfig, writeTopCaddyfile, startCaddy, stopCaddy } from '../harness/caddy';

test('空白・引用符・バックスラッシュを含むパスで生成した設定を固定版 Caddy が読める', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'tasuki caddy-'));
  const results = path.join(base, 'space "quote" \\ checkout');
  try {
    installCaddyConfig(path.join(results, 'config'));
    const config = writeTopCaddyfile(results);
    const binary = await ensureCaddyBinary();
    const adapted = JSON.parse(execFileSync(binary, ['adapt', '--config', config, '--adapter', 'caddyfile'], {encoding: 'utf8'}));
    expect(adapted.apps.http.servers).toBeTruthy();
  } finally { rmSync(base, {recursive: true, force: true}); }
});

// タグなし: 本番向けの @smoke/@core ではローカルサービスを起動しない。
test('同じポートの sync と Caddy を二重起動せず、元の実行は応答し続ける', async ({request}) => {
  const {startSyncServers, stopSyncServers} = await import('../harness/sync');
  await expect((async () => {
    const procs = await startSyncServers();
    await stopSyncServers(procs);
  })()).rejects.toThrow(/locked/);
  const binary = await ensureCaddyBinary();
  await expect((async () => {
    const proc = await startCaddy(binary);
    await stopCaddy(proc);
  })()).rejects.toThrow(/locked/);
  expect((await request.get('/')).status()).toBe(200);
});
