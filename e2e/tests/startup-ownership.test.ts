import { beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

beforeAll(() => { execFileSync('bun', ['--version'], { stdio: 'pipe' }); });
it.each(['sync', 'caddy'])('%s: 横取りされたポートを自分の起動成功と取り違えない', (kind) => {
  const result = execFileSync('bun', ['-e', `
    import net from 'node:net';
    import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
    import {tmpdir} from 'node:os';
    import path from 'node:path';
    const holder = net.createServer();
    await new Promise(r => holder.listen(0, '127.0.0.1', r));
    const port = holder.address().port;
    process.env.TASUKI_E2E_TARGET = 'local';
    delete process.env.TASUKI_E2E_RUN_ID;
    delete process.env.TASUKI_E2E_CADDY_PORT;
    delete process.env.TASUKI_E2E_SYNC_PORT;
    process.env['TASUKI_E2E_${kind === 'sync' ? 'SYNC' : 'CADDY'}_PORT'] = String(port);
    const dir = mkdtempSync(path.join(tmpdir(), 'e2e-startup-'));
    const p = await import('./harness/paths.ts');
    try {
      if ('${kind}' === 'sync') {
        const s = await import('./harness/sync.ts');
        const procs = await s.startSyncServers();
        await s.stopSyncServers(procs);
      } else {
        // Caddy の bind 失敗を模した、少し遅れて終了する実プロセス。
        const binary = path.join(dir, 'caddy');
        writeFileSync(binary, '#!/usr/bin/env node\\nsetTimeout(() => process.exit(1), 200);\\n', {mode: 0o755});
        const c = await import('./harness/caddy.ts');
        const proc = await c.startCaddy(binary);
        await c.stopCaddy(proc);
      }
      throw new Error('accepted another listener');
    } catch (e) {
      if (!String(e).includes('exit during startup')) throw e;
      console.log('REJECTED');
    } finally {
      await new Promise(r => holder.close(r));
      rmSync(dir, {recursive:true,force:true});
      rmSync(p.TEST_RESULTS_DIR, {recursive:true,force:true});
    }
  `], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  expect(result.trim()).toBe('REJECTED');
}, 10000);
