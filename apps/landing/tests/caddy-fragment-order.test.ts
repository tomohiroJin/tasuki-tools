/**
 * Caddy 断片が互いに殺し合わないことを固定する（S4 / #19）。
 *
 * ## Caddy の実際の評価順（2026-08-05 に 2.11.4 で実測）
 *
 * Caddyfile アダプタは、断片の**記述順をそのまま評価順にはしない**。
 * ルートは**マッチャの具体性**で並べ替えられ、パス指定のない `handle`
 * （包括フォールバック）は書いた位置に関わらず最後に回る。
 *
 * 実測: 包括フォールバックの断片を `90-landing.conf` → `05-landing.conf` に改名して
 * 先頭に置いても、`caddy adapt` が生成するルートの並びは**完全に同一**で、
 * 起動して叩いても `/`・`/timer/`・`/poker/`・`/timer/ws` すべて正常だった。
 *
 * **ファイル名順が効くのは、具体性が同じマッチャ同士の並び順を決めるときだけ。**
 * その場合はファイル名が先のものが勝ち、**後のものは一度も評価されない**。
 * （実測: 包括 `handle {}` を 2 本置くと、名前が先の方だけが応答した）
 *
 * ## したがって、ここで押さえるべきは「順序」ではなく「衝突の不在」
 *
 * 番号接頭辞は人が読むための規約であって、安全性の根拠ではない。本当に危ないのは
 * **同じ具体性のマッチャを 2 つ書いてしまい、片方が黙って死ぬ**こと。
 * 本番では poker の断片が**存在しなかった**ために `/poker` が timer の index.html を
 * 200 で返す事故が起きている（順序が原因ではない）。
 *
 * ## なぜ LP のテストとして置くか
 *
 * 包括フォールバックを持つのが LP の断片だから。加えて CI が実行するのは
 * パッケージの test タスクだけで、`scripts/` 配下の検査は手動実行のため、
 * そこに置くと静かに効かなくなる。
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
  /** 設置後のファイル名 */
  readonly name: string;
  /** リポジトリ内の相対パス（失敗時に場所が分かるように） */
  readonly source: string;
  /** コメントを除いた本文 */
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
      const raw = readFileSync(path.join(dir, name), 'utf8');
      fragments.push({
        name,
        source: path.join('deploy', app, 'caddy', name),
        body: raw
          .split('\n')
          .filter((line) => !line.trim().startsWith('#'))
          .join('\n'),
      });
    }
  }
  return fragments.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 断片が宣言しているルーティングの「鍵」を取り出す。
 * 同じ鍵が 2 つあると具体性が並び、名前が後の方が一度も評価されなくなる。
 */
function routeKeys(body: string): string[] {
  const keys: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // `handle {` （パス指定なし）＝ 包括フォールバック
    if (/^handle\s*\{/.test(trimmed)) keys.push('handle:(包括)');
    // `handle /path {` / `handle_path /path/* {`
    const withPath = /^(handle|handle_path)\s+(\S+)\s*\{/.exec(trimmed);
    if (withPath) keys.push(`${withPath[1]}:${withPath[2]}`);
    // `redir /from /to permanent` / `redir @matcher /to permanent`
    const redir = /^redir\s+(\S+)\s/.exec(trimmed);
    if (redir) keys.push(`redir:${redir[1]}`);
  }
  return keys;
}

describe('Caddy 断片', () => {
  const fragments = collectFragments();

  it('Given deploy 配下 / When 断片を集める / Then 1 本以上ある（走査先を間違えていない）', () => {
    // 収集に失敗して 0 件になると、以降の検査がすべて素通りする
    expect(fragments.length).toBeGreaterThan(0);
  });

  it('包括フォールバックはちょうど 1 本だけ（2 本目は一度も評価されず黙って死ぬ）', () => {
    // Given: 全断片
    // When: パス指定のない handle を数える
    // Then: 1 本。2 本あると具体性が並び、名前が後の方が到達不能になる
    const catchAlls = fragments
      .filter((f) => routeKeys(f.body).includes('handle:(包括)'))
      .map((f) => f.source);
    expect(catchAlls).toHaveLength(1);
  });

  it('同じルーティングの鍵を 2 つの断片が宣言していない（片方が到達不能になる）', () => {
    // Given: 全断片のルーティング宣言
    // When: 鍵の重複を探す
    // Then: 無い。重複すると具体性が並び、ファイル名が後の方が死ぬ
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const fragment of fragments) {
      for (const key of routeKeys(fragment.body)) {
        const owner = seen.get(key);
        if (owner) collisions.push(`${key}: ${owner} と ${fragment.source}`);
        else seen.set(key, fragment.source);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('ファイルを配信する断片は自分の root を宣言している（サイトブロックに依存しない）', () => {
    // Given: file_server を持つ断片
    // When: root 宣言を探す
    // Then: 自分で宣言している。サイトブロックの root を継承すると、
    //       サイトブロックを触ったときに配信元が黙って変わる
    const serving = fragments.filter((f) => f.body.includes('file_server'));
    expect(serving.length).toBeGreaterThan(0);
    for (const fragment of serving) {
      expect(fragment.body, `${fragment.source} が root を宣言していない`).toMatch(/^\s*root\s+\*/m);
    }
  });

  it('断片の名前は番号接頭辞で始まる（人が読む規約。安全性の根拠ではない）', () => {
    // 番号は「具体性が同じマッチャ同士」のときだけ評価順に効く。
    // 上の重複検査でその状況自体を禁じているため、番号は可読性のための規約。
    // Given: fragments 自体が前提の指定を兼ねる
    // When / Then（各断片名の検証をループ内で行うため、操作と検証が同じ繰り返しになる）
    for (const fragment of fragments) {
      expect(fragment.name).toMatch(/^\d{2}-/);
    }
  });
});
