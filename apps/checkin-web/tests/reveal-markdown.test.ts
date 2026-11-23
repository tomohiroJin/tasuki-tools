/**
 * 開いた結果の Markdown（#676・設計 §16）。画面の部品から切り離した純関数を試験する。
 *
 * @requirements #676（Check-in Cards の結果を Markdown でコピーして持ち出す）
 */
import { describe, expect, it } from 'vitest';
import type { PileView } from '@tasuki/checkin-core';
import { revealMarkdown } from '../src/reveal-markdown';

/** 2026-11-23 10:15:30 UTC。日本時間（+540 分）では 19:15 */
const AT = Date.UTC(2026, 10, 23, 10, 15, 30);
const JST = 540;

const named: PileView[] = [
  { card: 'sunny', count: 2, names: ['あや', 'ゆう'] },
  { card: 'cloudy', count: 1, names: ['はな'] },
  { card: 'rain', count: 0, names: [] },
  { card: 'thunder', count: 0, names: [] },
];
const anonymous: PileView[] = named.map(({ card, count }) => ({ card, count }));

describe('revealMarkdown', () => {
  it('Given 名前つきのチェックイン / Then 見出し・やり方・公開の仕方・山ごとの人数と名前・要約を書く', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'named', piles: named, nowMs: AT, tzOffsetMin: JST });
    expect(md.split('\n')).toEqual([
      '## チェックイン・チェックアウトの記録（2026-11-23 19:15）',
      '',
      '### チェックイン: 今日の天気',
      '',
      '公開の仕方: 名前つき',
      '',
      '- 晴れ: 2 人',
      '  - あや',
      '  - ゆう',
      '- くもり: 1 人',
      '  - はな',
      '- 雨: 0 人',
      '- 雷: 0 人',
      '',
      '晴れが 2 人',
    ]);
  });

  it('Given 匿名のチェックイン / Then 人数だけで、名前の行も名前の入る余地も無い', () => {
    const md = revealMarkdown({ method: 'busyness', visibility: 'anonymous', piles: [{ card: 'roomy', count: 1 }, { card: 'normal', count: 0 }, { card: 'packed', count: 0 }, { card: 'overflow', count: 0 }], nowMs: AT, tzOffsetMin: JST });
    expect(md).toContain('### チェックイン: いそがしさ');
    expect(md).toContain('公開の仕方: 匿名');
    expect(md).not.toMatch(/^ +- /m);
  });

  it('Given 匿名なのに山に名前が紛れ込んだ / Then 名前は 1 文字も出さない（画面と同じ粒度）', () => {
    const leaked: PileView[] = named; // 匿名の回の山は名前の鍵を持たないはず。持っていても書き出さない
    const md = revealMarkdown({ method: 'weather', visibility: 'anonymous', piles: leaked, nowMs: AT, tzOffsetMin: JST });
    for (const name of ['あや', 'ゆう', 'はな']) expect(md).not.toContain(name);
    expect(md).toContain('- 晴れ: 2 人');
  });

  it('Given チェックアウトの回 / Then 側の名前はチェックアウト', () => {
    const md = revealMarkdown({
      method: 'takeaway-done',
      visibility: 'named',
      piles: [{ card: 'yes', count: 1, names: ['あや'] }, { card: 'half', count: 0, names: [] }, { card: 'no', count: 0, names: [] }],
      nowMs: AT,
      tzOffsetMin: JST,
    });
    expect(md).toContain('### チェックアウト: ');
  });

  it('Given 数のやり方 / Then 札の名前に意味を添える（画面の山の下と同じ）', () => {
    const piles: PileView[] = ['1', '2', '3', '4', '5'].map((card) => ({ card, count: card === '4' ? 2 : 0 }));
    const md = revealMarkdown({ method: 'roti', visibility: 'anonymous', piles, nowMs: AT, tzOffsetMin: JST });
    expect(md).toContain('- 4（得るものが多かった）: 2 人');
    expect(md).toContain('- 1（時間のむだ）: 0 人');
    expect(md.split('\n').at(-1)).toBe('いちばん多いのは 4');
  });

  it('Given 全員が出していない / Then 要約は「出した人はいません」', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'anonymous', piles: anonymous.map((p) => ({ ...p, count: 0 })), nowMs: AT, tzOffsetMin: JST });
    expect(md.split('\n').at(-1)).toBe('出した人はいません');
  });

  it('Given サーバーが山を札の順に並べない / Then 画面と同じ札の定義の順で書く', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'anonymous', piles: [...anonymous].reverse(), nowMs: AT, tzOffsetMin: JST });
    const order = md.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.split(':')[0]);
    expect(order).toEqual(['- 晴れ', '- くもり', '- 雨', '- 雷']);
  });

  it('Given 同名の人が 2 人 / Then 2 行とも書く（画面の小札と同じ）', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'named', piles: [{ card: 'sunny', count: 2, names: ['あや', 'あや'] }], nowMs: AT, tzOffsetMin: JST });
    expect(md.split('\n').filter((l) => l === '  - あや')).toHaveLength(2);
  });

  it('Given 記号・改行・バッククォートを含む名前 / Then 行や表を壊さないよう逃がす', () => {
    const md = revealMarkdown({
      method: 'weather',
      visibility: 'named',
      piles: [{ card: 'sunny', count: 4, names: ['a|b', '**太字**', '# 見出し\n- 偽の行', '`code` x'] }],
      nowMs: AT,
      tzOffsetMin: JST,
    });
    const lines = md.split('\n');
    expect(lines).toContain('  - a\\|b');
    expect(lines).toContain('  - \\*\\*太字\\*\\*');
    expect(lines).toContain('  - \\# 見出し - 偽の行');
    expect(lines).toContain('  - \\`code\\` x');
    // 改行で行が増えない（名前 4 つ分の行だけ）
    expect(lines.filter((l) => l.startsWith('  - '))).toHaveLength(4);
  });

  it('Given 先頭が - や数字の名前 / Then 入れ子の箇条書きに読まれない', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'named', piles: [{ card: 'sunny', count: 2, names: ['- x', '1. y'] }], nowMs: AT, tzOffsetMin: JST });
    expect(md).toContain('  - \\- x');
    expect(md).toContain('  - 1\\. y');
  });

  it('Given 日付をまたぐ時間帯 / Then 時間帯の日付と時刻で書く（時刻は引数で渡す）', () => {
    const md = revealMarkdown({ method: 'weather', visibility: 'anonymous', piles: anonymous, nowMs: Date.UTC(2026, 11, 31, 23, 5), tzOffsetMin: JST });
    expect(md.split('\n')[0]).toBe('## チェックイン・チェックアウトの記録（2027-01-01 08:05）');
  });
});
