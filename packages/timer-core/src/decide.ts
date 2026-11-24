/**
 * decide 関数 — コマンドから DomainEvent[] を生成する純粋関数
 * 要件（`docs/plans/tdd-mob-pro-timer/spec.md`）: FR-002, FR-003, FR-004, FR-005, FR-009, FR-010
 */

import { ok, err, type Result } from "neverthrow";
import type { Aggregate, RandomRotation, RoomPhase, SessionAction, TimerConfig } from "./aggregate.js";
import {
  VALID_INTERVAL_MINUTES,
  MAX_MEMBERS,
  freshRandomRotation,
  isPermutation,
  isOnBreak,
  isSeatIndex,
  nextDriverAfterRemoval,
  nextDriverIndex,
  randomRotationAfterAssign,
  randomRotationAfterSwitch,
  rotationEntryId,
  sessionHasStarted,
} from "./aggregate.js";
import { driverSwitchedEvent } from "./driver-switch.js";
import type { DomainEvent } from "./events.js";
import type { DomainError } from "./errors.js";

/**
 * decide が受け付けるコマンド（スキーマ依存を避けた内部型）
 * T057: 自ファイル内でのみ使われるため export を外した（FR-119③・SC-039）。
 */
type DecideCommand =
  | {
      command: "session.act";
      action: SessionAction;
      // SWITCH 専用（他アクションでは無視される）。B-2統合: handleRoomCommand が
      // advanceDriver の代わりに使っていた「対象外を飛ばす」判定を decide 自身に委譲する
      // ための任意フィールド。省略時（既存呼び出し）は空集合扱いで従来通り隣を返す（後方互換）。
      ineligible?: ReadonlySet<number> | undefined;
      // START・SWITCH 専用。ランダム交代（#660）の引く順を作る順列（席の添字）。`member.shuffle` の order と
      // 同じく、サーバーが作って渡す（wire のコマンドは持たない）。輪の順のモードでは見ない。
      // 省略時は引く順を作り直さない。順列でなければ InvalidIndex で断る。
      randomOrder?: readonly number[] | undefined;
    }
  | { command: "session.complete"; topicTitle: string | null }
  | { command: "session.abort" }
  // randomOrder は session.act と同じ（ランダム交代の引く順を作る順列・#660）。
  | { command: "session.reset"; config?: TimerConfig; randomOrder?: readonly number[] | undefined }
  | { command: "member.add"; participantId: string }
  | {
      command: "member.remove";
      index: number;
      // 運転中の人を外すときの次の担当を、交代と同じ資格の規則で選ぶための入力（#376）。
      // session.act の ineligible と同じく、サーバーが埋める。省略時は全員適格として扱う。
      ineligible?: ReadonlySet<number> | undefined;
    }
  | { command: "member.move"; fromIndex: number; toIndex: number }
  // order はサーバー（handler）が生成して渡す（wire コマンドは order を持たない）。
  | { command: "member.shuffle"; order: number[] }
  // randomOrder はランダム交代を入れるときの引く順（#660）。session.act と同じくサーバーが作って渡す。
  | { command: "config.set"; config: Partial<TimerConfig>; randomOrder?: readonly number[] | undefined }
  | { command: "phase.set"; phase: RoomPhase }
  | { command: "handoff.note.set"; text: string }
  | { command: "break.start" }
  | { command: "break.end" }
  | { command: "participant.addProxy"; displayName: string; participantId: string }
  | { command: "participant.rename"; participantId: string; displayName: string }
  | { command: "driver.skip"; participantId: string }
  | { command: "driver.resume"; participantId: string }
  | { command: "driver.assign"; index: number };

/**
 * コマンドを受け取り、DomainEvent[] または DomainError を返す純粋関数
 */
