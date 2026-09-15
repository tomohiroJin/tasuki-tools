/**
 * ロビーの「セッションを開始」で何を送るかを決める純粋関数（#95 S5c・C-1）。
 *
 * **終わったセッションの集約は、次のセッションのために畳まれていない。**
 * `SessionCompleted` は集約（`session` と `clock`）を畳み込まないので
 * （`packages/timer-core/src/evolve.ts`）、完了したルームには前のセッションの
 * 時計・ドライバーの順・担当回数がそのまま残る。そこから「新しいセッション」で
 * ロビーへ戻ると、**前のセッションを引きずったロビー**に居ることになる。
 *
 * この状態で何を送るかは、引きずっているかどうかで分かれる。
 *
 * - `"start"`: `SessionStarted` —— いまを起点に走らせるだけ。**初回の開始でしか使えない。**
 *   `evolveSessionStarted` は残り時間も `currentIndex` も `driverCounts` も `isPaused` も
 *   触らないので、引きずったまま送ると前の続きから始まってしまう
 * - `"reset"`: `SessionReset` —— 輪の先頭・満タン・走行へ**作り直す**。2 回目以降はこちら
 *
 * ## 時計が走っているかだけでは足りない（レビュー ①）
 *
 * 完了時に時計が走っているとは限らない。`session.complete` は一時停止中でも休憩中でも
 * 通る（`decide.ts` に抑止は無い）ので、**「一時停止 → 完成」なら `running: false` かつ
 * `isPaused: true` のまま**ロビーへ戻る。ここを `clock.running` だけで判定すると
 * `"start"` に落ち、
 *
 * 1. 前セッションの残り時間から始まり
 * 2. ドライバーの順と担当回数を引きずり
 * 3. **`running: true` かつ `isPaused: true`** になる
 *
 * 3 は `evolveBreakEnded` が「表示は停止中なのに裏で進む矛盾」として明示的に避けている
 * 状態そのもので、画面は再開ボタンを描きながら時計だけ進む。
 *
 * ## 迷ったら `"reset"` へ倒す
 *
 * **取り違えの代償が対称ではない。** `"reset"` で足りる場面に `"start"` を送ると
 * 上の 3 つが起きるが、`"start"` で足りる場面に `"reset"` を送っても
 * （`initialAggregate` が作る形は初期状態と同じなので）**振る舞いは変わらず、
 * 実行者の通知が 1 つ増えるだけ**である。だから判定は「引きずっている形跡が
 * 1 つでもあるか」という広い側で書く。
 */
import type { Room } from "@tasuki/timer-core";

export type StartAction = "start" | "reset";

/** 前のセッションを引きずっているか（引きずる形跡が 1 つでもあれば true）。 */
export function carriesPreviousSession(session: Room["session"], clock: Room["clock"]): boolean {
  return (
    clock.running ||
    session.isPaused ||
    clock.accumulatedElapsedMs > 0 ||
    clock.secondsLeftAtAnchor < clock.intervalSeconds ||
    session.currentIndex > 0 ||
    session.totalSwitches > 0 ||
    session.driverCounts.some((count) => count > 0)
  );
}

/** 開始時に送るべき操作を、いまの集約が前のセッションを引きずっているかから決める。 */
export function startActionFor(session: Room["session"], clock: Room["clock"]): StartAction {
  return carriesPreviousSession(session, clock) ? "reset" : "start";
}
