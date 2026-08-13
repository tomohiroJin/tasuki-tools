/**
 * クライアント鍵の導出のテスト。
 *
 * ここで守りたいのは 1 点に尽きる。**同じ /64 に属するアドレスが、表記の違いで
 * 別の鍵になってはならない。** 別の鍵になると、攻撃者は表記を変えるだけで
 * レート制限を回避できる（設計正本 §3.2）。
 */
import { describe, it, expect } from "vitest";
import { normalizeClientAddress, createClientKeyDeriver } from "../src/index.js";

describe("normalizeClientAddress", () => {
  describe("X-Forwarded-For の刈り込み", () => {
    it("単一の値をそのまま採る", () => {
      expect(normalizeClientAddress("203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("複数あるときは最後の要素を採る（Caddy が追記する形でも実クライアントになる）", () => {
      expect(normalizeClientAddress("9.9.9.9, 203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("前後の空白を無視する", () => {
      expect(normalizeClientAddress("  203.0.113.7  ")).toBe("v4:203.0.113.7");
    });

    it("ヘッダが無ければ null", () => {
      expect(normalizeClientAddress(undefined)).toBeNull();
    });

    it("空文字なら null", () => {
      expect(normalizeClientAddress("")).toBeNull();
    });

    it("IP として読めない値なら null", () => {
      expect(normalizeClientAddress("unknown")).toBeNull();
    });

    it("先行ゼロつきの IPv4 は不正として null（表記を一意に保つ）", () => {
      expect(normalizeClientAddress("01.2.3.4")).toBeNull();
    });
  });

  describe("IPv6 は /64 へ丸める", () => {
    it("同義の表記はすべて同じ鍵になる", () => {
      const expected = "v6:2001:db8:0:0";
      for (const notation of [
        "2001:db8::1",
        "2001:DB8::1",
        "2001:0db8::1",
        "2001:db8:0:0::1",
        "2001:db8::0:1",
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "[2001:db8::1]",
        "2001:db8::1%eth0",
      ]) {
        expect(normalizeClientAddress(notation), notation).toBe(expected);
      }
    });

    it("下位 64 ビットが違っても同じ鍵になる", () => {
      expect(normalizeClientAddress("2001:db8::dead:beef")).toBe(
        normalizeClientAddress("2001:db8::1"),
      );
    });

    it("上位 64 ビットが違えば別の鍵になる", () => {
      expect(normalizeClientAddress("2001:db8:0:1::1")).not.toBe(
        normalizeClientAddress("2001:db8:0:2::1"),
      );
    });

    it("埋め込み IPv4 は下位 32 ビットなので /64 に影響しない", () => {
      expect(normalizeClientAddress("::ffff:192.0.2.1")).toBe("v6:0:0:0:0");
      expect(normalizeClientAddress("2001:db8::192.0.2.1")).toBe("v6:2001:db8:0:0");
    });

    it("全ゼロの短縮形も扱える", () => {
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });

  describe("IPv4 と IPv6 は名前空間が混ざらない", () => {
    it("接頭辞で区別される", () => {
      expect(normalizeClientAddress("0.0.0.0")).toBe("v4:0.0.0.0");
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });
});

describe("createClientKeyDeriver", () => {
  const salt = new Uint8Array(32).fill(7);

  it("同じ正規形からは同じ鍵が出る", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive("2001:db8::1")).toBe(derive("2001:DB8::99"));
  });

  it("違う正規形からは違う鍵が出る", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive("203.0.113.7")).not.toBe(derive("203.0.113.8"));
  });

  it("ソルトが違えば同じアドレスでも鍵が変わる", () => {
    const a = createClientKeyDeriver(new Uint8Array(32).fill(1));
    const b = createClientKeyDeriver(new Uint8Array(32).fill(2));
    expect(a("203.0.113.7")).not.toBe(b("203.0.113.7"));
  });

  it("鍵に生の IP が現れない", () => {
    const derive = createClientKeyDeriver(salt);
    const key = derive("203.0.113.7");
    expect(key).not.toBeNull();
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toContain("203");
  });

  it("アドレスを特定できなければ null を返す", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive(undefined)).toBeNull();
    expect(derive("unknown")).toBeNull();
  });
});
