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
    let settled = false;
    const done = () => {
      if (settled) return; // 通知と 'error' の両方が来ても 1 回だけ数える
      settled = true;
      pending -= 1;
      if (pending === 0) finish();
    };
    // 読み手が消えた（SIGHUP・`| head`）stdout / stderr は 'error' を出す。リスナーが無いと未捕捉の例外になるので付け、
    // エラーは『書き終わった』と同じに扱って先へ進む。書き込みの完了通知の後に 'error' が来ることがあるので、外さない（このあと exit する）
    stream.on?.("error", done);
    try {
      stream.write("", done); // 書き出しが失敗しても（EPIPE など）通知は来る。待ち続けない
    } catch {
      done();
    }
  }
}

/**
 * 終わり始めたことの印（モジュールの外から 1 つ作って、ハンドラが共有する）。
 *
 * シグナルのハンドラは最大 `timeoutMs`（10 秒）終わるのを待つので、その間に別のシグナル・未捕捉の例外が来ると再入する。
 * 再入したハンドラが子を再び止め、復元をやり直し、別の終了コードで競ってはならない。最初に `begin()` が true を返した 1 回だけが
 * 終わりを進め、あとのハンドラは何もしない。`isBegun()` は、終わり始めた後に流れ続ける処理（並列の要約など）が出力を控えるのに使う（#542）。
 */
export function createShutdownGate() {
  let begun = false;
  return {
    begin() {
      if (begun) return false;
      begun = true;
      return true;
    },
    isBegun: () => begun,
  };
}
