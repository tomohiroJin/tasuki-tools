/**
 * Valibot スキーマ（Command / ServerMsg / SessionConfig）
 * FR-021, FR-023, NFRセキュリティ(S3)
 */

import * as v from "valibot";
import {
  VALID_INTERVAL_MINUTES,
  MAX_ROOM_NAME,
  MAX_HANDOFF_NOTE,
  MAX_PASSPHRASE,
} from "./aggregate.js";
// ─── 共通 ───────────────────────────────────────────────────────────────────

const nonEmptyString = v.pipe(v.string(), v.minLength(1));
const participantId = nonEmptyString;

// 表示名は**この層では形だけを見る**（#95 S4b）。
//
// S4a まで、ここで正規化（`normalizeDisplayName`）と上限（正規化前後の二重）を
// 課していた。そのために `timer-core` が `@tasuki/room-core` を取り込んでいた ——
// 期限つきの一時依存として記録されていたものである（`docs/adr/0017` 決定 4）。
// **表示名の規約はメンバーシップ文脈のものなので、S4b で適用場所を境界の
// アプリケーション層（`apps/tasuki-sync/src/application/normalize-command-names.ts`）へ
// 移した。** 規約そのもの（正規則と上限）は `@tasuki/room-core` に住んでいる。
//
// **この変更で利用者が受け取るフレームは変わらない** —— 正規化の失敗は、ここで
// スキーマが落としていたときと同じ `INVALID_COMMAND`（同じ文言）で返る。
// 経路の検査は `apps/tasuki-sync/test/live-ws.display-name.test.ts`。
//
// ⚠ **ここに上限を書き戻さないこと。** 書き戻すと上限の正本が 2 つになり、
// `MAX_DISPLAY_NAME` を動かす段（S5b・#248 で poker の 24 と統合する）で片方が取り残される。
// 巨大入力そのものは接続層のフレーム上限（`maxMessageBytes`）が先に弾く。
const displayNameStr = v.string();
// パスフレーズ（空文字=解除を許すため minLength なし。最大長のみ課す）。
const passphraseStr = v.pipe(v.string(), v.maxLength(MAX_PASSPHRASE));

// ─── SessionConfig スキーマ ─────────────────────────────────────────────────

// `SessionConfig` は**入ってくるコマンド（`room.create` / `config.set`）と
// 出ていく snapshot の両方**が通るスキーマである。
//
// ⚠ かつてここには `members`（ローテーション順の表示名）があった。**#294 で落とした。**
// 読み手は席（`session.seats`）へ移っている。落としたことで 2 つの効果がある ——
//
// 1. **入ってくる `members` はここで消える。** v.object の出力に未知のキーは残らない
//    （`test/schemas.test.ts` が固定している）。輪の出入りを表示名の配列から組み直す
//    経路は、境界で取り除くまでもなく通れない（D6b）
// 2. **出ていく空文字で snapshot 全体が落ちなくなった。** 要素が `nonEmptyString` だった
//    ため、名簿から引けない席の空文字が 1 つ載るだけで画面は全フレームを捨てていた
//    （`docs/adr/0005`）。席の `displayName` は #276 D2 で `v.string()` にしてある
//
// ⚠ 同じく `language` / `difficulty` とお題機能を使うかの切り替えも **#91 PR 3 で落とした**
// （お題はルームの共有資産 `@tasuki/topic-core` へ移った）。上の 1 と同じ理由で、
// 古い画面が `config.set` / `room.create` に載せて送ってきても出力に残らない。
// 必須だった 2 つを落としたので、**古い画面の `config.set` はそのまま受理される**
// （必須を足す向きではないので、窓 3 = 古い画面 × 新しいサーバーでも落ちない）。
const SessionConfigSchema = v.object({
  intervalMinutes: v.picklist(VALID_INTERVAL_MINUTES),
  navigatorEnabled: v.optional(v.boolean()),
  // 0 は「休憩提案オフ」を表す（ロビーでトグルを外したときに送る）。1 以上で N 巡ごと。
  breakEveryRotations: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  assertiveSwitch: v.optional(v.boolean()),
});

// ─── Command スキーマ ────────────────────────────────────────────────────────