export function decide(
  cmd: DecideCommand,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  // 休憩中に拒むのは、時計を動かす操作（session.act・driver.assign）と二重の break.start である
  // （#402 設計 §3.4）。拒む対象はコマンドの種類で決める（session.act の中の操作の種類は列挙しない）。
  // 休憩を畳むのは break.end のほか、完成・中断・ロビーへの phase.set・session.reset（集約を
  // 作り直すので休憩も初期に戻る。設計 §3.4 の裁定）で、これらは拒まない。
  // 空の輪の判定（decideSessionAct）より先に来るので、空の輪で休憩中なら OnBreak が先に返る。
  if (
    isOnBreak(agg.session) &&
    (cmd.command === "session.act" || cmd.command === "driver.assign" || cmd.command === "break.start")
  ) {
    return err({ type: "OnBreak" });
  }
  if (!isOnBreak(agg.session) && cmd.command === "break.end") {
    return err({ type: "NotOnBreak" });
  }

  switch (cmd.command) {
    case "session.act":
      return decideSessionAct(cmd.action, agg, now, cmd.ineligible, cmd.randomOrder);

    case "session.complete":
      return ok([{ type: "SessionCompleted", now, topicTitle: cmd.topicTitle }]);

    case "session.abort":
      return ok([{ type: "SessionAborted", now }]);

    case "session.reset": {
      if (agg.session.randomRotation === null) return ok([{ type: "SessionReset", now }]);
      // ランダム交代（#660）: 開始と同じく引く順を作り、先頭の運転者から周を始める。画面は 2 回目以降の
      // セッションをリセットで始める（timer-web の `session-start.ts`）ので、ここで作らないと、
      // ロビーで入った人が最初の周だけ輪の順で並ぶ。
      const invalid = invalidRandomOrder(cmd.randomOrder, agg.session.rotation.length);
      if (invalid !== null) return err(invalid);
      const randomRotation = freshRandomRotation(
        { rotation: agg.session.rotation, currentIndex: 0 },
        cmd.randomOrder,
        agg.session.randomRotation.order,
      );
      return ok([{ type: "SessionReset", randomRotation, now }]);
    }

    case "member.add":
      return decideMemberAdd(cmd.participantId, agg, now);

    case "member.remove":
      return decideMemberRemove(cmd.index, agg, now, cmd.ineligible);

    case "member.move":
      return decideMemberMove(cmd.fromIndex, cmd.toIndex, agg, now);

    case "member.shuffle":
      return decideMembersShuffle(cmd.order, agg, now);

    case "config.set":
      return decideConfigSet(cmd.config, agg, now, cmd.randomOrder);

    case "phase.set":
      return ok([{ type: "PhaseSet", phase: cmd.phase, now }]);

    case "handoff.note.set":
      return ok([{ type: "HandoffNoteSet", text: cmd.text, now }]);

    case "break.start":
      // 開始前（時計が一度も走っていない）には休憩を作らせない（PR #416 のレビュー）。通すと break.end が
      // SessionStarted を経ずに時計を走らせ、休憩の基準も開始の送り分け（timer-web の session-start.ts）も素通りする。
      if (!sessionHasStarted(agg)) {
        return err({ type: "PhaseConflict", currentPhase: "stopped", requiredPhase: "session" });
      }
      return ok([{ type: "BreakStarted", now }]);

    case "break.end":
      return ok([{ type: "BreakEnded", now }]);

    case "participant.addProxy":
      return decideAddProxy(cmd.displayName, cmd.participantId, agg, now);

    case "participant.rename":
      return decideRename(cmd.participantId, cmd.displayName, now);

    case "driver.skip":
      return ok([{ type: "DriverSkipped", participantId: cmd.participantId, now }]);

    case "driver.resume":
      return ok([{ type: "DriverResumed", participantId: cmd.participantId, now }]);

    case "driver.assign":
      return decideDriverAssign(cmd.index, agg, now);
  }
}

// ─── v2 新コマンド ────────────────────────────────────────────────────────────

function decideAddProxy(
  displayName: string,
  participantId: string,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }
  // 表示名の一意性は participants に対して検査する（サーバー側の責務・D6b/T052 と同じ）。
  // rotation は参加者IDの配列になったので、ここから名前の重複は判定できない。
  // かつてここで rotation と突き合わせていた検査は、rotation の中身が識別子に変わった
  // 時点で「絶対に一致しない」死んだ検査になっていた（実機検証で発見）。
  if (agg.session.rotation.length >= MAX_MEMBERS) {
    return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  }
  return ok([{ type: "ProxyMemberAdded", participantId, displayName: trimmed, now }]);
}

