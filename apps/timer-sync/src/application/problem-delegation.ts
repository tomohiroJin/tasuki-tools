/**
 * 代表生成・タイムアウト・再委譲
 * T055: FR-025, FR-026, FR-027
 *
 * 共有ルームでは AI 鍵を持つ代表クライアントがお題を生成・投入する。
 * サーバーは鍵を持たず（秘密ゼロ）、代表へ need-problem を送って投入を待つ。
 * deadline 内に投入が無ければ次候補へ再委譲し、全候補失敗なら定型で確定する。
 */

import { validateProblem, pickFallback, type Problem, type Room } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";
import { ProviderFailure, type ServerProblemProvider } from "../ports/server-problem-provider.js";
import type { AiLimiter } from "./ai-limits.js";
import type { Logger } from "./log/logger.js";
import type { RefEncoder } from "./log/ref-encoder.js";
import type { LogSafe } from "./log/log-safe.js";
import { AI_SKIP_REASONS, AI_FAILURE_REASONS } from "./log/vocabulary.js";

/**
 * 失敗理由を既知の語彙へ畳む。例外メッセージをそのままログへ出さない（ADR 0012 D5・D12）。
 *
 * **2026-08-13 のレビューで文字列部分一致から作り直した。** 旧実装は
 * `String(e)`（例外メッセージ）を正規表現で推測していたが、実際の失敗理由を
 * 6 パターン洗い出したところ半数が意図せず "other" に落ちていた（メッセージの
 * 文言と正規表現がずれていたため）。分類は当てずっぽうで推測するのではなく、
 * 分類を知っている側（adapter・`ClaudeCliProblemProvider`）に `ProviderFailure`
 * として確定させてもらい、ここでは型で受け取るだけにする。
 * `ProviderFailure` を投げない provider（テストのフェイク等）は "other" 扱いになる。
 */
function classifyFailure(e: unknown): LogSafe {
  if (e instanceof ProviderFailure) return AI_FAILURE_REASONS[e.reason];
  return AI_FAILURE_REASONS.other;
}

/** 代表の投入を待つ既定の猶予（ms） */
export const PROBLEM_DEADLINE_MS = 20 * 1000;

/** 候補列の末尾に置く「定型で確定」を表すセンチネル */
const FALLBACK = "__fallback__";

export interface ProblemDelegatorDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  /** 代表の deadline（テストで上書き可能） */
  deadlineMs?: number | undefined;
  /** サーバサイド AI 生成（省略時はクライアント委譲のみ＝従来挙動） */
  serverProvider?: ServerProblemProvider | undefined;
  /** AI 生成の濫用抑制。serverProvider とセットで渡す */
  aiLimiter?: AiLimiter | undefined;
  /** AI 生成のタイムアウト ms（既定 60 秒） */
  aiTimeoutMs?: number | undefined;
  /** 運用ログの出口（ADR 0012 D1） */
  logger: Logger;
  /** ルームコード・リクエスト ID を相関 ID へ変換する（ADR 0012 D2） */
  refEncoder: RefEncoder;
}

interface DelegationState {
  requestId: string;
  /** participantId の候補列。末尾に FALLBACK センチネル */
  candidates: string[];
  /** 現在オファー中の候補インデックス */
  index: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 進行中のサーバ生成の状態 */
interface ServerGenerationState {
  requestId: string;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  release: () => void;
}

export class ProblemDelegator {
  private readonly store: RoomStore;
  private readonly broadcaster: Broadcaster;
  private readonly deadlineMs: number;
  private readonly serverProvider: ServerProblemProvider | undefined;
  private readonly aiLimiter: AiLimiter | undefined;
  private readonly aiTimeoutMs: number;
  private readonly logger: Logger;
  private readonly refEncoder: RefEncoder;
  /** roomCode → 進行中の委譲状態 */
  private readonly active = new Map<string, DelegationState>();
  /** roomCode → 進行中のサーバ生成（リロール/cancel で abort する）。
   * active（クライアント委譲）と activeServer（サーバ生成）は同一ルームで同時に存在しない（request 冒頭の cancel が両方を消すため）。 */
  private readonly activeServer = new Map<string, ServerGenerationState>();

  constructor(deps: ProblemDelegatorDeps) {
    this.store = deps.store;
    this.broadcaster = deps.broadcaster;
    this.deadlineMs = deps.deadlineMs ?? PROBLEM_DEADLINE_MS;
    this.serverProvider = deps.serverProvider;
    this.aiLimiter = deps.aiLimiter;
    this.aiTimeoutMs = deps.aiTimeoutMs ?? 60_000;
    this.logger = deps.logger;
    this.refEncoder = deps.refEncoder;
  }

