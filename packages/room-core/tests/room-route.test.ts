/**
 * ルームの URL の解析と玄関への道（#470・#463-C1・`docs/adr/0018`）。
 *
 * agenda / checkin / roulette / topic の 4 アプリが同じ形の `router.ts` を持っていたものを
 * ここへ寄せた。**入力と期待は寄せる前の 4 アプリのテストの表**と、境界の例（手で足した）である。
 * 期待は実装の写しではなく、URL として何が正しいかを文字列で書く。
 */
import { describe, it, expect } from "vitest";
import { parseRoomRoute, roomHubPath } from "../src/room-route.js";
import { DEPARTURE_PARAM } from "../src/departure.js";

const BASES = ["/agenda", "/checkin", "/roulette", "/topic"] as const;

describe.each(BASES)("parseRoomRoute（base = %s）", (base) => {
  it("玄関の札の URL はそのルームの画面になる", () => {
    expect(parseRoomRoute(base, `${base}/`, "?room=R1")).toEqual({ name: "room", roomCode: "R1" });
  });

  it("末尾スラッシュの無い base 直下でもそのルームの画面になる", () => {
    expect(parseRoomRoute(base, base, "?room=R1")).toEqual({ name: "room", roomCode: "R1" });
  });

  it("日本語を含むルームコードは復号したコードで入る", () => {
    // Given: 日本語を含むルームコードの検索文字列
    const search = `?room=${encodeURIComponent("朝会モブ-a1b2")}`;
    // When
    const route = parseRoomRoute(base, `${base}/`, search);
    // Then
    expect(route).toEqual({ name: "room", roomCode: "朝会モブ-a1b2" });
  });

  it("他のクエリが混じっていても room だけを読む", () => {
    expect(parseRoomRoute(base, `${base}/`, "?x=1&room=R1&left=self")).toEqual({
      name: "room",
      roomCode: "R1",
    });
  });

  it("ルームコードの無い URL は玄関へ送り返す", () => {
    // Given: コードの無い 4 通り（空・省略・空のコード・別のキー）
    const searches = ["", undefined, "?room=", "?other=R1"];
    // When
    const routes = searches.map((search) => parseRoomRoute(base, `${base}/`, search));
    // Then
    expect(routes).toEqual(searches.map(() => ({ name: "redirect", to: "/" })));
  });

  it("知らない下位パスは玄関へ送り返す", () => {
    expect(parseRoomRoute(base, `${base}/room/R1`, "")).toEqual({ name: "redirect", to: "/" });
  });

  it("ルームコードの付いた知らない下位パスはコードを保って玄関のそのルームへ送る", () => {
    // Given: 記号を含むコードと、知らない下位パス 2 通り
    const search = `?room=${encodeURIComponent("朝会 a&b")}`;
    // When
    const withSymbols = parseRoomRoute(base, `${base}/x`, search);
    const nested = parseRoomRoute(base, `${base}/room/R1/`, "?room=R1");
    // Then
    expect(withSymbols).toEqual({ name: "redirect", to: "/?room=%E6%9C%9D%E4%BC%9A+a%26b" });
    expect(nested).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("base で始まっても別の語になるパスは入口ではない（base 直後がスラッシュ以外）", () => {
    expect(parseRoomRoute(base, `${base}x`, "?room=R1")).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("base と大文字小文字が違うパスは入口ではない", () => {
    // Given: 大文字にした同じ綴りのパス
    const upper = `/${base.slice(1).toUpperCase()}/`;
    // When
    const route = parseRoomRoute(base, upper, "?room=R1");
    // Then
    expect(route).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("別のアプリの base 配下は入口ではない（base 長で切ると残りが空やスラッシュになる組で突く）", () => {
    // 同じ長さの別の語。base.length で切ると rest が '' や '/' になり、入口と取り違える
    // Given
    const sameLen = "/" + "q".repeat(base.length - 1);
    // When
    const bare = parseRoomRoute(base, sameLen, "?room=R1");
    const slashed = parseRoomRoute(base, `${sameLen}/`, "?room=R1");
    // Then
    expect(bare).toEqual({ name: "redirect", to: "/?room=R1" });
    expect(slashed).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it("base の末尾スラッシュの有無は結果を変えない", () => {
    // Given: 末尾スラッシュ付きの base
    const withSlash = `${base}/`;
    // When
    const entry = parseRoomRoute(withSlash, `${base}/`, "?room=R1");
    const unknown = parseRoomRoute(withSlash, `${base}/x`, "");
    // Then
    expect(entry).toEqual({ name: "room", roomCode: "R1" });
    expect(unknown).toEqual({ name: "redirect", to: "/" });
  });
});

describe("parseRoomRoute（base の渡し分け）", () => {
  it("渡した base だけが入口になる（長さが同じ別の base で突く）", () => {
    // Given: base は /topic。/agend は同じ長さの別の語
    // When
    const own = parseRoomRoute("/topic", "/topic/", "?room=R1");
    const otherSlashed = parseRoomRoute("/topic", "/agend/", "?room=R1");
    const otherBare = parseRoomRoute("/topic", "/agend", "?room=R1");
    // Then
    expect(own).toEqual({ name: "room", roomCode: "R1" });
    expect(otherSlashed).toEqual({ name: "redirect", to: "/?room=R1" });
    expect(otherBare).toEqual({ name: "redirect", to: "/?room=R1" });
  });

  it.each(["", "/", "//"])("base が %j のときは玄関自身を入口と誤判定しない", (emptyBase) => {
    // Given: 置き場の無い base（設定ミス）。玄関の札 /?room=X がそのまま来る
    // When
    const hub = parseRoomRoute(emptyBase, "/", "?room=R1");
    const sub = parseRoomRoute(emptyBase, "/anything", "");
    // Then: 入口（room）にならず、玄関へ送る
    expect(hub).toEqual({ name: "redirect", to: "/?room=R1" });
    expect(sub).toEqual({ name: "redirect", to: "/" });
  });
});

describe("roomHubPath", () => {
  it("記号を含むルームコードは符号化した ?room= になる（玄関の読み方で読み戻す）", () => {
    // Given / When
    const url = new URL(roomHubPath("朝会 a&b"), "http://x");
    // Then
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("room")).toBe("朝会 a&b");
    expect(url.searchParams.has(DEPARTURE_PARAM)).toBe(false);
  });

  it("抜けた理由は ?left= で運ぶ", () => {
    expect(roomHubPath("R1", "self")).toBe("/?room=R1&left=self");
    expect(roomHubPath("R1", "removed")).toBe("/?room=R1&left=removed");
  });

  it("理由が無ければ ?left= は付かない", () => {
    expect(roomHubPath("R1")).toBe("/?room=R1");
  });
});
