/**
 * ローカル用サイトブロックの生成規則を固定する。
 *
 * 経路の本体（deploy/<app>/caddy/*.conf）は 1 バイトも書き換えない。書き換えるのは
 * サイトブロック（deploy/caddy/tasuki.conf）の**アドレス行 1 行だけ**で、
 * ドメインと TLS(ACME) がローカルで再現できないことだけが理由。
 *
 * **ここが緩むと「ローカルだけ通る設定」で緑になる。** 差分が 1 行であることを
 * 機械的に固定して、header や import を取りこぼす改変を落とす。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL_BASE_URL } from '../harness/target';
import { PRODUCTION_ADDRESS_LINE, toLocalSiteConfig } from '../harness/site-config';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const PRODUCTION_CONF = readFileSync(
  path.join(findRepoRoot(process.cwd()), 'deploy', 'caddy', 'tasuki.conf'),
  'utf8',
);

/** 行単位で異なる位置を返す。行数が違えば -1 を含めて返す。 */
function changedLineIndices(before: string, after: string): number[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length !== b.length) return [-1];
  const changed: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) changed.push(i);
  }
  return changed;
}

describe('toLocalSiteConfig', () => {
  const local = toLocalSiteConfig(PRODUCTION_CONF, LOCAL_BASE_URL);

  it('Given 本番のサイトブロック / When 走査する / Then アドレス行がちょうど 1 本ある（走査先を間違えていない）', () => {
    // 0 本だと以降の検査がすべて素通りする
    const hits = PRODUCTION_CONF.split('\n').filter((l) => l.trimEnd() === PRODUCTION_ADDRESS_LINE);
    expect(hits).toHaveLength(1);
  });

  it('Given 本番のサイトブロック / When ローカル用に変換する / Then 差分はちょうど 1 行', () => {
    // Given: 本番の内容
    // When: 変換する
    // Then: 変わったのは 1 行だけ
    expect(changedLineIndices(PRODUCTION_CONF, local)).toHaveLength(1);
  });

  it('Given 変換結果 / When 差分の行を見る / Then アドレス行だけが置き換わっている', () => {
    // Given: describe 内で作った変換結果
    // When: 差分の行を見る
    const [index] = changedLineIndices(PRODUCTION_CONF, local);
    expect(index).toBeGreaterThanOrEqual(0);
    // Then
    expect(PRODUCTION_CONF.split('\n')[index as number]?.trimEnd()).toBe(PRODUCTION_ADDRESS_LINE);
    expect(local.split('\n')[index as number]).toBe(`${LOCAL_BASE_URL} {`);
  });

  it('Given 変換結果 / When import 行を探す / Then 断片の import が残っている', () => {
    // 断片が読まれなければ何を検証しても意味がない
    expect(local).toContain('import /etc/caddy/tasuki/apps/*.conf');
  });

  it.each([
    'Strict-Transport-Security',
    'X-Robots-Tag',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
  ])('Given 変換結果 / When ヘッダ %s を探す / Then 残っている', (header) => {
    // Given: describe 内で作った変換結果
    // When / Then: ヘッダは @smoke #6 の検証対象。ローカルで落ちると本番の設定を見ていないことになる
    expect(local).toContain(header);
  });

  it('Given アドレス行が 2 本ある設定 / When 変換する / Then 落ちる', () => {
    // Given: 想定外の形。黙って片方だけ置換すると壊れた設定が生まれる
    const broken = `${PRODUCTION_ADDRESS_LINE}\n${PRODUCTION_ADDRESS_LINE}\n`;
    // When / Then
    expect(() => toLocalSiteConfig(broken, LOCAL_BASE_URL)).toThrow(/1 本/);
  });

  it('Given アドレス行が無い設定 / When 変換する / Then 落ちる', () => {
    expect(() => toLocalSiteConfig('example.com {\n}\n', LOCAL_BASE_URL)).toThrow(/1 本/);
  });
});
