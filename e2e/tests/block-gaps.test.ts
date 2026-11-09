/**
 * 隣り合うブロックの重なりと間の判定（`support/block-gaps.ts`・#557）。
 *
 * ブラウザが要るのは箱を集める `collectBlocks` だけで、判定（`findBlockProblems`）は純関数にしてある。
 * ここで固定するのは 2 つ。
 *   - **本物の崩れは赤にする**: 間 0・重なり・詰まった段落（一覧 #1・#3 の型）
 *   - **偽陽性の規則は、除く範囲を広げすぎない**: 貼りつく帯・変形・字を切る面などを除くが、除くのは性質に当たる子だけで、
 *     その隣の子まで測らなくならない（規則を広げすぎると、検査が黙って何も測らなくなる）
 */
import { describe, expect, it } from 'vitest';
import { findBlockProblems, type BlockNode } from '../support/block-gaps';

/** ADR 0035 決定 2 の値（`--space-2` ＝ 0.5rem ＝ 8px・`--space-1` ＝ 4px）。**定数を import せず値を直書きする**（下限の定数を緩める変異に、テストが一緒に動いて緑になるのを防ぐ） */
const SPACE_2 = 8;
const SPACE_1 = 4;

let nextId = 0;

/** 箱を 1 つ作る。座標は (left, top, 幅, 高さ)。既定は流れの中の、箱を持つ（字だけでない）ブロック。 */
function box(parent: number, left: number, top: number, width: number, height: number, over: Partial<BlockNode> = {}): BlockNode {
  nextId += 1;
  return {
    id: nextId, parent, path: `div#${String(nextId)}`,
    left, top, right: left + width, bottom: top + height,
    position: 'static', display: 'block', transformed: false, truncates: false,
    textOnly: false, lines: 0, ink: { left, top, right: left + width, bottom: top + height },
    tag: 'div', role: '', ruledTop: false, ruledBottom: false,
    ...over,
  };
}

/** 字だけの要素（`lines` 行）。字の矩形は箱から上下に `slack` ずつ内側へ寄る。 */
function text(parent: number, left: number, top: number, width: number, height: number, lines: number, over: Partial<BlockNode> = {}, slack = 0): BlockNode {
  return box(parent, left, top, width, height, {
    textOnly: true, lines, ink: { left, top: top + slack, right: left + width, bottom: top + height - slack }, ...over,
  });
}

