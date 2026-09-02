/**
 * 配信対象のビルド成果物を最新化する段。
 *
 * この段が要る理由: `e2e/package.json` の `e2e` スクリプトはビルドを含まず、
 * ビルドを与えていたのは `turbo.json` の `dependsOn: ["^build"]` だけだった。
 * VSCode の Playwright 拡張は turbo を経由しないため、**そのとき置いてある dist に
 * 対してテストが走る**。通っても落ちても何に対する結果なのか分からないのに、
 * それを捕まえる検査が無かった（#162）。globalSetup 側でビルドを呼べば
 * 両方の経路が同じ成果物を見る。
 *
 * ## ここで `buildWebApps()` を実引数なしに呼ばない
 *
 * 呼ぶと各 app の dist を書き換える。ユニットテストが本番の成果物を触るのは
 * 副作用として重すぎるうえ、**この検査は暖まった状態では走らない**。
 * `@tasuki/e2e#test` の入力に `apps/` は含まれないため（実測: 入力 41 件）、
 * app を変えても turbo はキャッシュを再生して「成功」を出す。
 * **実際にビルドが走ることは E2E 自体が毎回証明する**（globalSetup が呼ぶ）。
 * ここでは副作用の無い部分だけを固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildWebApps, webAppPackages } from '../harness/build';
import { REPO_ROOT, WEB_ROOTS } from '../harness/paths';

describe('webAppPackages', () => {
  it('Given 配信対象の一覧 / When 最新化する対象と突き合わせる / Then 過不足がない', () => {
    // Given: 配信するのは WEB_ROOTS が指す dist。turbo へ渡すのは
    //        e2e/package.json の workspace 依存。**両者は同じ集合でなければならない**
    //        （どちらか一方だけに足すと、配信するのにビルドされない dist が生まれる）
    const fromRoots = WEB_ROOTS.map(
      ({ dist }) => `@tasuki/${path.basename(path.dirname(dist))}`,
    ).sort();

    // When
    const fromManifest = [...webAppPackages()].sort();

    // Then
    expect(fromManifest).toEqual(fromRoots);
  });
});

describe('buildWebApps', () => {
  /**
   * `turboBin` は検査対象を差し替えるための引数（既定値はワークスペースの実体）。
   * preflight の各検査と同じ流儀。クリーンな環境では常に「見つかる」側を通るため、
   * 見つからない分岐が実起動では一度も踏まれない。
   */
  it('Given turbo が見つからない / When ビルドを最新化する / Then 探した場所を示して落ちる', () => {
    // Given: 依存が入っていない作業ツリー
    // When / Then: 「Command failed」ではなく、何が無いのか分かること
    expect(() => buildWebApps('/nonexistent/turbo')).toThrow(/nonexistent\/turbo/);
  });
});

/**
 * 呼び出しが消えたら赤にする。
 *
 * **ソースの走査は脆い**が、ここで守りたいのは「globalSetup がビルドを経由する」
 * という配線そのもので、それが消えても E2E は緑のまま（古い成果物に対して）走り続ける
 * ＝ 静かに効かなくなる型である（#135・#158 と同じ）。順序までは見ていないので、
 * **preflight より前で呼ぶことは破壊検証で確かめる**（#162 の完了条件）。
 */
describe('globalSetup の配線', () => {
  it('Given global-setup.ts / When 読む / Then buildWebApps を呼んでいる', () => {
    // Given
    const source = readFileSync(path.join(REPO_ROOT, 'e2e/harness/global-setup.ts'), 'utf8');

    // When / Then
    expect(source).toContain('buildWebApps()');
  });
});