  /**
   * お題生成を依頼する。既存の依頼があればキャンセルしてから始める（リロール FR-027）。
   */
  request(roomCode: string, requestId: string): void {
    this.cancel(roomCode);

    const room = this.store.get(roomCode);
    if (!room) return;

    // problemMode=fallback の場合は AI 候補へ委譲せず即座に定型で確定する（FR-037/043）
    if (room.problemMode === "fallback") {
      const fb = pickFallback(room.config.language, room.config.difficulty);
      this.finalize(roomCode, { ...fb.problem, source: "fallback" });
      return;
    }

    // 合言葉解錠済み＋サーバ provider 構成済みならサーバ生成を最優先で試す。
    // 取得できない（同時実行/クールダウン/日次上限）ときはエラーにせず従来経路＝定型へ。
    if (room.aiUnlocked && this.serverProvider && this.aiLimiter) {
      const acquired = this.aiLimiter.tryAcquire(roomCode);
      if (acquired.ok) {
        this.startServerGeneration(roomCode, requestId, room, acquired.release);
        return;
      }
      this.logger.warn("ai.skip", {
        room: this.refEncoder.room(roomCode),
        req: this.refEncoder.request(requestId),
        reason: AI_SKIP_REASONS[acquired.reason],
      });
    }

    this.startClientDelegation(roomCode, requestId, room);
  }

  /** 従来のクライアント代表委譲（候補が空なら即・定型確定） */
  private startClientDelegation(roomCode: string, requestId: string, room: Room): void {
    const candidates = buildCandidates(room);
    this.active.set(roomCode, { requestId, candidates, index: 0, timer: null });
    this.offerToCurrent(roomCode);
  }

  /** サーバサイド AI 生成。成功で source:"ai" 確定、失敗は従来経路へ縮退する。 */
  private startServerGeneration(
    roomCode: string,
    requestId: string,
    room: Room,
    release: () => void,
  ): void {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.aiTimeoutMs);
    this.activeServer.set(roomCode, { requestId, abort, timer, release });

    // serverProvider の存在は呼び出し側が確認済み（未設定ならこの経路に入らない）。
    this.serverProvider!
      .generate(room.config.language, room.config.difficulty, abort.signal)
      .then((raw) => {
        // リロール済みのリクエストは破棄（stale 防御）
        if (!this.isCurrentServerRequest(roomCode, requestId)) return;
        const validated = validateProblem(raw);
        if (validated.isOk()) {
          this.clearServer(roomCode);
          this.finalize(roomCode, { ...validated.value, source: "ai" });
        } else {
          // ここは推測ではなく確定した事実（スキーマ検証に落ちた）なので、
          // 分類を直接渡す（classifyFailure に推測させない・FR-023）。
          this.failoverFromServer(roomCode, requestId, AI_FAILURE_REASONS.invalid);
        }
      })
      .catch((e: unknown) => {
        this.failoverFromServer(roomCode, requestId, classifyFailure(e));
      });
  }

  /** 進行中サーバ生成が requestId と一致するか（stale 防御） */
  private isCurrentServerRequest(roomCode: string, requestId: string): boolean {
    return this.activeServer.get(roomCode)?.requestId === requestId;
  }

  /** サーバ生成の状態を破棄する（タイマー解除・枠返却） */
  private clearServer(roomCode: string): void {
    const st = this.activeServer.get(roomCode);
    if (!st) return;
    clearTimeout(st.timer);
    st.release();
    this.activeServer.delete(roomCode);
  }

  /**
   * サーバ生成失敗 → 従来のクライアント委譲（実質・定型確定）へ縮退する。
   * `reason` は呼び出し側で分類済みの語彙（`LogSafe`）を渡す。ここでは推測しない。
   */
  private failoverFromServer(roomCode: string, requestId: string, reason: LogSafe): void {
    if (!this.isCurrentServerRequest(roomCode, requestId)) return;
    this.clearServer(roomCode);
    this.logger.warn("ai.fail", {
      room: this.refEncoder.room(roomCode),
      req: this.refEncoder.request(requestId),
      reason,
    });
    const room = this.store.get(roomCode);
    if (!room) return;
    this.startClientDelegation(roomCode, requestId, room);
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
    // 進行中のサーバ生成があれば中断する（子プロセスも provider 側で kill される）
    const server = this.activeServer.get(roomCode);
    if (server) {
      server.abort.abort();
      this.clearServer(roomCode);
    }
  }

  /** 全ルームの委譲をキャンセルする（シャットダウン用） */
  cancelAll(): void {
    for (const code of new Set([...this.active.keys(), ...this.activeServer.keys()])) {
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
