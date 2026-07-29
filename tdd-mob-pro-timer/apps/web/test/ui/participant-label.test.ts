/**
 * 参加者の呼び名（FR-084）。同名が並ぶときだけ識別子を添える。
 *
 * 3巡目の敵対的検証で、**見た目は同じだが文字列が違う**名前を作れることが分かった。
 * 完全一致で「同名」を判定していると、利用者にとって見分けの付かない行が
 * 識別子なしで並ぶ。判定は見え方の骨格（`nameSkeleton`）で行う。
 */

import { describe, it, expect } from "vitest";
import { isAmbiguousName, participantLabel, shortId } from "../../src/ui/participant-label.js";

const p = (participantId: string, displayName: string) => ({ participantId, displayName });

describe("isAmbiguousName", () => {
  it("同名が複数いれば曖昧", () => {
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Bob")];
    expect(isAmbiguousName("Bob", "pid-0001", list)).toBe(true);
  });

  it("同名がいなければ曖昧でない", () => {
    const list = [p("pid-0001", "Alice"), p("pid-0002", "Bob")];
    expect(isAmbiguousName("Bob", "pid-0002", list)).toBe(false);
  });

  it("名簿から消えた同名の別人も曖昧とみなす（退出直後の通知）", () => {
    const list = [p("pid-0001", "Bob")];
    expect(isAmbiguousName("Bob", "pid-0002", list)).toBe(true);
  });

  it("キリル文字の見た目が同じ名前を曖昧とみなす", () => {
    // Given（В はキリル大文字 В。画面では Latin の B と区別が付かない）
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Вob")];
    // When / Then
    expect(isAmbiguousName("Bob", "pid-0001", list)).toBe(true);
    expect(isAmbiguousName("Вob", "pid-0002", list)).toBe(true);
  });

  it("ZWJ を挟んだだけの名前も曖昧とみなす", () => {
    // 正規化は ZWJ を残す（絵文字のため）。見た目の偽装はここで拾う。
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Bob‍")];
    expect(isAmbiguousName("Bob", "pid-0001", list)).toBe(true);
  });

  it("大文字小文字だけが違う名前も曖昧とみなす", () => {
    const list = [p("pid-0001", "Bob"), p("pid-0002", "BOB")];
    expect(isAmbiguousName("Bob", "pid-0001", list)).toBe(true);
  });

  it("見た目が違えば曖昧でない（余計な識別子を出さない）", () => {
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Bobby")];
    expect(isAmbiguousName("Bob", "pid-0001", list)).toBe(false);
  });
});

describe("participantLabel", () => {
  it("曖昧なときだけ識別子を添える", () => {
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Bob")];
    expect(participantLabel("Bob", "pid-0001", list)).toBe("Bob（ID: 0001）");
  });

  it("曖昧でなければ素の名前のまま（通常時に読みにくくしない）", () => {
    const list = [p("pid-0001", "Alice"), p("pid-0002", "Bob")];
    expect(participantLabel("Bob", "pid-0002", list)).toBe("Bob");
  });

  it("見た目が同じキリル名が居ると、双方に識別子が付いて区別できる", () => {
    // Given
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Вob")];
    // When / Then
    expect(participantLabel("Bob", "pid-0001", list)).toBe("Bob（ID: 0001）");
    // 表示名そのものは本人が名乗ったまま（キリルはラテンに書き換えない）。
    expect(participantLabel("Вob", "pid-0002", list)).toBe("Вob（ID: 0002）");
  });

  it("敬称を渡すと語順が「名前 さん（ID: xxxx）」になる", () => {
    const list = [p("pid-0001", "Bob"), p("pid-0002", "Bob")];
    expect(participantLabel("Bob", "pid-0001", list, "さん")).toBe("Bob さん（ID: 0001）");
  });
});

describe("shortId", () => {
  it("識別子の末尾4文字を返す", () => {
    expect(shortId("p_abcdefgh1234")).toBe("1234");
  });
});
