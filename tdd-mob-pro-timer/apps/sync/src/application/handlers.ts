/**
 * アプリケーションハンドラ
 * T034, T036, T040c, T045, T047, T049, T053, T055
 * フロー: validate → authorize → decide → evolve → store → broadcast
 */

import { ok, err, type Result } from "neverthrow";
import {
  decide,
  evolve,
  advanceDriver,
  transferHost,
  initialAggregate,
  secondsLeft,
  buildCompletionRecord,
  type Room,
  type Participant,
  type SessionConfig,
  type Problem,
  type ProblemMode,
  type DomainEvent,
  type IntervalMinutes,
} from "@tdd-mob/core";
import type { Clock } from "../ports/clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import type { ProblemDelegator } from "./problem-delegation.js";

export interface HandlerDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  /** サーバー権威タイマー（省略時は自動交代をスケジュールしない＝テスト用） */
  scheduler?: Scheduler;
  /** お題代表生成（省略時は problem.request/submit を受け付けない） */
  delegator?: ProblemDelegator;
  /** サーバー全体のルーム数上限（省略時は 50）。DoS 緩和用。 */
  maxRooms?: number;
}

export interface CreateResult {
  code: string;
  participantId: string;
  hostToken: string;
  resumeToken: string;
}

export function makeHandlers(deps: HandlerDeps) {
  const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;
  const maxRooms = deps.maxRooms ?? 50;

  // トークンはハンドラインスタンスごとに保持（モジュール共有を避け、テスト間汚染を防ぐ）。
  /** ホストトークンのマップ（roomCode → hostToken） */
  const hostTokens = new Map<string, string>();
  /** ルームパスフレーズ（roomCode → 平文）。snapshot には載せない（R4-2）。 */
  const roomPassphrases = new Map<string, string>();
  /** リジュームトークンのマップ（resumeToken → {participantId, roomCode}） */
  const resumeTokens = new Map<
    string,
    { participantId: string; roomCode: string }
  >();

  // 単一接続あたりの room.join 連続失敗のレート制限（コード列挙の緩和）。
  // 正常利用には干渉しない緩い閾値。本来の防御はエッジ/IP 層（リバースプロキシ等）で行うべき。
  const JOIN_FAIL_WINDOW_MS = 10_000;
  const JOIN_FAIL_MAX = 30;
  /** connId → 直近の join 失敗時刻（epoch ms） */
  const joinFailures = new Map<string, number[]>();
  const recentJoinFailures = (connId: string, now: number): number[] => {
    const arr = (joinFailures.get(connId) ?? []).filter(
      (t) => now - t < JOIN_FAIL_WINDOW_MS,
    );
    if (arr.length === 0) joinFailures.delete(connId);
    else joinFailures.set(connId, arr);
    return arr;
  };

  // ─── サーバー権威タイマーの調停 ───────────────────────────────────────────

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: Room): void {
    if (!scheduler) return;
    // 稼働中かつ休憩でなく、完成フェーズに入っていない場合のみ次回交代を予約する
    if (room.clock.running && !room.onBreak && room.phase !== "celebration") {
      const left = secondsLeft(room.clock, clock.now());
      scheduler.schedule(room.code, left, autoSwitch);
    } else {
      scheduler.clear(room.code);
    }
  }

  /** タイマー発火時にサーバー側で交代を実行し再スケジュールする。
   *  driverEligible=false の参加者を飛ばし、全員 ineligible なら現状維持する（plan.md L194）。 */
  function autoSwitch(roomCode: string): void {
    const room = store.get(roomCode);
    if (!room || !room.clock.running) return;
    const now = clock.now();
    const agg = { session: room.session, clock: room.clock };
    const newAgg = advanceDriver(agg, computeIneligibleIndices(room), now);
    const updated: Room = { ...room, session: newAgg.session, clock: newAgg.clock };
    store.put(updated);
    broadcaster.broadcastSnapshot(updated.code, updated);
    broadcaster.broadcastSignal(updated.code, {
      type: "signal",
      signal: "switch",
      nextDriverName: updated.session.rotation[updated.session.currentIndex] ?? "",
    });
    maybeSuggestBreak(updated);
    reconcileSchedule(updated);
  }

  /** breakEveryRotations 巡ごとに休憩提案シグナルを配信する（§9.1）。
   *  巡 = rotation 一周（rotation 長ぶんの交代）。シグナルは演出専用で状態ではない（§5.2）。 */
  function maybeSuggestBreak(room: Room): void {
    const every = room.config.breakEveryRotations;
    if (!every || every < 1) return;
    const len = room.session.rotation.length;
    if (len === 0) return;
    // 巡の境界（一周完了）でのみ判定する
    if (room.session.totalSwitches % len !== 0) return;
    const rounds = room.session.totalSwitches / len;
    if (rounds === 0 || rounds % every !== 0) return;
    broadcaster.broadcastSignal(room.code, {
      type: "signal",
      signal: "suggest-break",
      rounds,
    });
  }

  /**
   * コマンドを処理するメインエントリポイント
   */
  async function handleCommand(
    connId: string,
    cmd: { command: string; [key: string]: unknown },
  ): Promise<Result<CreateResult, string>> {
    switch (cmd.command) {
      case "room.create":
        return handleRoomCreate(
          connId,
          cmd as { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
        );

      case "room.join":
        return handleRoomJoin(
          connId,
          cmd as {
            command: "room.join";
            code: string;
            displayName: string;
            hasAiKey: boolean;
            resumeToken?: string;
            passphrase?: string;
          },
        );

      case "time.ping":
        return handleTimePing(
          connId,
          cmd as { command: "time.ping"; clientTime: number },
        );

      case "role.set":
        return handleRoleSet(
          connId,
          cmd as { command: "role.set"; participantId: string; role: "editor" | "viewer" },
        );

      case "room.passphrase.set":
        return handleRoomPassphraseSet(
          connId,
          cmd as { command: "room.passphrase.set"; passphrase: string },
        );

      case "host.transfer":
        return handleHostTransfer(
          connId,
          cmd as { command: "host.transfer"; participantId: string },
        );

      case "problem.request":
        return handleProblemRequest(
          connId,
          cmd as { command: "problem.request"; requestId: string },
        );

      case "problem.submit":
        return handleProblemSubmit(
          connId,
          cmd as {
            command: "problem.submit";
            requestId: string;
            problem: Problem;
            usedFallback: boolean;
          },
        );

      default:
        return handleRoomCommand(connId, cmd);
    }
  }

  /** ルーム作成 */
  async function handleRoomCreate(
    connId: string,
    cmd: { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();
    // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
    if (store.list().length >= maxRooms) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "ROOM_LIMIT_EXCEEDED",
        message: "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。",
      });
      return err("ROOM_LIMIT_EXCEEDED");
    }
    // ルーム名があれば「slug-接尾辞」、無ければランダム。衝突時は接尾辞を引き直す。
    let code = codeGen.generate(cmd.roomName);
    for (let i = 0; i < 5 && store.get(code) !== undefined; i++) {
      code = codeGen.generate(cmd.roomName);
    }
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();
    const hostToken = codeGen.generateResumeToken();

    const defaultConfig: SessionConfig = cmd.config ?? {
      language: "TypeScript",
      difficulty: "easy",
      members: [cmd.displayName],
      intervalMinutes: 5 as IntervalMinutes,
    };

    const agg = initialAggregate(defaultConfig);

    const host: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: now,
    };

    const room: Room = {
      code,
      createdAt: now,
      hostParticipantId: participantId,
      config: defaultConfig,
      problem: null,
      session: agg.session,
      clock: agg.clock,
      phase: "setup",
      participants: [host],
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
    };

    store.put(room);
    hostTokens.set(code, hostToken);
    resumeTokens.set(resumeToken, { participantId, roomCode: code });

    broadcaster.sendTo(connId, {
      type: "room.created",
      code,
      hostToken,
      resumeToken,
      participantId,
    });

    broadcaster.broadcastSnapshot(code, room);

    return ok({ code, participantId, hostToken, resumeToken });
  }

  /** ルーム参加 */
  async function handleRoomJoin(
    connId: string,
    cmd: {
      command: "room.join";
      code: string;
      displayName: string;
      hasAiKey: boolean;
      resumeToken?: string;
      passphrase?: string;
    },
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();

    // 連続失敗が閾値を超えた接続は一時的に拒否（コード総当たりの緩和）。
    if (recentJoinFailures(connId, now).length >= JOIN_FAIL_MAX) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "RATE_LIMITED",
        message: "参加の試行が多すぎます。しばらく待ってから再試行してください。",
      });
      return err("RATE_LIMITED");
    }

    const room = store.get(cmd.code);

    if (!room) {
      // 失敗を記録（次回以降のレート判定に使う）。
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      broadcaster.sendTo(connId, {
        type: "error",
        code: "ROOM_NOT_FOUND",
        message: "指定されたルームコードが見つかりません",
      });
      return err("ROOM_NOT_FOUND");
    }

    // リジューム処理
    if (cmd.resumeToken) {
      const tokenData = resumeTokens.get(cmd.resumeToken);
      if (tokenData && tokenData.roomCode === cmd.code) {
        const existingParticipant = room.participants.find(
          (p) => p.participantId === tokenData.participantId,
        );
        if (existingParticipant) {
          const updatedRoom: Room = {
            ...room,
            participants: room.participants.map((p) =>
              p.participantId === tokenData.participantId
                ? { ...p, connId, presence: "online" }
                : p,
            ),
          };
          store.put(updatedRoom);
          broadcaster.sendTo(connId, {
            type: "snapshot",
            room: updatedRoom,
          });
          broadcaster.broadcastSnapshot(cmd.code, updatedRoom);
          return ok({
            code: cmd.code,
            participantId: tokenData.participantId,
            hostToken: hostTokens.get(cmd.code) ?? "",
            resumeToken: cmd.resumeToken,
          });
        }
      }
    }

    // パスフレーズ保護ルームは新規参加時に一致を要求する（R4-2）。
    // resume（再接続）は上の resume ブロックで return 済みのためここには来ない＝再認証不要。
    const requiredPassphrase = roomPassphrases.get(cmd.code);
    if (requiredPassphrase !== undefined && cmd.passphrase !== requiredPassphrase) {
      // 失敗をレート制限に積算（パスフレーズ総当たりの緩和・既存 join 制限と統合）。
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      const code = cmd.passphrase ? "PASSPHRASE_MISMATCH" : "PASSPHRASE_REQUIRED";
      broadcaster.sendTo(connId, {
        type: "error",
        code,
        message:
          code === "PASSPHRASE_REQUIRED"
            ? "このルームはパスフレーズが必要です"
            : "パスフレーズが一致しません",
      });
      return err(code);
    }

    // 新規参加者は editor として登録（UX 再設計の2層モデル: 名乗って参加した人は
    // すぐドライバーに加われる。ローテーション加入は別操作＝「ドライバーに加わる」）。
    // 純粋な見学者は host が role.set で viewer へ降格できる。
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    const newParticipant: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "editor",
      presence: "online",
      hasAiKey: cmd.hasAiKey,
      joinedAt: now,
    };

    const updatedRoom: Room = {
      ...room,
      participants: [...room.participants, newParticipant],
    };

    store.put(updatedRoom);
    resumeTokens.set(resumeToken, { participantId, roomCode: cmd.code });

    broadcaster.sendTo(connId, {
      type: "room.joined",
      resumeToken,
      participantId,
    });

    broadcaster.sendTo(connId, {
      type: "snapshot",
      room: updatedRoom,
    });

    broadcaster.broadcastSnapshot(cmd.code, updatedRoom);

    return ok({ code: cmd.code, participantId, hostToken: "", resumeToken });
  }

  /** time.ping — 状態を変えずにサーバー時刻を返す（FR-007, SC-001） */
  async function handleTimePing(
    connId: string,
    cmd: { command: "time.ping"; clientTime: number },
  ): Promise<Result<CreateResult, string>> {
    broadcaster.sendTo(connId, {
      type: "time.pong",
      serverTime: clock.now(),
    });
    return ok({ code: "", participantId: "", hostToken: "", resumeToken: "" });
  }

  /** ルームコマンド（session.act, config.set 等） */
  async function handleRoomCommand(
    connId: string,
    cmd: { command: string; [key: string]: unknown },
  ): Promise<Result<CreateResult, string>> {
    // connId からルームを特定する
    let targetRoom = findRoomByConnId(connId);

    if (!targetRoom) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const participant = targetRoom.participants.find((p) => p.connId === connId);
    if (!participant) {
      return err("PARTICIPANT_NOT_FOUND");
    }

    // participant.rename / driver.skip / driver.resume は「本人 or host」権限
    // （FR-046/048・plan.md L209-210）。いずれも対象 participantId に依存する関係的
    // 権限で、集合方式の authorize（ロール集合）では「対象が本人か」を表現できない。
    // EDITOR_PLUS に置くと editor が他人を skip/resume でき（fail-open）、かつ viewer が
    // 自分すら skip できない（過剰拒否）ため、ここで個別に fail-closed 判定する。
    const RELATIONAL_SELF_OR_HOST = new Set([
      "participant.rename",
      "driver.skip",
      "driver.resume",
    ]);
    if (RELATIONAL_SELF_OR_HOST.has(cmd.command)) {
      const isSelf = cmd.participantId === participant.participantId;
      const isHost = participant.role === "host";
      if (!isSelf && !isHost) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "UNAUTHORIZED",
          message: "他の参加者への操作はホストのみ実行できます",
        });
        return err("UNAUTHORIZED");
      }
    }

    // member.add/remove の関係的権限（横方向の権限濫用防止）。
    // editor は「自分の rotation 出入り」のみ許可し、他人分の追加/除外は host に限定する。
    // （UI は自名/自 index のみ送るが、コマンド直送で他人を操作されないようサーバで強制。）
    if (
      participant.role !== "host" &&
      (cmd.command === "member.add" || cmd.command === "member.remove")
    ) {
      const ownName = participant.displayName;
      const ownsTarget =
        cmd.command === "member.add"
          ? cmd.name === ownName
          : targetRoom.session.rotation[Number(cmd.index)] === ownName;
      if (!ownsTarget) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "UNAUTHORIZED",
          message: "他の参加者のローテーション操作はホストのみ実行できます",
        });
        return err("UNAUTHORIZED");
      }
    }

    // 権限チェック（FR-017）
    const authError = authorize(participant.role, cmd.command as string, targetRoom.hostParticipantId, participant.participantId);
    if (authError) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: authError,
      });
      return err("UNAUTHORIZED");
    }

    // 参加者の退出（host 限定・⑪）。参加者は Room レベルのため decide ではなくここで扱う。
    // rotation に居れば rotation からも外し（現ドライバーなら evolve が繰り上げ）、
    // 最後の1人は外せない（rotation を空にしない）。
    if (cmd.command === "participant.remove") {
      const now = clock.now();
      const targetId = cmd.participantId;
      if (typeof targetId !== "string" || targetId === participant.participantId) {
        broadcaster.sendTo(connId, { type: "error", code: "INVALID", message: "自分自身や不正な対象は外せません" });
        return err("INVALID");
      }
      const target = targetRoom.participants.find((p) => p.participantId === targetId);
      if (!target) {
        broadcaster.sendTo(connId, { type: "error", code: "PARTICIPANT_NOT_FOUND", message: "対象の参加者が見つかりません" });
        return err("PARTICIPANT_NOT_FOUND");
      }
      const idx = targetRoom.session.rotation.indexOf(target.displayName);
      let next: Room = {
        ...targetRoom,
        participants: targetRoom.participants.filter((p) => p.participantId !== targetId),
      };
      if (idx >= 0) {
        if (targetRoom.session.rotation.length <= 1) {
          broadcaster.sendTo(connId, { type: "error", code: "BelowMinMembers", message: "最後のドライバーは外せません" });
          return err("BelowMinMembers");
        }
        const agg = evolve(
          { session: targetRoom.session, clock: targetRoom.clock },
          { type: "MemberRemoved", index: idx, now },
          now,
        );
        next = { ...next, session: agg.session, clock: agg.clock, config: { ...next.config, members: [...agg.session.rotation] } };
      }
      store.put(next);
      broadcaster.broadcastSnapshot(next.code, next);
      reconcileSchedule(next);
      // 外された本人へ専用通知を送る（残りメンバーの snapshot には含まれず取り残されるため）。
      // クライアントはこれを受けて退出メッセージ＋参加画面へ遷移し、再参加可能にする。
      // 代理(connId=null)はクライアントが無いので送らない。
      if (target.connId) {
        broadcaster.sendTo(target.connId, {
          type: "error",
          code: "REMOVED_BY_HOST",
          message: "ホストにより退出させられました",
        });
      }
      return ok({ code: next.code, participantId: "", hostToken: "", resumeToken: "" });
    }

    // ドメインコマンドを構築して decide/evolve を実行
    const domainCmd = buildDomainCommand(cmd);
    // 改名は対象の現在名を解決して decide へ渡す。decide は「自分の現在名と同一」を
    // 重複検査から除外するために旧名を必要とする（rotation は名前配列のみで participantId を持たない）。
    if (domainCmd && domainCmd.command === "participant.rename") {
      const target = targetRoom.participants.find(
        (p) => p.participantId === domainCmd.participantId,
      );
      // 対象が存在しなければ早期に拒否する。ここで弾かないと旧名 undefined のまま decide に渡り、
      // 自己同一の除外が効かず DuplicateName 等の誤った理由で失敗しうる（実体は対象不在）。
      if (!target) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "PARTICIPANT_NOT_FOUND",
          message: "対象の参加者が見つかりません",
        });
        return err("PARTICIPANT_NOT_FOUND");
      }
      domainCmd.currentDisplayName = target.displayName;
    }
    if (!domainCmd) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNKNOWN_COMMAND",
        message: `不明なコマンド: ${cmd.command}`,
      });
      return err("UNKNOWN_COMMAND");
    }

    const now = clock.now();
    const agg = { session: targetRoom.session, clock: targetRoom.clock };
    const result = decide(domainCmd, agg, now);

    if (result.isErr()) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: result.error.type,
        message: `操作エラー: ${result.error.type}`,
      });
      return err(result.error.type);
    }

    // まず evolve で集約（session+clock）を更新する。
    let newAgg = agg;
    for (const event of result.value) {
      newAgg = evolve(newAgg, event, now);
    }

    // evolve の結果を Room に反映してから、Room レベルイベントを適用する。
    // applyRoomLevelEvent は session.rotation 等をさらに更新しうる
    // （ProxyMemberAdded の rotation 追加・ParticipantRenamed の rotation 改名）ため、
    // evolve 結果を基底に置かないと session 変更が捨てられる。
    targetRoom = { ...targetRoom, session: newAgg.session, clock: newAgg.clock };
    for (const event of result.value) {
      // PhaseSet/ProblemSet/ConfigSet/SessionCompleted 等はルームレベルで処理
      targetRoom = applyRoomLevelEvent(targetRoom, event, now);
    }

    // 現ドライバーが driver.skip で ineligible になり、かつ稼働中なら即座に次の eligible へ
    // 繰り上げる（plan.md L209）。交代先が無ければ advanceDriver が現状維持する。
    if (domainCmd.command === "driver.skip" && targetRoom.clock.running) {
      const ineligible = computeIneligibleIndices(targetRoom);
      if (ineligible.has(targetRoom.session.currentIndex)) {
        const advanced = advanceDriver(
          { session: targetRoom.session, clock: targetRoom.clock },
          ineligible,
          now,
        );
        targetRoom = { ...targetRoom, session: advanced.session, clock: advanced.clock };
      }
    }

    const updatedRoom: Room = {
      ...targetRoom,
      // config.members を session.rotation に同期する。
      // member.add/remove/move・addProxy は rotation のみ更新するため、ミラーしないと
      // 完成記録（config.members を使用）が古いメンバーになる。
      config: { ...targetRoom.config, members: [...targetRoom.session.rotation] },
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);
    // 手動スキップ等で交代が起きた場合も、自動交代と同様に巡境界で休憩を提案する（レビュー #3）。
    if (updatedRoom.session.currentIndex !== agg.session.currentIndex) {
      maybeSuggestBreak(updatedRoom);
    }
    // clock 状態が変わった可能性があるので自動交代を調停する（FR-003）
    reconcileSchedule(updatedRoom);

    return ok({ code: updatedRoom.code, participantId: participant.participantId, hostToken: "", resumeToken: "" });
  }

  /** 役割変更（host 限定）FR-016, FR-017 */
  async function handleRoleSet(
    connId: string,
    cmd: { command: "role.set"; participantId: string; role: "editor" | "viewer" },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "role.set はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // ホスト自身の役割は変更できない（委譲は別経路）
    if (cmd.participantId === room.hostParticipantId) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "CANNOT_CHANGE_HOST",
        message: "ホストの役割は変更できません",
      });
      return err("CANNOT_CHANGE_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_NOT_FOUND",
        message: "対象の参加者が見つかりません",
      });
      return err("PARTICIPANT_NOT_FOUND");
    }

    const updatedRoom: Room = {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === cmd.participantId ? { ...p, role: cmd.role } : p,
      ),
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** ルームパスフレーズを設定/解除する（host 限定・R4-2）。空文字で解除。
   *  平文は roomPassphrases に保持し、Room には passphraseProtected(boolean)のみ反映。 */
  async function handleRoomPassphraseSet(
    connId: string,
    cmd: { command: "room.passphrase.set"; passphrase: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "パスフレーズ設定はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    if (cmd.passphrase === "") {
      roomPassphrases.delete(room.code);
    } else {
      roomPassphrases.set(room.code, cmd.passphrase);
    }
    const updatedRoom: Room = {
      ...room,
      passphraseProtected: cmd.passphrase !== "",
    };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** ホストを明示的に他のオンライン参加者へ移譲する（host 限定・R2-3）。
   *  自動委譲（presence）と同じ transferHost を用い、snapshot で全員に反映する。 */
  async function handleHostTransfer(
    connId: string,
    cmd: { command: "host.transfer"; participantId: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "host.transfer はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // 自分自身へは移譲できない（現ホスト＝対象は無意味）
    if (cmd.participantId === room.hostParticipantId) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "CANNOT_CHANGE_HOST",
        message: "自分自身へは移譲できません",
      });
      return err("CANNOT_CHANGE_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_NOT_FOUND",
        message: "対象の参加者が見つかりません",
      });
      return err("PARTICIPANT_NOT_FOUND");
    }

    // オフラインの相手をホストにすると無人運用になり得るため拒否する
    if (target.presence === "offline") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_OFFLINE",
        message: "オフラインの参加者へは移譲できません",
      });
      return err("PARTICIPANT_OFFLINE");
    }

    const updatedRoom = transferHost(room, cmd.participantId);
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** お題生成依頼（editor+）FR-025, FR-027 */
  async function handleProblemRequest(
    connId: string,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<CreateResult, string>> {
    const guard = requireEditor(connId, "problem.request");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "DELEGATION_UNAVAILABLE",
        message: "お題生成が利用できません",
      });
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(room.code, cmd.requestId);

    return ok({
      code: room.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** お題投入（委譲代表のみ・editor+）FR-025, FR-026 */
  async function handleProblemSubmit(
    connId: string,
    cmd: {
      command: "problem.submit";
      requestId: string;
      problem: Problem;
      usedFallback: boolean;
    },
  ): Promise<Result<CreateResult, string>> {
    const guard = requireEditor(connId, "problem.submit");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "DELEGATION_UNAVAILABLE",
        message: "お題生成が利用できません",
      });
      return err("DELEGATION_UNAVAILABLE");
    }

    const accepted = delegator.submit(
      room.code,
      cmd.requestId,
      actor.participantId,
      cmd.problem,
      cmd.usedFallback,
    );
    if (!accepted) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "STALE_SUBMISSION",
        message: "この投入は受理されませんでした（期限切れ・権限外）",
      });
      return err("STALE_SUBMISSION");
    }

    return ok({
      code: room.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** connId から在室ルームと参加者を解決し、editor 以上であることを確認する */
  function requireEditor(
    connId: string,
    command: string,
  ): Result<{ room: Room; actor: Participant }, string> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) return err("PARTICIPANT_NOT_FOUND");
    if (actor.role === "viewer") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: `${command} は編集者以上が必要です`,
      });
      return err("UNAUTHORIZED");
    }
    return ok({ room, actor });
  }

  /** connId からルームを特定する（参加者として在室しているルーム） */
  function findRoomByConnId(connId: string): Room | undefined {
    return store
      .list()
      .find((r) => r.participants.some((p) => p.connId === connId));
  }

  /** 接続クローズ時の後始末。レート制限用の失敗履歴を解放しマップのリークを防ぐ。 */
  function handleConnectionClose(connId: string): void {
    joinFailures.delete(connId);
  }

  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンを解放する。 */
  function releaseRoom(roomCode: string): void {
    hostTokens.delete(roomCode);
    roomPassphrases.delete(roomCode);
    for (const [token, info] of resumeTokens) {
      if (info.roomCode === roomCode) resumeTokens.delete(token);
    }
  }

  // ドライバー不在の猶予後繰り上げ（R2-1）。presence の不在タイマーから呼ばれ、
  // 中身は通常の interval 交代(autoSwitch)と同一。
  return { handleCommand, handleConnectionClose, releaseRoom, advanceForAbsence: autoSwitch };
}