describe('隣り合うブロックの重なりと間', () => {
  it('Given 縦に積んだ 2 つの箱の間が 0 / When 判定する / Then 間の不足として出る（一覧 #1 の型）', () => {
    const problems = findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40, 300, 40)]);
    expect(problems.map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given 縦に積んだ 2 つの箱の間がちょうど下限 / When 判定する / Then 出ない', () => {
    expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40 + SPACE_2, 300, 40)])).toEqual([]);
  });

  it('Given 2 つの箱の間が下限より 1px 短い / When 判定する / Then 出る（境の 1 つずれ）', () => {
    // 下限の許容は 0.5px（丸め）なので、1px 短ければ出る
    const problems = findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40 + SPACE_2 - 1, 300, 40)]);
    expect(problems.map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given 2 つの箱が 10px 重なる / When 判定する / Then 重なりとして出る', () => {
    const problems = findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 30, 300, 40)]);
    expect(problems.map((p) => p.kind)).toEqual(['overlap']);
  });

  it('Given 親が違う 2 つの箱が重なる / When 判定する / Then 出ない（同じ親の子どうしだけを見る）', () => {
    expect(findBlockProblems([box(0, 0, 0, 300, 40), box(1, 0, 30, 300, 40)])).toEqual([]);
  });

  it('Given 横に並んだ 2 つの箱（縦の範囲は同じ） / When 判定する / Then 出ない', () => {
    expect(findBlockProblems([box(0, 0, 0, 100, 40), box(0, 110, 0, 100, 40)])).toEqual([]);
  });

  it('Given 横に並んだ 2 つの箱が横に重なる / When 判定する / Then 重なりとして出る', () => {
    expect(findBlockProblems([box(0, 0, 0, 100, 40), box(0, 90, 0, 100, 40)]).map((p) => p.kind)).toEqual(['overlap']);
  });

  describe('偽陽性を除く規則', () => {
    it('Given 貼りつく帯（fixed・sticky）が中身に重なる / When 判定する / Then 出ない。ただしその隣の中身どうしは測る', () => {
      for (const position of ['fixed', 'sticky']) {
        expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 20, 300, 40, { position })])).toEqual([]);
      }
      // 帯を除いても、残った 2 つの間が 0 なら出る（規則が親ごと除いていない）
      const problems = findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40, 300, 40), box(0, 0, 20, 300, 40, { position: 'fixed' })]);
      expect(problems.map((p) => p.kind)).toEqual(['gap']);
    });

    it('Given 流れの外（absolute）の部品が重なる / When 判定する / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 250, 10, 60, 60, { position: 'absolute' })])).toEqual([]);
    });

    it('Given 変形した部品（傾けた札・浮き上がり）が重なる / When 判定する / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 30, 300, 40, { transformed: true })])).toEqual([]);
    });

    it('Given 字を切る面（省略・行数の上限）の箱が隣に食い込む / When 判定する / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 30, 300, 40, { truncates: true })])).toEqual([]);
    });

    it('Given 高さが 2px 未満の線 / When 判定する / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40, 300, 1)])).toEqual([]);
    });

    it('Given 表の行（display: table-row） / When 間が 0 / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40, { display: 'table-row' }), box(0, 0, 40, 300, 40, { display: 'table-row' })])).toEqual([]);
    });

    it('Given 左右の枠が無く下だけ罫線のある行 / When 間が 0 / Then 出ない。罫線の無い箱どうしの 0 は出る', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40, { ruledBottom: true }), box(0, 0, 40, 300, 40)])).toEqual([]);
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40, 300, 40, { ruledTop: true })])).toEqual([]);
      expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 40, 300, 40)]).map((p) => p.kind)).toEqual(['gap']);
    });

    it('Given タブの帯が下の面に接する / When 間が 0 / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40, { role: 'tablist' }), box(0, 0, 40, 300, 100)])).toEqual([]);
    });

    it('Given 折り返した inline の字（行をまたぐ外接の矩形が隣と重なる） / When 判定する / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 300, 40, { display: 'inline' }), box(0, 0, 20, 300, 40, { display: 'inline' })])).toEqual([]);
    });

    it('Given 文の中の箱（display: inline-*） / When 間が 0 / Then 出ない', () => {
      expect(findBlockProblems([box(0, 0, 0, 100, 40, { display: 'inline-flex' }), box(0, 0, 40, 100, 40, { display: 'inline-flex' })])).toEqual([]);
    });
  });

  describe('字の行', () => {
    it('Given 1 行の字どうしが詰まって並ぶ（名前 → 意味） / When 判定する / Then 間は測らない', () => {
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), text(0, 0, 20, 100, 20, 1)])).toEqual([]);
    });

    it('Given 字の行の箱どうしが行の高さの余白で食い込む（字そのものは離れている） / When 判定する / Then 出ない', () => {
      // 箱は 6px 重なるが、字は 4px ずつ内側（8px の間）。行の高さの余白どうしの食い込みは重なりではない
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1, {}, 4), text(0, 0, 14, 100, 20, 1, {}, 4)])).toEqual([]);
    });

    it('Given 字の矩形が字の高さの 1/4 以下だけ食い込む（行の高さより字の枠が広い） / When 判定する / Then 出ない', () => {
      // 字の枠は 20px。2px の食い込みは行の高さの余白で、字は接していない
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), text(0, 0, 18, 100, 20, 1)])).toEqual([]);
    });

    it('Given 字そのものが半分以上重なる / When 判定する / Then 重なりとして出る（字が潰れる崩れは見逃さない）', () => {
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), text(0, 0, 8, 100, 20, 1)]).map((p) => p.kind)).toEqual(['overlap']);
    });

    it('Given 段落（p・2 行以上）どうしの間が 3.2px / When 判定する / Then 間の不足として出る（一覧 #3 の型）', () => {
      const p = (top: number) => text(0, 0, top, 300, 40, 2, { tag: 'p' });
      expect(findBlockProblems([p(0), p(43.2)]).map((x) => x.kind)).toEqual(['gap']);
      expect(findBlockProblems([p(0), p(40 + SPACE_2)])).toEqual([]);
    });

    it('Given 字と箱が詰まる / When 判定する / Then 字の端か箱の間の大きいほうが下限（4px）を下回れば出る', () => {
      // 見出し（字）の下に箱が 0px で続く
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), box(0, 0, 20, 300, 40)]).map((x) => x.kind)).toEqual(['gap']);
      // 下限ちょうどは出ない
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), box(0, 0, 20 + SPACE_1, 300, 40)])).toEqual([]);
      // 箱の間は 0 でも、字の枠の余白（padding）で字の端が 6px 離れていれば出ない
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1, {}, 6), box(0, 0, 20, 300, 40)])).toEqual([]);
    });

    it('Given 一覧の行（li）どうしが 4px / When 判定する / Then 出ない。0 は出る', () => {
      const li = (top: number) => box(0, 0, top, 300, 40, { tag: 'li', display: 'list-item' });
      expect(findBlockProblems([li(0), li(44)])).toEqual([]);
      expect(findBlockProblems([li(0), li(40)]).map((x) => x.kind)).toEqual(['gap']);
    });
  });
});
