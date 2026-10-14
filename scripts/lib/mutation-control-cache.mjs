/**
 * 対照実行の使い回し（#387・設計正本 `docs/superpowers/specs/2026-10-14-test-weight-design.md` §4.3）。
 *
 * 変異検査は変異ごとに「当てる前の素のコードで同じコマンドが通るか」を流していた。同じテストを
 * 対象にする変異が並ぶと同じ対照を何十回も流し、vitest では時間の約半分がこれだった（PR #384 の CI で約 220 秒）。
 *
 * **使い回してよい根拠**: 各変異の後に、作業ツリーが HEAD に戻ったことを `isRestoredToHead` で確かめ、
 * 戻らなければ実行を止めている。2 回目以降の対照は、同じ木の上で同じコマンドを流すことになる。
 *
 * 鍵は呼び出し側が決める（cwd とコマンドと引数）。1 回の実行の中だけで持ち、ディスクには残さない。
 */
export function createControlCache(keyOf, run) {
  const results = new Map();
  let reused = 0;
  return {
    run(mutation) {
      const key = keyOf(mutation);
      if (results.has(key)) {
        reused++;
        return { ...results.get(key), reused: true };
      }
      const result = run(mutation);
      results.set(key, result);
      return { ...result, reused: false };
    },
    get reusedCount() {
      return reused;
    },
  };
}
