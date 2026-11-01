import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquirePortLocks } from '../harness/port-locks';

it('同じポートへの二重取得を拒否し、解放後は取得できる', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'e2e-locks-'));
  try {
    const release = acquirePortLocks([21234, 21235], base);
    expect(() => acquirePortLocks([21235, 21236], base)).toThrow(/21235.*PID/);
    release(); release();
    acquirePortLocks([21234, 21235], base)();
  } finally { rmSync(base, {recursive: true, force: true}); }
});
it('途中で競合したら、自分が先に取った分だけを戻す', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'e2e-locks-'));
  try {
    const release = acquirePortLocks([21235], base);
    expect(() => acquirePortLocks([21234, 21235], base)).toThrow();
    acquirePortLocks([21234], base)();
    expect(() => acquirePortLocks([21235], base)).toThrow();
    release();
  } finally { rmSync(base, {recursive: true, force: true}); }
});

it('spawn の入口でも排他し、子の終了で解放する', async () => {
  const { spawnWithPortLock } = await import('../harness/port-locks');
  const net = await import('node:net');
  const holder = net.createServer();
  await new Promise<void>(r => holder.listen(0, '127.0.0.1', r));
  const port = (holder.address() as import('node:net').AddressInfo).port;
  await new Promise<void>(r => holder.close(() => r()));
  const children: import('node:child_process').ChildProcess[] = [];
  try {
    const start = () => {
      const child = spawnWithPortLock(port, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {});
      children.push(child);
      return child;
    };
    const first = start();
    expect(start).toThrow(/locked/);
    const exited = new Promise<void>(r => first.once('exit', () => r()));
    first.kill(); await exited;
    acquirePortLocks([port])();
  } finally {
    await Promise.all(children.filter(c => c.exitCode === null && c.signalCode === null).map(c => new Promise<void>(r => {
      c.once('exit', () => r()); c.kill();
    })));
    rmSync(`/tmp/tasuki-e2e-port-locks/${port}`, {recursive: true, force: true});
  }
});
