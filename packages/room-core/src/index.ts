/**
 * メンバーシップ文脈の公開契約（#95・`docs/adr/0017`）。
 *
 * ルーム・参加者・表示名を扱う。ツールのドメイン（timer-core / poker-core）は
 * この文脈に依存しない。ここへ依存してよいのはアプリ層だけである。
 *
 * S1 の時点では表示名の規約だけが住んでいる。ルームと参加者は S4a で移る。
 */
export { normalizeDisplayName, nameSkeleton, conflictsWithExisting } from "./display-name.js";
