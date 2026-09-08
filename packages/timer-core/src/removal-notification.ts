/**
 * 退出させられた本人へ送る通知の種類（Issue #32: 誰の操作かで分かれる）。
 *
 * #95 S3 で役割とホストを廃止した際、`participants.ts`（役割由来の不変条件）から
 * この 2 つだけを切り出した。**役割とは無関係な判定**であり、全員同格になっても
 * 「自分で抜けた」と「他の人に外された」の区別は残る。
 */

/** 退出させられた本人へ送る通知の種類。 */
export type RemovalNotification = "LEFT_ROOM" | "REMOVED_FROM_ROOM";

/**
 * 退出させられた本人へ送る通知の種類を、実行者と対象の関係から決める。
 *
 * 自分が自分を対象に退出を実行したのなら、それは本人自身の意思による退出であり、
 * 他者に外されたかのように伝えてはならない。
 */
export function removalNotificationFor(
  actorParticipantId: string,
  targetParticipantId: string,
): RemovalNotification {
  return actorParticipantId === targetParticipantId ? "LEFT_ROOM" : "REMOVED_FROM_ROOM";
}
