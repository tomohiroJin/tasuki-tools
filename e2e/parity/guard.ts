/**
 * 画素の基準（snapshot）の扱いの断定（#321）。比較は基準の画像を snapshot の置き場へ書いてから、ブランチの画像を照合する。
 *
 * - `-u` / `--update-snapshots`: ブランチの画像で基準の画像を上書きして、画素を比べずに通る
 * - `--ignore-snapshots`: `toMatchSnapshot` そのものを飛ばして、画素を比べずに通る
 *
 * どちらも偽の緑なので止める。許すのは、既定の `missing` と `none` で、`ignoreSnapshots` が偽のときだけ。
 */
export function snapshotGuardProblem(mode: { updateSnapshots: string; ignoreSnapshots: boolean }): string | null {
  if (mode.ignoreSnapshots) return '--ignore-snapshots で流している。画素を比べずに緑になるので止める';
  if (mode.updateSnapshots !== 'missing' && mode.updateSnapshots !== 'none') {
    return `updateSnapshots が ${mode.updateSnapshots}（-u / --update-snapshots で流している）。基準の画像がブランチの画像で上書きされるので止める`;
  }
  return null;
}
