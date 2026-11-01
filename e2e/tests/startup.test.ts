import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { waitForStartup } from '../harness/startup';

it('他人の listener が応答しても、子自身が bind できず終了したら失敗する', async () => {
  const occupied = net.createServer();
  await new Promise<void>(r => occupied.listen(0, '127.0.0.1', r));
  const port = (occupied.address() as net.AddressInfo).port;
  const child = spawn(process.execPath, ['-e', `
    const net = require('node:net');
    const s = net.createServer();
    s.on('error', () => setTimeout(() => process.exit(1), 200));
    s.listen(${port}, '127.0.0.1', () => console.log('READY'));
  `], {stdio: ['ignore', 'pipe', 'pipe']});
  try { await expect(waitForStartup(child, /READY/, 2000, 'test')).rejects.toThrow(/test.*exit/); }
  finally { child.kill(); await new Promise<void>(r => occupied.close(() => r())); }
});
it('子自身が出す起動完了行を分割受信しても待てる', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.stdout.write('REA'); setTimeout(() => process.stdout.write('DY\\n'), 30);
    setInterval(() => {}, 1000);
  `], {stdio: ['ignore', 'pipe', 'pipe']});
  try { await expect(waitForStartup(child, /READY/, 2000, 'test')).resolves.toBeUndefined(); }
  finally { child.kill(); }
});
it('起動完了を報告しない子はタイムアウトし、診断先を示す', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 'pipe', 'pipe']});
  try { await expect(waitForStartup(child, /READY/, 100, 'test/log')).rejects.toThrow(/test\/log.*timeout/); }
  finally { child.kill(); }
});
