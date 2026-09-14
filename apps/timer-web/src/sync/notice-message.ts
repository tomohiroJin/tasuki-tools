/**
 * signal: "notice" を日本語の文言に変換する（Issue #22・FR-077）。
 *
 * サーバーは意味（action と実行者・対象の識別子）だけを運び、表示の責務はここが持つ。
 * かつては「なぜ押せないか」を説明する拒否理由の文言（`ui/permission-hints.ts`）が別にあり、
 * 目的が違うので同居させていなかった。#95 S3 で役割ごと可否判定が消え、そのファイルも
 * 「なぜ押せないか」という概念も無くなったため、いまここが担うのは
 * 「誰が何をしたか」だけである。
 */

import { participantLabel } from "../ui/participant-label.js";

/** サーバーから受け取る notice の内容（`SignalNoticeMsg` と対応）。 */
export interface NoticeSignal {
  action: "participant-removed" | "session-aborted" | "session-reset" | "session-completed";
  actorName: string;
  actorParticipantId: string;
  targetName?: string | undefined;
  targetParticipantId?: string | undefined;
}

/** 文言を組み立てるのに必要な、受け手側の文脈。 */
export interface NoticeContext {
  /** この画面を見ている本人の識別子。実行者が本人なら「あなた」と表示する。 */
  selfParticipantId: string;
  /** 現在の名簿。同名参加者の検出に使う。 */
  participants: readonly { participantId: string; displayName: string }[];
}

/**
 * 参加者の呼び名を決める。同名が複数いるときだけ識別子を添える規則は
 * `ui/participant-label.ts` に集約しており、一覧の操作ラベルと同じものを使う。
 * 別々の規則を持つと、通知で名指しされた人が一覧のどの行だったのか辿れなくなる。
 */
function label(
  name: string,
  participantId: string,
  ctx: NoticeContext,
): string {
  if (participantId === ctx.selfParticipantId) return "あなた";
  return participantLabel(name, participantId, ctx.participants, "さん");
}

/** notice を読み上げ・表示用の一文にする。 */
export function buildNoticeMessage(notice: NoticeSignal, ctx: NoticeContext): string {
  const actor = label(notice.actorName, notice.actorParticipantId, ctx);

  switch (notice.action) {
    case "session-aborted":
      return `${actor}がセッションを中断しました。`;
    case "session-reset":
      // **「リセット」と言わない**（#95 S5c・レビュー ③）。同じ `session.reset` が
      // 2 つの操作から送られる —— セッション中の「最初から」と、完了後のロビーからの
      // 「セッションを開始」（2 本目以降。走行中・一時停止中の集約からは `START` が
      // 使えない・`ui/session-start.ts`）。サーバーはコマンドしか見ないので区別できない。
      // **どちらにも当てはまる言い方にする** —— 押したボタンの名前（「最初から」）に
      // 寄せ、起きたこと（先頭・満タンから走り出した）を述べる。
      return `${actor}がセッションを最初から始め直しました。`;
    case "session-completed":
      return `${actor}がセッションを完成として記録しました。`;
    case "participant-removed": {
      const targetName = notice.targetName ?? "";
      const targetId = notice.targetParticipantId ?? "";
      // 自己退出は「外された」ではなく本人の意思による退出として伝える。
      if (targetId !== "" && targetId === notice.actorParticipantId) {
        return `${actor}がルームから退出しました。`;
      }
      return `${actor}が${label(targetName, targetId, ctx)}を退出させました。`;
    }
  }
}
