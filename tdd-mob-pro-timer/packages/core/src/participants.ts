/**
 * 参加者の不変条件（Issue #22: 開始後は全員同格 — セッション進行から主催者を外す）。
 *
 * `permissions.ts` は「誰が実行できるか」（権限）を判定するのに対し、こちらは
 * 「その操作の結果、状態が妥当か」（不変条件）を判定する（plan.md D3）。
 * 「編集者以上（host または editor）が1名以上残る」という述語を、役割変更と退出の
 * 2つの経路から同じ関数として呼べるようにするためにモジュールを分離した。
 */

import type { Participant } from "./aggregate.js";

/**
 * 参加者が「編集者以上」として数えられるか。
 *
 * `isPlaceholder: true` の代理参加者（`participant.addProxy` で追加される。
 * `connId: null` / `role: "editor"` / `presence: "offline"` で登録される）は除外する。
 * 代理は Web に接続しておらず自分では何も操作できないため、代理を頭数に含めると
 * 「編集者以上が1名以上」という不変条件が「誰も操作できない」状態でも満たされてしまい、
 * 意味を失う（plan.md D3 注意1）。
 *
 * `presence` は意図的に見ない。本機能は死活監視をスコープ外としており、`presence` は
 * 信頼できる情報源ではない（plan.md D3 注意2）。オフラインの編集者だけが残り
 * オンラインは見学者のみ、という残存経路は presence ではなく D3b（開始後は自分の役割を
 * 自分で変更できる）で塞ぐ設計になっている。
 */
function isManager(participant: Participant): boolean {
  if (participant.isPlaceholder === true) return false;
  return participant.role === "host" || participant.role === "editor";
}

/** 在室者のうち編集者以上（host または editor）の人数を数える。 */
export function countManagers(participants: readonly Participant[]): number {
  return participants.filter(isManager).length;
}

/**
 * 対象の参加者が「編集者以上」から外れる操作（役割変更・退出）を行った結果、
 * 編集者以上が1名以上残るかを判定する共通述語。
 *
 * 対象が participants に見つからない場合や、対象が元々編集者以上でない場合
 * （viewer の退出・降格など）は、その操作が編集者以上の人数を減らさないため許可する。
 */
function wouldKeepAtLeastOneManager(
  participants: readonly Participant[],
  targetParticipantId: string,
): boolean {
  const target = participants.find((p) => p.participantId === targetParticipantId);
  if (!target) return true;
  if (!isManager(target)) return true;

  return countManagers(participants) - 1 >= 1;
}

/** 役割変更が「編集者以上が1名以上残る」不変条件を破らないか（FR-072/073）。 */
export function canDemote(
  participants: readonly Participant[],
  targetParticipantId: string,
): boolean {
  return wouldKeepAtLeastOneManager(participants, targetParticipantId);
}

/**
 * 退出が同じ不変条件を破らないか（FR-072/073）。
 *
 * spec.md FR-072 は「在室する参加者が1名以上存在する間」という前提つきの不変条件である。
 * 退出は在室者そのものを減らす操作なので、対象を除いた結果 在室者が0名になるなら
 * 前提が成立せず、不変条件は適用対象を失う（空虚に真）。したがってその退出は許可する。
 *
 * ここでの「在室者が0名か」の判定には、代理参加者（isPlaceholder: true）も含める。
 * `countManagers` が代理を数えないのは「自分で操作できる編集者以上」を数えるためだが、
 * 代理は退出後も部屋に残り続ける（自分では退出しない）。この2つの数え方を混同し、
 * 代理を「在室者」からも除外してしまうと、代理だけが残る部屋からhostが退出できてしまい、
 * 誰も操作できない部屋が残る（countManagers=0 の部屋に到達してしまう）。
 *
 * 一方 canDemote（降格）にはこの分岐を設けない。降格は在室者数を減らさないため、
 * 「対象1名だけが在室」のケースでも降格後にその1名（viewerになった本人）が部屋に
 * 残り続ける。退出（＝誰も残らないので誰も困らない）とは異なり、「操作できない人だけが
 * 部屋に残る」詰みを作ってしまうため、降格は拒否のままが正しい（非対称性は意図的）。
 */
export function canRemoveParticipant(
  participants: readonly Participant[],
  targetParticipantId: string,
): boolean {
  const remainingResidents = participants.filter(
    (p) => p.participantId !== targetParticipantId,
  );
  if (remainingResidents.length === 0) return true;

  return wouldKeepAtLeastOneManager(participants, targetParticipantId);
}
