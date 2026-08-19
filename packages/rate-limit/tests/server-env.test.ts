/**
 * env の生文字列（HOST・NODE_ENV）を解釈する検査のテスト。
 *
 * `apps/timer-sync/src/config.ts` と `apps/poker-sync/src/config.ts` に
 * 同じ 6 定義（LOOPBACK_HOSTS / IPV4_LOOPBACK / isLoopbackHost / KNOWN_NODE_ENVS /
 * normalizeNodeEnv / resolveNodeEnv）と `isProductionEnv` が複製されていた
 * （#103 Task 7 レビュー S-1）。ここへ切り出し、`@tasuki/rate-limit` から
 * `isLoopbackHost` / `isProductionEnv` として公開する。
 *
 * 個別の表記ゆれ網羅は移行元の各アプリの config.test.ts（`loadSyncConfig` /
 * `loadPokerSyncConfig` 経由）が引き続き持つ。ここでは関数の契約そのものを
 * 直接検証する。
 */
import { describe, it, expect } from "vitest";
import { isLoopbackHost, isProductionEnv } from "../src/server-env.js";

describe("isLoopbackHost", () => {
  it.each(["localhost", "::1", "[::1]", "127.0.0.1", "127.1.2.3"])(
    "%s はループバック扱い",
    (host) => {
      // Given: host の各表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（isLoopbackHost は純粋関数なので呼び出しと検証が同じ式になる）
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each(["0.0.0.0", "[0.0.0.0]", "example.com", "10.0.0.1", "::", "[::]"])(
    "%s はループバック外",
    (host) => {
      // Given: host の各表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（isLoopbackHost は純粋関数なので呼び出しと検証が同じ式になる）
      expect(isLoopbackHost(host)).toBe(false);
    },
  );

  it("IP ですらない値（127.999.999.999）は通さない", () => {
    expect(isLoopbackHost("127.999.999.999")).toBe(false);
  });

  it("前後の空白・大文字小文字を正規化してから判定する", () => {
    expect(isLoopbackHost("  Localhost  ")).toBe(true);
    expect(isLoopbackHost("127.0.0.1\n")).toBe(true);
  });
});

describe("isProductionEnv", () => {
  it("NODE_ENV=production なら true", () => {
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
  });

  it.each(["Production", "PRODUCTION", " production", "production\n"])(
    "表記ゆれ（%s）でも本番として判定される",
    (nodeEnv) => {
      // Given: nodeEnv の各表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（isProductionEnv は純粋関数なので呼び出しと検証が同じ式になる）
      expect(isProductionEnv({ NODE_ENV: nodeEnv })).toBe(true);
    },
  );

  it("未設定・空文字は本番ではない", () => {
    expect(isProductionEnv({})).toBe(false);
    expect(isProductionEnv({ NODE_ENV: "" })).toBe(false);
  });

  it("development / test は本番ではない", () => {
    expect(isProductionEnv({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionEnv({ NODE_ENV: "test" })).toBe(false);
  });

  it("未知の値は起動時 throw（表記ゆれ・誤設定で防御が無言ですり抜けるのを防ぐ）", () => {
    expect(() => isProductionEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("未知の値のエラーメッセージには受け取った値と既知の値の一覧が載る", () => {
    expect(() => isProductionEnv({ NODE_ENV: "staging" })).toThrow(/staging/);
    expect(() => isProductionEnv({ NODE_ENV: "staging" })).toThrow(/production/);
  });
});
