/**
 * timer をどの入口で開いたかを決める純粋関数のテスト（#95 S5c・R9）。
 *
 * 旧入口（Setup/Join）を撤去すると、ルームコードを伴わない URL には行き先が無くなる。
 * `decideEntry` はその判定を純粋関数として切り出したもので、適用（画面遷移）は
 * `App.tsx` 側が担う（`docs/adr/0015` MUST 2 と同じ「判定は純粋関数、適用は画面」の形）。
 */
import { describe, expect, it } from "vitest";
import { decideEntry } from "../../src/ui/entry.js";

describe("timer をどの入口で開いたかを決める", () => {
  it("Given ルームコードが無い / When timer を開く / Then 玄関へ送る", () => {
    expect(decideEntry("")).toEqual({ kind: "redirect", to: "/" });
  });

  it("Given 空の room だけが付いている / When timer を開く / Then 玄関へ送る", () => {
    // `?room=` だけの URL は入口のまま（poker の parseRoute と同じ扱い）
    expect(decideEntry("?room=")).toEqual({ kind: "redirect", to: "/" });
  });

  it("Given ルームコードがある / When timer を開く / Then そのルームへ入る", () => {
    expect(decideEntry("?room=朝会モブ-a1b2")).toEqual({ kind: "room", code: "朝会モブ-a1b2" });
  });

  it("Given 玄関から記録を開いた / When timer を開く / Then 履歴を出し、戻り先は玄関になる", () => {
    // 記録は端末に閉じるので、ルームに入っていなくても見られる（Setup が持っていた性質）
    expect(decideEntry("?view=history")).toEqual({ kind: "history", backTo: "/" });
  });

  it("Given 選択画面から記録を開いた / When timer を開く / Then 戻り先は同じルームの選択画面になる", () => {
    // **`?view=` の判定は `?room=` より先に来る。** 逆だとルームへ入ってしまい、履歴に着けない
    expect(decideEntry("?view=history&room=朝会モブ-a1b2")).toEqual({
      kind: "history",
      backTo: "/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2",
    });
  });
});
