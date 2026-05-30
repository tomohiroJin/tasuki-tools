/**
 * 代表生成・タイムアウト・再委譲
 * T055: FR-025, FR-026, FR-027
 *
 * 共有ルームでは AI 鍵を持つ代表クライアントがお題を生成・投入する。
 * サーバーは鍵を持たず（秘密ゼロ）、代表へ need-problem を送って投入を待つ。
 * deadline 内に投入が無ければ次候補へ再委譲し、全候補失敗なら定型で確定する。
 */

import { validateProblem, pickFallback, type Problem, type Room } from "@tdd-mob/core";
import type { RoomStore } from "../ports/room-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";

/** 代表の投入を待つ既定の猶予（ms） */
export const PROBLEM_DEADLINE_MS = 20 * 1000;

/** 候補列の末尾に置く「定型で確定」を表すセンチネル */
const FALLBACK = "__fallback__";

export interface ProblemDelegatorDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  /** 代表の deadline（テストで上書き可能） */
  deadlineMs?: number;
}

interface DelegationState {
  requestId: string;
  /** participantId の候補列。末尾に FALLBACK センチネル */
  candidates: string[];
  /** 現在オファー中の候補インデックス */
  index: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class ProblemDelegator {
  private readonly store: RoomStore;
  private readonly broadcaster: Broadcaster;
  private readonly deadlineMs: number;
  /** roomCode → 進行中の委譲状態 */
  private readonly active = new Map<string, DelegationState>();

  constructor(deps: ProblemDelegatorDeps) {
    this.store = deps.store;
    this.broadcaster = deps.broadcaster;
    this.deadlineMs = deps.deadlineMs ?? PROBLEM_DEADLINE_MS;
  }

  /**
   * お題生成を依頼する。既存の依頼があればキャンセルしてから始める（リロール FR-027）。
   */
  request(roomCode: string, requestId: string): void {
    this.cancel(roomCode);

    const room = this.store.get(roomCode);
    if (!room) return;

    const candidates = buildCandidates(room);
    this.active.set(roomCode, { requestId, candidates, index: 0, timer: null });
    this.offerToCurrent(roomCode);
  }

  /**
   * 代表からのお題投入を処理する。
   * @returns 受理したら true、stale/権限外で拒否したら false
   */
  submit(
    roomCode: string,
    requestId: string,
    submitterId: string,
    problem: Problem,
    usedFallback: boolean,
  ): boolean {
    const state = this.active.get(roomCode);
    // 進行中でない、または requestId が一致しない（リロール後の旧依頼）は拒否
    if (!state || state.requestId !== requestId) return false;

    // 現在オファー中の候補からの投入のみ受理する
    const currentCandidate = state.candidates[state.index];
    if (currentCandidate !== submitterId) return false;

    const room = this.store.get(roomCode);
    if (!room) return false;

    // AI 由来テキストは信頼しないデータとして検証し、失敗時は定型へ縮退（FR-023, FR-024）
    const validated = validateProblem(problem);
    const finalProblem: Problem = validated.isOk()
      ? validated.value
      : pickFallback(room.config.language, room.config.difficulty).problem;

    void usedFallback; // 出所バッジはクライアント側で表示するためここでは保持しない

    this.finalize(roomCode, finalProblem);
    return true;
  }

  /** ルームの進行中委譲をキャンセルする */
  cancel(roomCode: string): void {
    const state = this.active.get(roomCode);
    if (state?.timer) clearTimeout(state.timer);
    this.active.delete(roomCode);
  }

  /** 全ルームの委譲をキャンセルする（シャットダウン用） */
  cancelAll(): void {
    for (const code of [...this.active.keys()]) {
      this.cancel(code);
    }
  }

  // ─── 内部処理 ──────────────────────────────────────────────────────────────

  /** 現在の候補へ need-problem を送り deadline を設定する */
  private offerToCurrent(roomCode: string): void {
    const state = this.active.get(roomCode);
    if (!state) return;

    const room = this.store.get(roomCode);
    if (!room) {
      this.cancel(roomCode);
      return;
    }

    const candidateId = state.candidates[state.index];

    // 候補を使い切った、または FALLBACK センチネルに到達したら定型で確定
    if (candidateId === undefined || candidateId === FALLBACK) {
      const fb = pickFallback(room.config.language, room.config.difficulty);
      this.finalize(roomCode, fb.problem);
      return;
    }

    const candidate = room.participants.find(
      (p) => p.participantId === candidateId,
    );

    // 候補が離脱・オフラインなら即座に次候補へ（FR-026）
    if (!candidate || candidate.connId === null || candidate.presence === "offline") {
      state.index++;
      this.offerToCurrent(roomCode);
      return;
    }

    this.broadcaster.sendTo(candidate.connId, {
      type: "signal",
      signal: "need-problem",
      requestId: state.requestId,
      deadlineMs: this.deadlineMs,
    });

    // requestId を閉じ込めて、リロード後の stale なタイマー発火で
    // 新しい依頼の候補列を誤って進めないようにする（防御的）。
    const requestId = state.requestId;
    state.timer = setTimeout(
      () => this.onDeadline(roomCode, requestId),
      this.deadlineMs,
    );
  }

  /** deadline 超過時に次候補へ再委譲する */
  private onDeadline(roomCode: string, requestId: string): void {
    const state = this.active.get(roomCode);
    // 進行中でない、またはリロードで requestId が変わっていれば何もしない
    if (!state || state.requestId !== requestId) return;
    state.timer = null;
    state.index++;
    this.offerToCurrent(roomCode);
  }

  /** お題を Room に確定し、全参加者へ snapshot 配信して委譲を終了する */
  private finalize(roomCode: string, problem: Problem): void {
    const room = this.store.get(roomCode);
    if (room) {
      const updated: Room = { ...room, problem };
      this.store.put(updated);
      this.broadcaster.broadcastSnapshot(roomCode, updated);
    }
    this.cancel(roomCode);
  }
}

/**
 * 候補列を構築する（FR-026）。
 * host を優先し、続いて editor+ かつ hasAiKey の online を joinedAt 昇順。
 * 末尾に必ず定型確定のセンチネルを置く。
 */
function buildCandidates(room: Room): string[] {
  const eligible = room.participants.filter(
    (p) =>
      p.presence === "online" &&
      p.connId !== null &&
      p.hasAiKey &&
      (p.role === "host" || p.role === "editor"),
  );

  const host = eligible.find((p) => p.participantId === room.hostParticipantId);
  const others = eligible
    .filter((p) => p.participantId !== room.hostParticipantId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const ordered = [...(host ? [host] : []), ...others].map(
    (p) => p.participantId,
  );

  return [...ordered, FALLBACK];
}
