import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 直接実行されたときだけ `main()` を走らせるための判定（#197）。
 *
 * **なぜ単純な文字列比較では足りないか。** ESM ローダーは `import.meta.url` を
 * 実体パス（symlink 解決後）へ正規化するが、`process.argv[1]` は起動時に
 * 指定されたパスのままである。そのため `node <symlink>` で起動すると両者は
 * 一致せず、`main()` が一度も呼ばれないまま**無出力・exit 0** で終わる。
 * 「検査が何も実行せずに緑になる」は最も避けたい失敗の型である（憲法 VII）。
 *
 * そこで**両側を実体パスへ正規化してから比べる**。判定はこれだけに留める
 * （起動形態を場合分けするほど、静かに素通りする経路が増える）。
 *
 * **判定をこのモジュールへ集約している理由。** 同じ式を各スクリプトへ写すと、
 * 直すときに片側だけが直る（実際、`scripts/mutation-check.mjs` だけを直した
 * #174 の時点で、残る 10 本は同じ欠陥を抱えたままだった）。新しく足した
 * スクリプトが古い書き方を持ち込んでいないことは
 * `scripts/entry-point-wiring.test.mjs` が機械的に見る。
 *
 * @param {string} moduleUrl 呼び出し側の `import.meta.url`
 * @param {string | undefined} invokedPath 起動時に指定されたパス（`process.argv[1]`）
 */
export function isDirectRun(moduleUrl, invokedPath) {
  if (!invokedPath) return false;
  const self = fs.realpathSync(fileURLToPath(moduleUrl));
  try {
    return fs.realpathSync(invokedPath) === self;
  } catch (e) {
    // **握り潰してよいのは「存在しない」だけ。** ELOOP・EACCES まで偽に倒すと、
    // 直したはずの「無出力・exit 0」へそのまま戻る。解決できない理由が
    // 存在しないこと以外なら、黙って素通りさせずに落とす。
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
