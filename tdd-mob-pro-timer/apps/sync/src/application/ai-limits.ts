/**
 * AI お題生成の濫用抑制（純粋ロジック・clock 注入）。
 * - グローバル同時実行 1（VPS 1GB RAM の実測に基づく直列化。spec「VPS リソース実測」参照）
 * - ルームごとクールダウン（既定 10 秒）
 * - 日次回数上限（UTC 日付・揮発カウントで可＝再起動でリセットは許容）
 * 超過は呼び出し側で「エラーにせず定型へ縮退」する。
 */
import type { Clock } from "../ports/clock.js";

export interface AiLimiterOptions {
  clock: Clock;
  /** 日次生成回数上限（グローバル） */
  dailyLimit: number;
  /** ルームごとのクールダウン ms（既定 10 秒） */
  cooldownMs?: number;
  /** グローバル同時実行数（既定 1） */
  maxConcurrent?: number;
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: "concurrent" | "cooldown" | "daily" };

const DEFAULT_COOLDOWN_MS = 10_000;

export class AiLimiter {
  private readonly clock: Clock;
  private readonly dailyLimit: number;
  private readonly cooldownMs: number;
  private readonly maxConcurrent: number;

  private running = 0;
  /** roomCode → 直近の生成開始時刻（epoch ms） */
  private readonly lastStartByRoom = new Map<string, number>();
  private dayKey = "";
  private dayCount = 0;
  private total = 0;

  constructor(opts: AiLimiterOptions) {
    this.clock = opts.clock;
    this.dailyLimit = opts.dailyLimit;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.maxConcurrent = opts.maxConcurrent ?? 1;
  }

  /** 生成枠を取得する。ok の場合は完了/失敗時に必ず release() を呼ぶこと。 */
  tryAcquire(roomCode: string): AcquireResult {
    const now = this.clock.now();
    this.rolloverIfNeeded(now);

    if (this.running >= this.maxConcurrent) return { ok: false, reason: "concurrent" };

    const last = this.lastStartByRoom.get(roomCode);
    if (last !== undefined && now - last < this.cooldownMs) {
      return { ok: false, reason: "cooldown" };
    }

    if (this.dayCount >= this.dailyLimit) return { ok: false, reason: "daily" };

    this.running++;
    this.dayCount++;
    this.total++;
    this.lastStartByRoom.set(roomCode, now);

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return; // 二重 release を無害化
        released = true;
        this.running--;
      },
    };
  }

  /** 当日（UTC）の生成回数 */
  get todayCount(): number {
    this.rolloverIfNeeded(this.clock.now());
    return this.dayCount;
  }

  /** 累計生成回数（プロセス生存中） */
  get totalCount(): number {
    return this.total;
  }

  /** UTC 日付が変わっていたら日次カウントをリセットする。
   *  lastStartByRoom も同時に掃除する（無上限成長の防止）。日付境界をまたぐ
   *  クールダウン（最大 10 秒）が 1 回消えるが、実害がないため許容する。 */
  private rolloverIfNeeded(now: number): void {
    const key = new Date(now).toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayCount = 0;
      this.lastStartByRoom.clear();
    }
  }
}
