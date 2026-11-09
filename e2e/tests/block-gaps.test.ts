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
import { classifyTextOnly, findBlockProblems, type BlockNode, type RawBlockNode } from '../support/block-gaps';

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
    tag: 'div', role: '', ruledTop: false, ruledBottom: false, parentWidth: 1000,
    visTop: top, visBottom: top + height,
    ...over,
  };
}

/** 字だけの要素（`lines` 行）。字の矩形は箱から上下に `slack` ずつ内側へ寄る。 */
function text(parent: number, left: number, top: number, width: number, height: number, lines: number, over: Partial<BlockNode> = {}, slack = 0): BlockNode {
  return box(parent, left, top, width, height, {
    textOnly: true, lines, ink: { left, top: top + slack, right: left + width, bottom: top + height - slack }, ...over,
  });
}

/** ブラウザから集めた生の要素（textOnly の前）。座標は (left, top, 幅, 高さ)。 */
function raw(id: number, parent: number, tag: string, top: number, height: number, over: Partial<RawBlockNode> = {}): RawBlockNode {
  return {
    id, parent, path: `${tag}#${String(id)}`,
    left: 0, top, right: 300, bottom: top + height,
    position: 'static', display: 'block', transformed: false, truncates: false,
    lines: 1, ink: { left: 0, top, right: 300, bottom: top + height },
    tag, role: '', ruledTop: false, ruledBottom: false, parentWidth: 1000, paints: false,
    visTop: top, visBottom: top + height,
    ...over,
  };
}

describe('字だけの判定（許可リスト）', () => {
  const textOnlyOf = (nodes: RawBlockNode[]) => Object.fromEntries(classifyTextOnly(nodes).map((n) => [n.id, n.textOnly]));

  it('Given 字の入るブロック（p・h2・label・li・dt・dd）と inline の字 / When 判定する / Then 字だけ', () => {
    const t = textOnlyOf([raw(1, -1, 'p', 0, 20), raw(2, -1, 'h2', 30, 20), raw(3, -1, 'label', 60, 20), raw(4, -1, 'li', 90, 20), raw(5, -1, 'dt', 120, 20), raw(6, -1, 'dd', 150, 20), raw(7, 1, 'span', 0, 20, { display: 'inline' })]);
    expect(Object.values(t).every(Boolean)).toBe(true);
  });

  it('Given 字を中に持つ button・a・input・textarea・select・img・svg / When 判定する / Then どれも箱（字だけではない）', () => {
    for (const tag of ['button', 'a', 'input', 'textarea', 'select', 'img', 'svg', 'summary', 'canvas']) {
      expect(textOnlyOf([raw(1, -1, tag, 0, 20)])[1], tag).toBe(false);
    }
  });

  it('Given 背景・枠・影を塗る p や span（paints） / When 判定する / Then 箱。その親も字だけではない', () => {
    const t = textOnlyOf([raw(1, -1, 'p', 0, 40), raw(2, 1, 'span', 0, 20, { paints: true })]);
    expect(t[2]).toBe(false);
    expect(t[1]).toBe(false);
  });

  it('Given div（札・コンテナ）の中に button がある / When 判定する / Then div も箱。中が inline の字だけの div は字だけ', () => {
    expect(textOnlyOf([raw(1, -1, 'div', 0, 40), raw(2, 1, 'button', 0, 20)])[1]).toBe(false);
    expect(textOnlyOf([raw(1, -1, 'div', 0, 40), raw(2, 1, 'span', 0, 20, { display: 'inline' })])[1]).toBe(true);
    // div の中に div（入れ物）があれば字の行ではない
    expect(textOnlyOf([raw(1, -1, 'div', 0, 40), raw(2, 1, 'div', 0, 20)])[1]).toBe(false);
  });

  it('Given 字だけの p の中に a（リンク） / When 判定する / Then p は箱（押せるものを中に持つ）', () => {
    expect(textOnlyOf([raw(1, -1, 'p', 0, 40), raw(2, 1, 'a', 0, 20, { display: 'inline' })])[1]).toBe(false);
  });
});

