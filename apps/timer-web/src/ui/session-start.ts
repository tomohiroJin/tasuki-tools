/**
 * ロビーの「セッションを開始」で何を送るかを決める純粋関数（#95 S5c・C-1）。
 *
 * **完了したセッションの時計は止まっていない。** `SessionCompleted` は集約
 * （`session` と `clock`）を畳み込まないので（`packages/timer-core/src/evolve.ts`）、
 * `celebration` のルームの時計は走ったままである。そこから「新しいセッション」で
 * ロビーへ戻ると、**時計が走っている状態のロビー**に居ることになる。
 *
 * この状態で `session.act START` を送ると `decide` が `PhaseConflict` で弾く
 * （走行中の START は拒否される）。逆に、一度も開始していないルームへ `session.reset` を
 * 送るのは遠回りである。**どちらも「いまから満タンで走り出す」を作るが、成立する前提が
 * 逆**なので、時計の状態で選び分ける。
 *
 * - `"start"`: `SessionStarted` —— いまを起点に走らせる（初回の開始）
 * - `"reset"`: `SessionReset` —— 輪の先頭・満タン・走行へ作り直す（2 回目以降の開始）
 *
 * **ロビーに居る間に時計を止めておく、という手は無い。** 止める手段（`PAUSE`）は
 * `isPaused` を立ててしまい、`SessionStarted` はそれを降ろさないので、次のセッションが
 * 一時停止のまま始まる。`session.reset` を**開始の瞬間に**送るのが、余分な状態を
 * 残さない唯一の形である。
 */
export type StartAction = "start" | "reset";

/** 開始時に送るべき操作を、いまの時計が走っているかどうかから決める。 */
export function startActionFor(clockRunning: boolean): StartAction {
  return clockRunning ? "reset" : "start";
}
