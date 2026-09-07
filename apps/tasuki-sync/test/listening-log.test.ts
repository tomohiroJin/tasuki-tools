/**
 * 起動ログ（`server.ts` の "listening" イベント）に出すフィールドのテスト。
 *
 * `server.ts` はエントリポイントで、import した時点で env 読み込み・実サーバー起動・
 * SIGTERM ハンドラ登録という副作用が走る（テストプロセスを巻き込む）。そのため
 * フィールドの組み立てだけを `buildListeningLogFields` として切り出し、ここで
 * 純粋関数として検証する（P-1・P-3 の敵対的レビュー対応）。
 */
import { describe, it, expect } from "bun:test";
import { loadSyncConfig } from "../src/config.js";
import { buildListeningLogFields } from "../src/listening-log.js";

describe("buildListeningLogFields", () => {
  it("port は渡された値をそのまま含める", () => {
    // Given
    const config = loadSyncConfig({});
    // When
    const fields = buildListeningLogFields(config, 12345);
    // Then
    expect(fields["port"]).toBe(12345);
  });

  it("PORT=0 で起動しても、渡された実ポートを出す（config.port を見ない）", () => {
    // Given: PORT=0（OS に空きポートを選ばせる）。config.port は 0 のまま残る
    const config = loadSyncConfig({ PORT: "0" });
    expect(config.port).toBe(0);
    // When: 実際に bind されたポートを渡す
    const fields = buildListeningLogFields(config, 54321);
    // Then: 0 ではなく実ポートが出る。
    // **ここが config.port を見る実装に戻ると、テストハーネス（test/poker/helpers.ts）が
    // この行から接続先を読めなくなる**（#95 S2 で timer 側を poker の契約へ揃えた）。
    expect(fields["port"]).toBe(54321);
  });

  it("requireClientAddress を真偽値として含める（P-1）", () => {
    // Given
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://tasuki.example.com",
      HOST: "127.0.0.1",
    });
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields["requireClientAddress"]).toBe(true);
  });

  it("本番でなければ requireClientAddress=false を含める", () => {
    // Given
    const config = loadSyncConfig({});
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields["requireClientAddress"]).toBe(false);
  });

  // P-3: server.ts は従来 `config.host === "127.0.0.1"` で loopbackOnly を判定しており、
  // isLoopbackHost（config.ts）の定義とずれていた。localhost / ::1 / 127.x.x.x は
  // ループバックなのに loopbackOnly=false と出てしまう（誤った運用上の安心材料）。
  it.each(["127.0.0.1", "localhost", "::1", "[::1]", "127.1.2.3"])(
    // Given
    "loopbackOnly は isLoopbackHost と同じ判定になる（HOST=%s）",
    (host) => {
      const config = loadSyncConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://tasuki.example.com",
        HOST: host,
      });
    // When
      const fields = buildListeningLogFields(config, 1);
    // Then
      expect(fields["loopbackOnly"]).toBe(true);
    },
  );

  it("ループバック外の HOST では loopbackOnly=false", () => {
    // Given
    const config = loadSyncConfig({ HOST: "0.0.0.0" });
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields["loopbackOnly"]).toBe(false);
  });
});
