/**
 * 参加・操作の失敗から、次の一手を決める（`docs/adr/0015` MUST 1：副作用の無い判断は純粋関数に置く）。
 *
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。合言葉を求められたら、ツールの画面で
 * 聞かずに玄関へ戻す —— 玄関が名乗りと合言葉を聞き直し、新しい復帰の組を端末に置く。
 *
 * **写しはもう無い**（#94 PR 2 のレビュー）。お題ツール（#91）が持っていたものをルーレットが
 * そのまま写していたので、ここへ寄せた。コードはハブの参加の体系（`join-room.ts`）で、
 * どのツールの画面でも同じ意味を持つ。
 *
 * **`@tasuki/*` に依存しない**（このパッケージの条件・`scripts/audit-dependency-direction.mjs`）。
 * 抜けた理由は `@tasuki/room-core` の `DepartureReason` と同じ綴りの字面で返す
 * （利用側の型にそのまま入る。綴りがずれると利用側の型検査が落ちる）。
 * 既定の文は利用者に見える言葉なので、各アプリの文言表から引数で受ける。
 */
export type JoinErrorPlan =
  | { kind: "gone" }
  | { kind: "left"; reason: "self" | "removed" }
  | { kind: "to-hub" }
  | { kind: "retry" }
  | { kind: "show"; message: string };

export function planForJoinError(code: string, message: string, defaultText: string): JoinErrorPlan {
  if (code === "ROOM_NOT_FOUND") return { kind: "gone" };
  // 抜けた・外された（timer の `error-action.ts` と同じ対応。`REMOVED_BY_HOST` は旧名で、同じ扱いにする）。
  if (code === "LEFT_ROOM") return { kind: "left", reason: "self" };
  if (code === "REMOVED_FROM_ROOM" || code === "REMOVED_BY_HOST") return { kind: "left", reason: "removed" };
  if (code === "PASSPHRASE_REQUIRED" || code === "PASSPHRASE_MISMATCH") return { kind: "to-hub" };
  if (code === "JOIN_RATE_LIMITED") return { kind: "retry" };
  // 未知のコードも含め、文はサーバーのものを使う（意味を知るのは向こうだけ）。
  // 空白だけの文は見た目で空の箱になるので既定の文に替える（poker-web の useSync と同じ扱い）。
  return { kind: "show", message: message.trim() === "" ? defaultText : message };
}
