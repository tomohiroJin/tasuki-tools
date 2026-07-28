/** 参加時ドライバー宣言を rotation 加入（member.add）へ反映すべきか。 */
export function shouldAutoJoinRotation(args: {
  /** 自分の参加者ID。未確定（identity 未受信）なら null。 */
  participantId: string | null;
  /** session.rotation（参加者IDの配列・D6b）。 */
  rotation: string[];
}): boolean {
  const { participantId, rotation } = args;
  if (!participantId) return false;
  // 既に輪に居るなら送らない（連打・再送の吸収）。同名の別人と取り違えないよう ID で見る。
  return !rotation.includes(participantId);
}
