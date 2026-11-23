import { describe, expect, it } from 'vitest';
import { escapeName, resultMarkdown as render, stampText, type RouletteResult } from '../src/result-markdown';

/** 2026-11-23 14:05（日本時間） */
const WALL = Date.UTC(2026, 10, 23, 5, 5, 59);
const HEAD = '## 進行役ルーレットの結果（2026-11-23 14:05）';
const resultMarkdown = (r: RouletteResult): string => render(r, WALL, 540);

/**
 * @requirements #676（roulette の結果を Markdown でコピーして持ち出す）
 */
describe('resultMarkdown', () => {
  it('Given 1 回で決めて 1 人 / Then 決め方と選ばれた人が 1 行ずつ', () => {
    expect(resultMarkdown({ mode: 'once', names: ['あや'], seq: 1 })).toBe(
      [HEAD, '', '- 決め方：1 回で決める', '- 選ばれた人：あや'].join('\n'),
    );
  });

  it('Given 1 回で決めて 3 人 / Then 全員を止まった順の番号つきで書く（1 人にしない）', () => {
    expect(resultMarkdown({ mode: 'once', names: ['れん', 'あや', 'みお'], seq: 1 })).toBe(
      [HEAD, '', '- 決め方：1 回で決める', '- 選ばれた人：', '  1. れん', '  2. あや', '  3. みお'].join('\n'),
    );
  });

  it('Given 順番に回す回 / Then 決め方は順番に回す・順番は 1 番から並ぶ', () => {
    expect(resultMarkdown({ mode: 'order', names: ['れん', 'あや'], seq: 2 })).toBe(
      [HEAD, '', '- 決め方：順番に回す', '- 順番：', '  1. れん', '  2. あや'].join('\n'),
    );
  });

  it('Given 順番に回す回で 1 番だけ / Then 1 人でも番号つきの並び', () => {
    expect(resultMarkdown({ mode: 'order', names: ['れん'], seq: 1 })).toContain('  1. れん');
  });

  it('Given 押して止める / Then 決め方は止めて決める', () => {
    expect(resultMarkdown({ mode: 'press', names: ['あや'], seq: 1 })).toContain('- 決め方：止めて決める');
  });
});

describe('escapeName', () => {
  it.each([
    ['a|b', 'a\\|b'],
    ['*強調*', '\\*強調\\*'],
    ['#見出し', '\\#見出し'],
    ['`code`', '\\`code\\`'],
    ['a_b', 'a\\_b'],
    ['[x](y)', '\\[x\\]\\(y\\)'],
    ['<b>', '\\<b\\>'],
    ['R&D', 'R\\&D'],
    ['1. 番号', '1\\. 番号'],
    ['2) 番号', '2\\) 番号'],
    ['- 箇条書き', '\\- 箇条書き'],
    ['+ 箇条書き', '\\+ 箇条書き'],
    ['a-b', 'a-b'],
    ['a\\b', 'a\\\\b'],
    ['a@b.c', 'a\\@b\\.c'],
  ])('Given %s / Then %s', (input, expected) => {
    expect(escapeName(input)).toBe(expected);
  });

  it('Given 改行・連続する空白 / Then 1 つの空白にして 1 行に保つ', () => {
    expect(escapeName('あや\n## 偽の見出し\r\n  - 項目')).toBe('あや \\#\\# 偽の見出し - 項目');
  });

  it('Given 名前に改行を含む結果 / Then 書き出しの行数が増えない', () => {
    const md = resultMarkdown({ mode: 'once', names: ['あや\n- 偽の項目'], seq: 1 });
    expect(md.split('\n')).toHaveLength(4);
  });

  it('Given 同じ名前の人が 2 人 / Then 画面と同じく呼び分けず、番号で別の人と分かる', () => {
    const md = resultMarkdown({ mode: 'once', names: ['あや', 'あや'], seq: 1 });
    expect(md).toContain('  1. あや\n  2. あや');
  });
});

describe('見出しの日時', () => {
  it.each([
    [Date.UTC(2026, 10, 23, 5, 5, 59), 540, '2026-11-23 14:05'],
    [Date.UTC(2026, 10, 23, 15, 0, 0), 540, '2026-11-24 00:00'],
    [Date.UTC(2026, 10, 23, 14, 59, 59), 540, '2026-11-23 23:59'],
    [Date.UTC(2026, 0, 1, 2, 30), -300, '2025-12-31 21:30'],
    [Date.UTC(2024, 1, 29, 23, 59), 0, '2024-02-29 23:59'],
    [Date.UTC(2024, 1, 29, 23, 59), 60, '2024-03-01 00:59'],
    [Date.UTC(1970, 0, 1, 0, 0), -1, '1969-12-31 23:59'],
  ])('Given %s・オフセット %s / Then %s', (wall, tz, expected) => {
    expect(stampText(wall, tz)).toBe(expected);
  });

  it('Given 同じ時刻 / Then 何度書き出しても同じ（時計を読まない）', () => {
    const r: RouletteResult = { mode: 'once', names: ['あや'], seq: 1 };
    expect(render(r, WALL, 540)).toBe(render(r, WALL, 540));
  });

  it('Given 時間帯だけ違う / Then 日付も時刻も変わる', () => {
    const r: RouletteResult = { mode: 'once', names: ['あや'], seq: 1 };
    expect(render(r, WALL, 0).split('\n')[0]).toBe('## 進行役ルーレットの結果（2026-11-23 05:05）');
  });
});
