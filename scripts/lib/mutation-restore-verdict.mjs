/**
 * 復元の結果から、次へ進むか・止まって何の終了コードかを決める（#542）。
 *
 * 入口（`scripts/mutation-check.mjs`）は変異のパッチで書き換えない決まりなので、変異で守りたい判定はここに置く。
 * 入口の 3 か所（逐次ループの変異ごとの復元・シグナルのハンドラ・前回の異常終了からの復旧）がこれを通る。
 *
 * **戻らなかった（`restored === false`）ときは必ず止まる。** 進むと次の変異を当てるときに `writeMarker` が `.applied` を上書きし、
 * 戻っていないファイルの唯一の記録が消える。終了コードは、成功の終わり方（シグナルなら 130）ではなく 1。
 *
 * @param {boolean} restored 戻した（または戻すものが無かった）なら true、戻らなかったら false
 * @param {number} [successCode] 戻ったときの終了コード（既定 0。シグナルは 130）
 * @returns {{ proceed: boolean, exitCode: number }}
 */
export function restoreVerdict(restored, successCode = 0) {
  return restored === false ? { proceed: false, exitCode: 1 } : { proceed: true, exitCode: successCode };
}

/**
 * 復元の後に、まだ適用中として覚えておくファイルの一覧。**戻ったときだけ空にする。**
 *
 * 成否を知る前に空にすると、失敗の後の 2 回目の呼び出し（待っていたシグナル・未捕捉の例外）が空の一覧を復元の検証へ渡し、
 * 「戻すものが無い」としてマーカー（`.applied`）を消す。戻っていないファイルの唯一の記録が失われる。
 * 失敗なら本当の一覧を残し、次の呼び出しが再試行する（#542）。
 *
 * @param {string[]} files 復元を試みたファイル
 * @param {boolean | null} restored 戻した（true）・戻すものが無かった（null）・戻らなかった（false）
 * @returns {string[]}
 */
export function filesAfterRestore(files, restored) {
  return restored === false ? files : [];
}
