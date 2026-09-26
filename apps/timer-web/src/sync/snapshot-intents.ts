/**
 * snapshot 受信時に「何をするか」を決める純粋関数（#167 E4）。
 *
 * かつては App.tsx の handleRoom（88 行）に、7 つの分岐と 3 種の副作用
 * （復帰の組の保存・WS 送信・IndexedDB）が混ざっていた。判断だけをここへ出し、
 * 副作用は同期フックが意図を見て起こす。
 *
 * **配列の順が振る舞いである。** 現行 handleRoom の実行順をそのまま保つ:
 * resume 保存 → 完了状態の後片付け → 画面遷移 → 終わり方（`set-end`）→ 完成記録。
 *
 * **お題の生成中の解除（`clear-generating`）は #283 で消えた。** 生成中は
 * サーバーが持つ状態になったので、画面は受け取った値をそのまま読めばよく、解除という
 * 出来事が要らなくなった。その後 #91 PR 3 で timer のお題（生成中を含む）は snapshot から
 * 消え、お題の状態はお題の文脈（`@tasuki/topic-core` の `TopicState`）が `topic` フレームで配る。
 *
 * **参加時ドライバー宣言（`consume-driver-join` / `join-rotation`）は #272 で畳んだ。**
 * 宣言を立てていたのは timer の旧入口（`Join`）だけで、#95 S5c（#249）の撤去で
 * 立てる者が居なくなった（名乗りは玄関に 1 つ）。
 *
 * **完成記録は端末で組み立てない**（#91 PR 3）。サーバーが完了の時点で作った記録を
 * snapshot の `sessionRecords` から取り、終わり方（完成／中断）も「記録が増えたか」で決める。
 *
 * **この module から `Date.now()` を呼ばない**（`docs/adr/0016`）。かつては完成記録を
 * 組み立てるために `ctx.now` で時刻を注入していた。#91 PR 3 で端末が記録を作らなくなり、
 * 時刻に依存する判断は無くなったので注入口も落とした。要るようになったら同じ形で注入すること。
 */

import type { CompletionRecord, Room } from "@tasuki/timer-core";
import { screenForPhase, type Screen } from "../ui/screen.js";
import type { EndType } from "../ui/Summary.js";
import type { ResumeIdentity } from "@tasuki/sync-client";

export type SnapshotIntent =
  /** 復帰情報を保存する（room.code が分かるのは snapshot の時点だけ）。 */
  | { kind: "save-resume"; identity: ResumeIdentity }
  /** 前のセッションの完了状態（記録・終了種別）を畳む。 */
  | { kind: "clear-completion" }
  /** サーバー権威の phase に画面を追従させる。 */
  | { kind: "set-screen"; screen: Screen }
  /** 終わり方（完成／中断）を決める。snapshot から導く（#91 PR 3）。 */
  | { kind: "set-end"; endType: EndType }
  /** サーバーが作った完成記録を端末に保存する（組み立てはしない・#91 PR 3）。 */
  | { kind: "persist-completion"; record: CompletionRecord };

export interface SnapshotContext {
  /** room.created / room.joined で受け取り、まだ保存していない復帰情報。 */
  pendingResume: { participantId: string; resumeToken: string } | null;
  /** 参加時に名乗った表示名（resumeToken 再送の room.join に必要）。 */
  resumeDisplayName: string;
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

  // 2. 完了から抜けたら、前のセッションの完了状態を畳む（#95 S5c・レビュー ②）。
  //
  //    **全端末で降ろす必要がある。** 押した人の操作の中だけで降ろすと、押していない
  //    端末の `record` が前回のままになり、2 本目の完了画面に **1 本目の記録**が出る。
  //    （#91 PR 3 までは「保存済みの印」も畳んでいた。保存は完了へ入った瞬間にだけ
  //    起きる形になり、印は要らなくなった。）
  //
  //    （かつて「新しいセッション」を押した人はそのまま玄関へ去る前提だったが、
  //    #290・D5 でルームが生きていれば全員が同じ snapshot でロビーへ戻るようになり、
  //    その前提は無くなった。**結論（全端末で降ろす）はこの二重保存の窓のために
  //    別の理由で生きている。**）
  //
  //    見るのは phase の遷移そのもの（`celebration` → それ以外）である。サーバーが
  //    権威なので、全員が同じ snapshot で同じ時点に降ろす。二重保存の窓も開かない ——
  //    次に `celebration` へ入るのは新しいセッションが完成したときだけである。
  if (prev?.phase === "celebration" && next.phase !== "celebration") {
    intents.push({ kind: "clear-completion" });
  }

  // 3. サーバー権威の phase に全参加者が追従する（誰の開始/完成でも全員に反映）。
  intents.push({ kind: "set-screen", screen: screenForPhase(next.phase) });

  // ⚠ **ここに「設定が変わったら生成中の表示を出す」を置いてはならない**（#271 のレビュー）。
  //
  //    かつてこの位置には、内容差分で降ろす `clear-generating` があった。サーバーは
  //    設定変更の snapshot と、作り直したお題の snapshot を**同じ tick で続けて送る**。
  //    `handleRoom` が読む `room` は直前のレンダー時点の値なので、2 本目を処理する
  //    時点でもまだ「変更前のルーム」のままである。結果、**お題が確定した後の
  //    snapshot で生成中が立ち直り**、内容差分で降ろす経路は二度と成立しなかった。
  //    実測では `aria-busy=true` のまま 6 秒経っても降りず、お題パネル全体が
  //    `pointer-events: none` で固まった。
  //
  //    **#283 で生成中はサーバーの状態になった。** 画面は受け取った値をそのまま読むだけなので、
  //    立てる／降ろすという出来事が要らない。**#91 PR 3 で timer はお題を作らなくなり**、
  //    生成中はお題の文脈の状態（`TopicState.generating`。書くのは同期サーバーの
  //    `application/topic-generation.ts`）として `topic` フレームで届く。ここに待ちの表示を
  //    足す理由はもう無い —— 待ちを見せたいなら、それを知っているサーバー側が帳簿に書くこと。

  // 4. 完了へ**入った瞬間**に、終わり方と記録を決める（#91 PR 3）。
  //
  //    **記録は端末で作らない。** サーバーが完了の時点で作った記録（お題のタイトルを写したもの・
  //    spec T9）が `sessionRecords` に 1 件増えている。それをそのまま保存するので、タイトルは
  //    必ずサーバーの写しと一致し、ID もサーバーのものになる（再読込で二重に保存しない）。
  //
  //    **終わり方も snapshot から導く。** 完成ならサーバーが記録を 1 件足し、中断なら足さない。
  //    かつては押した人の端末だけが「中断」を知っており、押していない端末は中断でも記録を作っていた。
  //
  //    **前の snapshot が無い端末（再読込・完了の後に入ってきた人）は判定しない。** 増えたかどうかを
  //    比べる相手が無い。記録も出さず、保存もしない（受容・spec §10）。
  if (prev !== null && prev.phase !== "celebration" && next.phase === "celebration") {
    const added = next.sessionRecords.length > prev.sessionRecords.length
      ? next.sessionRecords[next.sessionRecords.length - 1]
      : undefined;
    if (added !== undefined) {
      intents.push({ kind: "set-end", endType: "complete" });
      intents.push({ kind: "persist-completion", record: added });
    } else {
      intents.push({ kind: "set-end", endType: "abort" });
    }
  }

  return intents;
}
