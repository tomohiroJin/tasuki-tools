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
 * turbo がキャッシュするので `pnpm e2e` 経由では実質ゼロ秒で済む
 * （実測: キャッシュヒットで 1.2 秒 / FULL TURBO）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildWebApps } from '../harness/build';
import { REPO_ROOT } from '../harness/paths';

describe('buildWebApps', () => {
  it('Given ワークスペース / When 呼ぶ / Then turbo の build タスクが成功して終わる', () => {
    // Given / When: 成功しなければ execFileSync が投げる
    const output = buildWebApps();

    // Then: turbo が build を実行した要約が返る
    expect(output).toMatch(/Tasks:\s+\d+ successful, \d+ total/);
  }, 300_000);

  /**
   * `turboBin` は検査対象を差し替えるための引数（既定値はワークスペースの実体）。
   * preflight の各検査と同じ流儀。クリーンな環境では常に「見つかる」側を通るため、
   * 見つからない分岐が実起動では一度も踏まれない。
   */
  it('Given turbo が見つからない / When 呼ぶ / Then 探した場所を示して落ちる', () => {
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
