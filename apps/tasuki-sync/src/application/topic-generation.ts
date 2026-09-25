/**
 * お題の生成（#91）。サーバー生成と定型だけを持つ（クライアント委譲は廃止・spec T7）。
 *
 * **帳簿（`TopicState` の generating / degraded）の書き手はここと `topic-handlers.ts` だけ**。
 * 画面は推測しない（#283）。
 *
 * ⚠ **クールダウンの判定は中断より先に行う**（spec §5.3・E22）。先に中断すると、
 * 作り直しを拒んだのに進行中の生成だけが消える。`AiLimiter#tryAcquire` は同時実行数を
 * 先に見るので、自分の生成中の作り直しでは `cooldown` を返さない —— そのため
 * 枠を取らない `isCoolingDown` で先に読む。
 */
import {
  pickTopicFallback,
  settleWithAi,
  settleWithFallback,
  startGeneration,
  validateTopicDraft,
  type Difficulty,
  type Language,
  type Topic,
  type TopicState,
} from "@tasuki/topic-core";
import type { Clock } from "../ports/clock.js";
import type { TopicStore } from "../ports/topic-store.js";
import { ProviderFailure, type ServerTopicProvider } from "../ports/server-topic-provider.js";
import type { AiLimiter } from "./ai-limits.js";
import type { Logger } from "./log/logger.js";
import type { RefEncoder } from "./log/ref-encoder.js";
import type { LogSafe } from "./log/log-safe.js";
import { AI_FAILURE_REASONS, AI_SKIP_REASONS } from "./log/vocabulary.js";

export interface GenerateRequest {
  mode: "ai" | "fallback";
  language: Language;
  difficulty: Difficulty;
}

export interface TopicGeneratorDeps {
  topics: TopicStore;
  /** 定型の選択の種（`pickTopicFallback` の `now`） */
  clock: Clock;
  /** 保管のあとに呼ぶ（宛先は呼び出し時点の名簿から決まる） */
  publish: (roomCode: string) => void;
  /** 省略時は AI 無効（トークンか合言葉が無い） */
  provider?: ServerTopicProvider | undefined;
  /** provider とセットで渡す。**timer の delegator と同じインスタンス**（上限はサーバー全体で 1 つ） */
  aiLimiter?: AiLimiter | undefined;
  /** 既定 60 秒 */
  aiTimeoutMs?: number | undefined;
  logger: Logger;
  refEncoder: RefEncoder;
}

interface ActiveGeneration {
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  release: () => void;
}

/** 失敗理由を既知の語彙へ畳む（例外メッセージをログへ出さない。ADR 0012 D5・D12） */
function classifyFailure(e: unknown): LogSafe {
  return e instanceof ProviderFailure ? AI_FAILURE_REASONS[e.reason] : AI_FAILURE_REASONS.other;
}

export class TopicGenerator {
  /** roomCode → 進行中のサーバー生成 */
  private readonly active = new Map<string, ActiveGeneration>();
  private readonly aiTimeoutMs: number;

  constructor(private readonly deps: TopicGeneratorDeps) {
    this.aiTimeoutMs = deps.aiTimeoutMs ?? 60_000;
  }

  request(roomCode: string, req: GenerateRequest): "started" | "cooldown" {
    const state = this.deps.topics.get(roomCode);
    if (state === undefined) return "started"; // ルームが無い。何もしない
    const { provider, aiLimiter } = this.deps;
    // provider と aiLimiter は**両方揃って**初めて AI を使う（problem-delegation.ts と同じ）。
    // 片方だけだと、あとで `aiLimiter.tryAcquire` 等が呼べず、中断済みの生成を持ったまま
    // 例外で抜けることになる。
    const wantsAi = req.mode === "ai" && state.aiUnlocked && provider !== undefined && aiLimiter !== undefined;

    // ⚠ クールダウンの判定は中断（cancel）より先に行う（spec §5.3・E22）。
    if (wantsAi && aiLimiter.isCoolingDown(roomCode)) return "cooldown";

    this.cancel(roomCode);
    const previous = state.topic;

    if (req.mode === "fallback") {
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), false));
      return "started";
    }
    if (!wantsAi || provider === undefined || aiLimiter === undefined) {
      // 未解錠・AI 無効（provider か aiLimiter が無い場合を含む）。provider を呼ばずに縮退する（E9）
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
      return "started";
    }
    const acquired = aiLimiter.tryAcquire(roomCode);
    if (!acquired.ok) {
      this.deps.logger.warn("ai.skip", {
        room: this.deps.refEncoder.room(roomCode),
        reason: AI_SKIP_REASONS[acquired.reason],
      });
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
      return "started";
    }
    this.write(roomCode, startGeneration);
    this.runAi(roomCode, req, previous, acquired.release, provider);
    return "started";
  }

  /** 進行中の生成を止める。**帳簿は触らない**（次の状態は呼び出し側が書く） */
  cancel(roomCode: string): void {
    const gen = this.active.get(roomCode);
    if (gen === undefined) return;
    this.active.delete(roomCode);
    clearTimeout(gen.timer);
    gen.abort.abort();
    gen.release();
  }

  cancelAll(): void {
    for (const code of [...this.active.keys()]) this.cancel(code);
  }

  private runAi(
    roomCode: string,
    req: GenerateRequest,
    previous: Topic | null,
    release: () => void,
    provider: ServerTopicProvider,
  ): void {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.aiTimeoutMs);
    const gen: ActiveGeneration = { abort, timer, release };
    this.active.set(roomCode, gen);

    // **自分の生成であることを確かめてから書く**（中断・作り直しの後に届いた結果を捨てる。E11）
    const isCurrent = (): boolean => this.active.get(roomCode) === gen;
    const finish = (): void => {
      this.active.delete(roomCode);
      clearTimeout(timer);
      release();
    };
    const failover = (reason: LogSafe): void => {
      if (!isCurrent()) return;
      finish();
      this.deps.logger.warn("ai.fail", { room: this.deps.refEncoder.room(roomCode), reason });
      this.write(roomCode, (s) => settleWithFallback(s, this.fallback(req, previous), true));
    };

    // provider.generate() の**同期の**例外も、非同期の reject と同じ経路（failover）へ流す。
    // `Promise.resolve().then(() => provider.generate(...))` で包むと呼び出し自体が 1 tick
    // 遅れ、「request の直後に resolve/reject する」というテスト側の前提が壊れる
    // （実測: 既存テストが red になった）。呼び出しは同期のまま try/catch で包む。
    let pending: Promise<unknown>;
    try {
      pending = provider.generate(req.language, req.difficulty, abort.signal);
    } catch (e) {
      failover(classifyFailure(e));
      return;
    }
    pending
      .then((raw) => {
        if (!isCurrent()) return;
        const draft = validateTopicDraft(raw);
        if (draft.isErr()) {
          failover(AI_FAILURE_REASONS.invalid);
          return;
        }
        finish();
        this.write(roomCode, (s) => settleWithAi(s, { ...draft.value, source: "ai" }));
      })
      .catch((e: unknown) => failover(classifyFailure(e)));
  }

  private fallback(req: GenerateRequest, previous: Topic | null): Topic {
    return pickTopicFallback(req.language, req.difficulty, this.deps.clock.now(), previous);
  }

  /** 保管から引き直して遷移を当て、保管してから配る。**ルームが消えていたら書かない** */
  private write(roomCode: string, next: (s: TopicState) => TopicState): void {
    const current = this.deps.topics.get(roomCode);
    if (current === undefined) return;
    this.deps.topics.put(roomCode, next(current));
    this.deps.publish(roomCode);
  }
}