// ─── 権限チェック ─────────────────────────────────────────────────────────────

/** ホスト限定操作 */
const HOST_ONLY_COMMANDS = new Set([
  "session.complete",
  "session.abort",
  "session.reset",
  "phase.set",
  "break.start",
  "break.end",
  "role.set",
  "room.passphrase.set",
  "host.transfer",
  "participant.addProxy",
  "participant.remove",
  // 並べ替えはホスト専用（UI も host のみ提供）。editor による他人の順序操作を防ぐ。
  "member.move",
]);

/** 編集者以上が必要な操作 */
const EDITOR_PLUS_COMMANDS = new Set([
  "config.set",
  // member.add/remove は EDITOR_PLUS だが、handleRoomCommand の関係ガードで
  // 「自分の rotation 出入りのみ本人可・他人分は host」に絞る（横方向の権限濫用防止）。
  "member.add",
  "member.remove",
  "session.act",
  "problem.request",
  "problem.submit",
  "problem.edit",
  "problem.mode.set",
  "handoff.note.set",
  // driver.skip / driver.resume は「本人 or host」の関係的権限のため EDITOR_PLUS に
  // は含めない（handleRoomCommand の RELATIONAL_SELF_OR_HOST ガードで判定する）。
]);

function authorize(
  role: "host" | "editor" | "viewer",
  command: string,
  hostParticipantId: string,
  participantId: string,
): string | null {
  if (HOST_ONLY_COMMANDS.has(command)) {
    if (role !== "host") {
      return `${command} はホストのみ実行できます`;
    }
    return null;
  }

  if (EDITOR_PLUS_COMMANDS.has(command)) {
    if (role === "viewer") {
      return `${command} は編集者以上が必要です`;
    }
    return null;
  }

  return null;
}

