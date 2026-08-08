/**
 * 「タグ無しのシナリオは `local` 専用」を機械的に固定する。
 *
 * この取り決めを支えているのは `e2e/package.json` の `e2e:prod` に書かれた
 * `--grep` の**パターンひとつだけ**で、それを保証する検査は無かった。
 * 誰かがパターンを書き換えたり、新しいタグを増やしたりすれば、
 * `local` 専用のはずの回帰シナリオが黙って本番へ流れる。
 *
 * 本番へ流れて困る理由は 2 つ。第 3 段の回帰シナリオは実ルームを作って
 * 消えるまで見る種類のもので、**本番の枠（`maxRooms`）を消費する**。
 * さらに #13 は「ルームが消えること」を利用者の目に触れる形で確かめるので、
 * 本番で走らせる意味がない。
 *
 * **パターンが「書かれているか」ではなく「何を選ぶか」を見る。**
 * 初版は `--grep` という文字列と各タグの綴りが含まれることしか見ておらず、
 * `--grep "@smoke|@core|"` のように**空の選択肢を 1 つ足すだけで全件が選ばれる**
 * のに素通りした（実測。`playwright test --list` が 16 件から 21 件になった）。
 * ここではパターンを実際に `RegExp` として組み立て、Playwright と同じく
 * 「describe とテストのタイトルを繋いだもの」に当てて、選ばれる集合を確かめる。
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
 * `test.describe(...)` の呼び出し。`.skip` / `.only` / `.serial` / `.parallel` など
 * 修飾子が付いた形も拾う。
 *
 * **`foo.test(` に当たらないよう、直前がドットや識別子でないことを条件にする。**
 * これが無いと `/x/.test('@bogus')` のような無関係な呼び出しまで拾ってしまう。
 */
