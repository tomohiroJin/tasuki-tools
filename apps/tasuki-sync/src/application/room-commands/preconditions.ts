/**
 * ルームのコマンドの事前条件（#366）。`decide` の前に、名簿を持つこの層だけが確かめられるものを見る。
 *
 * **集約（timer-core）は名簿を持たない**ので、「在室している人か」「名前がぶつからないか」「指名の相手が
 * 輪のどこに居るか」は `decide` では判定できない（#95 S4a で rotation が席の配列になってから）。
 * 以前は `handleRoomCommand` の中に `if (domainCmd && domainCmd.command === "...")` の連鎖として並んでいた。
 *
 * 失敗はコードだけを返す。文言は呼び出し側が timer-core の文言表から引く（全て `errorMessageFor`）。
 * 事前条件の無いコマンドは、そのまま通す。
 */
import { ok, err, type Result } from "neverthrow";
import { breakPolicyOf, rotationEntryId, type RoomPhase, type RotationEntry, type TimerConfig } from "@tasuki/timer-core";
import { conflictsWithExisting } from "@tasuki/room-core";
import type { Occupant } from "../timer-snapshot-dto.js";
import type { DomainCommandDraft } from "./domain-command.js";

export type PreconditionFailure =
  | "PARTICIPANT_NOT_FOUND"
  | "DuplicateName"
  | "NOT_IN_ROTATION"
  | "DRIVER_ASSIGN_OFFLINE"
  | "NOT_IN_SESSION"
  | "CONFIG_LOCKED_IN_SESSION"
  | "BREAK_DISABLED";

export interface PreconditionContext {
  /** 「名乗っている人」＝名簿の参加者＋輪の上の代理（`occupants`）。名簿だけを見ると代理が消える */
  residents: readonly Occupant[];
  rotation: readonly RotationEntry[];
  /** `driver.assign` の相手（wire のコマンドの `participantId`。ドメインのコマンドは index しか持たない） */
  assignTarget: string | undefined;
  /** ルームの段階。休憩と設定の変更の可否に使う（集約は phase を持たない・#402） */
  phase: RoomPhase;
  /** ルームの設定。休憩の条件が「なし」なら休憩を始めさせない（#402） */
  config: TimerConfig;
}

/**
 * 事前条件を確かめる。通れば、事前条件の中で決まった値（`driver.assign` の `index`）を埋めたコマンドを返す。
 */
export function checkPreconditions(
  draft: DomainCommandDraft,
  ctx: PreconditionContext,
): Result<DomainCommandDraft, PreconditionFailure> {
  switch (draft.command) {
    case "member.add":
      // 輪に並べられるのは在室者だけ（D6b）。実在しない ID を rotation に入れると
      // 表示名を引けない枠が残り、順番表示も指名も破綻する。
      return ctx.residents.some((p) => p.participantId === draft.participantId)
        ? ok(draft)
        : err("PARTICIPANT_NOT_FOUND");
    case "participant.addProxy":
      // 代理追加の表示名一意性（D6b）。rotation が席の配列になったため、集約からは名前の重複を判定できない。
      // 「既存の表示名と重複する代理は追加できない」という従来の挙動を維持する。
      return conflictsWithExisting(ctx.residents, draft.displayName) ? err("DuplicateName") : ok(draft);
    case "participant.rename":
      return checkRename(draft, ctx);
    case "driver.assign":
      return resolveAssign(draft, ctx);
    case "break.start":
      // 休憩はセッション中だけ（#402）。集約は phase を持たないので decide では判定できない。
      if (ctx.phase !== "session") return err("NOT_IN_SESSION");
      // 条件「なし」のルームの画面は「休憩する」を出さない。古い画面や手で組んだフレームが送っても
      // 同じ線をサーバーが引く（#402 総合レビュー）。
      return breakPolicyOf(ctx.config).trigger === "none" ? err("BREAK_DISABLED") : ok(draft);
    case "break.end":
      // 明ける経路は条件で塞がない。休憩中に設定は変わらない（config.set はセッション中に拒む）が、
      // 万一条件「なし」の休憩中が生まれても、終えられないルームを残さないため。
      return ctx.phase === "session" ? ok(draft) : err("NOT_IN_SESSION");
    case "config.set":
      // 設定はロビーで変える（#402 設計 D7）。セッション中に間隔を変えると、凍結した残り時間が満タンで
      // 上書きされる（`evolveConfigSet`）。画面はセッション中に config.set を送らない。
      return ctx.phase === "session" ? err("CONFIG_LOCKED_IN_SESSION") : ok(draft);
    default:
      return ok(draft);
  }
}

/** 改名の表示名一意性（T052・D6b）。「既存の表示名へは改名できない」という従来の挙動を維持する。 */
function checkRename(
  draft: Extract<DomainCommandDraft, { command: "participant.rename" }>,
  ctx: PreconditionContext,
): Result<DomainCommandDraft, PreconditionFailure> {
  const target = ctx.residents.find((p) => p.participantId === draft.participantId);
  // 対象が存在しなければ早期に拒否する（実体は対象不在なのに DuplicateName 等の誤った理由で失敗させないため）。
  if (!target) return err("PARTICIPANT_NOT_FOUND");
  // 自分自身は比較対象から外す（現在名と同じ名前への改名は no-op 相当で許可する）。
  // 大文字小文字は無視する（表示上の識別が付かないため衝突とみなす・FR-046/048）。
  return conflictsWithExisting(ctx.residents, draft.displayName, target.participantId)
    ? err("DuplicateName")
    : ok(draft);
}

/**
 * 指名は participantId → rotation index を解決して decide へ渡す（Issue #13）。集約は名簿を持たないため、
 * rotation 内の位置をここで確定する。
 */
function resolveAssign(
  draft: Extract<DomainCommandDraft, { command: "driver.assign" }>,
  ctx: PreconditionContext,
): Result<DomainCommandDraft, PreconditionFailure> {
  const target = ctx.residents.find((p) => p.participantId === (ctx.assignTarget ?? ""));
  // 対象解決を 2 段に分ける（Issue #29・T112）。「対象が存在しない」と「対象は居るが rotation に居ない」は
  // 解消手段が異なるため、同じ index<0 の 1 条件で吸収せず、コードも分ける。
  if (!target) return err("PARTICIPANT_NOT_FOUND");
  const index = ctx.rotation.findIndex((e) => rotationEntryId(e) === target.participantId);
  if (index < 0) return err("NOT_IN_ROTATION");
  // 実在（非代理）オフラインのメンバーは指名できない（R2-1: 無人ドライバーを防ぐ。自動交代・手動 SWITCH の
  // computeIneligibleIndices と同じ判定に揃える）。代理(placeholder)は Web 非接続が常態で対面在席する
  // 実在の人を表すため offline でも許可する。
  if (target.presence === "offline" && !target.isPlaceholder) return err("DRIVER_ASSIGN_OFFLINE");
  return ok({ ...draft, index });
}
