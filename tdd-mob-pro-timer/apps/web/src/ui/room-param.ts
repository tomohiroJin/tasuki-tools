/**
 * URL から room クエリパラメータを除去する純粋関数（Issue #32・FR-127/US2-2）。
 *
 * 自己退出（LEFT_ROOM）の入口画面遷移では、画面上の joinCode state をクリアするだけでは
 * 不十分。アドレスバーの URL に `?room=...` が残っていると、それ自体が
 * 「直前のルームへ復帰するための手がかり」になってしまい、リロード一発で
 * 抜けたはずのルームの参加画面へ戻ってしまう（FR-127 違反）。
 * URL 操作という関心のため、ブラウザ API を薄くラップする platform/ ではなく、
 * 既存の screen.ts / error-action.ts と同じ「判定・計算は純粋関数」の並びとして
 * ui/ に置く（App.tsx から呼ばれ、結果の適用だけ App.tsx 側が担う設計方針に合わせた）。
 */

/** 絶対 URL 文字列から room クエリパラメータ（複数可）だけを取り除いた URL 文字列を返す。 */
export function stripRoomParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("room");
  return url.toString();
}
