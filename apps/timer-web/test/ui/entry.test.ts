/**
 * timer をどの入口で開いたかを決める純粋関数のテスト（#95 S5c・R9）。
 *
 * 旧入口（Setup/Join）を撤去すると、ルームコードを伴わない URL には行き先が無くなる。
 * `decideEntry` はその判定を純粋関数として切り出したもので、適用（画面遷移）は
 * `App.tsx` 側が担う（`docs/adr/0015` MUST 2 と同じ「判定は純粋関数、適用は画面」の形）。
 */
import { describe, expect, it } from "vitest";
import { decideEntry, hubRoomPath } from "../../src/ui/entry.js";

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
    // Given: 選択画面の「記録を見る」が作る URL（ルームコードを伴う）
    const search = "?view=history&room=朝会モブ-a1b2";

    // When: **`?view=` の判定は `?room=` より先に来る。**
    //       逆だとルームへ入ってしまい、履歴に着けない
    const entry = decideEntry(search);

    // Then: 戻り先は開いた元（同じルームの選択画面）で、コードは符号化されている
    expect(entry).toEqual({
      kind: "history",
      backTo: "/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2",
    });
  });

  it("Given 記録を開いたが room が空文字 / When timer を開く / Then 戻り先は玄関になる", () => {
    // `?room=` 単独の空文字ケース（上の「空の room だけが付いている」）と対になる。
    expect(decideEntry("?view=history&room=")).toEqual({ kind: "history", backTo: "/" });
  });
});

describe("hubRoomPath", () => {
  it("ルームコードは符号化して載せる（日本語のルーム名がそのまま入る）", () => {
    // Given: ルーム名がそのまま入ったコード
    const code = "朝会モブ-a1b2";

    // When
    const path = hubRoomPath(code);

    // Then
    expect(path).toBe("/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");
  });

  it("コードが無ければ玄関そのもの", () => {
    // Given: 入る先のルームが決まっていない（null と空文字はどちらも同じ扱い）
    // When / Then
    expect(hubRoomPath(null)).toBe("/");
    expect(hubRoomPath("")).toBe("/");
  });

  it("退出の理由を渡すと印を載せる（告知は玄関が出す）", () => {
    // Given: 外された人と、自分で抜けた人
    // When
    const removed = hubRoomPath("ROOM01", "removed");
    const self = hubRoomPath(null, "self");

    // Then: 綴りの正本は `@tasuki/room-core`。ここは載せるだけである
    expect(removed).toBe("/?room=ROOM01&left=removed");
    expect(self).toBe("/?left=self");
  });
});
