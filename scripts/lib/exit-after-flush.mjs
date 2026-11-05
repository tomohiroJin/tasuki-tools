/**
 * 書き出しが終わってから `process.exit` する（#542）。
 *
 * **なぜ要るか。** stdout / stderr がパイプのとき、`process.exit()` は書き出し途中の出力を捨てる（#540）。
 * 検査スクリプトは `process.exitCode = N; return;` で戻って自然に終わるのが基本だが、シグナル・`uncaughtException`
 * のハンドラは「戻る先」が無く、ほかの仕事（子プロセス・イベントループ）が生きたまま終わらせる必要がある。
 * そこでは、先に積んだ書き出しがすべて流れたことを待ってから `exit` する。
 *
 * **仕組み。** 空の書き出しは、先に積んだ書き出しの後ろに並ぶ。その完了の通知が来たなら、手前の出力は流れ終わっている。
 * stdout・stderr の両方で待つ。パイプの読み手が止まっていて通知が来ないときのために、`timeoutMs` で打ち切って終わる
 * （固まった読み手のために、中断が終わらなくならない）。2 回呼んでも `exit` は 1 回しか呼ばない。
 *
 * @param {number} code 終了コード
 * @param {object} [io] 差し替え口（自己テスト用）
 * @param {{ write: (chunk: string, cb: (err?: Error | null) => void) => unknown }[]} [io.streams]
 * @param {(code: number) => void} [io.exit]
 * @param {number} [io.timeoutMs]
 */
export function exitAfterFlush(
  code,
  { streams = [process.stdout, process.stderr], exit = (c) => process.exit(c), timeoutMs = 10_000 } = {},
) {
  let pending = streams.length;
  let exited = false;
  let timer;
  const finish = () => {
    if (exited) return;
    exited = true;
    clearTimeout(timer);
    exit(code);
  };
  if (pending === 0) return finish();
  timer = setTimeout(finish, timeoutMs);
  for (const stream of streams) {
    const done = () => {
      pending -= 1;
      if (pending === 0) finish();
    };
    try {
      stream.write("", done); // 書き出しが失敗しても（EPIPE など）通知は来る。待ち続けない
    } catch {
      done();
    }
  }
}