// ─── コマンド変換 ────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(["START", "SWITCH", "PAUSE", "RESUME"]);
const VALID_PHASES = new Set(["setup", "ready", "session", "celebration"]);

function buildDomainCommand(cmd: { command: string; [key: string]: unknown }) {
  switch (cmd.command) {
    case "session.act": {
      const action = cmd.action;
      if (typeof action !== "string" || !VALID_ACTIONS.has(action)) return null;
      return { command: "session.act" as const, action: action as "START" | "SWITCH" | "PAUSE" | "RESUME" };
    }
    case "session.complete":
      return { command: "session.complete" as const };
    case "session.reset":
      return { command: "session.reset" as const };
    case "config.set":
      if (typeof cmd.config !== "object" || cmd.config === null) return null;
      return { command: "config.set" as const, config: cmd.config as Partial<SessionConfig> };
    case "member.add":
      if (typeof cmd.name !== "string") return null;
      return { command: "member.add" as const, name: cmd.name };
    case "member.remove":
      if (typeof cmd.index !== "number") return null;
      return { command: "member.remove" as const, index: cmd.index };
    case "member.move":
      if (typeof cmd.fromIndex !== "number" || typeof cmd.toIndex !== "number") return null;
      return { command: "member.move" as const, fromIndex: cmd.fromIndex, toIndex: cmd.toIndex };
    case "phase.set": {
      const phase = cmd.phase;
      if (typeof phase !== "string" || !VALID_PHASES.has(phase)) return null;
      return { command: "phase.set" as const, phase: phase as "setup" | "ready" | "session" | "celebration" };
    }
    case "handoff.note.set":
      if (typeof cmd.text !== "string") return null;
      return { command: "handoff.note.set" as const, text: cmd.text };
    case "break.start":
      return { command: "break.start" as const };
    case "break.end":
      return { command: "break.end" as const };
    // ─── v2 新コマンド ─────────────────────────────────────────────────────
    case "session.abort":
      return { command: "session.abort" as const };
    case "participant.addProxy":
      if (typeof cmd.displayName !== "string" || typeof cmd.participantId !== "string") return null;
      return { command: "participant.addProxy" as const, displayName: cmd.displayName, participantId: cmd.participantId };
    case "participant.rename":
      if (typeof cmd.participantId !== "string" || typeof cmd.displayName !== "string") return null;
      // currentDisplayName は呼び出し側（handleRoomCommand）が対象の現在名を解決して埋める
      return { command: "participant.rename" as const, participantId: cmd.participantId, displayName: cmd.displayName, currentDisplayName: undefined as string | undefined };
    case "driver.skip":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.skip" as const, participantId: cmd.participantId };
    case "driver.resume":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.resume" as const, participantId: cmd.participantId };
    case "problem.edit":
      if (typeof cmd.patch !== "object" || cmd.patch === null) return null;
      return { command: "problem.edit" as const, patch: cmd.patch as { title?: string; description?: string; requirements?: string[]; exampleTest?: string; hints?: string[] } };
    case "problem.mode.set":
      if (cmd.mode !== "ai" && cmd.mode !== "fallback") return null;
      return { command: "problem.mode.set" as const, mode: cmd.mode as ProblemMode };
    default:
      return null;
  }
}

