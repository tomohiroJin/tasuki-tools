/**
 * 「タグ無しのシナリオは `local` 専用」を機械的に固定する。
 *
 * この取り決めを支えているのは `e2e/package.json` の `e2e:prod` に書かれた
 * `--grep "@smoke|@core"` という**文字列ひとつだけ**で、それを保証する検査は
 * 無かった。誰かがパターンを書き換えたり、新しいタグを増やしたりすれば、
 * `local` 専用のはずの回帰シナリオが黙って本番へ流れる。
 *
 * 本番へ流れて困る理由は 2 つ。第 3 段の回帰シナリオは実ルームを作って
 * 消えるまで見る種類のもので、**本番の枠（`maxRooms`）を消費する**。
 * さらに #13 は「ルームが消えること」を利用者の目に触れる形で確かめるので、
 * 本番で走らせる意味がない。
 *
 * 同じ型の事故は既に 2 度起きている（`turbo-env.test.ts` を参照）。
 * 「検査は存在するが、実経路では効いていない」を止めるのがこのテストの役目。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../harness/paths';

/** 本番でも走らせるシナリオのタグ。ここに無いタグは使わない。 */
const PRODUCTION_TAGS = ['@smoke', '@core'] as const;

const SPECS_DIR = path.join(REPO_ROOT, 'e2e/specs');

/**
 * `test.describe('…')` と `test('…')` のタイトルを、ソースから機械的に抜き出す。
 *
 * 呼び出しの形（識別子＋開き括弧＋引用符）を条件にしているので、
 * 本文のコメントに書かれた `@core` のような文字列は拾わない。
 */
function titlesIn(source: string): string[] {
  const found: string[] = [];
  const pattern = /\btest(?:\.describe)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== undefined) found.push(match[2]);
  }
  return found;
}

/** `test.describe('…')` のタイトルだけを抜き出す。タグはここに付ける規約。 */
function describeTitlesIn(source: string): string[] {
  const found: string[] = [];
  const pattern = /\btest\.describe\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== undefined) found.push(match[2]);
  }
  return found;
}

function readSpecs(): { file: string; source: string }[] {
  return readdirSync(SPECS_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => ({ file: name, source: readFileSync(path.join(SPECS_DIR, name), 'utf8') }));
}

describe('e2e:prod の絞り込み', () => {
  it('Given e2e/package.json / When e2e:prod を見る / Then @smoke と @core だけに絞っている', () => {
    // Given: 本番実行の入口
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'e2e/package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const command = pkg.scripts?.['e2e:prod'] ?? '';

    // When / Then: 絞り込みが外れると、タグ無しのシナリオがそのまま本番へ流れる
    expect(command, 'e2e:prod の定義').toContain('--grep');
    for (const tag of PRODUCTION_TAGS) {
      expect(command, `e2e:prod が ${tag} を対象にしていない`).toContain(tag);
    }
  });
});

describe('specs のタグ運用', () => {
  const specs = readSpecs();

  it('Given specs / When 走査する / Then シナリオが 1 件以上見つかる', () => {
    // Given / When: 走査先そのものが空だと、以下の検査は何も検証しない
    const titles = specs.flatMap((spec) => titlesIn(spec.source));
    // Then
    expect(specs.length, 'spec ファイル').toBeGreaterThan(0);
    expect(titles.length, '抜き出したタイトル').toBeGreaterThan(0);
  });

  it('Given specs / When タイトルのタグを見る / Then 未知のタグが無い', () => {
    // Given: 全 spec のタイトル
    const unknown: string[] = [];

    // When: タイトルに現れる `@…` を集める
    for (const spec of specs) {
      for (const title of titlesIn(spec.source)) {
        for (const tag of title.match(/@[\w-]+/g) ?? []) {
          if (!PRODUCTION_TAGS.includes(tag as (typeof PRODUCTION_TAGS)[number])) {
            unknown.push(`${spec.file}: ${tag}（${title}）`);
          }
        }
      }
    }

    // Then: 未知のタグは、本番で走るのか走らないのかが `--grep` の書き方任せになる
    expect(unknown.join('\n'), '未知のタグ').toBe('');
  });

  it('Given specs / When describe を見る / Then タグ無しのシナリオが 1 件以上ある', () => {
    // Given: describe のタイトル（タグはここに付ける）
    const titles = specs.flatMap((spec) => describeTitlesIn(spec.source));

    // When: タグの付いていないものを数える
    const untagged = titles.filter(
      (title) => !PRODUCTION_TAGS.some((tag) => title.startsWith(tag)),
    );

    // Then: 0 件だと `--grep` は誰も除外しておらず、「local 専用」という
    //       取り決めそのものが空になる。この検査も何も守らなくなる
    expect(untagged.length, `タグ無しの describe（全 ${String(titles.length)} 件中）`,
    ).toBeGreaterThan(0);
  });
});
