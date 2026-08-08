/**
 * 起動前の検査。1 つでも該当したら起動せず、理由を示して落とす。
 *
 * ポートの占有検査は**そのまま二重起動の排他になる**。別途ロックファイルを
 * 持たないのは、TOCTOU のある自作ロックより OS が保証する bind の排他のほうが
 * 確実だから。
 */
import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertDistsBuilt,
  assertNoCaddyLeftovers,
  assertPortsFree,
  assertWebRootsSafe,
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
    await expect(assertPortsFree([19805])).rejects.toThrow(/19805/);
  });

  it('Given 空きポート / When 検査する / Then 通る', async () => {
    await expect(assertPortsFree([19806])).resolves.toBeUndefined();
  });
});

describe('assertNoCaddyLeftovers', () => {
  it('Given 指定したディレクトリが存在しない / When 検査する / Then 落ちない', () => {
    // Given: 一時ディレクトリの中の、まだ作っていないパス
    const base = makeTmpDir();
    const etcDir = path.join(base, 'etc-caddy-tasuki');
    // When / Then
    expect(() => assertNoCaddyLeftovers(etcDir)).not.toThrow();
  });

  it('Given 指定したディレクトリが存在する / When 検査する / Then そのパスを含めて落ちる', () => {
    // Given: 残骸あるいは本物の Caddy 設定を模した実ディレクトリ
    const base = makeTmpDir();
    const etcDir = path.join(base, 'etc-caddy-tasuki');
    mkdirSync(etcDir);
    // When / Then
    expect(() => assertNoCaddyLeftovers(etcDir)).toThrow(etcDir);
  });
});

describe('assertWebRootsSafe', () => {
  it('Given link が存在しない / When 検査する / Then 落ちない', () => {
    // Given
    const base = makeTmpDir();
    const link = path.join(base, 'var-www-tasuki');
    // When / Then
    expect(() => assertWebRootsSafe([{ link, dist: base }])).not.toThrow();
  });

  it('Given link が symlink / When 検査する / Then 落ちない（前回の残骸なので張り替えてよい）', () => {
    // Given: symlink の先には実ディレクトリがある
    const base = makeTmpDir();
    const target = path.join(base, 'dist-target');
    mkdirSync(target);
    const link = path.join(base, 'var-www-tasuki');
    symlinkSync(target, link);
    // When / Then
    expect(() => assertWebRootsSafe([{ link, dist: base }])).not.toThrow();
  });

  it('Given link が実体ディレクトリ / When 検査する / Then 落ちる（本物の配信の可能性があるため触らない）', () => {
    // Given
    const base = makeTmpDir();
    const link = path.join(base, 'var-www-tasuki');
    mkdirSync(link);
    // When / Then
    expect(() => assertWebRootsSafe([{ link, dist: base }])).toThrow(/symlink ではなく実体/);
  });

  it('Given link がリンク先の無い symlink（dangling） / When 検査する / Then 落ちない', () => {
    // Given: symlink 自体はあるが、リンク先を消してある
    const base = makeTmpDir();
    const target = path.join(base, 'gone-target');
    mkdirSync(target);
    const link = path.join(base, 'var-www-tasuki');
    symlinkSync(target, link);
    rmSync(target, { recursive: true, force: true });
    // When / Then: existsSync は symlink を辿るため false になり、続行が意図どおり
    expect(() => assertWebRootsSafe([{ link, dist: base }])).not.toThrow();
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
