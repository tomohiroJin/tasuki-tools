import { describe, expect, it } from "vitest";
import { adjustSegment } from "../src/edit.js";
import { formatClock, formatDuration, toMarkdown } from "../src/markdown.js";
import { autoStop, start, stop, toView } from "../src/track.js";
import type { TrackState } from "../src/types.js";
import { MIN, at, empty, must, sample } from "./support/states.js";

/** 日本時間（UTC+9） */
const JST = 540;
const markdownAt = (minutes: number, s: TrackState = sample()): string => {
  const view = toView(s, at(minutes));
  return toMarkdown(view, view.nowMs, JST);
};

describe("formatDuration", () => {
  it("h:mm で、1 分未満を切り捨てる", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59_999)).toBe("0:00");
    expect(formatDuration(60_000)).toBe("0:01");
    expect(formatDuration(72 * MIN + 59_000)).toBe("1:12");
    expect(formatDuration(10 * 60 * MIN)).toBe("10:00");
  });
});

describe("formatClock", () => {
  it("壁時計の時刻を、渡した時間帯の HH:MM にする", () => {
    // 2026-11-23 01:00 UTC = 10:00 JST
    expect(formatClock(Date.UTC(2026, 10, 23, 1, 0, 30), JST)).toBe("10:00");
    expect(formatClock(Date.UTC(2026, 10, 23, 1, 0, 30), 0)).toBe("01:00");
    expect(formatClock(Date.UTC(2026, 10, 23, 1, 0, 30), -300)).toBe("20:00");
  });
});

describe("toMarkdown", () => {
  it("表（作業名・合計・割合）と時系列の一覧を出す", () => {
    // sample(): 設計 0-10・実装 10-30・休憩 30-40・（隙間）・実装 50-（計測中）。壁時計は 10:00 JST 始まり
    expect(markdownAt(60)).toBe(
      [
        "## うちわけ（2026-11-23 10:00–11:00）",
        "",
        "| 作業 | 時間 | 割合 |",
        "|---|---:|---:|",
        "| 実装 | 0:30 | 75% |",
        "| 設計 | 0:10 | 25% |",
        "| 作業の合計 | 0:40 | |",
        "| 休憩 | 0:10 | |",
        "| 全体 | 0:50 | |",
        "",
        "時間は 1 分未満を切り捨てています。行を足しても合計と合わないことがあります。",
        "",
        "### 時系列",
        "",
        "- 10:00–10:10 設計",
        "- 10:10–10:30 実装",
        "- 10:30–10:40 休憩",
        "- 10:50– 実装（計測中）",
      ].join("\n"),
    );
  });
  it("割合は丸める前の値から計算し、整数に丸めて出す", () => {
    let s = must(start(empty(), { label: "A", kind: "work", now: at(0) }));
    s = must(start(s, { label: "B", kind: "work", now: at(0) + 100_000 }));
    s = must(stop(s, { now: at(0) + 300_000 }));
    // A は 100 秒（33.3%）、B は 200 秒（66.7%）
    const md = markdownAt(10, s);
    expect(md).toContain("| B | 0:03 | 67% |");
    expect(md).toContain("| A | 0:01 | 33% |");
    // 合計は丸める前の値から出す（1:40 + 3:20 = 5:00。行の 0:01 + 0:03 とは合わない）
    expect(md).toContain("| 作業の合計 | 0:05 | |");
  });
  it("名前なしは「（名前なし）」と出す", () => {
    const s = must(stop(must(start(empty(), { label: "", kind: "work", now: at(0) })), { now: at(3) }));
    const md = markdownAt(5, s);
    expect(md).toContain("| （名前なし） | 0:03 | 100% |");
    expect(md).toContain("- 10:00–10:03 （名前なし）");
  });
  it("全員の切断で閉じた区切りに印を添える", () => {
    const s = autoStop(sample(), { at: at(55) });
    expect(markdownAt(60, s)).toContain("- 10:50–10:55 実装（全員が離れたため自動で停止）");
  });
  it("作業名の記号を逃がし、表を崩さない", () => {
    const s = must(stop(must(start(empty(), { label: "a|b *強調* [x](y) `c` <i> #1 ~z~ \\", kind: "work", now: at(0) })), { now: at(2) }));
    const md = markdownAt(5, s);
    expect(md).toContain("| a\\|b \\*強調\\* \\[x\\](y) \\`c\\` \\<i\\> \\#1 \\~z\\~ \\\\ | 0:02 | 100% |");
  });
  it("作業名の下線を逃がす", () => {
    const s = must(stop(must(start(empty(), { label: "_強調_", kind: "work", now: at(0) })), { now: at(2) }));
    expect(markdownAt(5, s)).toContain("| \\_強調\\_ |");
  });
  it("日付をまたぐ記録は、見出しと時系列に日付を添える", () => {
    // 10:00 JST から 14 時間 30 分後 = 翌 00:30
    let s = must(start(empty(), { label: "夜の作業", kind: "work", now: at(13 * 60) }));
    s = must(start(s, { label: "深夜の作業", kind: "work", now: at(14 * 60 + 10) }));
    s = must(stop(s, { now: at(14 * 60 + 30) }));
    const md = markdownAt(14 * 60 + 30, s);
    expect(md).toContain("## うちわけ（2026-11-23 23:00–2026-11-24 00:30）");
    expect(md).toContain("- 11/23 23:00–11/24 00:10 夜の作業");
    expect(md).toContain("- 11/24 00:10–11/24 00:30 深夜の作業");
  });
  it("時間帯が変わると、同じ記録でも時刻の表記が変わる", () => {
    const view = toView(sample(), at(60));
    expect(toMarkdown(view, view.nowMs, 0)).toContain("## うちわけ（2026-11-23 01:00–02:00）");
  });
  it("時系列の時刻は切り捨てる（境界が ms でずれていても隣と食い違わない）", () => {
    const s = must(adjustSegment(sample(), { id: "g-1", edge: "end", atMs: 10 * MIN + 59_000, now: at(60) }));
    const md = markdownAt(60, s);
    expect(md).toContain("- 10:00–10:10 設計");
    expect(md).toContain("- 10:10–10:30 実装");
  });
  it("空の記録は、見出しと「まだ記録がありません」だけを出す", () => {
    expect(markdownAt(5, empty())).toBe(["## うちわけ", "", "まだ記録がありません。"].join("\n"));
  });
  it("休憩だけの記録でも表を出す（割合は空）", () => {
    const s = must(stop(must(start(empty(), { label: "", kind: "break", now: at(0) })), { now: at(15) }));
    const md = markdownAt(20, s);
    expect(md).toContain("| 作業の合計 | 0:00 | |");
    expect(md).toContain("| 休憩 | 0:15 | |");
  });
});
