import { describe, expect, it } from 'vitest';
import type { Member, RouletteView } from '@tasuki/roulette-core';
import { batchNoticeText, buildMembers, candidatesOf, planBatch, splitForEdit } from '../src/regulars-view';
import type { PersonRow } from '../src/roulette-view';

const IDLE: RouletteView = { excluded: [], guests: [], drawn: [], spin: null };
const MEMBERS: Member[] = [
  { id: 'p1', name: 'あや', present: true },
  { id: 'p2', name: 'れん', present: false },
];
const guestsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i + 1}`, name: `ゲスト${i + 1}` }));
const namesOf = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `新${from + i}`);

/**
 * @requirements #458 E3・E3b（知らせを画面が中核の関数から組む）
 */
describe('planBatch', () => {
  it('Given 空の輪 / When 3 人を入れる / Then 3 人とも入り、入る人は在室の自分と合わせて 4 人', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['A1', 'A2', 'A3'] })).toEqual({ added: 3, skipped: 0, overflow: 0, overflowNames: [], poolAfter: 4 });
  });

  it('Given 自分の名前を含む / When 入れる / Then 自分はとばす', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['あや', 'A1'] })).toEqual({ added: 1, skipped: 1, overflow: 0, overflowNames: [], poolAfter: 2 });
  });

  it('Given 離席中の人と同じ名前 / When 入れる / Then 在室でなくてもとばす（離席中は入る人に数えない）', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['れん', 'A1'] })).toEqual({ added: 1, skipped: 1, overflow: 0, overflowNames: [], poolAfter: 2 });
  });

  it('Given ゲストが 20 人 / When 8 人を入れる / Then 4 人入って 4 人は入らない（在室の自分と合わせて 25 人）', () => {
    const plan = planBatch({ view: { ...IDLE, guests: guestsOf(20) }, members: MEMBERS, names: namesOf(8) });
    expect(plan).toEqual({ added: 4, skipped: 0, overflow: 4, overflowNames: ['新5', '新6', '新7', '新8'], poolAfter: 25 });
  });

  it('Given ゲストが 24 人 / When 1 人入れる / Then 入らず、入る人は変わらない', () => {
    expect(planBatch({ view: { ...IDLE, guests: guestsOf(24) }, members: MEMBERS, names: ['A1'] })).toEqual({ added: 0, skipped: 0, overflow: 1, overflowNames: ['A1'], poolAfter: 25 });
  });

  it('Given 中核と同じ g-1 形式の ID で g-1 を外している / When 1 人入れる / Then 新しい人は外れた扱いにならない', () => {
    const view = { ...IDLE, guests: [{ id: 'g-1', name: 'ゲスト1' }, { id: 'g-2', name: 'ゲスト2' }], excluded: ['g-1'] };
    expect(planBatch({ view, members: [{ id: 'p1', name: 'あや', present: true }], names: ['A1'] })).toEqual({ added: 1, skipped: 0, overflow: 0, overflowNames: [], poolAfter: 3 });
  });

  it('Given 外してあるゲスト / When 入れる / Then 入る人に数えない', () => {
    const view = { ...IDLE, guests: guestsOf(2), excluded: ['g1'] };
    expect(planBatch({ view, members: MEMBERS, names: ['A1'] })).toEqual({ added: 1, skipped: 0, overflow: 0, overflowNames: [], poolAfter: 3 });
  });
});

describe('batchNoticeText', () => {
  const plan = (added: number, skipped: number, overflowNames: string[], poolAfter: number) => ({ added, skipped, overflow: overflowNames.length, overflowNames, poolAfter });
  const CAP = '名前は 24 人まで追加できます';
  const OVER25 = '入る人がいま 25 人です。回せるのは 24 人までなので、チェックを外してください';
  it.each([
    ['全部入った', plan(8, 0, [], 9), '8 人を入れました'],
    ['一部をとばした（人数のみ・名前は出さない）', plan(6, 2, [], 7), '6 人を入れました。2 人はもう入っているので、とばしました'],
    ['上限で止まった（入らなかった人の名前を出す）', plan(6, 0, ['さとう', 'Bob', 'ｱﾘｽ'], 7), `6 人を入れました。${CAP}。3 人は入りませんでした（さとう、Bob、ｱﾘｽ）`],
    ['両方', plan(6, 2, ['さとう'], 7), `6 人を入れました。2 人はもう入っているので、とばしました。${CAP}。1 人は入りませんでした（さとう）`],
    ['全員もういる', plan(0, 5, [], 6), '全員もう入っています'],
    ['上限で 0 人', plan(0, 0, ['A', 'B'], 20), `${CAP}。入れられませんでした（A、B）`],
    ['とばしたうえで上限で 0 人', plan(0, 2, ['A'], 20), `${CAP}。入れられませんでした（A）`],
    ['入る人が 25 人になる', plan(8, 0, [], 25), `8 人を入れました。${OVER25}`],
    ['24 人ちょうどなら促さない', plan(8, 0, [], 24), '8 人を入れました'],
    ['全員いるが 25 人', plan(0, 5, [], 26), '全員もう入っています。入る人がいま 26 人です。回せるのは 24 人までなので、チェックを外してください'],
  ])('Given %s / When 知らせを組む / Then 文が決まる', (_name, p, expected) => {
    expect(batchNoticeText(p)).toBe(expected);
  });
});

const row = (id: string, name: string, checked: boolean): PersonRow => ({
  id, name, checked, disabled: false, isSelf: false, removable: false, mark: null, turn: null,
});

/** @requirements #469 D1・D3（候補・振り分け） */
describe('candidatesOf', () => {
  it('Given 名簿とゲスト / When 候補にする / Then 並びを保ち、チェックの状態を写す', () => {
    expect(candidatesOf([row('p1', 'あや', true), row('g-1', 'ゲスト', false)])).toEqual([
      { name: 'あや', checked: true },
      { name: 'ゲスト', checked: false },
    ]);
  });

  it.each([
    ['大文字小文字違い', 'Alice', 'alice', 'Alice'],
    ['全角半角違い', 'Ａｌｉｃｅ', 'Alice', 'Alice'],
    ['前後の空白', 'Alice', '  Alice ', 'Alice'],
    ['半角カナ', 'ｱﾘｽ', 'アリス', 'アリス'],
  ])('Given 同名の twin（%s）/ When 候補にする / Then 1 人にまとめ、先に出た名前（保存と同じ正規化）を残す', (_l, a, b, expected) => {
    const out = candidatesOf([row('p1', a, true), row('g-1', b, false)]);
    expect(out).toEqual([{ name: expected, checked: true }]);
  });

  it('Given 同名で名簿側が外れていてゲストが入る / When 候補にする / Then どちらかが入っていればチェック', () => {
    expect(candidatesOf([row('p1', 'Alice', false), row('g-1', 'alice', true)])).toEqual([{ name: 'Alice', checked: true }]);
  });

  it('Given 見えない名前 / When 候補にする / Then 落とす', () => {
    expect(candidatesOf([row('p1', '​', true)])).toEqual([]);
  });
});

describe('splitForEdit', () => {
  const cands = [
    { name: 'Alice', checked: true },
    { name: 'さとう', checked: false },
  ];
  it('Given 組にいる人 / When 振り分ける / Then いる人はチェック、いない人は手入力の行', () => {
    expect(splitForEdit(cands, ['さとう', 'いない人', 'x'])).toEqual({
      rows: [
        { name: 'Alice', checked: false },
        { name: 'さとう', checked: true },
      ],
      text: 'いない人\nx',
    });
  });

  it.each([['alice'], ['ＡＬＩＣＥ'], ['Ａlice']])('Given 候補と大小・全角が違う組の名前「%s」/ When 振り分ける / Then 候補のチェックに寄せ、手入力へ重ねない', (m) => {
    const out = splitForEdit(cands, [m]);
    expect(out.rows[0]?.checked).toBe(true);
    expect(out.text).toBe('');
  });

  it('Given 候補が 0 人 / When 振り分ける / Then すべて手入力', () => {
    expect(splitForEdit([], ['a', 'b'])).toEqual({ rows: [], text: 'a\nb' });
  });
});

describe('buildMembers', () => {
  it('Given チェックと手入力 / When 組む / Then チェックが先、手入力が後', () => {
    expect(buildMembers(['あや', 'れん'], 'さとう\nすずき')).toEqual(['あや', 'れん', 'さとう', 'すずき']);
  });

  it.each([
    ['大文字小文字', ['Alice'], 'alice', ['Alice']],
    ['全角半角', ['Alice'], 'Ａｌｉｃｅ', ['Alice']],
    ['前後の空白', ['Alice'], '  Alice  ', ['Alice']],
    ['手入力の中の重複', [], 'x\nX\n x', ['x']],
    ['空行と CRLF', ['a'], '\r\n\r\nb\r\n', ['a', 'b']],
  ])('Given %s の重複 / When 組む / Then 保存と同じ正規化で 1 人', (_l, checked, text, expected) => {
    expect(buildMembers(checked, text)).toEqual(expected);
  });

  it('Given 何も無い / When 組む / Then 空', () => {
    expect(buildMembers([], '  \n')).toEqual([]);
  });
});
