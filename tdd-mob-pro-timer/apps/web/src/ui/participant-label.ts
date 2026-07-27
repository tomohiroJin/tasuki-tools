/**
 * 参加者の呼び名（Issue #22・FR-084）。
 *
 * 二重参加の幽霊は本人と同じ表示名を持つため、表示名だけでは本 Issue の主要シナリオで
 * 判別できない。同名が複数いるときだけ識別子を添える。同名がいない通常時に付けると
 * 読みにくいだけなので付けない。
 *
 * **同じ画面で同じ人が別の呼ばれ方をしないよう、規則はここに1つだけ置く。**
 * 通知の文面（`sync/notice-message.ts`）と一覧の操作ラベル（`ui/components/RosterPanel.tsx`）が
 * 別々の規則を持つと、通知で名指しされた人が一覧のどの行だったのか辿れなくなる。
 */

/** 呼び名の判定に必要な参加者の情報。Participant 全体を要求しない。 */
export interface LabelParticipant {
  participantId: string;
  displayName: string;
}

/**
 * 識別子の末尾4文字。全体を出すと長く、読み上げでも冗長になるため短縮する。
 * 衝突しうるが、区別したいのは「同じ画面に並んだ同名の数人」なので実用上は足りる。
 */
export function shortId(participantId: string): string {
  return participantId.slice(-4);
}

/**
 * 名簿の中に、その participant と同名の別人がいるか。
 *
 * 対象が名簿から消えている場合（退出直後の通知など）も曖昧とみなす。
 * 同名が1人だけ載っていて、それが対象自身でないなら、対象は「消えた同名の別人」である。
 */
export function isAmbiguousName(
  name: string,
  participantId: string,
  participants: readonly LabelParticipant[],
): boolean {
  const sameName = participants.filter((p) => p.displayName === name);
  if (sameName.length > 1) return true;
  return sameName.length === 1 && sameName[0]!.participantId !== participantId;
}

/**
 * 参加者を指す呼び名を返す。同名が複数いるときだけ識別子を添える。
 *
 * `honorific` を渡すと「名前 さん（ID: xxxx）」の語順にする。敬称を末尾に付け足すと
 * 「Bob（ID: 1234） さん」という不自然な日本語になるため、文脈ごとに語順を選べるようにしている。
 * **共有すべきは「曖昧かどうかの判定」と「識別子の短縮の仕方」であって、敬称の位置ではない。**
 */
export function participantLabel(
  name: string,
  participantId: string,
  participants: readonly LabelParticipant[],
  honorific = "",
): string {
  const base = honorific ? `${name} ${honorific}` : name;
  return isAmbiguousName(name, participantId, participants)
    ? `${base}（ID: ${shortId(participantId)}）`
    : base;
}
