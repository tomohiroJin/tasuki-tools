import { describe, it, expect } from "vitest";
import { computeRotationStatus } from "../../src/ui/rotation-status.js";

describe("computeRotationStatus", () => {
  /** rotation の枠は識別子＋表示名の対（D6b）。 */
  const mk = (id: string, name: string, label = name, skipReason: "away" | null = null) => ({
    participantId: id, displayName: name, label, skipReason,
  });
  const base = {
    rotation: [mk("p1", "Alice"), mk("p2", "Bob"), mk("p3", "Carol")],
    currentIndex: 0, nextIndex: 1, intervalSeconds: 300, selfIndex: 2, isPaused: false,
  };

  it("turnsAway は現在を 0 として循環する", () => {
    // Given
    const r = computeRotationStatus(base);
    // When / Then
    expect(r.members.map((m) => m.turnsAway)).toEqual([0, 1, 2]);
    expect(r.members[0]!.isCurrent).toBe(true);
    expect(r.members[1]!.isNext).toBe(true);
  });

  it("currentIndex が進むと turnsAway が回る", () => {
    // Given
    const r = computeRotationStatus({ ...base, currentIndex: 1 });
    // When / Then
    const byName = Object.fromEntries(r.members.map((m) => [m.name, m.turnsAway]));
    expect(byName).toEqual({ Bob: 0, Carol: 1, Alice: 2 });
  });

  it("自分の minutesAway は interval×turnsAway/60（停止中は null）", () => {
    // Given
    const r = computeRotationStatus({ ...base, currentIndex: 0 });
    // When / Then
    expect(r.self?.name).toBe("Carol");
    expect(r.self?.turnsAway).toBe(2);
    expect(r.self?.minutesAway).toBe(10); // 300s×2=600s=10分
    // Given（停止中）
    const paused = computeRotationStatus({ ...base, isPaused: true });
    // Then
    expect(paused.self?.minutesAway).toBeNull();
  });

  it("自分が rotation 外なら self=null", () => {
    const r = computeRotationStatus({ ...base, selfIndex: -1 });
    expect(r.self).toBeNull();
  });

  it("同名が並んでも participantId で区別できる（React の key に使う）", () => {
    // Given（表示名を key にすると同名の行が衝突し、強調が別人に付く）
    const r = computeRotationStatus({
      ...base,
      rotation: [mk("p1", "Bob", "Bob（ID: p1）"), mk("p2", "Bob", "Bob（ID: p2）")],
      currentIndex: 0,
      selfIndex: 1,
    });
    // When / Then
    expect(r.members.map((m) => m.participantId)).toEqual(["p1", "p2"]);
    expect(r.members.map((m) => m.isSelf)).toEqual([false, true]);
    // 画面に出る名前は呼び名（同名なら識別子つき）。素の表示名だと両方「Bob」になる。
    expect(r.members.map((m) => m.name)).toEqual(["Bob（ID: p1）", "Bob（ID: p2）"]);
  });

  it("空 rotation でも例外なく空配列を返す", () => {
    // Given
    const r = computeRotationStatus({ ...base, rotation: [], currentIndex: 0 });
    // When / Then
    expect(r.members).toEqual([]);
    expect(r.self).toBeNull();
  });

  it("timer に居ない席かどうかを枠からそのまま引き継ぐ", () => {
    // Given（Bob だけが選択画面へ戻っている）
    const rotation = [mk("p1", "Alice"), mk("p2", "Bob", "Bob", "away"), mk("p3", "Carol")];

    // When
    const r = computeRotationStatus({ ...base, rotation, nextIndex: 2 });

    // Then（画面は「なぜ番が飛ぶか」をここから引く）
    expect(r.members.map((m) => m.skipReason)).toEqual([null, "away", null]);
  });
});

describe("飛ばされる席を数えない（#276 E3 / D13）", () => {
  // 輪: [アリス(現), ボブ(切断), カルロス, ダイア]
  const rotation = [
    { participantId: "a", displayName: "アリス", label: "アリス", skipReason: null },
    { participantId: "b", displayName: "ボブ", label: "ボブ", skipReason: "disconnected" as const },
    { participantId: "c", displayName: "カルロス", label: "カルロス", skipReason: null },
    { participantId: "d", displayName: "ダイア", label: "ダイア", skipReason: null },
  ];
  const status = () =>
    computeRotationStatus({
      rotation, currentIndex: 0, nextIndex: 2, intervalSeconds: 300, selfIndex: 3, isPaused: false,
    });

  it("飛ばされる席は turnsAway を持たない", () => {
    expect(status().members[1]!.turnsAway).toBe(null);
    expect(status().members[1]!.minutesAway).toBe(null);
  });

  it("飛ばされる席を挟んだ先は、その席を数に入れない", () => {
    // カルロスは「次」。素朴な計算なら 2 になるところ。
    expect(status().members[2]!.turnsAway).toBe(1);
    expect(status().members[3]!.turnsAway).toBe(2);
  });

  it("minutesAway も詰まった数から出す", () => {
    expect(status().members[3]!.minutesAway).toBe(10); // 2 順 × 5 分
  });

  it("isNext はサーバーの nextIndex と一致する席だけ", () => {
    expect(status().members.map((m) => m.isNext)).toEqual([false, false, true, false]);
  });

  it("現ドライバーは飛ばされる状態でも turnsAway が 0", () => {
    const r = [{ ...rotation[0]!, skipReason: "away" as const }, ...rotation.slice(1)];
    const s = computeRotationStatus({
      rotation: r, currentIndex: 0, nextIndex: 2, intervalSeconds: 300, selfIndex: 0, isPaused: false,
    });
    expect(s.members[0]!.turnsAway).toBe(0);
    expect(s.members[0]!.isCurrent).toBe(true);
  });

  it("nextIndex が null なら isNext はどこにも立たない", () => {
    const s = computeRotationStatus({
      rotation, currentIndex: 0, nextIndex: null, intervalSeconds: 300, selfIndex: 3, isPaused: false,
    });
    expect(s.members.some((m) => m.isNext)).toBe(false);
  });
});
