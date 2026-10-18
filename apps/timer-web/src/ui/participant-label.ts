/**
 * 参加者の呼び名（Issue #22・FR-084）。
 *
 * 二重参加の幽霊は本人と同じ表示名を持つため、表示名だけでは本 Issue の主要シナリオで
 * 判別できない。同名が複数いるときだけ識別子を添える。同名がいない通常時に付けると
 * 読みにくいだけなので付けない。
 *
 * **呼び分けの規則そのもの（`participantLabel` など）は `@tasuki/room-core` に1つだけある（#419）。**
 * ここに残すのは、timer 固有の `Seat` に依存するプール組み立て（{@link labelPool}）だけ。
 *
 * **判定対象のプール（{@link labelPool}）を組む規則も、同じ理由でここに1つだけ置く。**
 * `seats`（輪の席・見学者を取りこぼさない）と `participants`（timer の在席者・離席者を
 * 取りこぼさない）のどちらか一方だけでは同名を見落とす場面がある（#276 D9）。
 * 呼び名を出すすべての呼び出し口が同じプールを使わないと、一方には識別子が付き
 * もう一方には付かないという非対称が起きる（敵対的レビュー #276 指摘1）。
 */

import type { LabelParticipant } from "@tasuki/room-core";
import type { Seat } from "@tasuki/timer-core";

/**
 * 呼び名の判定対象プールを組む（`seats` と `participants` の和集合、id で重複排除）。
 *
 * **同じ画面に並ぶ人全員が対象になる。** 片方だけでは足りない ——
 * `seats` だけだと輪の外の見学者との同名を取りこぼし（見学者は席を持たない）、
 * `participants` だけだと離席者どうしの同名を取りこぼす（`participants` は timer の
 * 在席者に絞られており、離席した席の相方が乗らない・R5/R6）。
 *
 * `seats` を優先する。`Seat.displayName` は絞っていない名簿から引かれており、
 * `participants` より広い集合の表示名を持つためである。
 */
export function labelPool(
  seats: readonly Seat[],
  participants: readonly LabelParticipant[],
): LabelParticipant[] {
  const byId = new Map<string, LabelParticipant>();
  for (const s of seats) byId.set(s.id, { participantId: s.id, displayName: s.displayName });
  for (const p of participants) if (!byId.has(p.participantId)) byId.set(p.participantId, p);
  return [...byId.values()];
}

/**
 * かつてここには「参加者行の操作の可否判定」（Issue #28・T067/T068・FR-107）として
 * `canTransferHostTo` / `canRemoveParticipant` / `canReorderRotation` の 3 つがあった。
 * どれも「管理権限を持つ操作主体か」（`isHost` / `canManage`）を引数に取る述語で、
 * Lobby と RosterPanel がそれぞれ別のインライン条件式を持つのを防ぐために置いていた。
 *
 * **#95 S3 で役割とホストを廃止し、管理権限という区別そのものが消えた。**
 * 残った条件（自分の行か・輪の中か・輪が 2 人以上か）は行の描画そのもので、
 * 述語として括り出しても常に真を返す部分を抱えるだけになる。
 * 恒真な述語は「検査しているように見えて何も守っていない」状態を作るため、
 * 関数ごと畳んで呼び出し側の条件式へ戻した。
 */