function decideRename(
  participantId: string,
  displayName: string,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }
  // 表示名の一意性は participants に対して検査する（サーバー側の責務・D6b/T052）。
  // rotation は参加者IDの配列になったので、ここから名前の重複は判定できない。
  // decide は集約（session/clock）しか見ないため、participants を持つ層へ移した。
  return ok([{ type: "ParticipantRenamed", participantId, displayName: trimmed, now }]);
}

// ─── セッション操作 ──────────────────────────────────────────────────────────

function decideSessionAct(
  action: SessionAction,
  agg: Aggregate,
  now: number,
  ineligible?: ReadonlySet<number>,
  randomOrder?: readonly number[],
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  // 空の輪では時計を走らせない（#376）。どの操作も時計を走らせる（PAUSE だけは止めるが、空の輪の時計は
  // evolve が既に止めている）。evolve に黙って直させず、decide が断る。
  if (session.rotation.length === 0) {
    return err({ type: "EmptyRotation" });
  }

  switch (action) {
    case "START": {
      if (clock.running) {
        return err({
          type: "PhaseConflict",
          currentPhase: "session",
          requiredPhase: "stopped",
        });
      }
      if (session.randomRotation === null) return ok([{ type: "SessionStarted", now }]);
      // ランダム交代（#660）: 開始のたびに引く順を作り、いまの運転者から周を始める。ロビーでモードを選んだ
      // あとに入った人は引く順に居ないので、ここで作らないと最初の周が輪の順になる。
      const invalid = invalidRandomOrder(randomOrder, session.rotation.length);
      if (invalid !== null) return err(invalid);
      const randomRotation = freshRandomRotation(session, randomOrder, session.randomRotation.order);
      return ok([{ type: "SessionStarted", randomRotation, now }]);
    }

    case "SWITCH": {
      if (!clock.running) {
        return err({
          type: "PhaseConflict",
          currentPhase: "stopped",
          requiredPhase: "session",
        });
      }
      const invalid = session.randomRotation === null ? null : invalidRandomOrder(randomOrder, session.rotation.length);
      if (invalid !== null) return err(invalid);
      // 交代先は輪の順でもランダム交代でも nextDriverIndex が決める（driverSwitchedEvent）。
      // ineligible 省略時（undefined）は全員適格として扱う。
      return ok([driverSwitchedEvent(session, ineligible, now, randomOrder)]);
    }

    case "PAUSE":
      if (!clock.running || session.isPaused) {
        return err({
          type: "PhaseConflict",
          currentPhase: "paused",
          requiredPhase: "running",
        });
      }
      return ok([{ type: "SessionPaused", now }]);

    case "RESUME":
      if (clock.running && !session.isPaused) {
        return err({
          type: "PhaseConflict",
          currentPhase: "running",
          requiredPhase: "paused",
        });
      }
      return ok([{ type: "SessionResumed", now }]);

    case "RESTART":
      // 現ドライバーのまま持ち時間をやり直す（Issue #14）。走行中・一時停止中・停止中の
      // いずれでも「満タンで走り出す」は一貫して意味を持つためガードを置かない
      // （一時停止中の実行で走行再開する＝受け入れ基準。RESUME も未開始状態を受理する）。
      return ok([{ type: "DriverTimerReset", now }]);
  }
}

/**
 * 任意メンバーへドライバーを強制指名する（Issue #13）。
 * 既存 DriverSwitched を任意 index で発行し、evolve の担当回数加算・満タン再アンカーを流用する。
 * 稼働中のみ・rotation 範囲内のみ許可し、現ドライバー自身の指名は no-op（空イベント）とする。
 */
function decideDriverAssign(
  index: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  // 稼働中でなければ指名しない（SWITCH と同じガード）。
  if (!clock.running) {
    return err({
      type: "PhaseConflict",
      currentPhase: "stopped",
      requiredPhase: "session",
    });
  }
  // rotation 範囲外は不正（整数でない添字も。判定は evolve と共有の isSeatIndex・#376）。
  if (!isSeatIndex(index, session.rotation.length)) {
    return err({ type: "InvalidIndex", index, max: session.rotation.length - 1 });
  }
  // 現ドライバー自身の指名は no-op（イベント無し）。
  if (index === session.currentIndex) {
    return ok([]);
  }
  // ランダム交代（#660）なら、指名された人をこの周で運転した人に足す。
  const randomRotation = randomRotationAfterAssign(session, index);
  return ok([{ type: "DriverSwitched", nextIndex: index, ...(randomRotation !== null && { randomRotation }), now }]);
}

