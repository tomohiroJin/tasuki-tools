import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, csvFileName, csvField, toCsv } from "../src/csv.js";
import { start, stop, toView } from "../src/track.js";
import type { TrackView } from "../src/types.js";
import { MIN, at, empty, must, sample } from "./support/states.js";

/** 日本時間（UTC+9） */
const JST = 540;
const BOM = "﻿";

const csvAt = (minutes: number, tz = JST): string => {
  const view = toView(sample(), at(minutes));
  return toCsv(view, view.nowMs, tz);
};
const linesOf = (csv: string): string[] => csv.replace(BOM, "").split("\r\n");

/** 作業名だけを変えた 1 区切りの写し */
const viewWithLabel = (label: string): TrackView => {
  const s = must(stop(must(start(empty(), { label, kind: "work", now: at(0) })), { now: at(1) }));
  return toView(s, at(1));
};

describe("toCsv", () => {
  it("UTF-8 の BOM で始まり、見出しの行を 1 行目に置く", () => {
    const csv = csvAt(60);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(linesOf(csv)[0]).toBe(CSV_COLUMNS.join(","));
    expect(CSV_COLUMNS.join(",")).toBe("date,start,end,minutes,kind,label,auto_closed");
  });

  it("1 区切り = 1 行。日付と時刻は渡した時間帯で、分は小数 2 桁", () => {
    const lines = linesOf(csvAt(60));
    expect(lines.slice(1, 5)).toEqual([
      "2026-11-23,10:00,10:10,10.00,work,設計,false",
      "2026-11-23,10:10,10:30,20.00,work,実装,false",
      "2026-11-23,10:30,10:40,10.00,break,,false",
      // 計測中の区切りは書き出す時点（60 分）で切る
      "2026-11-23,10:50,11:00,10.00,work,実装,false",
    ]);
  });

  it("行の区切りは CRLF で、最後の行にも付く（RFC 4180）", () => {
    const csv = csvAt(60);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("時間帯を変えると日付も時刻も変わる", () => {
    expect(linesOf(csvAt(60, 0))[1]).toBe("2026-11-23,01:00,01:10,10.00,work,設計,false");
    // 10:00 JST は、UTC-10 では前日の 15:00
    expect(linesOf(csvAt(60, -600))[1]).toBe("2026-11-22,15:00,15:10,10.00,work,設計,false");
  });

  it("計測中の区切りを書き出す時点で切り、分は小数 2 桁へ丸める", () => {
    const view = toView(sample(), at(50.5));
    const lines = linesOf(toCsv(view, view.nowMs, JST));
    expect(lines[4]).toBe("2026-11-23,10:50,10:50,0.50,work,実装,false");
  });

  it("全員の切断で閉じた区切りに印を付ける", () => {
    const view: TrackView = {
      ...toView(sample(), at(60)),
      segments: [{ id: "g-1", kind: "work", label: "x", startMs: 0, endMs: 5 * MIN, autoClosed: true }],
    };
    expect(linesOf(toCsv(view, 60 * MIN, JST))[1]).toBe("2026-11-23,10:00,10:05,5.00,work,x,true");
  });

  it("記録が無ければ見出しだけ", () => {
    const view = toView(empty(), at(0));
    expect(toCsv(view, view.nowMs, JST)).toBe(`${BOM}${CSV_COLUMNS.join(",")}\r\n`);
  });

  it("作業名の , \" を含む値は引用符で囲み、引用符は二重にする", () => {
    const lines = linesOf(toCsv(viewWithLabel('a,"b"'), 1 * MIN, JST));
    expect(lines[1]).toBe('2026-11-23,10:00,10:01,1.00,work,"a,""b""",false');
  });

  it("作業名が数式として読まれる字で始まるときは、先頭に ' を付ける", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      const lines = linesOf(toCsv(viewWithLabel(`${lead}SUM(A1)`), 1 * MIN, JST));
      expect(lines[1]).toContain(`,work,'${lead}SUM(A1),`);
    }
  });

  it("途中に = があるだけの作業名は変えない", () => {
    expect(linesOf(toCsv(viewWithLabel("a=b"), 1 * MIN, JST))[1]).toContain(",work,a=b,");
  });
});

describe("csvField", () => {
  it("タブ・CR で始まる値も無害化し、改行を含む値は引用符で囲む", () => {
    expect(csvField("\tx")).toBe("'\tx");
    expect(csvField("\rx")).toBe('"\'\rx"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("a\r\nb")).toBe('"a\r\nb"');
  });

  it("ふつうの値はそのまま", () => {
    expect(csvField("設計")).toBe("設計");
    expect(csvField("")).toBe("");
    expect(csvField("a b")).toBe("a b");
  });

  it("無害化は引用符の囲みより先に効く（囲んでも先頭は ' になる）", () => {
    expect(csvField("=a,b")).toBe("\"'=a,b\"");
  });
});

describe("csvFileName", () => {
  it("track-YYYYMMDD-HHMM.csv を、渡した時間帯で作る", () => {
    const wall = Date.UTC(2026, 10, 23, 1, 5, 59);
    expect(csvFileName(wall, JST)).toBe("track-20261123-1005.csv");
    expect(csvFileName(wall, 0)).toBe("track-20261123-0105.csv");
  });
});
