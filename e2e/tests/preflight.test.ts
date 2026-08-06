/**
 * 起動前の検査。1 つでも該当したら起動せず、理由を示して落とす。
 *
 * ポートの占有検査は**そのまま二重起動の排他になる**。別途ロックファイルを
 * 持たないのは、TOCTOU のある自作ロックより OS が保証する bind の排他のほうが
 * 確実だから。
 */
import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { assertPortsFree, findBusyPorts } from '../harness/preflight';

const servers: net.Server[] = [];

/** 指定ポートを掴む。テスト後に必ず解放する。 */
async function occupy(port: number): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
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
