/**
 * InMemoryRoundStore — poker の状態（投票ラウンド）の揮発インメモリストア（#95 S4a）。
 *
 * 憲法 原則 III（再起動で失われてよい）。`InMemoryTimerStore` と同じ形にしてある ——
 * 名簿（`InMemoryRoomStore`）と対で扱うものなので、片方だけ書き方が違うと取り違える。
 */
import type { Round } from '@tasuki/poker-core';
import type { RoundStore } from '../ports/poker-round-store.js';

export class InMemoryRoundStore implements RoundStore {
  private readonly rounds = new Map<string, Round>();

  get(roomId: string): Round | undefined {
    return this.rounds.get(roomId);
  }

  put(roomId: string, round: Round): void {
    this.rounds.set(roomId, round);
  }

  remove(roomId: string): void {
    this.rounds.delete(roomId);
  }
}
