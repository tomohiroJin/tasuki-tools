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
  it("ルート直下の参加 URL を返す（入口は LP に一本化された）", () => {
    // Given: 玄関 LP がルートを占め、そこがルームコードを解する（#95 S5a・D11）
    // When: 招待 URL を組み立てる
    // Then: ツールの配下ではない。選択画面に着地して、そこから道具を選ぶ
    expect(buildRoomUrl("https://tasuki.example", "ABC123")).toBe(
      "https://tasuki.example/?room=ABC123",
    );
  });

  it("開発サーバーのポートを落とさない", () => {
    // Given: ポート付きのオリジン
    // When: 招待 URL を組み立てる
    // Then: ポートが保たれる（落とすと別のアプリに繋がる）
    expect(buildRoomUrl("http://localhost:5175", "ABC123")).toBe(
      "http://localhost:5175/?room=ABC123",
    );
  });

  it("ルーム名を含むコードでも参加 URL として壊れない", () => {
    // Given: ルーム名は日本語も許すため、コードは非 ASCII になりうる
    // When: 招待 URL を組み立てる
    const url = buildRoomUrl("https://tasuki.example", "朝会モブ-a1b2");

    // Then: 素の文字列連結と違い、クエリとして読み戻せる
    expect(new URL(url).searchParams.get("room")).toBe("朝会モブ-a1b2");
  });

  it("ツールの公開パス配下には向けない（旧 S4 の形へ戻さない）", () => {
    // Given（準備）: S4 から S5a までは `/timer/?room=` を配っていた
    // When（操作）
    const url = buildRoomUrl("https://h", "ABC123");

    // Then: 戻すと、配ったリンクが選択画面を素通りして timer に着く
    expect(url).not.toContain("/timer/");
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
