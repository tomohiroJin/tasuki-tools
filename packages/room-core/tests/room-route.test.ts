/**
 * ルームの URL の解析と玄関への道（#470・#463-C1・`docs/adr/0018`）。
 *
 * agenda / checkin / roulette / topic の 4 アプリが同じ形の `router.ts` を持っていたものを
 * ここへ寄せた。**入力と期待は寄せる前の 4 アプリのテストの表**と、境界の例（手で足した）である。
 * 期待は実装の写しではなく、URL として何が正しいかを文字列で書く。
 */
import { describe, it, expect } from "vitest";
import { parseRoute, hubPathFor } from "../src/room-route.js";
import { DEPARTURE_PARAM } from "../src/departure.js";

const BASES = ["/agenda", "/checkin", "/roulette", "/topic"] as const;

describe.each(BASES)("parseRoute（base = %s）", (base) => {
  it("玄関の札の URL はそのルームの画面になる", () => {
    expect(parseRoute(base, `${base}/`, "?room=R1")).toEqual({ name: "room", roomCode: "R1" });
  });

  it("末尾スラッシュの無い base 直下でもそのルームの画面になる", () => {
    expect(parseRoute(base, base, "?room=R1")).toEqual({ name: "room", roomCode: "R1" });
  });

  it("日本語を含むルームコードは復号したコードで入る", () => {
    const search = `?room=${encodeURIComponent("朝会モブ-a1b2")}`;
    expect(parseRoute(base, `${base}/`, search)).toEqual({ name: "room", roomCode: "朝会モブ-a1b2" });
  });

  it("他のクエリが混じっていても room だけを読む", () => {
    expect(parseRoute(base, `${base}/`, "?x=1&room=R1&left=self")).toEqual({
      name: "room",
      roomCode: "R1",
    });
  });

  it("ルームコードの無い URL は玄関へ送り返す", () => {
    expect(parseRoute(base, `${base}/`, "")).toEqual({ name: "redirect", to: "/" });
    expect(parseRoute(base, `${base}/`)).toEqual({ name: "redirect", to: "/" });
    expect(parseRoute(base, `${base}/`, "?room=")).toEqual({ name: "redirect", to: "/" });
    expect(parseRoute(base, `${base}/`, "?other=R1")).toEqual({ name: "redirect", to: "/" });
  });

  it("知らない下位パスは玄関へ送り返す", () => {
    expect(parseRoute(base, `${base}/room/R1`, "")).toEqual({ name: "redirect", to: "/" });
  });

  it("ルームコードの付いた知らない下位パスはコードを保って玄関のそのルームへ送る", () => {
    const search = `?room=${encodeURIComponent("朝会 a&b")}`;
    expect(parseRoute(base, `${base}/x`, search)).toEqual({
      name: "redirect",
      to: "/?room=%E6%9C%9D%E4%BC%9A+a%26b",
    });
    expect(parseRoute(base, `${base}/room/R1/`, "?room=R1")).toEqual({
      name: "redirect",
      to: "/?room=R1",
    });
  });

  it("base で始まっても別の語になるパスは入口ではない（base 直後がスラッシュ以外）", () => {
    expect(parseRoute(base, `${base}x`, "?room=R1")).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("base と大文字小文字が違うパスは入口ではない", () => {
    const upper = `/${base.slice(1).toUpperCase()}/`;
    expect(parseRoute(base, upper, "?room=R1")).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("別のアプリの base 配下は入口ではない", () => {
    const other = BASES.find((b) => b !== base) as string;
    expect(parseRoute(base, `${other}/`, "")).toEqual({ name: "redirect", to: "/" });
  });
});

describe("parseRoute（base の渡し分け）", () => {
  it("渡した base だけが入口になる", () => {
    expect(parseRoute("/agenda", "/agenda/", "?room=R1")).toEqual({ name: "room", roomCode: "R1" });
    expect(parseRoute("/topic", "/agenda/", "?room=R1")).toEqual({
      name: "redirect",
      to: "/?room=R1",
    });
  });
});

describe("hubPathFor", () => {
  it("記号を含むルームコードは符号化した ?room= になる（玄関の読み方で読み戻す）", () => {
    const url = new URL(hubPathFor("朝会 a&b"), "http://x");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("room")).toBe("朝会 a&b");
    expect(url.searchParams.has(DEPARTURE_PARAM)).toBe(false);
  });

  it("抜けた理由は ?left= で運ぶ", () => {
    expect(hubPathFor("R1", "self")).toBe("/?room=R1&left=self");
    expect(hubPathFor("R1", "removed")).toBe("/?room=R1&left=removed");
  });

  it("理由が無ければ ?left= は付かない", () => {
    expect(hubPathFor("R1")).toBe("/?room=R1");
  });

  it("運ぶ理由の綴りは DEPARTURE_PARAM と一致する", () => {
    expect(DEPARTURE_PARAM).toBe("left");
  });
});
