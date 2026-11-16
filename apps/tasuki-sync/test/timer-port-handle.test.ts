/**
 * `TimerPort` の `set` が返したハンドルだけを `clear` が受ける（#596）。
 *
 * 契約: ハンドルは `set` が返したものをそのまま `clear` へ返す。以前はハンドルが `unknown` で、
 * 既定の実装が `clearTimeout` の型へ `as` で読み替えていた。ハンドルの型を持たせたので、
 * 別の型のハンドルを `clear` へ渡す取り違えは型検査が止める（`@ts-expect-error` が外れたら typecheck が赤くなる）。
 */
import { describe, expect, it } from "bun:test";
import type { TimerPort } from "../src/application/agenda-deadlines.js";

describe("TimerPort のハンドルの型", () => {
  it("WHEN set が返したハンドルを clear へ返す THE ポート SHALL 受ける。別の型のハンドルは型で止まる", () => {
    const cleared: number[] = [];
    const port: TimerPort<number> = {
      set: () => 7,
      clear: (handle) => void cleared.push(handle),
    };

    port.clear(port.set(() => {}, 1));
    // @ts-expect-error 文字列は set が返す型（number）ではない
    port.clear("7");

    expect(cleared).toEqual([7, "7" as unknown as number]);
  });
});
