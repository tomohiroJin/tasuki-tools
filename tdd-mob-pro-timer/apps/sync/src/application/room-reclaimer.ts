/**
 * アイドル回収 — 全参加者が offline のまま TTL を超えたルームを削除する（DoS 緩和・FR M4-lite）。
 * presence にフックせず、ストアを定期 sweep で観測する自己完結方式（結合最小）。
 */

import type { RoomStore } from "../ports/room-store.js";

export interface RoomReclaimerDeps {
  store: RoomStore;
  /** 全員 offline がこの ms 継続したら回収する。 */
  idleTtlMs: number;
  /** 回収時の後始末（store.remove・timer 解放・token 解放など）。 */
  onReclaim: (roomCode: string) => void;
}

export class RoomReclaimer {
  private readonly store: RoomStore;
  private readonly idleTtlMs: number;
  private readonly onReclaim: (roomCode: string) => void;
  /** roomCode → 全員 offline になったと初検知した時刻（epoch ms）。 */
  private readonly emptySince = new Map<string, number>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: RoomReclaimerDeps) {
    this.store = deps.store;
    this.idleTtlMs = deps.idleTtlMs;
    this.onReclaim = deps.onReclaim;
  }

  /** 1 周の観測。now はテスト容易性のため引数。 */
  sweep(now: number): void {
    const liveCodes = new Set<string>();
    for (const room of this.store.list()) {
      liveCodes.add(room.code);
      const empty = room.participants.every((p) => p.presence === "offline");
      if (!empty) {
        this.emptySince.delete(room.code);
        continue;
      }
      const since = this.emptySince.get(room.code);
      if (since === undefined) {
        this.emptySince.set(room.code, now);
      } else if (now - since >= this.idleTtlMs) {
        this.onReclaim(room.code);
        this.emptySince.delete(room.code);
      }
    }
    // ストアから消えたルームの追跡情報を掃除（マップのリーク防止）。
    for (const code of this.emptySince.keys()) {
      if (!liveCodes.has(code)) this.emptySince.delete(code);
    }
  }

  /** 定期 sweep を開始する。now 取得は Date.now（テストでは sweep を直接呼ぶ）。 */
  start(sweepIntervalMs: number): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => this.sweep(Date.now()), sweepIntervalMs);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