const RoomCreateCommand = v.object({
  command: v.literal("room.create"),
  displayName: displayNameStr,
  config: v.optional(SessionConfigSchema),
  // 任意のルーム名。コード生成のシードに使う（slug-接尾辞）。
  roomName: v.optional(v.pipe(v.string(), v.maxLength(MAX_ROOM_NAME))),
});

const RoomJoinCommand = v.object({
  command: v.literal("room.join"),
  code: nonEmptyString,
  displayName: displayNameStr,
  // ⚠ かつてここには AI の鍵を持つかの印（必須の boolean）があった。#91 PR 3 で落とした。
  // 古い画面はまだ載せて送ってくるが、v.object は未知のキーを出力に残さないので参加できる
  // （窓 3 = 古い画面 × 新しいサーバー。`apps/tasuki-sync/test/live-ws.room-ops.test.ts` が固定）。
  resumeToken: v.optional(v.string()),
  passphrase: v.optional(passphraseStr),
});

const ConfigSetCommand = v.object({
  command: v.literal("config.set"),
  config: v.partial(SessionConfigSchema),
});

const PhaseSetCommand = v.object({
  command: v.literal("phase.set"),
  phase: v.picklist(["setup", "ready", "session", "celebration"]),
});

// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
/** セッション操作アクション */
const SessionActionValues = [
  "START",
  "SWITCH",
  "PAUSE",
  "RESUME",
  // 現ドライバーのまま持ち時間だけを満タンからやり直す（Issue #14）。
  "RESTART",
  "COMPLETE",
  "RESET",
] as const;

const SessionActCommand = v.object({
  command: v.literal("session.act"),
  action: v.picklist(SessionActionValues),
});

const SessionCompleteCommand = v.object({
  command: v.literal("session.complete"),
});

const SessionResetCommand = v.object({
  command: v.literal("session.reset"),
});

const MemberAddCommand = v.object({
  command: v.literal("member.add"),
  // ローテーションは参加者IDで持つ（D6b）。名前で受けると同名の解決が曖昧になるため、
  // 発生源であるコマンドの時点で識別子にする。
  participantId,
});

