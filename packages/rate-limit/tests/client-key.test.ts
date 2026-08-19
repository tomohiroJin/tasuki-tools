/**
 * クライアント鍵の導出のテスト。
 *
 * ここで守りたいのは 1 点に尽きる。**同じ /64 に属するアドレスが、表記の違いで
 * 別の鍵になってはならない。** 別の鍵になると、攻撃者は表記を変えるだけで
 * レート制限を回避できる（設計正本 §3.2）。
 */
import { describe, it, expect } from "vitest";
import { createClientKeyDeriver } from "../src/index.js";
// normalizeClientAddress は公開 API から外れている（生 IP を外へ出さないため）。
// テストは client-key.js から直接 import する。
import { normalizeClientAddress } from "../src/client-key.js";

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
      // Given
      const expected = "v6:2001:db8:0:0";
      // When / Then（normalizeClientAddress は純粋関数なので呼び出しと検証が同じ式になる）
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
      // Given: 比較する 2 つの表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（normalizeClientAddress は純粋関数なので呼び出しと検証が同じ式になる）
      expect(normalizeClientAddress("2001:db8::dead:beef")).toBe(
        normalizeClientAddress("2001:db8::1"),
      );
    });

    it("上位 64 ビットが違えば別の鍵になる", () => {
      // Given: 比較する 2 つの表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（normalizeClientAddress は純粋関数なので呼び出しと検証が同じ式になる）
      expect(normalizeClientAddress("2001:db8:0:1::1")).not.toBe(
        normalizeClientAddress("2001:db8:0:2::1"),
      );
    });

    it("射影ではない埋め込み IPv4（2001:db8::192.0.2.1）は /64 に影響しない", () => {
      // ::ffff:192.0.2.1 は IPv4 射影アドレスなので、この項ではなく
      // 下の「IPv4 射影アドレスは v4: 名前空間へ落とす」で検証する。
      expect(normalizeClientAddress("2001:db8::192.0.2.1")).toBe("v6:2001:db8:0:0");
    });

    it("全ゼロの短縮形も扱える", () => {
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });

  describe("IPv4 射影アドレス（::ffff:0:0/96）は v4: 名前空間へ落とす", () => {
    // ::ffff:203.0.113.7 は上位 64 ビットが全ゼロなので、/64 に丸めると
    // 世界中の IPv4 射影クライアントが同一の鍵を共有してしまう（F1・実測済み）。
    // 数値展開した 8 グループ全体で射影レンジを判定し、下位 32 ビットを
    // IPv4 として復元して v4: 名前空間へ落とすことで、この丸め崩壊を避ける。
    it("::ffff:203.0.113.7 は 203.0.113.7 と同じ鍵になる", () => {
      // Given: 比較する表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（normalizeClientAddress は純粋関数なので呼び出しと検証が同じ式になる）
      expect(normalizeClientAddress("::ffff:203.0.113.7")).toBe(
        normalizeClientAddress("203.0.113.7"),
      );
      expect(normalizeClientAddress("::ffff:203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("大文字表記（::FFFF:）も同じ鍵になる", () => {
      expect(normalizeClientAddress("::FFFF:203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("完全展開の射影形（0:0:0:0:0:ffff:cb00:7107）も同じ鍵になる", () => {
      expect(normalizeClientAddress("0:0:0:0:0:ffff:cb00:7107")).toBe("v4:203.0.113.7");
    });

    it("異なる射影クライアント同士は別の鍵になる", () => {
      // Given: 比較する 2 つの表記を渡す呼び出し自体が前提の指定を兼ねる
      // When / Then（normalizeClientAddress は純粋関数なので呼び出しと検証が同じ式になる）
      expect(normalizeClientAddress("::ffff:198.51.100.9")).not.toBe(
        normalizeClientAddress("::ffff:203.0.113.7"),
      );
    });

    it("下位 32 ビットが 0.0.0.0 の射影は v4:0.0.0.0 になる", () => {
      expect(normalizeClientAddress("::ffff:0.0.0.0")).toBe("v4:0.0.0.0");
    });

    it("射影レンジ以外で上位 64 ビットが全ゼロのもの（::/64。::1・:: など）は v6:0:0:0:0 のまま。ループバック・未指定・非推奨レンジは外部クライアントの実 IP としては到達しないので、まとまることを意図して受け入れる", () => {
      expect(normalizeClientAddress("::1")).toBe("v6:0:0:0:0");
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });

    // G2: この残余は ::/96 ではなく ::/64（射影レンジを除く）である。::/96 の外にある
    // アドレスも上位 64 ビットが全ゼロなら同じ v6:0:0:0:0 になることを確かめる。
    /**
     * @requirements G2
     */
    it("::/96 の外でも上位 64 ビットが全ゼロなら v6:0:0:0:0 になる", () => {
      expect(normalizeClientAddress("::1:2:3:4")).toBe("v6:0:0:0:0");
      expect(normalizeClientAddress("::c000:201")).toBe("v6:0:0:0:0");
    });
  });

  describe("IPv4 と IPv6 は名前空間が混ざらない", () => {
    it("接頭辞で区別される", () => {
      expect(normalizeClientAddress("0.0.0.0")).toBe("v4:0.0.0.0");
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });
});

describe("公開 API の面（生 IP をモジュールの外へ出さない）", () => {
  it("index.ts は normalizeClientAddress を公開しない", async () => {
    const indexModule: Record<string, unknown> = await import("../src/index.js");
    expect(indexModule.normalizeClientAddress).toBeUndefined();
  });

  it("index.ts は createClientKeyDeriver を公開する", async () => {
    const indexModule: Record<string, unknown> = await import("../src/index.js");
    expect(typeof indexModule.createClientKeyDeriver).toBe("function");
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
    // Given
    const a = createClientKeyDeriver(new Uint8Array(32).fill(1));
    const b = createClientKeyDeriver(new Uint8Array(32).fill(2));
    // When / Then（derive の呼び出し自体が操作であり、結果同士の比較が検証を兼ねる）
    expect(a("203.0.113.7")).not.toBe(b("203.0.113.7"));
  });

  it("鍵に生の IP が現れない", () => {
    // Given
    const derive = createClientKeyDeriver(salt);
    // When
    const key = derive("203.0.113.7");
    // Then
    expect(key).not.toBeNull();
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toContain("203");
  });

  it("アドレスを特定できなければ null を返す", () => {
    // Given
    const derive = createClientKeyDeriver(salt);
    // When / Then（derive は純粋関数なので呼び出しと検証が同じ式になる）
    expect(derive(undefined)).toBeNull();
    expect(derive("unknown")).toBeNull();
  });
});

describe("createClientKeyDeriver のソルト検証（F5）", () => {
  // 正規形は v4:<IP> という低エントロピーの既知文字列なので、ソルトが
  // 退化する（短い・空）と鍵から IP を総当たりで逆算できてしまう。
  it("32 バイト未満なら throw する", () => {
    expect(() => createClientKeyDeriver(new Uint8Array(31))).toThrow();
  });

  it("0 バイト（空のソルト）でも throw する", () => {
    expect(() => createClientKeyDeriver(new Uint8Array(0))).toThrow();
  });

  it("throw のメッセージにソルトの中身は含まれない（長さだけを伝える）", () => {
    // Given
    let message = "";
    // When
    try {
      createClientKeyDeriver(new Uint8Array(31).fill(7));
    } catch (error) {
      message = (error as Error).message;
    }
    // Then
    expect(message).toContain("31");
    // 中身（0x07 を 16 進 "7" や "07" として含む等）が漏れていないことの簡易確認。
    expect(message).not.toContain("0707");
  });

  it("32 バイトちょうどなら通る", () => {
    expect(() => createClientKeyDeriver(new Uint8Array(32).fill(7))).not.toThrow();
  });

  // G4: 全ゼロ 32 バイトは HMAC の仕様上「鍵なし」と証明可能に同一の鍵を出す（実測済み）。
  // 「長さだけを見る・中身は見ない」という設計判断自体は妥当だが、new Uint8Array(32)
  // （＝確保して埋め忘れ）はこの API で最も起こりやすい事故なので、合格例としてではなく
  // この決定を明示する独立したテストとして残す。
  it("全ゼロ 32 バイトは意図して弾かない（長さだけを見る。中身は見ない、という設計判断）", () => {
    expect(() => createClientKeyDeriver(new Uint8Array(32))).not.toThrow();
  });

  /**
   * @requirements G1
   */
  describe("length を持たない型は throw する", () => {
    // G1: .length を持たない型（ArrayBuffer・DataView）は byteLength しか持たず、
    // `salt.length < SALT_MIN_BYTES` が undefined < 32 = false になって素通りしていた。
    // createHmac は両方を鍵として受け付けてしまうため、型そのものを検査する必要がある。
    it("ArrayBuffer は length を持たないため throw する", () => {
      expect(() => createClientKeyDeriver(new ArrayBuffer(64) as never)).toThrow();
    });

    it("空の ArrayBuffer も throw する", () => {
      expect(() => createClientKeyDeriver(new ArrayBuffer(0) as never)).toThrow();
    });

    it("DataView は length を持たないため throw する", () => {
      expect(() => createClientKeyDeriver(new DataView(new ArrayBuffer(64)) as never)).toThrow();
    });
  });
});
