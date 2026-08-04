/**
 * FakeCodeGen — RoomCodeGen の決定的テスト実装（apps/sync 共有）
 *
 * 既存 27 ファイルにローカル定義されていた `FakeCodeGen` の和集合。
 * 各ファイルの違いはプレフィックス文字列（例: "ROOM" / "LC" / "SNAP"）と
 * 桁数だけで、挙動（1 から始まる連番・0 埋め・単調増加）は共通していた。
 * ここでは単一のカウンタから 3 種の識別子を生成する共通の挙動だけを実装し、
 * 和集合を超える機能（ファイルごとの衝突回避用プレフィックス等）は足さない（FR-118）。
 *
 * @requirements FR-097, US2
 */

import type { RoomCodeGen } from "../../src/ports/code-gen.js";

export class FakeCodeGen implements RoomCodeGen {
  private counter = 0;

  generate(): string {
    return `ROOM${String(++this.counter).padStart(2, "0")}`;
  }

  generateParticipantId(): string {
    return `pid-${++this.counter}`;
  }

  generateResumeToken(): string {
    return `rt-${++this.counter}`;
  }
}
