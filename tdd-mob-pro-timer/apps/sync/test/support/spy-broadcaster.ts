/**
 * SpyBroadcaster — Broadcaster の記録つきテスト実装（apps/sync 共有）
 *
 * 既存 29 ファイルにローカル定義されていた `SpyBroadcaster` の和集合。
 * ファイルごとに `snapshots` が roomCode のみ／room のみ／両方、`signals` が
 * roomCode のみ／{roomCode,msg} 等ばらばらだったため、ここでは両方を保持する
 * 最も情報量の多い形（{ roomCode, room } / { roomCode, msg }）に統一する。
 * 和集合を超える機能（例: 未使用の bindStore 系の一般化）は足さない（FR-118）。
 *
 * @requirements FR-097, FR-118, US2
 */

import type { Broadcaster } from "../../src/ports/broadcaster.js";
import type { ServerMsg, Room } from "@tdd-mob/core";

export class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: Array<{ roomCode: string; room: Room }> = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];

  broadcastSnapshot(roomCode: string, room: Room): void {
    this.snapshots.push({ roomCode, room });
  }

  sendTo(connId: string, msg: ServerMsg): void {
    this.sent.push({ connId, msg });
  }

  broadcastSignal(roomCode: string, msg: ServerMsg): void {
    this.signals.push({ roomCode, msg });
  }

  /** 最後に配信されたルームを返す（配信が一度もなければ undefined）。 */
  latestSnapshot(): Room | undefined {
    return this.snapshots.at(-1)?.room;
  }

  /**
   * 指定した接続へ送られた `room.created` を返す（**本番と同じ観測点**）。
   *
   * `handleCommand` の戻り値ではなくここを見る理由は、本番（`server.ts`）が
   * 戻り値を破棄しており、ルームコードや participantId が利用者へ届く経路は
   * この配信メッセージだけだからである。
   *
   * 届いていない場合は `throw` する。前提の構築（ルーム作成）の失敗を、
   * テスト対象の検証の失敗（`expect`）と区別するため（FR-096）。
   */
  createdFor(connId: string): Extract<ServerMsg, { type: "room.created" }> {
    const msg = this.sent.find((s) => s.connId === connId && s.msg.type === "room.created")?.msg;
    if (msg === undefined || msg.type !== "room.created") {
      throw new Error(`SpyBroadcaster: ${connId} へ room.created が送られていない`);
    }
    return msg;
  }

  /**
   * 指定した接続へ送られた `room.joined` を返す（**本番と同じ観測点**）。
   * 届いていない場合は `throw` する（`createdFor` と同じ理由・FR-096）。
   */
  joinedFor(connId: string): Extract<ServerMsg, { type: "room.joined" }> {
    const msg = this.sent.find((s) => s.connId === connId && s.msg.type === "room.joined")?.msg;
    if (msg === undefined || msg.type !== "room.joined") {
      throw new Error(`SpyBroadcaster: ${connId} へ room.joined が送られていない`);
    }
    return msg;
  }

  /** 指定した接続へ送られたエラーメッセージの一覧を返す。 */
  errorsTo(connId: string): Array<Extract<ServerMsg, { type: "error" }>> {
    return this.sent
      .filter((s) => s.connId === connId && s.msg.type === "error")
      .map((s) => s.msg as Extract<ServerMsg, { type: "error" }>);
  }

  /** 指定した接続へ特定のエラーコードが送られたかを判定する。 */
  hasErrorCode(connId: string, code: string): boolean {
    return this.errorsTo(connId).some((msg) => msg.code === code);
  }

  /** 特定種別のシグナルメッセージの一覧を返す。 */
  signalsOf<S extends Extract<ServerMsg, { type: "signal" }>["signal"]>(
    signal: S,
  ): Array<Extract<ServerMsg, { type: "signal"; signal: S }>> {
    return this.signals
      .filter(
        (s): s is { roomCode: string; msg: Extract<ServerMsg, { type: "signal"; signal: S }> } =>
          s.msg.type === "signal" && s.msg.signal === signal,
      )
      .map((s) => s.msg);
  }
}