// ─── メンバー管理 ────────────────────────────────────────────────────────────

function decideMemberAdd(
  participantId: string,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = participantId.trim();

  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }

  // 既にローテーションに並んでいる人は二重に並べない（連打・再送の吸収）。
  // rotation は席の配列（#95 S4a）なので席の識別子で突き合わせる。**代理の ID も見る**
  // （移設前の `rotation.includes(trimmed)` と同じ範囲。`kind` で絞る理由は無い）。
  if (agg.session.rotation.some((e) => rotationEntryId(e) === trimmed)) {
    return err({ type: "DuplicateName", name: trimmed });
  }

  if (agg.session.rotation.length >= MAX_MEMBERS) {
    return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  }

  return ok([{ type: "MemberAdded", participantId: trimmed, now }]);
}

function decideMemberRemove(
  index: number,
  agg: Aggregate,
  now: number,
  ineligible?: ReadonlySet<number>,
): Result<DomainEvent[], DomainError> {
  if (!isSeatIndex(index, agg.session.rotation.length)) {
    return err({
      type: "InvalidIndex",
      index,
      max: agg.session.rotation.length - 1,
    });
  }

  // 2層モデル: ドライバーは各自が出入りする。最後の1人だけは外れられない
  // （rotation が 0 になると担当も交代先も居ないままタイマーが回るため）。
  // evolve は空の輪を渡されても壊れない（currentIndex は 0、時計は一時停止で止まる。#376）が、
  // 空の輪は製品として認めない。
  if (agg.session.rotation.length <= 1) {
    return err({ type: "BelowMinMembers", min: 1 });
  }

  // 運転中の人を外すなら、次の担当を交代と同じ資格の規則で選ぶ（#376）。
  // 位置で次の席にすると、一時離脱・不在の人に運転が回る。
  // 開始前（ロビー）の「運転中の席」は運転していない。ランダム交代でも袋から引かず、輪の順のモードと同じ規則
  // （外れた席の次の適格な席・#376）で選ぶ。始まっていれば、一時停止中・休憩中でも袋から引く
  // （袋から引くと、開始の運転者が輪の途中の席になり、画面が最初の開始をリセットで送る。#660 の 2 巡目のレビュー）。
  const session = sessionHasStarted(agg) ? agg.session : { ...agg.session, randomRotation: null };
  const nextDriver = nextDriverAfterRemoval(session, index, ineligible);
  // ランダム交代（#660）で運転中の人を外すなら、次の担当は袋から引いた人（予告した人）なので、袋も進める。
  // 適格な人が居なくて位置で次の席にしたとき（`drawn === index`）は、袋から引いていないので、指名と同じく
  // その人をこの周で運転した人に足すだけにする（周は始め直さない）。足さないと、全員が戻ったあとに
  // 同じ人がこの周でもう一度当たる（#660 のレビュー）。
  const removesDriver = index === session.currentIndex;
  const drawn = removesDriver ? nextDriverIndex(session, index, ineligible) : index;
  const randomRotation = !removesDriver
    ? null
    : drawn === index
      ? randomRotationAfterAssign(session, (index + 1) % session.rotation.length)
      : randomRotationAfterSwitch(session, drawn, undefined);
  return ok([
    { type: "MemberRemoved", index, nextDriverIndex: nextDriver, ...(randomRotation !== null && { randomRotation }), now },
  ]);
}

function decideMemberMove(
  fromIndex: number,
  toIndex: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const len = agg.session.rotation.length;
  const maxIndex = len - 1;

  // 判定は evolve と共有の isSeatIndex（整数でない添字も拒む・#376）。
  if (!isSeatIndex(fromIndex, len)) {
    return err({ type: "InvalidIndex", index: fromIndex, max: maxIndex });
  }

  if (!isSeatIndex(toIndex, len)) {
    return err({ type: "InvalidIndex", index: toIndex, max: maxIndex });
  }

  return ok([{ type: "MemberMoved", fromIndex, toIndex, now }]);
}

/**
 * 順列でない `order` のうち、最初に順列を崩した値（長さが違えば長さ）。InvalidIndex の `index` に載せる。
 * 判定そのものは `isPermutation` が持つ。ここは「何が悪かったか」を言うだけ。
 */
