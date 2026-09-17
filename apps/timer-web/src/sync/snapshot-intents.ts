/**
 * snapshot 受信時に「何をするか」を決める純粋関数（#167 E4）。
 *
 * かつては App.tsx の handleRoom（88 行）に、7 つの分岐と 3 種の副作用
 * （復帰の組の保存・WS 送信・IndexedDB）が混ざっていた。判断だけをここへ出し、
 * 副作用は同期フックが意図を見て起こす。
 *
 * **配列の順が振る舞いである。** 現行 handleRoom の実行順をそのまま保つ:
 * resume 保存 → 生成中の解除 → 完了状態の後片付け → 画面遷移 → 完成記録。
 *
 * **参加時ドライバー宣言（`consume-driver-join` / `join-rotation`）は #272 で畳んだ。**
 * 宣言を立てていたのは timer の旧入口（`Join`）だけで、#95 S5c（#249）の撤去で
 * 立てる者が居なくなった（名乗りは玄関に 1 つ）。
 *
 * **現在時刻は ctx.now で注入する。** この module から `Date.now()` を呼ばない
 * （`docs/adr/0016`。#166 が timer-core の pickFallback に対して採った作法と同じ）。
 */

import { buildCompletionRecord, type CompletionRecord, type Room } from "@tasuki/timer-core";
import { screenForPhase, type Screen } from "../ui/screen.js";
import { shouldClearGenerating } from "../ui/problem-generation.js";
import type { ResumeIdentity } from "@tasuki/sync-client";

export type SnapshotIntent =
  /** 復帰情報を保存する（room.code が分かるのは snapshot の時点だけ）。 */
  | { kind: "save-resume"; identity: ResumeIdentity }
  /** お題生成中の表示を解除する。 */
  | { kind: "clear-generating" }
  /** 前のセッションの完了状態（記録・終了種別・保存済みの印）を畳む。 */
  | { kind: "clear-completion" }
  /** サーバー権威の phase に画面を追従させる。 */
  | { kind: "set-screen"; screen: Screen }
  /** 完成記録を作って保存する。 */
  | { kind: "persist-completion"; record: CompletionRecord };

export interface SnapshotContext {
  /** room.created / room.joined で受け取り、まだ保存していない復帰情報。 */
  pendingResume: { participantId: string; resumeToken: string } | null;
  /** 参加/作成時に指定した表示名（resumeToken 再送の room.join に必要）。 */
  resumeDisplayName: string;
  /** 完成記録を既に保存したか。 */
  recordSaved: boolean;
  /** お題生成中の表示が出ているか。 */
  generatingProblem: boolean;
  /** 終了種別。中断のときは完成記録を作らない。 */
  endType: "complete" | "abort";
  /** 現在時刻。完成記録に使う。 */
  now: number;
}

export function decideSnapshotIntents(
  prev: Room | null,
  next: Room,
  ctx: SnapshotContext,
): SnapshotIntent[] {
  const intents: SnapshotIntent[] = [];

  // 1. 直前の room.created/room.joined で受け取った resumeToken を、今来た snapshot の
  //    room.code と組み合わせて保存する（Issue #24・FR-001）。一度保存すれば
  //    code/participantId/resumeToken は変わらないので、以降の snapshot では再保存しない。
  if (ctx.pendingResume) {
    intents.push({
      kind: "save-resume",
      identity: {
        code: next.code,
        participantId: ctx.pendingResume.participantId,
        resumeToken: ctx.pendingResume.resumeToken,
        displayName: ctx.resumeDisplayName,
      },
    });
  }

  // 2. 生成中で、お題の内容が前回から変化したら生成中を解除
  //    （AI 成功・定型縮退・タイムアウト確定の全経路）。
  if (shouldClearGenerating(ctx.generatingProblem, prev?.problem ?? null, next.problem ?? null)) {
    intents.push({ kind: "clear-generating" });
  }

  // 3. 完了から抜けたら、前のセッションの完了状態を畳む（#95 S5c・レビュー ②）。
  //
  //    **全端末で降ろす必要がある。** 「新しいセッション」を押した人はそのまま玄関へ去り、
  //    「セッションを開始」を押すのは別の人で、残りは何も押さない。押した人の操作の中で
  //    降ろすと、**押していない端末は `recordSaved` が立ったまま**になり、2 本目の完成で
  //    自分の端末に記録が保存されない（FR-020 の自動保存）。`record` も前回のままなので、
  //    2 本目の完了画面に**1 本目の記録**が出る。
  //
  //    見るのは phase の遷移そのもの（`celebration` → それ以外）である。サーバーが
  //    権威なので、全員が同じ snapshot で同じ時点に降ろす。二重保存の窓も開かない ——
  //    次に `celebration` へ入るのは新しいセッションが完成したときだけである。
  if (prev?.phase === "celebration" && next.phase !== "celebration") {
    intents.push({ kind: "clear-completion" });
  }

  // 4. サーバー権威の phase に全参加者が追従する（誰の開始/完成でも全員に反映）。
  intents.push({ kind: "set-screen", screen: screenForPhase(next.phase) });

  // ⚠ **ここに「設定が変わったら生成中の表示を出す」を置いてはならない**（#271 のレビュー）。
  //
  //    サーバーは設定変更の snapshot と、作り直したお題の snapshot を**同じ tick で
  //    続けて送る**。`handleRoom` が読む `room` と `generatingProblem` は直前のレンダー
  //    時点の値なので、2 本目を処理する時点でもまだ「変更前のルーム・生成中ではない」
  //    ままである。結果、**お題が確定した後の snapshot で生成中が立ち直り**、
  //    内容差分で降ろす `clear-generating`（上の 2.）は二度と成立しない。
  //    実測では `aria-busy=true` のまま 6 秒経っても降りず、お題パネル全体が
  //    `pointer-events: none` で固まった（65 秒の安全弁が切れるまで全員が操作できない）。
  //
  //    「別のお題にする」の生成中表示は押した人の操作の中で立てている
  //    （`use-timer-sync.ts` の `regenerateProblem`）ので、この経路とは無関係である。
  //    設定変更でも待ちを見せたいなら、**生成中をサーバー権威の状態にする**こと（#283）。

  // 5. 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成する
  //    （FR-020/028/059）。中断（abort）では記録を作らない。
  if (next.phase === "celebration" && next.problem && ctx.endType !== "abort" && !ctx.recordSaved) {
    intents.push({
      kind: "persist-completion",
      record: buildCompletionRecord(
        { session: next.session, clock: next.clock },
        next.problem,
        next.config,
        // 名簿は timer-core の外（#95 S4a・D15）なので、表示名は呼び出し側が渡す。
        // wire の `config.members` はローテーション順の表示名そのものなのでそのまま使える。
        next.config.members,
        ctx.now,
        next.code,
      ),
    });
  }

  return intents;
}