describe('許可リストにした後の本物の崩れ（レビューで素通りした型）', () => {
  it('Given ボタン（button）どうしの間が 0 / When 判定する / Then 間の不足として出る（poker の手札の 2 段）', () => {
    const nodes = classifyTextOnly([raw(1, -1, 'button', 0, 40), raw(2, -1, 'button', 40, 40)]);
    expect(findBlockProblems(nodes).map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given ラベル（label）と入力（input）の間が 0 / When 判定する / Then 間の不足として出る（landing の欄）', () => {
    const nodes = classifyTextOnly([raw(1, -1, 'label', 0, 20), raw(2, -1, 'input', 20, 44)]);
    expect(findBlockProblems(nodes).map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given 見出し（h2）に button が箱で重なる / When 判定する / Then 重なりとして出る（見出しの行）', () => {
    const nodes = classifyTextOnly([raw(1, -1, 'h2', 0, 30, { right: 200 }), raw(2, -1, 'button', 0, 44, { left: 172, right: 300 })]);
    expect(findBlockProblems(nodes).map((p) => p.kind)).toEqual(['overlap']);
  });
});

describe('字の組・変形の子孫・塗らない入れ物', () => {
  it('Given 名前 → 意味・値 → ラベル（span・div・dt・dd の 1 行の字）が間 0 / When 判定する / Then 測らない（詰めた組）。p・h2 なら測る', () => {
    for (const tag of ['span', 'div', 'dt', 'dd']) {
      expect(findBlockProblems([text(0, 0, 0, 300, 24, 1, { tag }), text(0, 0, 24, 300, 24, 1, { tag })]), tag).toEqual([]);
    }
    expect(findBlockProblems([text(0, 0, 0, 300, 24, 1, { tag: 'h2' }), text(0, 0, 24, 300, 24, 1, { tag: 'p' })]).map((x) => x.kind)).toEqual(['gap']);
  });

  it('Given 変形した部品の子孫（3D の回転で射影された札の中）が詰まる / When 判定する / Then 測らない。変形の外の兄弟は測る', () => {
    const card = box(0, 0, 0, 300, 200, { transformed: true });
    const inner = [text(card.id, 0, 0, 300, 24, 1, { tag: 'p' }), text(card.id, 0, 24, 300, 24, 1, { tag: 'p' })];
    expect(findBlockProblems([card, ...inner])).toEqual([]);
    // 変形していない親の下なら同じ配置が出る
    const plain = box(0, 0, 0, 300, 200);
    expect(findBlockProblems([plain, text(plain.id, 0, 0, 300, 24, 1, { tag: 'p' }), text(plain.id, 0, 24, 300, 24, 1, { tag: 'p' })]).map((x) => x.kind)).toEqual(['gap']);
  });

  it('Given 塗らない入れ物（padding 16px）の上に見出しが接する / When 判定する / Then 入れ物の padding は間に数える。塗る箱なら数えない', () => {
    const heading = text(0, 0, 0, 300, 24, 1, { tag: 'h3' });
    expect(findBlockProblems([heading, box(0, 0, 24, 300, 100, { visTop: 24 + 16 })])).toEqual([]);
    expect(findBlockProblems([heading, box(0, 0, 24, 300, 100)]).map((x) => x.kind)).toEqual(['gap']);
  });
});

describe('負の間・1 行の字どうし・sticky の脇の欄', () => {
  it('Given 箱が 0.3px だけ食い込む（重なりの許容の内）/ When 判定する / Then 間が負として出る', () => {
    const problems = findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 39.7, 300, 40)]);
    expect(problems.map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given 字の矩形の 1/4 以内に収まる箱の食い込み（字どうし）/ When 判定する / Then 箱の間が負なら間の不足として出る', () => {
    // 字の矩形は離れている（重なりではない）が、箱は 3px 食い込む。段落どうしが接する崩れ
    const a = text(0, 0, 0, 300, 20, 1, { tag: 'p' }, 4);
    const b = text(0, 0, 17, 300, 20, 1, { tag: 'p' }, 4);
    expect(findBlockProblems([a, b]).map((p) => p.kind)).toEqual(['gap']);
  });

  it('Given 1 行の段落（p）どうしが間 0 / When 判定する / Then 4px 未満として出る（短い段落の退行を見逃さない）', () => {
    const p = (top: number) => text(0, 0, top, 300, 24, 1, { tag: 'p' });
    expect(findBlockProblems([p(0), p(24)]).map((x) => x.kind)).toEqual(['gap']);
    expect(findBlockProblems([p(0), p(24 + SPACE_1)])).toEqual([]);
  });

  it('Given 見出し（h2）と 1 行の段落（p）が間 0 / When 判定する / Then 出る', () => {
    expect(findBlockProblems([text(0, 0, 0, 300, 24, 1, { tag: 'h2' }), text(0, 0, 24, 300, 24, 1, { tag: 'p' })]).map((x) => x.kind)).toEqual(['gap']);
  });

  it('Given 横に長い sticky の帯（親の幅とほぼ同じ） / When 兄弟に重なる / Then 出ない', () => {
    expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 20, 1000, 40, { position: 'sticky', parentWidth: 1000 })])).toEqual([]);
  });

  it('Given sticky の脇の欄（親より狭い）が主の欄に重なる / When 判定する / Then 重なりとして出る', () => {
    expect(findBlockProblems([box(0, 0, 0, 600, 400), box(0, 500, 0, 300, 400, { position: 'sticky', parentWidth: 1000 })]).map((p) => p.kind)).toEqual(['overlap']);
  });

  it('Given fixed の部品 / When 兄弟に重なる / Then 出ない（幅に関わらず）', () => {
    expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 20, 100, 40, { position: 'fixed', parentWidth: 1000 })])).toEqual([]);
  });
});

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
        // 帯は親の幅いっぱい（sticky は親の幅とほぼ同じのときだけ帯）
        expect(findBlockProblems([box(0, 0, 0, 300, 40), box(0, 0, 20, 1000, 40, { position, parentWidth: 1000 })])).toEqual([]);
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
    it('Given 字の行の箱どうしが食い込む（字そのものは離れている） / When 判定する / Then 重なりではなく間の不足として出る', () => {
      // 箱は 6px 重なるが、字は 4px ずつ内側（8px の間）。字は接していないので「重なる」ではないが、箱の間は負（段落が接する崩れ）
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1, { tag: 'p' }, 4), text(0, 0, 14, 100, 20, 1, { tag: 'p' }, 4)]).map((p) => p.kind)).toEqual(['gap']);
    });

    it('Given 字の矩形が字の高さの 1/4 以下だけ食い込む / When 判定する / Then 「重なる」ではなく間の不足として出る（負の間を飛ばさない）', () => {
      // 字の枠は 20px。2px の食い込みは字の 1/4 以下で重なりと読まないが、間は -2px
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1, { tag: 'p' }), text(0, 0, 18, 100, 20, 1, { tag: 'p' })]).map((p) => p.kind)).toEqual(['gap']);
    });

    it('Given 字そのものが半分以上重なる / When 判定する / Then 重なりとして出る（字が潰れる崩れは見逃さない）', () => {
      expect(findBlockProblems([text(0, 0, 0, 100, 20, 1), text(0, 0, 8, 100, 20, 1)]).map((p) => p.kind)).toEqual(['overlap']);
    });

    it('Given 段落（p・2 行以上）どうしの間が 3.2px / When 判定する / Then 間の不足として出る（一覧 #3 の型）', () => {
      const p = (top: number) => text(0, 0, top, 300, 40, 2, { tag: 'p' });
      expect(findBlockProblems([p(0), p(43.2)]).map((x) => x.kind)).toEqual(['gap']);
      expect(findBlockProblems([p(0), p(40 + SPACE_2)])).toEqual([]);
    });

    it('Given 2 行以上の段落（p）どうしの間が 6px / When 判定する / Then 8px 未満として出る。1 行の段落どうしの 6px は出ない（下限が違う）', () => {
      const multi = (top: number) => text(0, 0, top, 300, 40, 2, { tag: 'p' });
      expect(findBlockProblems([multi(0), multi(40 + 6)]).map((x) => x.kind)).toEqual(['gap']);
      const one = (top: number) => text(0, 0, top, 300, 24, 1, { tag: 'p' });
      expect(findBlockProblems([one(0), one(24 + 6)])).toEqual([]);
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
