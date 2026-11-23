import { describe, expect, it } from 'vitest';
import { escapeName, resultMarkdown } from '../src/result-markdown';

/**
 * @requirements #676（roulette の結果を Markdown でコピーして持ち出す）
 */
describe('resultMarkdown', () => {
  it('Given 1 回で決めて 1 人 / Then 決め方と選ばれた人が 1 行ずつ', () => {
    expect(resultMarkdown({ mode: 'once', names: ['あや'], seq: 1 })).toBe(
      ['## 進行役ルーレットの結果', '', '- 決め方：1 回で決める', '- 選ばれた人：あや'].join('\n'),
    );
  });

  it('Given 1 回で決めて 3 人 / Then 全員を止まった順の番号つきで書く（1 人にしない）', () => {
    expect(resultMarkdown({ mode: 'once', names: ['れん', 'あや', 'みお'], seq: 1 })).toBe(
      ['## 進行役ルーレットの結果', '', '- 決め方：1 回で決める', '- 選ばれた人：', '  1. れん', '  2. あや', '  3. みお'].join('\n'),
    );
  });

  it('Given 順番に回す回 / Then 決め方は順番に回す・順番は 1 番から並ぶ', () => {
    expect(resultMarkdown({ mode: 'order', names: ['れん', 'あや'], seq: 2 })).toBe(
      ['## 進行役ルーレットの結果', '', '- 決め方：順番に回す', '- 順番：', '  1. れん', '  2. あや'].join('\n'),
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
