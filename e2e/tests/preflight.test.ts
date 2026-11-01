/**
 * 起動前の検査。1 つでも該当したら起動せず、理由を示して落とす。
 *
 * ポートの占有検査は**そのまま二重起動の排他になる**。別途ロックファイルを
 * 持たないのは、TOCTOU のある自作ロックより OS が保証する bind の排他のほうが
 * 確実だから。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, execFileSync: vi.fn(original.execFileSync) };
});
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertDistsBuilt,
  assertPortsFree,
  findBusyPorts,
} from '../harness/preflight';

const servers: net.Server[] = [];
const tmpDirs: string[] = [];

/** 指定ポートを掴む。テスト後に必ず解放する。 */
async function occupy(port: number): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

/** 一時ディレクトリを作る。テスト後に必ず削除する。 */
function makeTmpDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tasuki-e2e-preflight-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  tmpDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('findBusyPorts', () => {
  it('Given 誰も使っていないポート / When 検査する / Then 空になる', async () => {
    // Given: 使われていない高位ポート
    // When / Then
    await expect(findBusyPorts([19801, 19802])).resolves.toEqual([]);
  });

  it('Given 使用中のポート / When 検査する / Then そのポートが返る', async () => {
    // Given
    await occupy(19803);
    // When / Then
    await expect(findBusyPorts([19803, 19804])).resolves.toEqual([19803]);
  });
});

describe('assertPortsFree', () => {
  it('Given 使用中のポート / When 検査する / Then ポート番号を含めて落ちる', async () => {
    // Given
    await occupy(19805);
    // When / Then: 誰が掴んでいるかを調べる手掛かりが出る
    vi.mocked(execFileSync).mockReturnValue('LISTEN 0 511 127.0.0.1:19805 0.0.0.0:* users:(("holder",pid=1234,fd=5))');
    try {
      await expect(assertPortsFree([19805])).rejects.toThrow(/ポートが使用中です: 19805/);
      await expect(assertPortsFree([19805])).rejects.toThrow(/TASUKI_E2E_CADDY_PORT/);
      await expect(assertPortsFree([19805])).rejects.toThrow(/holder.*pid=1234/);
    } finally { vi.mocked(execFileSync).mockReset(); }
  });

  it('Given 空きポート / When 検査する / Then 通る', async () => {
    await expect(assertPortsFree([19806])).resolves.toBeUndefined();
  });
});

describe('assertDistsBuilt', () => {
  it('Given dist に index.html がある / When 検査する / Then 落ちない', () => {
    // Given
    const base = makeTmpDir();
    writeFileSync(path.join(base, 'index.html'), '<html></html>');
    // When / Then
    expect(() => assertDistsBuilt([{ link: base, dist: base }])).not.toThrow();
  });

  it('Given dist に index.html が無い / When 検査する / Then その dist を含めて落ちる', () => {
    // Given
    const base = makeTmpDir();
    // When / Then
    expect(() => assertDistsBuilt([{ link: base, dist: base }])).toThrow(base);
  });
});
