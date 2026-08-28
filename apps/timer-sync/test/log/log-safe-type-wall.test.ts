import { describe, it, expect } from "bun:test";
import { createLogger, type LogLevel } from "../../src/application/log/logger.js";
import { publicText, type LogField } from "../../src/application/log/log-safe.js";

/**
 * **型の壁そのものを守るテスト**（ADR 0012 D1・Issue #136 最終レビュー I1）。
 *
 * `LogField` が `number | boolean | LogSafe` であること、つまり **生の `string` を
 * 受け付けないこと**が、ログ衛生の土台である。ところが `log-safe.ts` の
 * `LogField` へ `| string` を足すだけで、この壁は跡形もなく消える。実測すると
 * 型検査も既存のテストもログ衛生の検査もすべて緑のまま通ってしまう。
 *
 * **ログへ文字列を出したい人にとって、型エラーを消す最短経路が「`LogField` を
 * 広げること」になっている。** Issue #70 で踏んだ「検査の下限を下げるのが
 * 赤を消す最短経路になる」と同型の罠である。
 *
 * そこで `@ts-expect-error` を使う。ここに書かれた行は「型エラーになるはずの行」で
 * あり、**壁が消えてエラーが出なくなった瞬間に `tsc` が
 * 「Unused '@ts-expect-error' directive.（TS2578）」で落ちる。**
 * 検査の向きが逆（エラーが出ないことを検出する）である点が要点である。
 *
 * ⚠ このファイルが型検査に掛かるのは `apps/timer-sync/tsconfig.test.json` の
 * `include` に `test/log/**\/*` があるからである。パッケージ既定の
 * `tsconfig.json` は `src/**\/*` しか見ておらず、そちらではこのテストは
 * **1 行も型検査されない**（実測: わざと壊した .ts を test/ へ置いても緑のまま通った）。
 * `package.json` の `typecheck` スクリプトがこの設定を指していることが前提条件である。
 */
describe("LogField の型の壁", () => {
  it("生の string を LogField へ代入できない", () => {
    // Given
    const roomCode: string = "MORNING-MOB-7F3K";
    // When
    // @ts-expect-error 生の string は LogField に代入できない（壁が消えるとこの行が緑になり tsc が落ちる）
    const field: LogField = roomCode;
    // Then（実行時の値は素通りする。壁は型だけのものなので、ここは形式的な確認に留める）
    expect(typeof field).toBe("string");
  });

  it("文字列リテラルも LogField へ代入できない", () => {
    // @ts-expect-error 文字列リテラルも LogSafe ではない
    const field: LogField = "r_1a2b3c4d";
    expect(typeof field).toBe("string");
  });

  it("ロガのフィールドへ生の string を渡せない", () => {
    // Given
    const lines: string[] = [];
    const logger = createLogger((_level: LogLevel, line: string) => lines.push(line));
    const roomCode: string = "MORNING-MOB-7F3K";
    // When
    // @ts-expect-error fields の値は LogField のみ。生の string は通らない
    logger.info("reclaimed", { room: roomCode });
    // Then
    expect(lines).toHaveLength(1);
  });

  it("publicText を通した値は LogField として受け付ける（壁が過剰でないことの対照）", () => {
    // Given（型検査の対象となる値そのものが前提であり操作でもある）
    // When
    const field: LogField = publicText("r_1a2b3c4d");
    const numeric: LogField = 1800207;
    const flag: LogField = true;
    // Then
    expect(String(field)).toBe("r_1a2b3c4d");
    expect(numeric).toBe(1800207);
    expect(flag).toBe(true);
  });
});
