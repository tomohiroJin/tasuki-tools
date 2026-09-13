/**
 * 参加用 URL（配るもの）を組み立てる（#95 D11・`docs/adr/0018` 決定 2）。
 *
 * **ルート直下の `?room=CODE` が正しい形である。** 入口が玄関（ハブ）へ一本化され、
 * そこがルームコードを解して名乗りの画面を出すからである。旧リンク救済の断片
 * （`deploy/timer/caddy/40-timer-legacy-room.conf`）は S5a で撤去した —— 残すと、
 * この形の URL がタイマーへ 301 で飛ばされて選択画面に着地しない。
 *
 * **3 つの画面が同じものを配る**（#95 S5b でここへ寄せた）。選択画面・timer・poker が
 * 別々に組み立てていると、片方だけが旧い形を配り続けても誰も気づけない。
 *
 * ## 置き場（#95 S5b で一度 `@tasuki/room-core` へ移そうとして戻した）
 *
 * `URL` はブラウザ側の型で、`tsconfig.base.json` は **DOM を持たせるのはブラウザで動くもの
 * だけ**と定めている（ドメインと同期サーバーは `lib: ES2022` のみ）。したがって
 * メンバーシップ文脈には置けない。ここに置いたうえで、**画面（`.tsx`）は各アプリの
 * ローカルの入口を経由する** —— 層の対応表（`docs/guides/architecture.md`）が
 * 「画面は同期クライアントを直接 import しない」としているためである。
 *
 * ルームコードにはルーム名がそのまま入り、日本語も許される（例: `朝会モブ-a1b2`）。
 * 素の文字列連結では壊れるため、クエリとして符号化する。
 */
export function buildInviteUrl(origin: string, code: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("room", code);
  return url.toString();
}
