/**
 * `loadRecords` が、IndexedDB から読んだ値を**いまの形へ畳んでから**返すことを見る（#91・E18）。
 *
 * 履歴や App のテストは `loadRecords` そのものを差し替えるので、畳む処理を呼ぶことは
 * そこでは守られない。依存（fake-indexeddb）は足さず、`indexedDB.open` を
 * `loadRecords` が触る分だけの最小のスタブに差し替えて、実物の `loadRecords` を通す。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadRecords } from "../../src/records/indexeddb.js";

/** 成功の通知を次の tick で起こすだけの、IDBRequest の最小の代役。 */
function succeedLater<T>(result: T): { result: T; onsuccess: (() => void) | null; onerror: (() => void) | null } {
  const request = { result, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  setTimeout(() => request.onsuccess?.(), 0);
  return request;
}

/** `getAll` が `stored` を返す DB を開く `indexedDB` のスタブ。 */
function stubIndexedDb(stored: unknown[]): void {
  const db = {
    close: () => {},
    transaction: () => ({
      oncomplete: null,
      objectStore: () => ({ index: () => ({ getAll: () => succeedLater(stored) }) }),
    }),
  };
  vi.stubGlobal("indexedDB", { open: () => succeedLater(db) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @requirements #91 E18
 */
describe("loadRecords: 端末の記録を読む", () => {
  it("Given 旧い形の記録と壊れた値 / When 読む / Then 旧い形は topicTitle へ畳まれ、壊れた値は外れる", async () => {
    // Given
    stubIndexedDb([
      { id: "old", problemTitle: "FizzBuzz", language: "Go", difficulty: "easy", elapsedSeconds: 1, members: [], totalSwitches: 0, completedAt: 1 },
      { id: "broken" },
    ]);
    // When
    const records = await loadRecords();
    // Then
    expect(records).toEqual([
      { id: "old", topicTitle: "FizzBuzz", elapsedSeconds: 1, members: [], totalSwitches: 0, completedAt: 1 },
    ]);
  });
});
