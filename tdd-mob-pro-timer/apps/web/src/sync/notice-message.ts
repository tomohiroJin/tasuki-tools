/**
 * signal: "notice" を日本語の文言に変換する（Issue #22・FR-077）。
 *
 * サーバーは意味（action と実行者・対象の識別子）だけを運び、表示の責務はここが持つ。
 * 拒否理由の文言（`ui/permission-hints.ts`）とは目的が違うので同居させない。
 * 前者は「なぜ押せないか」、こちらは「誰が何をしたか」を伝える。
 */

/** サーバーから受け取る notice の内容（`SignalNoticeMsg` と対応）。 */
export interface NoticeSignal {
  action: "participant-removed" | "session-aborted" | "session-reset" | "session-completed";
  actorName: string;
  actorParticipantId: string;
  targetName?: string;
  targetParticipantId?: string;
}

/** 文言を組み立てるのに必要な、受け手側の文脈。 */
export interface NoticeContext {
  /** この画面を見ている本人の識別子。実行者が本人なら「あなた」と表示する。 */
  selfParticipantId: string;
  /** 現在の名簿。同名参加者の検出に使う。 */
  participants: readonly { participantId: string; displayName: string }[];
}

/** 識別子の末尾4文字。全体を出すと長く、読み上げでも冗長になるため短縮する。 */
function shortId(participantId: string): string {
  return participantId.slice(-4);
}

/**
 * 参加者の呼び名を決める。
 *
 * 同名が複数いるときだけ識別子を添える。二重参加の幽霊は本人と同じ表示名を持つため、
 * 表示名だけでは「Alice さんが Alice さんを退出させました」となり、本 Issue の
 * 主要シナリオでまさに判別できなくなる。一方、同名がいない通常時に識別子を出すと
 * 読みにくいだけなので付けない。
 */
function label(
  name: string,
  participantId: string,
  ctx: NoticeContext,
): string {
  if (participantId === ctx.selfParticipantId) return "あなた";

  // 名簿に載っている同名の人数を数える。対象は退出直後で名簿から消えていることが
  // あるため（notice は退出を永続化した後に配信される）、名簿に無くても名前は表示する。
  const sameName = ctx.participants.filter((p) => p.displayName === name);
  const isAmbiguous =
    sameName.length > 1 ||
    (sameName.length === 1 && sameName[0]!.participantId !== participantId);

  return isAmbiguous ? `${name} さん（ID: ${shortId(participantId)}）` : `${name} さん`;
}

/** notice を読み上げ・表示用の一文にする。 */
export function buildNoticeMessage(notice: NoticeSignal, ctx: NoticeContext): string {
  const actor = label(notice.actorName, notice.actorParticipantId, ctx);

  switch (notice.action) {
    case "session-aborted":
      return `${actor}がセッションを中断しました。`;
    case "session-reset":
      return `${actor}がセッションをリセットしました。`;
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
