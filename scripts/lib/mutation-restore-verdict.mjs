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
