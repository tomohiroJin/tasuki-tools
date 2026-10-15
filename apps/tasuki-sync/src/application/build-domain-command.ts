/**
 * wire のコマンド（`RoomScopedCommand`。境界で検証済み）を、core の `DecideCommand` へ翻訳する（FR-161）。
 *
 * DDD の腐敗防止層にあたる。ドメインのコマンドは wire に無い値を持つので、ここでは仮の値を置き、
 * 呼び出し側（`handleRoomCommand`）が後で埋める:
 * - `session.act` の `ineligible`（SWITCH のときだけ）
 * - `member.remove` の `ineligible`（運転中の人を外すときの次の担当を選ぶ・#376）
 * - `session.complete` の `topicTitle`（保管から）
 * - `driver.assign` の `index`（参加者 ID から解決する。-1 は仮の値）
 *
 * `handlers.ts` が抱えていた `buildDomainCommand` を 1 モジュールへ切り出したもの（フェーズ4・純粋な移動）。
 * **#363 で引数を検証済みの型にした。** それまでは `{ command: string; [key: string]: unknown }` を受け、
 * 検証済みの値を `typeof` と `as` で確かめ直していた。翻訳の表は `test/build-domain-command.test.ts` が固定する。
 */

import type { RoomScopedCommand } from "./handlers.js";
import { toPartialTimerConfig } from "./wire-config.js";

export function buildDomainCommand(cmd: RoomScopedCommand) {
  switch (cmd.command) {
    case "session.act": {
      // wire は 7 つの操作を受けるが、ドメインが扱うのは 5 つ（`SESSION_ACTIONS`）。
      // 残る 2 つはここで落とす（UNKNOWN_COMMAND になる）。**名前で書き分けるのは、wire に操作が
      // 増えたときに、下の `action` の型（ドメインの 5 つ）が合わなくなって型検査が落ちるようにするため**。
      if (cmd.action === "COMPLETE" || cmd.action === "RESET") return null;
      // ineligible は SWITCH のときだけ handlers.ts 側で後から埋める（B-2統合）。
      // ここでは常に未設定の型付きプロパティとして持たせ、他コマンドと同様に
      // 呼び出し側での型安全な代入を可能にする。
      return {
        command: "session.act" as const,
        action: cmd.action,
        ineligible: undefined as ReadonlySet<number> | undefined,
      };
    }
    case "session.complete":
      // タイトルは handleRoomCommand が保管から埋める。wire からは受け取らない（#91・spec T9）。
      return { command: "session.complete" as const, topicTitle: null as string | null };
    case "session.reset":
      return { command: "session.reset" as const };
    case "config.set":
      // ⚠ ここにはかつて `members` を取り除く分解代入があった。**#294 で不要になった** ——
      // `members` は wire の設定から消え、`SessionConfigSchema` を通った時点で落ちる
      // （v.object の出力に未知のキーは残らない。`packages/timer-core/test/schemas.test.ts`）。
      // 輪の出入りを担うのは member.add/remove/move・addProxy・participant.remove だけ
      // という決まり（D6b）は変わらない。
      return { command: "config.set" as const, config: toPartialTimerConfig(cmd.config) };
    case "member.add":
      // 誰を輪に並べるかは参加者IDで指す（D6b）。名前→IDの解決という曖昧さを発生源で消す。
      return { command: "member.add" as const, participantId: cmd.participantId };
    case "member.remove":
      // ineligible は handlers.ts 側で後から埋める（運転中の人を外すときの次の担当を選ぶ入力・#376）。
      return {
        command: "member.remove" as const,
        index: cmd.index,
        ineligible: undefined as ReadonlySet<number> | undefined,
      };
    case "member.move":
      return { command: "member.move" as const, fromIndex: cmd.fromIndex, toIndex: cmd.toIndex };
    case "phase.set":
      return { command: "phase.set" as const, phase: cmd.phase };
    case "handoff.note.set":
      return { command: "handoff.note.set" as const, text: cmd.text };
    // ─── v2 新コマンド ─────────────────────────────────────────────────────
    case "session.abort":
      return { command: "session.abort" as const };
    case "participant.addProxy":
      return { command: "participant.addProxy" as const, displayName: cmd.displayName, participantId: cmd.participantId };
    case "participant.rename":
      // 表示名の一意性は呼び出し側（handleRoomCommand）が participants に対して検査する（T052）
      return { command: "participant.rename" as const, participantId: cmd.participantId, displayName: cmd.displayName };
    case "driver.skip":
      return { command: "driver.skip" as const, participantId: cmd.participantId };
    case "driver.resume":
      return { command: "driver.resume" as const, participantId: cmd.participantId };
    case "driver.assign":
      // index は handleRoomCommand が participantId から解決して埋める（-1 はプレースホルダ）。
      return { command: "driver.assign" as const, index: -1 };
    default:
      // 翻訳の対象外（member.shuffle・participant.remove・room.passphrase.set は前段の専用処理、
      // break.start・break.end は wire に残るが処理しない）。UNKNOWN_COMMAND になる。
      return null;
  }
}
