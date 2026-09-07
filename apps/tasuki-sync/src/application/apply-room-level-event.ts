/**
 * ルームレベルのイベント適用（FR-103）。
 *
 * `handlers.ts` が抱えていた `applyEvents`/`applyRoomLevelEvent`（集約反映後に
 * Room レベルのイベントを適用する処理）を、ロジックを変えずに1モジュールへ
 * 切り出したもの（フェーズ4・純粋な移動）。
 *
 * ★**適用順の依存関係（呼び出し側が守るべき契約）**:
 * `applyEvents` は「1. evolve/advanceDriver が返した集約を Room に反映する →
 * 2. その結果を基底にして Room レベルのイベントを適用する」の順序を型
 * （`RoomWithAggregate`）で強制する。この順序を逆にすると、`applyRoomLevelEvent`
 * が更新しうる `session.rotation`（`ProxyMemberAdded`/`ParticipantRenamed` 等）が
 * 集約の反映で丸ごと上書きされ捨てられる。詳細は各関数の docstring を参照。
 */

import {
  buildCompletionRecord,
  type Room,
  type Participant,
  type DomainEvent,
} from "@tasuki/timer-core";

/**
 * **集約（session + clock）を反映済みであることを表す型**（FR-103）。
 *
 * 実体はただの `Room` であり、この目印は**型の上にしか存在しない**（実行時のコストは無い）。
 * `applyRoomLevelEvent` はこの型しか受け付けず、この型を作れるのは `applyEvents` だけである。
 * したがって「Room レベルイベントを先に適用してしまう」順序違反はコンパイルが通らない。
 */
declare const aggregateApplied: unique symbol;
type RoomWithAggregate = Room & { readonly [aggregateApplied]: true };

/**
 * **状態遷移の適用順序の契約**（FR-103）。
 *
 * 1. `evolve` / `advanceDriver` が返した集約を Room に反映する
 * 2. その結果を基底にして Room レベルのイベントを順に適用する
 *
 * **この順序を逆にしてはならない。** `applyRoomLevelEvent` は `session.rotation` 等を
 * さらに更新しうるため（`ProxyMemberAdded` の rotation 追加・`ParticipantRenamed` の改名）、
 * 集約の反映を後に回すと、そこで加えた session の変更が丸ごと捨てられる。
 *
 * かつてこの順序はコメントによる注意喚起でしか表現されておらず、呼び出し側が自分で
 * `{ ...room, session, clock }` を組み立ててからループを回していた。順序を守る責務を
 * この関数 1 つに閉じ込め、`applyRoomLevelEvent` を型で守ることで、順序違反を起こせなくする。
 *
 * **統合（`applyRoomLevelEvent` と `evolve` を 1 つにすること）は行わない**（Issue #26 の担当）。
 * ここで行うのは境界を型と契約として表現することまでである。
 */
export function applyEvents(
  room: Room,
  agg: { session: Room["session"]; clock: Room["clock"] },
  events: readonly DomainEvent[],
  now: number,
): Room {
  const base = { ...room, session: agg.session, clock: agg.clock } as RoomWithAggregate;
  return events.reduce<RoomWithAggregate>(
    (acc, event) => applyRoomLevelEvent(acc, event, now),
    base,
  );
}

function applyRoomLevelEvent(
  room: RoomWithAggregate,
  event: DomainEvent,
  _now: number,
): RoomWithAggregate {
  switch (event.type) {
    case "PhaseSet": {
      // startedAt は「一度でも開始したか」を表す単調フラグ（host-spof-relaxation D2）。
      // phase は phase.set で任意方向へ遷移でき "setup" 等へ後戻りもできるため、
      // 現在の phase で権限を判定すると主催者不在時に誰かが "setup" へ戻した瞬間
      // ルームが再びホスト限定に締まり、Issue #22 の詰みが再発する。そのため
      // 「session への遷移を初めて観測した」時点で一度だけ記録し、以後は
      // どんな phase 遷移でも消さない（上書きしない）。
      const startedAt =
        event.phase === "session" && room.startedAt == null ? _now : room.startedAt;
      return { ...room, phase: event.phase, startedAt };
    }
    case "SessionReset":
      // リセット＝最初から再スタート（v2.3 #3）。集約(session/clock)は evolve が
      // 先頭・満タン・走行に初期化済み。お題・メンバー・設定・引き継ぎは維持し、
      // phase は session のまま（その場で走り直す）。休憩フラグのみ解除する。
      return {
        ...room,
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
      const next: RoomWithAggregate = { ...room, phase: "celebration" };
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
          rotation: [...room.session.rotation, event.participantId],
          driverCounts: [...room.session.driverCounts, 0],
        },
      };
    }
    case "ParticipantRenamed":
      // rotation は参加者IDの配列（D6b）で改名しても値が変わらないため、触る必要が無い。
      // 旧名で位置を引いて置換していた処理はここで消えた（同名の取り違えの温床だった）。
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, displayName: event.displayName }
            : p,
        ),
      };
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
