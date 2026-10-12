import type { NameConflict } from "../../src/index.js";

/**
 * 同名の判定のテスト用の代役。**本物は `@tasuki/room-core` の `conflictsWithExisting`**
 * （同期サーバーと web が渡す）で、roulette-core はそれに依存できない（`docs/adr/0017`）。
 *
 * 代役は本物と同じく大文字小文字を畳む。roulette-core が**自分で文字列を比べず、渡された判定に
 * 任せている**ことは、`neverConflicts`（同じ文字列でも衝突としない）で見分ける。
 */
export const foldCase: NameConflict = (existing, name) =>
  existing.some((e) => e.displayName.trim().toLowerCase() === name.trim().toLowerCase());

/** どの名前も衝突としない判定。ドメインが自前の比較を残していると、同じ文字列で拒んでしまう。 */
export const neverConflicts: NameConflict = () => false;
