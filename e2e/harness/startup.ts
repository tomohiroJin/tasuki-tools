import type { ChildProcess } from 'node:child_process';

/** 他人の TCP 応答ではなく、spawn した子自身の bind 完了の報告を待つ。 */
export function waitForStartup(
  proc: ChildProcess,
  ready: RegExp,
  timeoutMs: number,
  diagnostic: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
      proc.off('exit', onExit);
      proc.off('error', onError);
      if (error) reject(error); else resolve();
    };
    const onExit = (code: number | null): void => finish(new Error(`${diagnostic}: exit during startup (${code})`));
    const onError = (cause: Error): void => finish(new Error(`${diagnostic}: ${cause.message}`, { cause }));
    const onData = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-65536);
      if (ready.test(output)) {
        if (proc.exitCode !== null || proc.signalCode !== null) onExit(proc.exitCode);
        else finish();
      }
    };
    const timer = setTimeout(() => finish(new Error(`${diagnostic}: startup timeout (${timeoutMs}ms)`)), timeoutMs);
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('exit', onExit);
    proc.once('error', onError);
    if (proc.exitCode !== null || proc.signalCode !== null) onExit(proc.exitCode);
  });
}
