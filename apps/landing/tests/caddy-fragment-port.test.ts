/**
 * Caddy 断片が転送するポートと、デプロイ定義（deploy/{app}/app.env）の PORT が
 * 一致していることを固定する。
 *
 * 同じ値を 2 つの別ファイルが持っているため、**食い違ってもどちらも正しく見える**。
 * 断片だけ直して app.env を忘れると、systemd は別のポートで起動し、
 * Caddy は誰も居ないポートへ転送する。どちらのファイルにも誤りが見当たらない状態になる。
 *
 * E2E でも検出できるが、あちらは Caddy とサーバーを立てる必要があり遅い。
 * ここは文字列の突き合わせだけなので pnpm test の速い側で落とす。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * リポジトリルートを上方向に探す。
 * jsdom 環境では `import.meta.url` が file スキームにならず fileURLToPath が使えないため、
 * 実行時のカレントから遡って deploy と apps が揃う場所を見つける。
 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const DEPLOY_ROOT = path.join(findRepoRoot(process.cwd()), 'deploy');

/**
 * デプロイ配下のアプリディレクトリ名を集める。
 */
function appDirs(): string[] {
  return readdirSync(DEPLOY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * 断片が転送する先のポートを集める（コメント行は除く）。
 * @returns ポート番号とそのソースファイル（deploy 相対パス）の配列
 */
function proxiedPorts(): { port: string; source: string }[] {
  const found: { port: string; source: string }[] = [];
  for (const app of appDirs()) {
    const dir = path.join(DEPLOY_ROOT, app, 'caddy');
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.conf')) continue;
      const body = readFileSync(path.join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'));
      for (const line of body) {
        const match = /reverse_proxy\s+127\.0\.0\.1:(\d+)/.exec(line);
        if (match?.[1]) found.push({ port: match[1], source: path.join('deploy', app, 'caddy', name) });
      }
    }
  }
  return found;
}

/**
 * app.env が宣言する PORT を集める。
 * @returns ポート番号をキーに、app.env ファイルの相対パスを値とする Map
 */
function declaredPorts(): Map<string, string> {
  const ports = new Map<string, string>();
  for (const app of appDirs()) {
    const envPath = path.join(DEPLOY_ROOT, app, 'app.env');
    if (!existsSync(envPath)) continue;
    const match = /^PORT=(\d+)$/m.exec(readFileSync(envPath, 'utf8'));
    if (match?.[1]) ports.set(match[1], path.join('deploy', app, 'app.env'));
  }
  return ports;
}

describe('Caddy 断片の転送先ポート', () => {
  const proxied = proxiedPorts();
  const declared = declaredPorts();

  it('Given deploy 配下 / When reverse_proxy を集める / Then 2 本ある（走査先を間違えていない）', () => {
    // /timer/ws と /poker/ws の 2 本。**どちらも 8787 を指す** ——
    // #95 S2 で同期サーバーを 1 プロセスへ統合したため（統合前は poker が 3311）。
    // 0 本だと以降の検査が素通りするので、本数と値の両方を固定する。
    expect(proxied.map((p) => p.port).sort()).toEqual(['8787', '8787']);
  });

  it('Given app.env / When PORT を集める / Then 1 本ある', () => {
    // 統合サーバーの 8787 だけ。poker は STATIC_ONLY になり PORT を持たない（#95 S2）。
    // 0 本だと以降の検査が素通りする
    expect([...declared.keys()].sort()).toEqual(['8787']);
  });

  it('転送先のポートはすべて app.env が宣言している（食い違うと誰も居ないポートへ転送する）', () => {
    // Given: 断片の転送先
    // When: app.env の宣言と突き合わせる
    // Then: すべて対応がある
    const orphans = proxied.filter((p) => !declared.has(p.port));
    expect(orphans.map((o) => `${o.source} → 127.0.0.1:${o.port}`)).toEqual([]);
  });
});

/**
 * WS 断片の rewrite（#95 S2・設計正本 D10）。
 *
 * 統合サーバーは 1 つの待ち受けで timer と poker を捌き、**振り分けをパスだけで
 * 決める**（`apps/tasuki-sync/src/adapters/ws-adapter.ts` の `POKER_WS_PATH`）。
 * したがって poker の断片が `/ws` へ剥がすと、poker のコマンドが timer 側の
 * メッセージ層へ流れて `INVALID_COMMAND` で弾かれる。**断片と sync の両方を見ても
 * どちらも正しく見える**種類の食い違いなので、ここで機械的に止める。
 *
 * timer 側の断片が `/ws` へ剥がしていることは
 * `apps/timer-web/test/sync/sync-url.test.ts` が固定している（そちらは
 * クライアントが繋ぐパスとの一致も併せて見る）。
 */
describe('WS 断片の rewrite', () => {
  const fragment = (rel: string): string[] =>
    readFileSync(path.join(DEPLOY_ROOT, rel), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'));

  it('poker の断片は rewrite しない（剥がすと timer 側へ流れる）', () => {
    // Given: 本番へ設置される poker の断片
    const lines = fragment('poker/caddy/20-poker.conf');
    // When: rewrite 指令を探す
    const rewrites = lines.filter((line) => /^\s*rewrite\s/.test(line));
    // Then: 1 本も無い
    expect(rewrites).toEqual([]);
  });

  it('poker の断片が受けるパスは /poker/ws である', () => {
    // Given: 本番へ設置される poker の断片
    const lines = fragment('poker/caddy/20-poker.conf');
    // When: WebSocket を受ける handle を読む
    const handled = lines
      .map((line) => /^\s*handle\s+(\S+)\s*\{/.exec(line)?.[1])
      .filter((v): v is string => v !== undefined);
    // Then: sync の POKER_WS_PATH と同じ値が含まれる
    expect(handled).toContain('/poker/ws');
  });
});
