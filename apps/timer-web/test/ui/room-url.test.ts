/**
 * 招待 URL の組み立て（#76 / F-1）。
 *
 * #19 で timer は `/` から `/timer/` へ移設されたが、招待 URL だけが
 * `${origin}?room=CODE` のまま残り、玄関 LP に着地して参加画面へ行けなくなっていた。
 * 各ツールの dev サーバーへ直接繋ぐと Vite が `/` → `/timer/` へクエリごと
 * リダイレクトするため**偶然通ってしまい**、玄関経由（＝本番と同じ経路）のときだけ死ぬ。
 *
 * sync-url.test.ts と同じ方針で、公開パスが配信設定と食い違ったら機械的に落ちるようにする。
 *
 * ⚠ **組み立てそのものは `@tasuki/sync-client` が持つ**（#95 S5b）。3 つの画面が同じ
 * 参加用 URL を配るので、写しを増やす前に寄せた。ここが見るのは**timer の公開パスと
 * 配信設定の突き合わせ**であり、向こうの単体テストでは代われない。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildInviteUrl } from "@tasuki/sync-client";

/** リポジトリルートを上方向に探す（jsdom では import.meta.url が使えないため）。 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, "deploy")) && existsSync(path.join(dir, "apps"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

describe("buildInviteUrl", () => {
  it("ルート直下の参加 URL を返す（入口は LP に一本化された）", () => {
    // Given: 玄関 LP がルートを占め、そこがルームコードを解する（#95 S5a・D11）
    // When: 招待 URL を組み立てる
    // Then: ツールの配下ではない。選択画面に着地して、そこから道具を選ぶ
    expect(buildInviteUrl("https://tasuki.example", "ABC123")).toBe(
      "https://tasuki.example/?room=ABC123",
    );
  });

  it("開発サーバーのポートを落とさない", () => {
    // Given: ポート付きのオリジン
    // When: 招待 URL を組み立てる
    // Then: ポートが保たれる（落とすと別のアプリに繋がる）
    expect(buildInviteUrl("http://localhost:5175", "ABC123")).toBe(
      "http://localhost:5175/?room=ABC123",
    );
  });

  it("ルーム名を含むコードでも参加 URL として壊れない", () => {
    // Given: ルーム名は日本語も許すため、コードは非 ASCII になりうる
    // When: 招待 URL を組み立てる
    const url = buildInviteUrl("https://tasuki.example", "朝会モブ-a1b2");

    // Then: 素の文字列連結と違い、クエリとして読み戻せる
    expect(new URL(url).searchParams.get("room")).toBe("朝会モブ-a1b2");
  });

  it("ツールの公開パス配下には向けない（旧 S4 の形へ戻さない）", () => {
    // Given（準備）: S4 から S5a までは `/timer/?room=` を配っていた
    // When（操作）
    const url = buildInviteUrl("https://h", "ABC123");

    // Then: 戻すと、配ったリンクが選択画面を素通りして timer に着く
    expect(url).not.toContain("/timer/");
  });
});

describe("timer の公開パスと配信設定", () => {
  /**
   * **突き合わせる相手が変わった**（#95 S5c）。
   *
   * S5b までは `src/public-path.ts` の `PUBLIC_PATH` が製品コードの正本で、
   * WS の接続先と招待 URL がそれを読んでいた。S5c で WS の入口が `/ws` になり
   * （`sync/sync-url.ts` の `SYNC_PATH`）、招待 URL は玄関の `/?room=` を配る
   * `@tasuki/sync-client` へ移ったので、**製品コードにこの値を読む場所は 1 つも
   * 残っていない**。読み手のいない定数を src に置くと、製品コードの入口から
   * 到達しないモジュールになる（`scripts/audit-structure.mjs` の SC-027）ので消した。
   *
   * **突き合わせそのものは消さない。** #19 の移設漏れ（#76 F-1）が起きた原因は
   * 「同じ公開パスが別々のファイルに 3 つあり、食い違ってもどれを見ても正しく見える」
   * ことで、その構図は S5c でも変わっていない。**src の定数を経由せず、
   * 配信設定 3 つを直に読み比べる** —— こちらのほうが守る範囲は広い
   * （以前は vite の `base` としか比べていなかった）。
   */
  it("Given vite の base・app.env・Caddy 断片 / When 3 つを読む / Then 同じ公開パスを指す", () => {
    // Given: 公開パスを別々に持つ 3 つの配信設定
    const root = findRepoRoot(process.cwd());
    const vite = readFileSync(path.join(root, "apps/timer-web/vite.config.ts"), "utf8");
    const env = readFileSync(path.join(root, "deploy/timer/app.env"), "utf8");
    const caddy = readFileSync(path.join(root, "deploy/timer/caddy/30-timer-spa.conf"), "utf8");

    // When: それぞれから公開パスを取り出す
    const base = /^\s*base:\s*["']([^"']+)["']/m.exec(vite)?.[1];
    const publicPath = /^PUBLIC_PATH=(\S+)$/m.exec(env)?.[1];
    // `handle_path /timer/* {` の `*` を除いた部分。末尾スラッシュまで含めて比べる
    const handled = /^handle_path\s+([^\s*]+)\*/m.exec(caddy)?.[1];

    // Then その1: **3 つとも実際に読めた。** 取り出しに失敗して undefined 同士が
    //             一致する形で素通りさせない（正規表現が古くなると必ずこうなる）
    expect({ base, publicPath, handled }).toEqual({
      base: "/timer/",
      publicPath: "/timer/",
      handled: "/timer/",
    });
  });

  it("Given 旧リンク救済の断片 / When 探す / Then もう存在しない", () => {
    // Given（準備）: #95 S5a で撤去した（`docs/adr/0018` 決定 4）。
    //                招待 URL が `/?room=` になった以上、これが残ると新しいリンクが
    //                301 でタイマーへ飛ばされ、選択画面に着地しない
    const fragment = path.join(
      findRepoRoot(process.cwd()),
      "deploy/timer/caddy/40-timer-legacy-room.conf",
    );

    // When / Then（操作）: 復活させたらここが赤くなる
    expect(existsSync(fragment)).toBe(false);
  });
});
