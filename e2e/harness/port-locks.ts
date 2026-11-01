import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';

// checkout や TMPDIR に依存させず、同じ機械の E2E が同じ排他を使う。
const LOCK_ROOT = '/tmp/tasuki-e2e-port-locks';

export function acquirePortLocks(ports: readonly number[], root = LOCK_ROOT): () => void {
  mkdirSync(root, {recursive: true});
  const token = randomUUID();
  const acquired: string[] = [];
  const release = (): void => {
    for (const dir of acquired.splice(0)) {
      const owner = JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')) as {token: string};
      if (owner.token === token) rmSync(dir, {recursive: true});
    }
  };
  try {
    for (const port of [...new Set(ports)].sort((a, b) => a - b)) {
      const dir = path.join(root, String(port));
      try { mkdirSync(dir); }
      catch (cause) {
        let owner = 'PID 不明（取得処理中または残骸）';
        try { owner = readFileSync(path.join(dir, 'owner.json'), 'utf8'); } catch { /* 作成途中でも排他は有効 */ }
        throw new Error(`E2E port ${port} is locked; PID/owner: ${owner}; lock: ${dir}. 別ポートを指定してください。残骸は所有者の停止を確認してから撤去してください。`, {cause});
      }
      try { writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({token, pid: process.pid, host: hostname()})); }
      catch (cause) { rmSync(dir, {recursive: true}); throw cause; }
      acquired.push(dir);
    }
  } catch (cause) { release(); throw cause; }
  return release;
}

/** SO_REUSEPORT が有効な子でも、同じポートを使う E2E を同時に spawn しない。 */
export function spawnWithPortLock(port: number, command: string, args: string[], options: SpawnOptionsWithoutStdio) {
  const release = acquirePortLocks([port]);
  try {
    const proc = spawn(command, args, {...options, stdio: ['ignore', 'pipe', 'pipe']});
    proc.once('exit', release);
    proc.once('error', release);
    proc.once('close', release);
    return proc;
  } catch (cause) { release(); throw cause; }
}
