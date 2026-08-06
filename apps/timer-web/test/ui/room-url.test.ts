/**
 * 招待 URL の組み立て（#76 / F-1）。
 *
 * #19 で timer は `/` から `/timer/` へ移設されたが、招待 URL だけが
 * `${origin}?room=CODE` のまま残り、玄関 LP に着地して参加画面へ行けなくなっていた。
 * 各ツールの dev サーバーへ直接繋ぐと Vite が `/` → `/timer/` へクエリごと
 * リダイレクトするため**偶然通ってしまい**、玄関経由（＝本番と同じ経路）のときだけ死ぬ。
 *
 * sync-url.test.ts と同じ方針で、公開パスが配信設定と食い違ったら機械的に落ちるようにする。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PUBLIC_PATH } from "../../src/public-path";
import { buildRoomUrl } from "../../src/ui/room-url";

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

describe("buildRoomUrl", () => {
  it("公開パス配下の参加 URL を返す", () => {
    // Given: 玄関 LP がルートを占めるオリジン
    // When: 招待 URL を組み立てる
    // Then: /timer/ 配下を指し、玄関に着地しない
    expect(buildRoomUrl("https://tasuki.example", "ABC123")).toBe(
      "https://tasuki.example/timer/?room=ABC123",
    );
  });

  it("開発サーバーのポートを落とさない", () => {
    // Given: ポート付きのオリジン
    // When: 招待 URL を組み立てる
    // Then: ポートが保たれる（落とすと別のアプリに繋がる）
    expect(buildRoomUrl("http://localhost:5175", "ABC123")).toBe(
      "http://localhost:5175/timer/?room=ABC123",
    );
  });

  it("ルーム名を含むコードでも参加 URL として壊れない", () => {
    // Given: ルーム名は日本語も許すため、コードは非 ASCII になりうる
    // When: 招待 URL を組み立てる
    const url = buildRoomUrl("https://tasuki.example", "朝会モブ-a1b2");

    // Then: 素の文字列連結と違い、クエリとして読み戻せる
    expect(new URL(url).searchParams.get("room")).toBe("朝会モブ-a1b2");
  });

  it("ルート直下（?room=）には向けない", () => {
    // Given: ルートは玄関 LP の包括フォールバックが持っている
    // When: 招待 URL を組み立てる
    // Then: ルート直下ではない。ここが直下だとコードを持ったまま LP が
    // 表示されて参加できない（#76 で実測した事象）
    expect(buildRoomUrl("https://h", "ABC123")).not.toBe("https://h?room=ABC123");
  });
});

describe("PUBLIC_PATH と配信設定", () => {
  it("Given vite の base / When 読む / Then PUBLIC_PATH と一致する", () => {
    // Given: timer-web の配信設定
    // When: base を読む
    // Then: クライアントが組み立てる公開パスと一致する
    //
    // 別ファイルにある同じ値で、食い違ってもどちらを見ても正しく見える。
    // #19 の移設漏れはまさにこれで、ここで機械的に固定する。
    const config = readFileSync(
      path.join(findRepoRoot(process.cwd()), "apps/timer-web/vite.config.ts"),
      "utf8",
    );
    const base = /^\s*base:\s*["']([^"']+)["']/m.exec(config);

    expect(base?.[1]).toBe(PUBLIC_PATH);
  });

  it("Given 旧リンク救済の Caddy 断片 / When 転送先を読む / Then PUBLIC_PATH 配下へ送っている", () => {
    // Given: `/` + room クエリを救う本番の断片
    // When: 転送先を読む
    // Then: 公開パス配下へ送っている
    //
    // 旧リンク救済はあくまで保険で、招待 URL 自体が正しい形を出すのが本筋。
    // 断片の転送先が公開パスとずれたら、古いリンクの救済も同時に壊れる。
    const fragment = readFileSync(
      path.join(findRepoRoot(process.cwd()), "deploy/timer/caddy/40-timer-legacy-room.conf"),
      "utf8",
    );
    const redir = /^\s*redir\s+@legacy-room\s+(\S+)/m.exec(fragment);

    expect(redir?.[1]?.startsWith(PUBLIC_PATH)).toBe(true);
  });
});