const DESCRIBE_CALL = /(?<![.\w$])test\.describe(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

/** `test(...)` の呼び出し（`test.describe` を除く）。 */
const TEST_CALL = /(?<![.\w$])test(?!\.describe)(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

/**
 * `test.describe('題', { tag: '@core' }, ...)` というネイティブのタグ指定。
 *
 * **この形は使わない。** タイトルに現れないのでこのテストからは「タグ無し」に見え、
 * それでいて Playwright の `--grep` は選ぶ。つまり**本検査が空振りしたまま
 * 本番へ流れる**という、いちばん避けたい形になる（実測で確認した）。
 */
const NATIVE_TAG_OPTION = /\btag:\s*\[?\s*(['"`])@/;

interface Spec {
  readonly file: string;
  readonly source: string;
}

function readSpecs(): Spec[] {
  return readdirSync(SPECS_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => ({ file: name, source: readFileSync(path.join(SPECS_DIR, name), 'utf8') }));
}

function titlesOf(source: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(new RegExp(pattern.source, pattern.flags))) {
    if (match[2] !== undefined) found.push(match[2]);
  }
  return found;
}

/**
 * `e2e:prod` のコマンドから `--grep` のパターンを取り出す。
 * 見つからなければ `null`（＝絞り込みが無く、全件が本番へ流れる）。
 */
function grepPatternOf(command: string): string | null {
  const match = /--grep\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(command);
  if (match === null) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function prodCommand(): string {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'e2e/package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts?.['e2e:prod'] ?? '';
}

/**
 * Playwright が `--grep` を当てる相手にならった形。
 * describe のタイトルとテストのタイトルを繋いだものを 1 件ぶんとする。
 */
function fullTitlesOf(spec: Spec): { title: string; tagged: boolean }[] {
  const describes = titlesOf(spec.source, DESCRIBE_CALL);
  const tests = titlesOf(spec.source, TEST_CALL);
  return describes.flatMap((describeTitle) => {
    const tagged = PRODUCTION_TAGS.some((tag) => describeTitle.startsWith(tag));
    return tests.map((testTitle) => ({ title: `${describeTitle} ${testTitle}`, tagged }));
  });
}

describe('e2e:prod の絞り込み', () => {
  const command = prodCommand();
  const pattern = grepPatternOf(command);
  const specs = readSpecs();

  it('Given e2e/package.json / When e2e:prod を見る / Then --grep で絞っている', () => {
    // Given / When / Then: 絞り込みが外れると、タグ無しのシナリオがそのまま本番へ流れる
    expect(pattern, `e2e:prod に --grep が無い（${command}）`).not.toBeNull();
  });

  it('Given --grep のパターン / When タグ付きのタイトルに当てる / Then すべて選ばれる', () => {
    // Given: パターンを Playwright と同じく正規表現として組み立てる
    const grep = new RegExp(pattern ?? '(?:)');
    const tagged = specs.flatMap(fullTitlesOf).filter((entry) => entry.tagged);

    // 走査先が空だと以下が何も検証しない
    expect(tagged.length, 'タグ付きのシナリオ').toBeGreaterThan(0);

    // When / Then: 本番で走らせたいものが漏れていないこと
    const missed = tagged.filter((entry) => !grep.test(entry.title)).map((entry) => entry.title);
    expect(missed.join('\n'), '本番で選ばれないタグ付きシナリオ').toBe('');
  });

  it('Given --grep のパターン / When タグ無しのタイトルに当てる / Then 1 件も選ばれない', () => {
    // Given: local 専用のはずのシナリオ
    const grep = new RegExp(pattern ?? '(?:)');
    const untagged = specs.flatMap(fullTitlesOf).filter((entry) => !entry.tagged);

    // **タグ無しが 0 件だと絞り込みは誰も除外しておらず、この検査は空になる**
    expect(untagged.length, 'タグ無しのシナリオ').toBeGreaterThan(0);

    // When / Then: **ここが本題。** 空の選択肢を足すなどでパターンが緩むと、
    //              本番の枠を消費するシナリオがそのまま流れる
    const leaked = untagged.filter((entry) => grep.test(entry.title)).map((entry) => entry.title);
    expect(leaked.join('\n'), '本番へ漏れる local 専用シナリオ').toBe('');
  });
});

describe('specs のタグの書き方', () => {
  const specs = readSpecs();

  it('Given specs / When 走査する / Then シナリオが 1 件以上見つかる', () => {
    // Given / When: 走査先そのものが空だと、以下の検査は何も検証しない
    const titles = specs.flatMap((spec) => [
      ...titlesOf(spec.source, DESCRIBE_CALL),
      ...titlesOf(spec.source, TEST_CALL),
    ]);
    // Then
    expect(specs.length, 'spec ファイル').toBeGreaterThan(0);
    expect(titles.length, '抜き出したタイトル').toBeGreaterThan(0);
  });

  it('Given specs / When タイトルのタグを見る / Then 未知のタグが無い', () => {
    // Given / When: タイトルに現れる `@…` を集める
    const unknown: string[] = [];
    for (const spec of specs) {
      const titles = [
        ...titlesOf(spec.source, DESCRIBE_CALL),
        ...titlesOf(spec.source, TEST_CALL),
      ];
      for (const title of titles) {
        for (const tag of title.match(/@[\w-]+/g) ?? []) {
          if (!PRODUCTION_TAGS.includes(tag as (typeof PRODUCTION_TAGS)[number])) {
            unknown.push(`${spec.file}: ${tag}（${title}）`);
          }
        }
      }
    }

    // Then: 未知のタグは、本番で走るのか走らないのかが --grep の書き方任せになる
    expect(unknown.join('\n'), '未知のタグ').toBe('');
  });

  it('Given specs / When 書き方を見る / Then ネイティブの tag 指定を使っていない', () => {
    // Given / When: タイトルの外でタグを指定している箇所
    const used = specs
      .filter((spec) => NATIVE_TAG_OPTION.test(spec.source))
      .map((spec) => spec.file);

    // Then: この形はタイトルに現れないため、上の検査からは「タグ無し」に見えるのに
    //       Playwright の --grep は選ぶ。**検査が空振りしたまま本番へ流れる**
    expect(used.join('\n'), 'ネイティブの tag 指定').toBe('');
  });

  it('Given specs / When 書き方を見る / Then .only が残っていない', () => {
    // Given / When: 絞り込みの置き忘れ
    const used = specs.filter((spec) => /\btest(?:\.describe)?\.only\(/.test(spec.source));

    // Then: `.only` が 1 つあると Playwright はそれだけを走らせ、
    //       **終了コード 0 のまま検査対象が縮む**（実測で 21 件が 1 件になった）。
    //       playwright.config.ts の forbidOnly は CI でしか効かないので、
    //       ローカルの `pnpm test` でも気づけるようにここでも見る
    expect(used.map((spec) => spec.file).join('\n'), '置き忘れた .only').toBe('');
  });
});
