import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installCaddyConfig, writeTopCaddyfile } from '../harness/caddy';

it('生成する2段の import のトークンを引用する', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'caddy import-'));
  const results = path.join(base, 'space "quote" \\ checkout');
  const config = path.join(results, 'config');
  try {
    installCaddyConfig(config);
    const top = readFileSync(writeTopCaddyfile(results), 'utf8');
    const site = readFileSync(path.join(config, 'site.conf'), 'utf8');
    expect(top).toContain(`import ${JSON.stringify(path.join(config, 'site.conf'))}`);
    expect(site).toContain(`import ${JSON.stringify(path.join(config, 'apps/*.conf'))}`);
  } finally { rmSync(base, {recursive: true, force: true}); }
});