function firstNonPermutationValue(order: readonly number[], len: number): number {
  if (order.length !== len) return order.length;
  const seen = new Set<number>();
  for (const i of order) {
    if (!isSeatIndex(i, len) || seen.has(i)) return i;
    seen.add(i);
  }
  return order.length;
}

/**
 * サーバーが渡したランダム交代の順列（#660）が順列でなければ、その InvalidIndex。省略と順列は null。
 * `member.shuffle` の order と同じ扱い（乱数の契約違反を、集約へ入れる前に断る）。
 */
function invalidRandomOrder(order: readonly number[] | undefined, len: number): DomainError | null {
  if (order === undefined || isPermutation(order, len)) return null;
  return { type: "InvalidIndex", index: firstNonPermutationValue(order, len), max: len - 1 };
}

function decideMembersShuffle(
  order: number[],
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const len = agg.session.rotation.length;

  // 判定は evolve と共有の isPermutation（#376）。エラーには、どの値が順列を崩したかを載せる。
  if (!isPermutation(order, len)) {
    return err({ type: "InvalidIndex", index: firstNonPermutationValue(order, len), max: len - 1 });
  }

  return ok([{ type: "MembersShuffled", order, now }]);
}

// ─── 設定変更 ────────────────────────────────────────────────────────────────

/**
 * 設定変更を検証する。
 *
 * ⚠ **かつてここには `partial.members` の人数・重複・空名を見る分岐があった。**
 * #95 S4a で `TimerConfig` から `members` が消え、型の上でも到達できなくなったので
 * 落とした。落とす前に、wire からも到達しないことを確かめてある ——
 * `BelowMinMembers` はこの経路からは返らない（破壊検証で実測。設計正本 §6.5 の
 * 「性質が概念ごと消えた」ケース）。
 *
 * **到達不能の根拠は #294 で移った。** それまでは境界
 * （`apps/tasuki-sync/src/application/build-domain-command.ts`）が `config.set` の
 * `members` を捨てていた。いまは `SessionConfigSchema`（`schemas.ts`）に項目が無く、
 * **パーサの出力に未知のキーが残らない**ことが根拠である
 * （取り除きのコードはもう無い。探しても見つからない）。
 */
function decideConfigSet(
  partial: Partial<TimerConfig>,
  agg: Aggregate,
  now: number,
  randomOrder?: readonly number[],
): Result<DomainEvent[], DomainError> {
  // 交代先の決め方（#660）。変わるときだけ、イベントに袋（輪の順へ戻すなら null）を載せる。
  // 既にランダム交代なら、もう一度選ばれても袋を作り直さない（周の途中の「運転した人」を消さない）。
  const { session } = agg;
  let randomRotation: RandomRotation | null | undefined;
  if (partial.rotationMode === "random" && session.randomRotation === null) {
    const invalid = invalidRandomOrder(randomOrder, session.rotation.length);
    if (invalid !== null) return err(invalid);
    randomRotation = freshRandomRotation(session, randomOrder);
  } else if (partial.rotationMode === "order" && session.randomRotation !== null) {
    randomRotation = null;
  }

  // 交代間隔の検証
  if (partial.intervalMinutes !== undefined) {
    if (
      !(VALID_INTERVAL_MINUTES as readonly number[]).includes(
        partial.intervalMinutes,
      )
    ) {
      return err({
        type: "InvalidInterval",
        value: partial.intervalMinutes,
        allowed: [...VALID_INTERVAL_MINUTES],
      });
    }
  }

  // 検証済みの部分設定のみをイベントに載せる（未指定フィールドは適用側で現状維持）。
  const validatedPartial: Partial<TimerConfig> = {
    ...(partial.intervalMinutes !== undefined && { intervalMinutes: partial.intervalMinutes }),
    ...(partial.navigatorEnabled !== undefined && { navigatorEnabled: partial.navigatorEnabled }),
    ...(partial.break !== undefined && { break: partial.break }),
    ...(partial.assertiveSwitch !== undefined && { assertiveSwitch: partial.assertiveSwitch }),
    ...(partial.rotationMode !== undefined && { rotationMode: partial.rotationMode }),
  };

  return ok([{ type: "ConfigSet", config: validatedPartial, ...(randomRotation !== undefined && { randomRotation }), now }]);
}