// ─── ドライバー対象外の判定 ──────────────────────────────────────────────────

/**
 * driverEligible===false の参加者を rotation インデックスへ対応付けた集合を返す。
 * rotation は表示名配列で participantId を持たないため、表示名で突き合わせる
 * （改名時の一意性ガードにより rotation 内に同名は無く、一意に対応付く）。
 */
function computeIneligibleIndices(room: Room): Set<number> {
  const ineligibleNames = new Set(
    room.participants
      // 切断中(offline)の人も交代対象から外す（R2-1）。
      .filter((p) => p.driverEligible === false || p.presence === "offline")
      .map((p) => p.displayName),
  );
  const set = new Set<number>();
  room.session.rotation.forEach((name, i) => {
    if (ineligibleNames.has(name)) set.add(i);
  });
  return set;
}

// ─── ルームレベルのイベント適用 ──────────────────────────────────────────────

function applyRoomLevelEvent(
  room: Room,
  event: DomainEvent,
  _now: number,
): Room {
  switch (event.type) {
    case "PhaseSet":
      return { ...room, phase: event.phase };
    case "SessionReset":
      // 初期(設定)状態へ戻す（FR-001, US4-AC4）。集約は evolve が初期化済み。
      // お題・引き継ぎ・休憩フラグをクリアし phase を setup へ。記録履歴は保持。
      return {
        ...room,
        phase: "setup",
        problem: null,
        handoffNote: "",
        onBreak: false,
      };
    case "ProblemSet":
      return { ...room, problem: event.problem };
    case "ConfigSet":
      // 検証済み部分設定を Room.config にマージ（言語/難易度/メンバー/間隔を反映）
      return { ...room, config: { ...room.config, ...event.config } };
    case "HandoffNoteSet":
      return { ...room, handoffNote: event.text };
    case "BreakStarted":
      return { ...room, onBreak: true };
    case "BreakEnded":
      return { ...room, onBreak: false };
    case "SessionCompleted": {
      // 既に完成済みなら二重計上しない（complete の冪等性）
      if (room.phase === "celebration") return room;
      // 完成フェーズへ遷移し、揮発な完成記録を Room に追加（FR-028）
      const next: Room = { ...room, phase: "celebration" };
      if (room.problem) {
        const agg = { session: room.session, clock: room.clock };
        const record = buildCompletionRecord(
          agg,
          room.problem,
          room.config,
          event.now,
          room.code,
        );
        next.sessionRecords = [...room.sessionRecords, record];
      }
      return next;
    }
    // ─── v2 イベント ──────────────────────────────────────────────────────
    case "SessionAborted":
      // 中断: 記録を生成せず締めくくりフェーズへ（FR-020）
      return { ...room, phase: "celebration" };
    case "ProxyMemberAdded": {
      // 代理参加者をルームに追加し、rotation・driverCounts にも追加して
      // ドライバーローテーションに含める（FR-047）。
      const proxyParticipant: Participant = {
        participantId: event.participantId,
        connId: null,
        displayName: event.displayName,
        role: "editor",
        presence: "offline",
        hasAiKey: false,
        joinedAt: _now,
        isPlaceholder: true,
        driverEligible: true,
      };
      return {
        ...room,
        participants: [...room.participants, proxyParticipant],
        session: {
          ...room.session,
          rotation: [...room.session.rotation, event.displayName],
          driverCounts: [...room.session.driverCounts, 0],
        },
      };
    }
    case "ParticipantRenamed": {
      // 改名対象の旧名をループ外で一度だけ解決する。rotation は名前配列であり
      // participantId を持たないため、旧名で位置を特定して置換する。
      // 重複名は member.add/addProxy で拒否されるため rotation 内に同名はなく、一意に特定できる。
      const target = room.participants.find((p) => p.participantId === event.participantId);
      const oldName = target?.displayName;
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, displayName: event.displayName }
            : p,
        ),
        session:
          oldName === undefined
            ? room.session
            : {
                ...room.session,
                rotation: room.session.rotation.map((name) =>
                  name === oldName ? event.displayName : name,
                ),
              },
      };
    }
    case "DriverSkipped":
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, driverEligible: false }
            : p,
        ),
      };
    case "DriverResumed":
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, driverEligible: true }
            : p,
        ),
      };
    case "ProblemEdited": {
      if (!room.problem) return room;
      return {
        ...room,
        problem: { ...room.problem, ...event.patch, edited: true },
      };
    }
    case "ProblemModeSet":
      return { ...room, problemMode: event.mode };
    default:
      return room;
  }
}
