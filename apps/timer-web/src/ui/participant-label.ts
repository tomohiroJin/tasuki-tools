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

import { nameSkeleton } from "@tasuki/room-core";

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
 * 名簿の中に、その participant と**見分けの付かない**別人がいるか。
 *
 * 比較は文字列の一致ではなく `nameSkeleton`（見え方の骨格）で行う。
 * キリル文字の `Вob` は Latin の `Bob` と画面上まったく同じに見えるが別の文字列なので、
 * 完全一致で見ていると「同名ではない」と判定され、識別子が添えられないまま並ぶ。
 * 利用者にとって見分けが付かないなら、それは曖昧である。
 *
 * 対象が名簿から消えている場合（退出直後の通知など）も曖昧とみなす。
 * 見た目が同じ人が1人だけ載っていて、それが対象自身でないなら、
 * 対象は「消えた見分けの付かない別人」である。
 */
export function isAmbiguousName(
  name: string,
  participantId: string,
  participants: readonly LabelParticipant[],
): boolean {
  const skeleton = nameSkeleton(name);
  const lookAlike = participants.filter((p) => nameSkeleton(p.displayName) === skeleton);
  if (lookAlike.length > 1) return true;
  return lookAlike.length === 1 && lookAlike[0]!.participantId !== participantId;
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

/**
 * 参加者行の「操作の可否判定」（Issue #28・T067/T068・FR-107）。
 *
 * `Lobby.tsx`（開始前・isHost で判定）と `RosterPanel.tsx`（開始後・canManage で判定）が、
 * ホスト譲渡・退出・ドライバー順の並べ替えという**同じ3つの操作**を、
 * それぞれ別のインライン条件式で判定していた（呼び出し側が2系統）。
 * Issue #22 の G8 では「同名判定の規則を1箇所に作ったのに呼び出し側が2系統あり
 * 片方へ行き渡らなかった」ために見分けのつかない状態のまま出荷しかけた。
 * それと同じ構造の再発（規則が2箇所でずれる）を避けるため、判定はここに1つだけ置く。
 *
 * `isHost` と `canManage` は呼び出し側で意味が異なりうるため、共通化するのは
 * 「管理権限を持つ操作主体が、対象の行に対してこの操作をしてよいか」という
 * 純粋な述語であり、権限そのものの算出（isHost か canManage か）は呼び出し側に残す。
 * 描画（JSX）・ハンドラの有無チェックも呼び出し側に残す（FR-118: 元に戻すことが困難な
 * 抽象を作らない）。
 */

/** 操作主体の状態。「自分自身の行か」と「管理権限を持つか」だけを表す。 */
export interface ParticipantActionContext {
  /** 対象が操作主体自身の行か。 */
  isSelf: boolean;
  /** 操作主体が管理権限を持つか（Lobby では isHost、RosterPanel では canManage）。 */
  canManage: boolean;
}

/**
 * ホスト譲渡ボタンを出してよいか。
 * 自分以外・管理権限あり・相手がまだホストでない・相手がオフラインでない
 * （オフラインへ譲ると無人ドライバーになるため）。
 */
export function canTransferHostTo(
  target: { role: "host" | "editor" | "viewer"; presence: "online" | "idle" | "offline" },
  ctx: ParticipantActionContext,
): boolean {
  return !ctx.isSelf && ctx.canManage && target.role !== "host" && target.presence !== "offline";
}

/** 退出させるボタンを出してよいか。自分以外・管理権限あり（自己退出は別経路）。 */
export function canRemoveParticipant(ctx: ParticipantActionContext): boolean {
  return !ctx.isSelf && ctx.canManage;
}

/**
 * ドライバー順の並べ替えボタンを出してよいか。
 * 管理権限あり・対象がドライバー（rotation 内）・ドライバーが2人以上
 * （1人だけでは並べ替える意味がない）。
 */
export function canReorderRotation(ctx: {
  canManage: boolean;
  inRotation: boolean;
  rotationLength: number;
}): boolean {
  return ctx.canManage && ctx.inRotation && ctx.rotationLength > 1;
}
