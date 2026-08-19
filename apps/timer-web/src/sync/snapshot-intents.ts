/**
 * snapshot 受信時に「何をするか」を決める純粋関数（#167 E4）。
 *
 * かつては App.tsx の handleRoom（88 行）に、7 つの分岐と 3 種の副作用
 * （sessionStorage・WS 送信・IndexedDB）が混ざっていた。判断だけをここへ出し、
 * 副作用は同期フックが意図を見て起こす。
 *
 * **配列の順が振る舞いである。** 現行 handleRoom の実行順をそのまま保つ:
 * resume 保存 → 参加時ドライバー宣言 → 生成中の解除 → 画面遷移 →
 * お題の自動依頼 → 設定変更での作り直し → 完成記録。
 *
 * **現在時刻は ctx.now で注入する。** この module から `Date.now()` を呼ばない
 * （`docs/adr/0016`。#166 が timer-core の pickFallback に対して採った作法と同じ）。
 */

import { buildCompletionRecord, type CompletionRecord, type Room } from "@tasuki/timer-core";
import { screenForPhase, type Screen } from "../ui/screen.js";
import { shouldAutoJoinRotation } from "../ui/join-driver-intent.js";
import { shouldAutoRequestProblem, shouldClearGenerating } from "../ui/problem-generation.js";
import type { ResumeIdentity } from "./resume-identity.js";

export type SnapshotIntent =
  /** 復帰情報を保存する（room.code が分かるのは snapshot の時点だけ）。 */
  | { kind: "save-resume"; identity: ResumeIdentity }
  /** 参加時ドライバー宣言を降ろす（輪に入れたかに関わらず一度きり）。 */
  | { kind: "consume-driver-join" }
  /** 自分をローテーションへ加える。 */
  | { kind: "join-rotation"; participantId: string }
  /** お題生成中の表示を解除する。 */
  | { kind: "clear-generating" }
  /** サーバー権威の phase に画面を追従させる。 */
  | { kind: "set-screen"; screen: Screen }
  /** ロビーでの代表お題生成を依頼する。 */
  | { kind: "request-problem"; requestId: string }
  /** 難易度・言語の変更でお題を作り直す（生成中の表示も立てる）。 */
  | { kind: "regenerate-problem"; requestId: string }
  /** 完成記録を作って保存する。 */
  | { kind: "persist-completion"; record: CompletionRecord };

export interface SnapshotContext {
  /** 自分の参加者ID。identity 未受信なら空文字。 */
  participantId: string;
  /** room.created / room.joined で受け取り、まだ保存していない復帰情報。 */
  pendingResume: { participantId: string; resumeToken: string } | null;
  /** 参加/作成時に指定した表示名（resumeToken 再送の room.join に必要）。 */
  resumeDisplayName: string;
  /** 参加時に "driver" を宣言したか。 */
  pendingDriverJoin: boolean;
  /** このクライアントがルーム作成者（＝当初ホスト）か。 */
  isCreator: boolean;
  /** ロビーでのお題自動生成を既に依頼したか。 */
  problemRequested: boolean;
  /** 完成記録を既に保存したか。 */
  recordSaved: boolean;
  /** お題生成中の表示が出ているか。 */
  generatingProblem: boolean;
  /** 終了種別。中断のときは完成記録を作らない。 */
  endType: "complete" | "abort";
  /** 現在時刻。requestId と完成記録に使う。 */
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

  // 2. 参加時ドライバー宣言: 自分が参加者に現れたら一度だけ rotation に加入する。
  //    宣言は「参加時の一度きり」で、輪に入れたかに関わらずここで降ろす。降ろさないと、
  //    後で自分が輪を抜けた瞬間に再追加が走り、意図しない再加入になる。
  if (
    ctx.pendingDriverJoin &&
    ctx.participantId &&
    next.participants.some((p) => p.participantId === ctx.participantId)
  ) {
    intents.push({ kind: "consume-driver-join" });
    if (shouldAutoJoinRotation({ participantId: ctx.participantId, rotation: next.session.rotation })) {
      intents.push({ kind: "join-rotation", participantId: ctx.participantId });
    }
  }

  // 3. 生成中で、お題の内容が前回から変化したら生成中を解除
  //    （AI 成功・定型縮退・タイムアウト確定の全経路）。
  if (shouldClearGenerating(ctx.generatingProblem, prev?.problem ?? null, next.problem ?? null)) {
    intents.push({ kind: "clear-generating" });
  }

  // 4. サーバー権威の phase に全参加者が追従する（ホストの開始/完成が全員に反映）。
  intents.push({ kind: "set-screen", screen: screenForPhase(next.phase) });

  // 5. ロビー（開始前）でお題が未確定かつ problemEnabled=true なら、
  //    作成者が一度だけ代表生成を依頼する（US3）。
  if (
    shouldAutoRequestProblem({
      phase: next.phase,
      hasProblem: !!next.problem,
      isCreator: ctx.isCreator,
      alreadyRequested: ctx.problemRequested,
      problemEnabled: next.config.problemEnabled !== false,
    })
  ) {
    intents.push({ kind: "request-problem", requestId: `req-${next.code}-lobby` });
  }

  // 6. 難易度・言語をロビーで変えたら、お題を作り直して選択と中身を一致させる。
  //    代表（作成者）のみが依頼し、変化時だけ発火するのでループしない。
  const cfgChanged =
    prev?.code === next.code &&
    (prev.config.difficulty !== next.config.difficulty ||
      prev.config.language !== next.config.language);
  if (
    cfgChanged &&
    ctx.isCreator &&
    (next.phase === "setup" || next.phase === "ready") &&
    !!next.problem &&
    next.config.problemEnabled !== false
  ) {
    intents.push({ kind: "regenerate-problem", requestId: `req-${next.code}-cfg-${ctx.now}` });
  }

  // 7. 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成する
  //    （FR-020/028/059）。中断（abort）では記録を作らない。
  if (next.phase === "celebration" && next.problem && ctx.endType !== "abort" && !ctx.recordSaved) {
    intents.push({
      kind: "persist-completion",
      record: buildCompletionRecord(
        { session: next.session, clock: next.clock },
        next.problem,
        next.config,
        ctx.now,
        next.code,
      ),
    });
  }

  return intents;
}
