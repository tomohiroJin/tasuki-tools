/**
 * Caddy 断片の評価順を固定する（S4 / #19）。
 *
 * Caddy の `handle` は記述順に評価され、最初にマッチしたものだけが実行される。
 * 断片は `import /etc/caddy/tasuki/apps/*.conf` で**ファイル名順**に展開されるため、
 * 番号接頭辞が評価順そのものになる。
 *
 * 包括フォールバック（パス指定なしの `handle`）が最後でないと、それより後ろの断片は
 * **一切効かない**。本番ではこれで実際に事故が起きている（poker の断片が無いために
 * /poker が timer の index.html を 200 で返していた）。S4 では包括フォールバックが
 * timer から LP へ移るため、番号の入れ替えを間違えると同じ形で壊れる。
 *
 * ## なぜ LP のテストとして置くか
 *
 * 包括フォールバックを持つのが LP の断片であり、この不変条件の「最後に来るもの」が
 * LP だから。加えて CI が実行するのはパッケージの test タスクだけで、
 * `scripts/` 配下の検査は手動実行のため、そこに置くと**静かに効かなくなる**。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * リポジトリルートを上方向に探す。
 * jsdom 環境では `import.meta.url` が file スキームにならず fileURLToPath が使えないため、
 * 実行時のカレントから遡って `deploy/` と `apps/` が揃う場所を見つける。
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

interface Fragment {
  /** 設置後のファイル名（この順で評価される） */
  readonly name: string;
  /** リポジトリ内の相対パス（失敗時に場所が分かるように） */
  readonly source: string;
  readonly body: string;
}

/** `deploy/<app>/caddy/*.conf` を集める。設置先は 1 つのディレクトリなので名前で並ぶ。 */
function collectFragments(): Fragment[] {
  const apps = readdirSync(DEPLOY_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const fragments: Fragment[] = [];
  for (const app of apps) {
    const dir = path.join(DEPLOY_ROOT, app, 'caddy');
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // caddy ディレクトリを持たないアプリ（サイトブロックのみ等）
    }
    for (const name of entries) {
      if (!name.endsWith('.conf')) continue;
      fragments.push({
        name,
        source: path.join('deploy', app, 'caddy', name),
        body: readFileSync(path.join(dir, name), 'utf8'),
      });
    }
  }
  return fragments.sort((a, b) => a.name.localeCompare(b.name));
}

/** コメントを落とした本文（`#` 始まりの行を除く）。 */
function stripComments(body: string): string {
  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

/** パス指定のない `handle {`（= 包括フォールバック）を持つか。 */
function hasCatchAll(body: string): boolean {
  return /^\s*handle\s*\{/m.test(stripComments(body));
}

describe('Caddy 断片の評価順', () => {
  const fragments = collectFragments();

  it('Given deploy 配下 / When 断片を集める / Then 1 本以上ある（走査先を間違えていない）', () => {
    // 収集に失敗して 0 件になると、以降の検査がすべて素通りする
    expect(fragments.length).toBeGreaterThan(0);
  });

  it('包括フォールバックはちょうど 1 本だけ', () => {
    const catchAlls = fragments.filter((f) => hasCatchAll(f.body)).map((f) => f.source);
    expect(catchAlls).toHaveLength(1);
  });

  it('包括フォールバックはファイル名順で最後に来る', () => {
    // これが最後でないと、後ろの断片は一切評価されない
    const names = fragments.map((f) => f.name);
    const catchAll = fragments.find((f) => hasCatchAll(f.body));
    expect(catchAll).toBeDefined();
    expect(names.at(-1)).toBe(catchAll?.name);
  });

  it('包括フォールバックを持つのは LP の断片（ルートは玄関が占める）', () => {
    const catchAll = fragments.find((f) => hasCatchAll(f.body));
    expect(catchAll?.source).toBe(path.join('deploy', 'landing', 'caddy', '90-landing.conf'));
  });

  it('断片の名前は番号接頭辞で始まる（評価順が名前で決まるため）', () => {
    for (const fragment of fragments) {
      expect(fragment.name).toMatch(/^\d{2}-/);
    }
  });

  it('WebSocket の断片は、それぞれの SPA 断片より先に評価される', () => {
    // 後ろに回ると Upgrade されず、SPA フォールバックが index.html を 200 で返す
    const names = fragments.map((f) => f.name);
    const wsIndex = names.indexOf('10-timer-ws.conf');
    const spaIndex = names.indexOf('30-timer-spa.conf');
    expect(wsIndex).toBeGreaterThanOrEqual(0);
    expect(spaIndex).toBeGreaterThanOrEqual(0);
    expect(wsIndex).toBeLessThan(spaIndex);
  });

  it('旧共有リンクの救済は、包括フォールバックより先に評価される', () => {
    // 後ろに回ると / が LP に吸われ、?room= 付きリンクの救済が効かない
    const names = fragments.map((f) => f.name);
    const legacyIndex = names.indexOf('40-timer-legacy-room.conf');
    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeLessThan(names.length - 1);
  });
});