const MemberRemoveCommand = v.object({
  command: v.literal("member.remove"),
  index: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const MemberMoveCommand = v.object({
  command: v.literal("member.move"),
  fromIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  toIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

// 順列はサーバーが生成するため、wire コマンドにはフィールドを持たせない。
const MemberShuffleCommand = v.object({ command: v.literal("member.shuffle") });

const HandoffNoteSetCommand = v.object({
  command: v.literal("handoff.note.set"),
  text: v.pipe(v.string(), v.maxLength(MAX_HANDOFF_NOTE)),
});

const BreakStartCommand = v.object({
  command: v.literal("break.start"),
});

const BreakEndCommand = v.object({
  command: v.literal("break.end"),
});

// ─── v2 新コマンド ────────────────────────────────────────────────────────────

const SessionAbortCommand = v.object({
  command: v.literal("session.abort"),
});

const ParticipantAddProxyCommand = v.object({
  command: v.literal("participant.addProxy"),
  participantId,
  displayName: displayNameStr,
});

const ParticipantRenameCommand = v.object({
  command: v.literal("participant.rename"),
  participantId,
  displayName: displayNameStr,
});

const ParticipantRemoveCommand = v.object({
  command: v.literal("participant.remove"),
  participantId,
});

const DriverSkipCommand = v.object({
  command: v.literal("driver.skip"),
  participantId,
});

const DriverResumeCommand = v.object({
  command: v.literal("driver.resume"),
  participantId,
});

const DriverAssignCommand = v.object({
  command: v.literal("driver.assign"),
  participantId,
});

const RoomPassphraseSetCommand = v.object({
  command: v.literal("room.passphrase.set"),
  passphrase: passphraseStr,
});

const PresencePingCommand = v.object({
  command: v.literal("presence.ping"),
});

const TimePingCommand = v.object({
  command: v.literal("time.ping"),
  clientTime: v.number(),
});

/**
 * クライアント→サーバー コマンドの合併スキーマ。
 *
 * ⚠ かつてはお題のコマンド（`problem.request` / `problem.submit` / `problem.edit` /
 * `problem.mode.set` / `ai.unlock`）も並んでいた。**#91 PR 3 で落とした。** 古い画面が
 * 送ってきても、ここで `INVALID_COMMAND` になり状態は変わらない（接続も切れない。
 * `apps/tasuki-sync/test/live-ws.room-ops.test.ts` が固定）。
 */
export const CommandSchema = v.variant("command", [
  RoomCreateCommand,
  RoomJoinCommand,
  ConfigSetCommand,
  PhaseSetCommand,
  SessionActCommand,
  SessionCompleteCommand,
  SessionAbortCommand,
  SessionResetCommand,
  MemberAddCommand,
  MemberRemoveCommand,
  MemberMoveCommand,
  MemberShuffleCommand,
  HandoffNoteSetCommand,
  BreakStartCommand,
  BreakEndCommand,
  ParticipantAddProxyCommand,
  ParticipantRenameCommand,
  ParticipantRemoveCommand,
  DriverSkipCommand,
  DriverResumeCommand,
  DriverAssignCommand,
  RoomPassphraseSetCommand,
  PresencePingCommand,
  TimePingCommand,
]);

/** クライアント→サーバー コマンドの合併型（wire スキーマから導出。ServerMsg と対の型）。 */
export type Command = v.InferOutput<typeof CommandSchema>;

// T057: 自ファイル内でも使われていなかったため、export を外すだけでなく削除した
// （FR-119③・SC-039。`private` にしても未使用のままでは死んだ記号が残るだけのため）。

// ─── ServerMsg スキーマ ──────────────────────────────────────────────────────

// Room のスキーマ（Valibot で検証用）
// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
const ParticipantSchema = v.object({
  participantId,
  // ⚠ `connId` は #95 S4b で落とした（多接続では「接続 1 本」が嘘になる。`wire.ts` の注記）。
  displayName: nonEmptyString,
  presence: v.picklist(["online", "idle", "offline"]),
  joinedAt: v.number(),
  // v2 追加フィールド（任意化で後方互換）
  isPlaceholder: v.optional(v.boolean()),
  driverEligible: v.optional(v.boolean()),
});

// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
const ServerClockSchema = v.object({
  running: v.boolean(),
  intervalSeconds: v.number(),
  anchorServerTime: v.number(),
  secondsLeftAtAnchor: v.number(),
  accumulatedElapsedMs: v.number(),
  runningSince: v.nullable(v.number()),
});

// #276 D2: displayName に nonEmptyString を使わない。名簿から引けない席は
// 空文字になりうる（設計 §3.3 の縮退）ため、ここで弾くと名前が引けない席が
// あるだけで snapshot 全体が落ちてしまう。
const SeatSchema = v.object({
  id: nonEmptyString,
  displayName: v.string(),
  isProxy: v.boolean(),
  skipReason: v.nullable(v.picklist(["stood-down", "away", "disconnected"])),
});

// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
const SessionStateSchema = v.object({
  rotation: v.array(v.string()),
  currentIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  isPaused: v.boolean(),
  driverCounts: v.array(v.pipe(v.number(), v.integer(), v.minValue(0))),
  totalSwitches: v.pipe(v.number(), v.integer(), v.minValue(0)),
  // #276 D7: 任意にしない。省略可にすると画面側にフォールバック経路が戻る。
  // **#294 で判断はより強くなった** —— 当時の補い元だった `config.members` は wire から
  // 落ちたので、席が欠けたときに「画面が推測する席」を組む材料はもう存在しない。
  // 任意にすると、席の無い snapshot で輪が丸ごと消えるか、推測の材料を**作り直す**ことになる。
  // 配布時の窓・後方互換の扱いは台帳を参照する
  // （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の項目 7）。
  seats: v.array(SeatSchema),
  nextIndex: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

// T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
const CompletionRecordSchema = v.object({
  id: nonEmptyString,
  roomId: v.optional(v.string()),
  // お題なしで完了した記録は null（#91・spec T9）。**`nonEmptyString` にしない** ——
  // 1 件の値で snapshot 全体が落ちる型の欠陥は #276 D2 で直している。
  topicTitle: v.nullable(v.string()),
  elapsedSeconds: v.pipe(v.number(), v.minValue(0)),
  members: v.array(nonEmptyString),
  totalSwitches: v.pipe(v.number(), v.integer(), v.minValue(0)),
  completedAt: v.number(),
  driverCounts: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  rounds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const RoomSchema = v.object({
  code: nonEmptyString,
  createdAt: v.number(),
  config: SessionConfigSchema,
  session: SessionStateSchema,
  clock: ServerClockSchema,
  phase: v.picklist(["setup", "ready", "session", "celebration"]),
  participants: v.array(ParticipantSchema),
  sessionRecords: v.array(CompletionRecordSchema),
  handoffNote: v.string(),
  onBreak: v.boolean(),
  // v2 追加フィールド（任意化で後方互換）
  passphraseProtected: v.optional(v.boolean()),
  // お題の 4 項目（`problem`・`problemMode`・`aiUnlocked`・`problemGeneration`）は
  // #91 PR 3 で落とした（`wire.ts` 末尾の注記）。**`problem` は必須だった**が、落とす向きなので
  // 旧いサーバーの snapshot（これらを載せている）は今までどおり通る。
  // `startedAt` は #95 S4a で落とした（読み手 0 件・書き手 0 件）。非 strict の
  // `v.object` なので、この項目を載せた古い snapshot も従来どおりパースできる。
});

const SnapshotMsg = v.object({
  type: v.literal("snapshot"),
  room: RoomSchema,
});

const ErrorMsg = v.object({
  type: v.literal("error"),
  code: nonEmptyString,
  message: v.string(),
});

const SignalSwitchMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("switch"),
  nextDriverName: v.string(),
});

const SignalCelebrationMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("celebration"),
});

const SignalSuggestBreakMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("suggest-break"),
  // 何巡したかの参考値（演出のみ・状態ではない・§5.2）
  rounds: v.number(),
});

/**
 * 破壊的操作の実行者を在室者全員へ伝えるシグナル（Issue #22・FR-077）。
 *
 * 開始後は主催者以外も退出・中断・リセット・完成を実行できるようになるため、
 * 「誰がやったか」が分からないと画面が突然変わった理由を追えない。
 * サーバーは意味（action と実行者）だけを運び、日本語の文言化は UI 側が行う。
 *
 * `participant-removed` の場合、退出させられた本人にはこのシグナルは届かない
 * （snapshot の配信対象から外れるため）。本人向けには専用の error を送る。
 */
const SignalNoticeMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("notice"),
  action: v.picklist([
    "participant-removed",
    "session-aborted",
    "session-reset",
    // 完成も確認を課す操作（FR-074b）なので、実行者を全員に伝える対象に含める。
    "session-completed",
  ]),
  /** 実行者の表示名 */
  actorName: nonEmptyString,
  /**
   * 実行者の識別子。表示名と併せて送る。
   * 二重参加の幽霊は本人と同じ表示名を持つため、表示名だけでは
   * 「A さんが A さんを退出させました」となり本 Issue の主要シナリオで判別できない。
   */
  actorParticipantId: participantId,
  /** 対象の表示名（participant-removed のときのみ） */
  targetName: v.optional(v.string()),
  /** 対象の識別子（participant-removed のときのみ） */
  targetParticipantId: v.optional(v.string()),
});

const TimePongMsg = v.object({
  type: v.literal("time.pong"),
  serverTime: v.number(),
});

const RoomCreatedMsg = v.object({
  type: v.literal("room.created"),
  code: nonEmptyString,
  resumeToken: nonEmptyString,
  participantId,
});

const RoomJoinedMsg = v.object({
  type: v.literal("room.joined"),
  resumeToken: nonEmptyString,
  participantId,
});

/** サーバー→クライアント メッセージの合併スキーマ */
export const ServerMsgSchema = v.variant("type", [
  SnapshotMsg,
  ErrorMsg,
  SignalSwitchMsg,
  SignalCelebrationMsg,
  SignalSuggestBreakMsg,
  SignalNoticeMsg,
  TimePongMsg,
  RoomCreatedMsg,
  RoomJoinedMsg,
]);

export type ServerMsg = v.InferOutput<typeof ServerMsgSchema>;
