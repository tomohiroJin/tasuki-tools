/**
 * 終了の一覧の Markdown（#676）。画面の一覧（`SummaryTable`）と同じ値を、同じ計算（`summaryOf`・`signedDuration`）から書く。
 */
import { describe, expect, it } from 'vitest';
import { summaryOf } from '@tasuki/agenda-core';
import { signedDuration, durationClock, clockStyleOf } from '../src/agenda-view';
import { summaryMarkdown } from '../src/summary-markdown';
import { Driver, MIN } from './support/agenda-states';

/** 2026-11-23 14:05（UTC+9）。日本時間の 14:05 は UTC の 05:05 */
const AT = { wallMs: Date.UTC(2026, 10, 23, 5, 5, 30), tzOffsetMin: 540 };

/** S1（1 分）を 1:30 かけ、S2（2 分）に +1 分して 2:40 かけ、S3（3 分）を飛ばして終えた */
const finished = (title?: string) => new Driver([1, 2, 3], title).skip('s-3').next(90_000).extend(1).next(250_000).view(250_000);

/**
 * @requirements #676
 */
describe('終了の一覧の Markdown', () => {
  it('Given 会の名前つきで終了 / When 書き出す / Then 見出し・会の名前・表（ステップごとと合計）になる', () => {
    expect(summaryMarkdown(finished('朝会'), AT).split('\n')).toEqual([
      '## 進行タイマー（2026-11-23 14:05）',
      '',
      '### 朝会',
      '',
      '| ステップ | 予定 | 追加 | かかった時間 | 予定より |',
      '|---|---:|---:|---:|---:|',
      '| S1 | 1 分 | | 1:30 | +0:30 |',
      '| S2 | 2 分 | +1 分 | 2:40 | +0:40 |',
      '| S3 | 3 分 | | スキップ | −3:00 |',
      '| 合計 | 6 分 | +1 分 | 4:10 | −1:50 |',
    ]);
  });

  it('Given 会の名前が空 / When 書き出す / Then 会の名前の行を出さない', () => {
    const text = summaryMarkdown(finished(''), AT);
    expect(text).not.toContain('### ');
    expect(text.split('\n').slice(0, 3)).toEqual(['## 進行タイマー（2026-11-23 14:05）', '', '| ステップ | 予定 | 追加 | かかった時間 | 予定より |']);
  });

  it('Given 終了 / When 書き出す / Then 差と合計は画面と同じ関数・同じ値（summaryOf・signedDuration）', () => {
    const v = finished('x');
    const s = summaryOf(v);
    const style = clockStyleOf(v);
    const text = summaryMarkdown(v, AT);
    expect(text).toContain(`| ${signedDuration(s.driftMs, style)} |`);
    for (const row of s.rows) expect(text).toContain(signedDuration(row.diffMs, style));
    expect(text).toContain(durationClock(s.rows[0]!.spentMs, style));
  });

  it('Given 押した行・巻いた行・ちょうどの行 / When 書き出す / Then 符号は + − と無印（0:00）', () => {
    // S1（1 分）を 1:10 で押し、S2（2 分）を 1:50 で巻き、S3（1 分）をちょうどで終える
    const v = new Driver([1, 2, 1]).next(70_000).next(180_000).next(240_000).view(240_000);
    const rows = summaryMarkdown(v, AT).split('\n').filter((l) => l.startsWith('| S'));
    expect(rows.map((l) => l.split('|').at(-2)!.trim())).toEqual(['+0:10', '−0:10', '0:00']);
  });

  it('Given ステップが 1 つ / When 書き出す / Then 行 1 つと合計', () => {
    const v = new Driver([5]).next(5 * MIN).view(5 * MIN);
    const lines = summaryMarkdown(v, AT).split('\n').filter((l) => l.startsWith('| '));
    expect(lines).toEqual([
      '| ステップ | 予定 | 追加 | かかった時間 | 予定より |',
      '| S1 | 5 分 | | 5:00 | 0:00 |',
      '| 合計 | 5 分 | | 5:00 | 0:00 |',
    ]);
  });

  it('Given くりかえし 2 回 / When 書き出す / Then 回の列が付き、各行がどの回か分かる', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 2);
    for (let i = 1; i <= 4; i++) d.next(i * 90_000);
    const v = d.view(4 * 90_000);
    expect(v.phase).toBe('finished');
    const lines = summaryMarkdown(v, AT).split('\n').filter((l) => l.startsWith('| '));
    expect(lines).toEqual([
      '| 回 | ステップ | 予定 | 追加 | かかった時間 | 予定より |',
      '| 1 回 | S1 | 1 分 | | 1:30 | +0:30 |',
      '| 1 回 | S2 | 1 分 | | 1:30 | +0:30 |',
      '| 2 回 | S1 | 1 分 | | 1:30 | +0:30 |',
      '| 2 回 | S2 | 1 分 | | 1:30 | +0:30 |',
      '| | 合計 | 4 分 | | 6:00 | +2:00 |',
    ]);
  });

  it('Given 長い会（予定の合計 180 分） / When 書き出す / Then 画面と同じ h:mm:ss', () => {
    const v = new Driver([120, 60]).next(125 * MIN).next(175 * MIN).view(175 * MIN);
    const text = summaryMarkdown(v, AT);
    expect(text).toContain('| S1 | 120 分 | | 2:05:00 | +0:05:00 |');
    expect(text).toContain('| 合計 | 180 分 | | 2:55:00 | −0:05:00 |');
  });

  it('Given 会の名前・ステップ名に | * # ` と改行 / When 書き出す / Then 表と見出しを壊さない', () => {
    const v = new Driver([1]).next(60_000).view(60_000);
    const evil = { ...v, title: '朝会 #1\n* 追記', steps: v.steps.map((s) => ({ ...s, name: 'a|b *c* `d` #e\nf' })) };
    const text = summaryMarkdown(evil, AT);
    const lines = text.split('\n');
    expect(lines).toContain('### 朝会 \\#1 \\* 追記');
    expect(lines).toContain('| a\\|b \\*c\\* \\`d\\` \\#e f | 1 分 | | 1:00 | 0:00 |');
    // 改行で行が増えない（見出し・空行・会の名前・空行・表の 4 行）
    expect(lines).toHaveLength(8);
  });

  it('Given 日をまたぐ時間帯 / When 日時を書く / Then 引数の時間帯で書く（端末の時間帯を読まない）', () => {
    const wallMs = Date.UTC(2026, 11, 31, 20, 0, 0);
    expect(summaryMarkdown(finished('x'), { wallMs, tzOffsetMin: 540 })).toContain('（2027-01-01 05:00）');
    expect(summaryMarkdown(finished('x'), { wallMs, tzOffsetMin: 0 })).toContain('（2026-12-31 20:00）');
  });
});

/**
 * @requirements #676
 */
describe('会の名前が空白だけ', () => {
  it('Given 会の名前が空白とタブだけ / When 書き出す / Then 空の見出し（###）を出さない', () => {
    const v = finished('');
    const text = summaryMarkdown({ ...v, title: ' \t ' }, AT);
    expect(text).not.toContain('###');
    expect(text.split('\n').slice(0, 3)).toEqual(['## 進行タイマー（2026-11-23 14:05）', '', '| ステップ | 予定 | 追加 | かかった時間 | 予定より |']);
  });
});
