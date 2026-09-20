/**
 * 代表生成・タイムアウト・再委譲
 * T055: FR-025, FR-026, FR-027
 *
 * 共有ルームでは AI 鍵を持つ代表クライアントがお題を生成・投入する。
 * サーバーは鍵を持たず（秘密ゼロ）、代表へ need-problem を送って投入を待つ。
 * deadline 内に投入が無ければ次候補へ再委譲し、全候補失敗なら定型で確定する。
 */

import {
  validateProblem,
  pickFallback,
  type Problem,
  type ProblemGeneration,
  type TimerState,
} from "@tasuki/timer-core";
import type {
  Participant as MembershipParticipant,
  Room as MembershipRoom,
} from "@tasuki/room-core";
import { TOOL_TIMER } from "./tool-id.js";
import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import { buildTimerSnapshotRoom } from "./timer-snapshot-dto.js";
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
  /** 名簿（候補の在席と AI 鍵の突き合わせに使う）。 */
  store: RoomStore;
  /** timer の状態（設定・お題・解錠状態・AI 鍵の持ち主）。 */
  timers: TimerStore;
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
  private readonly timers: TimerStore;
  /** 定型お題の選択に使う時刻源（#166 / #72 E3 で初めて実際に使われるようになった） */
  private readonly clock: Clock;
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
    this.timers = deps.timers;
    this.clock = deps.clock;
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

    const room = this.timers.get(roomCode);
    if (!room) return;

    // 新しい依頼が始まった。帳簿を「生成中・縮退なし」から引き直し、**必ず 1 本配信する**
    // （#283・レビュー指摘 3）。
    //
    // ⚠ **「同じ tick で確定するなら送らない」にしてはならない。** 本番のロビーは
    // まさにその形（`problemMode` 未設定・AI 無し・全員 `hasAiKey: false` なので候補が
    // 定型センチネルだけになり、依頼と確定が同じ tick で終わる）を通る。そこを省くと、
    // **65 秒の安全弁も押下側の局所スピナーも落とした**あとの画面は押しても一瞬も
    // 反応せず、`pickFallback` が同じ候補を引いた回は結果も変わらないので
    // 「何も起きていない」と区別が付かない。実測で 8 回連打して `aria-busy` が
    // 一度も立たなかった。**押下のフィードバックはこの 1 本目が担う。**
    this.writeGeneration(roomCode, { active: true, degraded: false });
    this.broadcastGeneration(roomCode);

    // problemMode=fallback の場合は AI 候補へ委譲せず即座に定型で確定する（FR-037/043）
    if (room.problemMode === "fallback") {
      this.finalize(roomCode, this.fallbackProblem(room));
      return;
    }

    // 合言葉解錠済み＋サーバ provider 構成済みならサーバ生成を最優先で試す。
    // 取得できない（同時実行/クールダウン/日次上限）ときはエラーにせず従来経路＝定型へ。
    if (room.aiUnlocked && this.serverProvider && this.aiLimiter) {
      const acquired = this.aiLimiter.tryAcquire(roomCode);
      if (acquired.ok) {
        this.startServerGeneration(roomCode, requestId, room, acquired.release);
        this.settleIfAbandoned(roomCode);
        return;
      }
      this.logger.warn("ai.skip", {
        room: this.refEncoder.room(roomCode),
        req: this.refEncoder.request(requestId),
        reason: AI_SKIP_REASONS[acquired.reason],
      });
      // **AI で作るつもりだったのに枠が取れなかった。** この先は実質・定型なので
      // 縮退の印を立てる（#283 の穴 3）。走っている生成を設定変更が中断した直後が
      // ちょうどこの形で、利用者には何も伝わらないまま定型へ落ちていた。
      this.writeGeneration(roomCode, { active: true, degraded: true });
    }

    this.startClientDelegation(roomCode, requestId, room);
    this.settleIfAbandoned(roomCode);
  }

  // ─── 生成の帳簿（#283）─────────────────────────────────────────────────────
  //
  // 「生成中」をサーバーが持つ。**書き手はこのクラスだけである** ——
  // 他の場所が書くと、委譲の実態（`active` / `activeServer`）と帳簿が食い違い、
  // 誰も降ろさない生成中が生まれる。

  /**
   * 定型バンクから 1 つ選ぶ。**出所（`source: "fallback"`）はここで必ず付ける**（#283）。
   *
   * `pickFallback` は出所をお題の外（`ProblemWithSource.source`）で返すので、素の
   * `fb.problem` をそのまま確定すると**出所不明のお題**になる（`Problem.source` の
   * 省略はそういう意味である）。付けていたのは `request()` の定型モードの経路だけで、
   * **本番が実際に通る経路**（候補を使い切って定型へ落ちる。実クライアントは常に
   * `hasAiKey: false` を送るので候補は定型センチネルだけになる）は付けていなかった。
   * 画面の出所バッジは「印が無ければ定型」と書いてあるため、この食い違いは
   * 見た目には出ず、**同じ結末なのに wire の値だけが 2 通り**という形で残っていた。
   */
  private fallbackProblem(room: TimerState): Problem {
    const fb = pickFallback(room.config.language, room.config.difficulty, this.clock.now());
    return { ...fb.problem, source: fb.source };
  }

  /** 帳簿を書く（配信はしない）。ルームが消えていれば何もしない。 */
  private writeGeneration(roomCode: string, generation: ProblemGeneration): void {
    const room = this.timers.get(roomCode);
    if (!room) return;
    this.timers.put({ ...room, problemGeneration: generation });
  }

  /** いまの帳簿を在室者全員へ配信する（EARS 1）。 */
  private broadcastGeneration(roomCode: string): void {
    const room = this.timers.get(roomCode);
    const membership = this.store.get(roomCode);
    if (!room || !membership) return;
    this.broadcaster.broadcastSnapshot(roomCode, buildTimerSnapshotRoom(membership, room));
  }

  /**
   * **見捨てられた生成中**を降ろす（#283・レビュー指摘 4）。
   *
   * 帳簿が「生成中」なのに委譲がもう走っていない、という組み合わせは
   * **誰も降ろせない**状態である。`finalize` を通らずに委譲が畳まれる道が
   * `offerToCurrent` の行き止まり（ルームか名簿が揃っていない）にあり、
   * そこへは `onDeadline` の `setTimeout` からも入ってくる —— つまり
   * **帳簿を整えてくれる呼び出し側が居ない経路が実在する**。
   *
   * **65 秒の安全弁を落とした以上、画面側に逃げ道は無い。** 残ると以後どの snapshot を
   * 受け取ってもお題パネルは減光・操作不能のままになる。委譲が畳まれうる場所からは
   * 必ずここを通ること。
   *
   * 待ちが残っている場合は何もしない（配信は `request` の冒頭で済んでいる。
   * 同じ値をもう 1 本送っても受け手が再描画するだけである）。
   */
  private settleIfAbandoned(roomCode: string): void {
    if (this.isRequesting(roomCode)) return;
    const generation = this.timers.get(roomCode)?.problemGeneration;
    if (generation?.active !== true) return;
    this.writeGeneration(roomCode, { active: false, degraded: generation.degraded });
    this.broadcastGeneration(roomCode);
  }

  /** 従来のクライアント代表委譲（候補が空なら即・定型確定） */
  private startClientDelegation(roomCode: string, requestId: string, room: TimerState): void {
    const membership = this.store.get(roomCode);
    const candidates = membership ? buildCandidates(membership, room) : [FALLBACK];
    this.active.set(roomCode, { requestId, candidates, index: 0, timer: null });
    this.offerToCurrent(roomCode);
  }

  /** サーバサイド AI 生成。成功で source:"ai" 確定、失敗は従来経路へ縮退する。 */
  private startServerGeneration(
    roomCode: string,
    requestId: string,
    room: TimerState,
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
    const room = this.timers.get(roomCode);
    if (!room) return;
    // **AI 生成が失敗した。** この先は実質・定型なので縮退の印を立てる（#283 の穴 3）。
    this.writeGeneration(roomCode, { active: true, degraded: true });
    this.startClientDelegation(roomCode, requestId, room);
    this.settleIfAbandoned(roomCode);
  }

  /**
   * 代表からのお題投入を処理する。
   * @returns 受理したら true、stale／代表ではないなどで拒否したら false
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

    const room = this.timers.get(roomCode);
    if (!room) return false;

    // AI 由来テキストは信頼しないデータとして検証し、失敗時は定型へ縮退（FR-023, FR-024）
    const validated = validateProblem(problem);
    const finalProblem: Problem = validated.isOk() ? validated.value : this.fallbackProblem(room);

    void usedFallback; // 出所バッジはクライアント側で表示するためここでは保持しない

    this.finalize(roomCode, finalProblem);
    return true;
  }

  /**
   * そのルームで委譲が走っているか（#271）。
   *
   * 「お題が無いなら用意する」側（`lobby-problem.ts`）が、**参加のたびに
   * 張り直さない**ために見る。`problem` が null であることは「誰も依頼していない」を
   * 意味しない —— 依頼済みで返りを待っている間も null である。
   */
  isRequesting(roomCode: string): boolean {
    return this.active.has(roomCode) || this.activeServer.has(roomCode);
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

    const room = this.timers.get(roomCode);
    const membership = this.store.get(roomCode);
    if (!room || !membership) {
      // **行き止まり。** `finalize` を通らずに委譲が終わるので、帳簿は自分で整える
      // （#283・レビュー指摘 4）。**ここへは `onDeadline` の setTimeout からも入る** ——
      // その場合、降ろしてくれる呼び出し側は居ない。
      this.cancel(roomCode);
      this.settleIfAbandoned(roomCode);
      return;
    }

    const candidateId = state.candidates[state.index];

    // 候補を使い切った、または FALLBACK センチネルに到達したら定型で確定
    if (candidateId === undefined || candidateId === FALLBACK) {
      this.finalize(roomCode, this.fallbackProblem(room));
      return;
    }

    // 候補は名簿の参加者（代理は AI 鍵を持たないので候補列に載らない）。
    const candidate = membership.participants.find((p) => p.id === candidateId);

    // **依頼先は「timer を見ている接続」の 1 本である**（#95 S4b）。
    // 候補が離脱・タイマーの前に居ないなら即座に次候補へ（FR-026）。
    //
    // **全接続へは送らない。** 同じ人が選択画面とタイマーを別タブで開いていると、
    // 両方が生成を始めて 1 つの依頼に 2 つの回答が返る（後から来たほうは
    // `STALE_SUBMISSION` で弾かれるが、AI の呼び出しは 2 回起きる）。
    // 宣言順の先頭を採るのは、どれを選んでも同じだからである（同一人物の同一鍵）。
    const target = candidate === undefined ? undefined : timerConnectionOf(candidate);
    if (target === undefined) {
      state.index++;
      this.offerToCurrent(roomCode);
      return;
    }

    this.broadcaster.sendTo(target, {
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
    const room = this.timers.get(roomCode);
    const membership = this.store.get(roomCode);
    if (room && membership) {
      const updated: TimerState = {
        ...room,
        problem,
        // **確定したので生成中は降りる。内容が前と同じでも降りる**（#283 の穴 1）。
        // 内容差分で降ろしていた頃は、`pickFallback` が同じ候補に当たると
        // title も source も変わらず、押した人だけが安全弁の 65 秒まで固まっていた。
        //
        // 縮退の印は**定型で確定したときだけ**持ち越す（レビュー指摘 1）。
        // 依頼の途中で立った印をそのまま持ち越すと、AI の枠が取れずに印を立てたあと
        // **代表が AI で作ったお題を投入してきた**場合に、`source: "ai"` のバッジの隣へ
        // 「定型のお題に切り替えました」が並ぶ。印が語れるのは、いま確定した
        // **そのお題が定型であるとき**だけである。
        problemGeneration: {
          active: false,
          degraded: problem.source === "fallback" && room.problemGeneration?.degraded === true,
        },
      };
      this.timers.put(updated);
      this.broadcaster.broadcastSnapshot(roomCode, buildTimerSnapshotRoom(membership, updated));
    }
    this.cancel(roomCode);
  }
}

/**
 * 候補列を構築する（FR-026）。
 * `hasAiKey` の online を joinedAt 昇順に並べ、末尾に必ず定型確定のセンチネルを置く。
 *
 * #95 S3 で役割とホストを廃止したため、かつての「ホストを優先し、続いて editor+」という
 * 2 段の並びは無くなった。全員同格なので参加順だけで決まる。
 */
function buildCandidates(membership: MembershipRoom, timer: TimerState): string[] {
  // AI 鍵の持ち主は timer の状態が持つ（#95 S4a）。名簿はツールを知らない。
  const holders = new Set(timer.aiKeyHolders);
  const ordered = membership.participants
    .filter((p) => timerConnectionOf(p) !== undefined && holders.has(p.id))
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.id);

  return [...ordered, FALLBACK];
}

/**
 * その人が timer を見ている接続の 1 本（宣言順の先頭）。居なければ `undefined`。
 *
 * S4a までは `connId !== null && presence !== "offline"` がこの判定だった。
 * 多接続模型では**どのツールを見ているか**まで見る必要がある（#95 S4b・D21）——
 * 選択画面のタブだけを開いている人に「お題を作って」と頼んでも、その画面に
 * お題生成の UI は無い。
 */
function timerConnectionOf(participant: MembershipParticipant): string | undefined {
  for (const [connId, tool] of participant.connections) {
    if (tool === TOOL_TIMER) return connId;
  }
  return undefined;
}
