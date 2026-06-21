/** 参加時ドライバー宣言を rotation 加入（member.add）へ反映すべきか。 */
export function shouldAutoJoinRotation(args: { pendingName: string | null; rotation: string[] }): boolean {
  const { pendingName, rotation } = args;
  if (!pendingName) return false;
  return !rotation.includes(pendingName);
}
