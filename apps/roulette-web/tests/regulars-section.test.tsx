/**
 * 「いつものメンツ」の区画（#458 画面案 §1・§2・§5）。端末の保存（jsdom の localStorage）と
 * フォーカスの移り方（document.activeElement）を、押した結果から確かめる。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegularsSection } from '../src/components/RegularsSection';
import { REGULARS_KEY } from '../src/storage/regulars';

const seed = (items: { id: string; name: string; usedAt: number; members: string[] }[]): void => {
  localStorage.setItem(REGULARS_KEY, JSON.stringify({ version: 1, items }));
};
const stored = (): { id: string; name: string; members: string[] }[] =>
  (JSON.parse(localStorage.getItem(REGULARS_KEY) ?? '{"items":[]}') as { items: { id: string; name: string; members: string[] }[] }).items;

const setup = (props: Partial<{ locked: boolean; candidates: { name: string; checked: boolean }[]; onInsert: (g: unknown) => string }> = {}) => {
  const onInsert = vi.fn(props.onInsert ?? (() => '3 人を入れました'));
  render(<RegularsSection locked={props.locked ?? false} people={(props.candidates ?? []).map((c, i) => ({ id: `r${i}`, name: c.name, checked: c.checked, disabled: false, isSelf: false, removable: false, mark: null, turn: null }))} onInsert={onInsert} />);
  return { onInsert };
};
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const status = () => screen.getByRole('status');

beforeEach(() => localStorage.clear());

describe('0 組のとき', () => {
  it('Given 保存が無い / When 描く / Then 見出し・添え書き・説明・新しく作るが出る', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'いつものメンツ' })).toBeInTheDocument();
    expect(screen.getByText('この端末だけ')).toBeInTheDocument();
    expect(screen.getByText('よく入れる名前をまとめておくと、次から一度で入れられます')).toBeInTheDocument();
    expect(btn('新しく作る')).toBeInTheDocument();
  });

  it('Given 自分だけ（候補 1 人）/ When 描く / Then いまの人から作るは出さない', () => {
    setup({ candidates: [{ name: 'あや', checked: true }] });
    expect(screen.queryByRole('button', { name: 'いまの人から作る' })).toBeNull();
  });

  it('Given 人が 0 人 / When 描く / Then いまの人から作るは無く、新しく作ると手入力だけでチェックの一覧は出ない', () => {
    setup({ candidates: [] });
    expect(screen.queryByRole('button', { name: 'いまの人から作る' })).toBeNull();
    fireEvent.click(btn('新しく作る'));
    expect(screen.queryByRole('group', { name: 'ルーレットにいる人' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'さとう');
    fireEvent.click(btn('この端末に保存'));
    expect(stored().map((g) => g.members)).toEqual([['さとう']]);
  });

  it('Given 保存が壊れている / When 描く / Then 0 組で描け、保存で止めて中身は触らない', () => {
    localStorage.setItem(REGULARS_KEY, '{');
    setup();
    expect(screen.getByText('よく入れる名前をまとめておくと、次から一度で入れられます')).toBeInTheDocument();
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'さとう');
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByRole('alert')).toHaveTextContent('保存したメンツを読めないため、保存を止めました');
    expect(localStorage.getItem(REGULARS_KEY)).toBe('{');
  });
});

describe('作る', () => {
  it('Given 新しく作るを押す / Then 名前の欄にフォーカスが移る', () => {
    setup();
    fireEvent.click(btn('新しく作る'));
    expect(document.activeElement).toBe(screen.getByLabelText('メンツの名前'));
  });

  it('Given 名前と 3 人を入れた / When 保存 / Then 札・知らせ・札にフォーカス・端末に保存', () => {
    setup();
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'さとう\nすずき\n\n  たなか  \nさとう');
    expect(screen.getByText('3 / 24 人')).toBeInTheDocument();
    fireEvent.click(btn('この端末に保存'));
    const pick = btn('朝会 3 人を入れる');
    expect(pick).toBeInTheDocument();
    expect(status()).toHaveTextContent('この端末に保存しました');
    expect(document.activeElement).toBe(pick);
    expect(stored().map((g) => [g.name, g.members])).toEqual([['朝会', ['さとう', 'すずき', 'たなか']]]);
  });

  const PEOPLE = [
    { name: 'あや', checked: true },
    { name: 'さとう', checked: false },
    { name: 'すずき', checked: true },
  ];
  const box = (name: string) => screen.getByRole('checkbox', { name });

  it('Given 3 人（2 人が入っている）/ When いまの人から作る / Then 全員が一覧に出て入っている人にチェック、手入力は空、名前の欄にフォーカス', () => {
    setup({ candidates: PEOPLE });
    fireEvent.click(btn('いまの人から作る'));
    const group = screen.getByRole('group', { name: 'ルーレットにいる人' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').map((c) => [c.closest('label')?.textContent, (c as HTMLInputElement).checked])).toEqual([
      ['あや', true],
      ['さとう', false],
      ['すずき', true],
    ]);
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）')).toHaveValue('');
    expect(screen.getByText('2 / 24 人')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('メンツの名前'));
  });

  it('Given いまの人から作る / When チェックを足し手入力も足して保存 / Then 合計の重複なし 1 組を保存する', () => {
    setup({ candidates: PEOPLE });
    fireEvent.click(btn('いまの人から作る'));
    fireEvent.click(box('さとう'));
    type('ほかの名前（1 行に 1 人）', 'いない人\n  ＡＹＡ \nいない人');
    type('メンツの名前', '朝会');
    fireEvent.click(btn('この端末に保存'));
    expect(stored().map((g) => g.members)).toEqual([['あや', 'さとう', 'すずき', 'いない人', 'ＡＹＡ'.normalize('NFKC')]]);
  });

  it('Given 新しく作る / Then チェックは全部外れ、手入力は空', () => {
    setup({ candidates: PEOPLE });
    fireEvent.click(btn('新しく作る'));
    expect(screen.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）')).toHaveValue('');
    expect(screen.getByText('0 / 24 人')).toBeInTheDocument();
  });

  it('Given チェックと手入力の合計が 25 人 / When 保存 / Then 保存せず上限の理由を出す', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `人${i}`, checked: true }));
    setup({ candidates: many });
    fireEvent.click(btn('いまの人から作る'));
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', Array.from({ length: 5 }, (_, i) => `外${i}`).join('\n'));
    expect(screen.getByText('25 / 24 人')).toBeInTheDocument();
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByRole('alert')).toHaveTextContent('1 組は 24 人までです');
    expect(stored()).toEqual([]);
  });

  it('Given チェックの人と手入力が同じ人 / When 保存 / Then 人数は重複を除いた数', () => {
    setup({ candidates: PEOPLE });
    fireEvent.click(btn('いまの人から作る'));
    type('ほかの名前（1 行に 1 人）', 'あや');
    expect(screen.getByText('2 / 24 人')).toBeInTheDocument();
  });

  it('Given 作る欄 / When やめる / Then 開いたボタンへフォーカスが戻る', () => {
    setup({ candidates: [{ name: 'さとう', checked: true }, { name: 'あや', checked: true }] });
    fireEvent.click(btn('新しく作る'));
    fireEvent.click(btn('やめる'));
    expect(document.activeElement).toBe(btn('新しく作る'));
    fireEvent.click(btn('いまの人から作る'));
    fireEvent.click(btn('やめる'));
    expect(document.activeElement).toBe(btn('いまの人から作る'));
  });
});

describe('保存の検証', () => {
  const open = (): void => {
    fireEvent.click(btn('新しく作る'));
  };
  const save = (): void => {
    fireEvent.click(btn('この端末に保存'));
  };

  it.each([
    ['名前が空', '', 'さとう', 'メンツの名前を入れてください'],
    ['0 人', '朝会', '\n  \n', '名前を 1 人から入れてください'],
    ['25 人', '朝会', Array.from({ length: 25 }, (_, i) => `ひと${i}`).join('\n'), '1 組は 24 人までです'],
    ['使えない名前', '朝会', `さとう\n${'あ'.repeat(41)}`, '使えない名前があります'],
  ])('Given %s / When 保存 / Then 理由の文を role=alert に出し、欄は閉じない', (_label, name, members, message) => {
    setup();
    open();
    type('メンツの名前', name);
    type('ほかの名前（1 行に 1 人）', members);
    save();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('メンツの名前')).toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it('Given 24 人ちょうど / When 保存 / Then 保存できる', () => {
    setup();
    open();
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', Array.from({ length: 24 }, (_, i) => `ひと${i}`).join('\n'));
    save();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stored()[0]?.members).toHaveLength(24);
    expect(btn('朝会 24 人を入れる')).toBeInTheDocument();
  });

  it('Given 名前が空 / When 保存 / Then 名前の欄に印が付き、エラーと結ばれる', () => {
    setup();
    open();
    type('ほかの名前（1 行に 1 人）', 'さとう');
    save();
    const field = screen.getByLabelText('メンツの名前');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it.each([
    ['名前が空', '', 'さとう', true, false],
    ['名前に制御文字', '朝\t会', 'さとう', true, false],
    ['0 人', '朝会', '\n', false, true],
    ['使えない名前', '朝会', 'あ'.repeat(41), false, true],
  ])('Given %s / When 保存 / Then 印の付く欄が正しい', (_label, name, members, onName, onMembers) => {
    setup();
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', name);
    type('ほかの名前（1 行に 1 人）', members);
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('メンツの名前').hasAttribute('aria-invalid')).toBe(onName);
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）').hasAttribute('aria-invalid')).toBe(onMembers);
  });

  it('Given 同じ名前のメンツがある / When 保存 / Then 印は名前の欄だけ', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'すずき');
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByLabelText('メンツの名前')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）').hasAttribute('aria-invalid')).toBe(false);
  });

  it('Given 同じ名前のメンツがある / When 作って保存 / Then 同じ名前のメンツがもうあります', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    open();
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'すずき');
    save();
    expect(screen.getByRole('alert')).toHaveTextContent('同じ名前のメンツがもうあります');
    expect(stored()).toHaveLength(1);
  });

  it('Given 10 組ある / When 11 組目を保存 / Then 10 組まで保存できます', () => {
    seed(Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, name: `組${i}`, usedAt: i, members: ['さとう'] })));
    setup();
    open();
    type('メンツの名前', '十一');
    type('ほかの名前（1 行に 1 人）', 'すずき');
    save();
    expect(screen.getByRole('alert')).toHaveTextContent('メンツは 10 組まで保存できます');
    expect(stored()).toHaveLength(10);
  });

  it('Given 書き込めない / When 保存 / Then この端末に書き込めませんでした', () => {
    setup();
    open();
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'さとう');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    save();
    spy.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent('この端末に書き込めませんでした');
  });
});

describe('入れる・並び', () => {
  it('Given 2 組 / When 描く / Then 最後に使った組が先頭', () => {
    seed([
      { id: 'a', name: '古い', usedAt: 1, members: ['さとう'] },
      { id: 'b', name: '新しい', usedAt: 2, members: ['すずき', 'たなか'] },
    ]);
    setup();
    const picks = screen.getAllByRole('button', { name: /を入れる$/ });
    expect(picks.map((p) => p.textContent)).toEqual(['新しい 2 人を入れる', '古い 1 人を入れる']);
  });

  it('Given 札を押す / Then onInsert に組が渡り、返った文が知らせに出て、札が先頭へ動いてもフォーカスは札のまま', () => {
    seed([
      { id: 'a', name: '古い', usedAt: 1, members: ['さとう'] },
      { id: 'b', name: '新しい', usedAt: 2, members: ['すずき'] },
    ]);
    const { onInsert } = setup({ onInsert: () => '1 人を入れました' });
    fireEvent.click(btn('古い 1 人を入れる'));
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', members: ['さとう'] }));
    expect(status()).toHaveTextContent('1 人を入れました');
    const picks = screen.getAllByRole('button', { name: /を入れる$/ });
    expect(picks[0]).toHaveTextContent('古い');
    expect(document.activeElement).toBe(picks[0]);
  });

  it('Given 切断中 / When 描く / Then 札は disabled だが、直す・新しく作るは押せる', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup({ locked: true });
    expect(btn('朝会 1 人を入れる')).toBeDisabled();
    expect(btn('朝会 を直す')).toBeEnabled();
    expect(btn('新しく作る')).toBeEnabled();
  });

  it('Given 札の名前 / Then roulette-regulars-name クラスを持つ', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    expect(screen.getByText('朝会')).toHaveClass('roulette-regulars-name');
  });
});

describe('直す・消す', () => {
  const two = (): void =>
    seed([
      { id: 'a', name: '朝会', usedAt: 2, members: ['さとう', 'すずき'] },
      { id: 'b', name: '夕会', usedAt: 1, members: ['たなか'] },
    ]);

  it('Given 直すを押す / Then 欄に中身が入り、題が出て、名前の欄にフォーカス', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    expect(screen.getByText('「朝会」を直す')).toBeInTheDocument();
    expect(screen.getByLabelText('メンツの名前')).toHaveValue('朝会');
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）')).toHaveValue('さとう\nすずき');
    expect(document.activeElement).toBe(screen.getByLabelText('メンツの名前'));
  });

  it('Given ルーレットにいる人とそうでない人を含む組 / When 直す / Then いる人はチェック、いない人は手入力。チェックを外して保存すると外れる', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう', 'すずき', 'いない人'] }]);
    setup({ candidates: [{ name: 'あや', checked: true }, { name: 'さとう', checked: true }, { name: 'すずき', checked: true }] });
    fireEvent.click(btn('朝会 を直す'));
    expect((screen.getByRole('checkbox', { name: 'あや' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: 'さとう' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）')).toHaveValue('いない人');
    fireEvent.click(screen.getByRole('checkbox', { name: 'さとう' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'あや' }));
    fireEvent.click(btn('この端末に保存'));
    expect(stored()[0]?.members).toEqual(['すずき', 'いない人', 'あや']);
  });

  it('Given 保存済みの順と綴りが候補と違う組 / When 直すを開いて何も変えず保存 / Then members は完全に同じ', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['zed', 'alice', 'いない人', 'さとう'] }]);
    setup({ candidates: [{ name: 'さとう', checked: true }, { name: 'Alice', checked: true }, { name: 'zed', checked: false }] });
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('この端末に保存'));
    expect(stored()[0]?.members).toEqual(['zed', 'alice', 'いない人', 'さとう']);
  });

  it('Given 直す欄 / When 新しくチェックして手入力も足す / Then 保存済みの後ろへ', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['zed', 'alice'] }]);
    setup({ candidates: [{ name: 'Alice', checked: true }, { name: 'new', checked: false }] });
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'new' }));
    type('ほかの名前（1 行に 1 人）', 'zed\nmanual');
    fireEvent.click(btn('この端末に保存'));
    expect(stored()[0]?.members).toEqual(['zed', 'alice', 'new', 'manual']);
  });

  it('Given チェックが 0 人で手入力も空 / When 保存 / Then 一覧側に印が付き、入力欄には付かない', () => {
    setup({ candidates: [{ name: 'あや', checked: false }] });
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', '朝会');
    fireEvent.click(btn('この端末に保存'));
    const group = screen.getByRole('group', { name: 'ルーレットにいる人' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）').hasAttribute('aria-invalid')).toBe(false);
  });

  it('Given チェックだけで 25 人 / When 保存 / Then 一覧側に印、入力欄には付かない', () => {
    setup({ candidates: Array.from({ length: 25 }, (_, i) => ({ name: `人${i}`, checked: true })) });
    fireEvent.click(btn('いまの人から作る'));
    type('メンツの名前', '朝会');
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByRole('group', { name: 'ルーレットにいる人' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）').hasAttribute('aria-invalid')).toBe(false);
  });

  it('Given 手入力が足して 25 人 / When 保存 / Then 入力欄に印（両方が原因のときは入力欄）', () => {
    setup({ candidates: Array.from({ length: 24 }, (_, i) => ({ name: `人${i}`, checked: true })) });
    fireEvent.click(btn('いまの人から作る'));
    type('メンツの名前', '朝会');
    type('ほかの名前（1 行に 1 人）', 'もう一人');
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByLabelText('ほかの名前（1 行に 1 人）')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('group', { name: 'ルーレットにいる人' }).hasAttribute('aria-invalid')).toBe(false);
  });

  it('Given 直して保存 / Then 同じ組が更新され、新しい札にフォーカス', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    type('メンツの名前', '朝の会');
    fireEvent.click(btn('この端末に保存'));
    expect(stored().map((g) => g.name).sort()).toEqual(['夕会', '朝の会']);
    expect(document.activeElement).toBe(btn('朝の会 2 人を入れる'));
  });

  it('Given 直す欄でやめる / Then その直すボタンへフォーカスが戻る', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('やめる'));
    expect(document.activeElement).toBe(btn('朝会 を直す'));
  });

  it('Given このメンツを消す / Then 確認が出てフォーカスはやめる', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    expect(screen.getByText('「朝会」をこの端末から消しますか')).toBeInTheDocument();
    expect(document.activeElement).toBe(btn('やめる'));
  });

  it('Given 確認でやめる / Then このメンツを消すへフォーカスが戻り、保存は残る', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('やめる'));
    expect(document.activeElement).toBe(btn('このメンツを消す'));
    expect(stored()).toHaveLength(2);
  });

  it('Given 確認で消す / Then 一覧から消え、知らせが出て、次の札にフォーカス', () => {
    two();
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(screen.queryByRole('button', { name: '朝会 1 人を入れる' })).toBeNull();
    expect(status()).toHaveTextContent('「朝会」を消しました');
    expect(document.activeElement).toBe(btn('夕会 1 人を入れる'));
    expect(stored().map((g) => g.name)).toEqual(['夕会']);
  });

  it('Given 最後の 1 組を消す / Then 新しく作るへフォーカス', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(document.activeElement).toBe(btn('新しく作る'));
  });

  it('Given 3 組の真ん中を消す / Then 前ではなく次の札にフォーカス', () => {
    seed([
      { id: 'a', name: '一番', usedAt: 3, members: ['さとう'] },
      { id: 'b', name: '二番', usedAt: 2, members: ['すずき'] },
      { id: 'c', name: '三番', usedAt: 1, members: ['たなか'] },
    ]);
    setup();
    fireEvent.click(btn('二番 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(document.activeElement).toBe(btn('三番 1 人を入れる'));
  });

  it('Given 回転中（locked）で直して保存 / Then 止まった札でなく、その組の直すボタンへフォーカス', () => {
    two();
    setup({ locked: true });
    fireEvent.click(btn('朝会 を直す'));
    type('メンツの名前', '朝の会');
    fireEvent.click(btn('この端末に保存'));
    expect(btn('朝の会 2 人を入れる')).toBeDisabled();
    expect(document.activeElement).toBe(btn('朝の会 を直す'));
  });

  it('Given 回転中（locked）で消す / Then 次の組の直すボタンへ、最後の 1 組なら新しく作るへフォーカス', () => {
    two();
    setup({ locked: true });
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(document.activeElement).toBe(btn('夕会 を直す'));
    fireEvent.click(btn('夕会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(document.activeElement).toBe(btn('新しく作る'));
  });

  it('Given 末尾の組を消す / Then 前の札にフォーカス', () => {
    two();
    setup();
    fireEvent.click(btn('夕会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    fireEvent.click(btn('消す'));
    expect(document.activeElement).toBe(btn('朝会 2 人を入れる'));
  });
});

describe('読み直し・失敗', () => {
  it('Given 消すが書き込めずに失敗 / Then このメンツを消すへフォーカスが戻る', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    fireEvent.click(btn('朝会 を直す'));
    fireEvent.click(btn('このメンツを消す'));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fireEvent.click(btn('消す'));
    spy.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent('この端末に書き込めませんでした');
    expect(document.activeElement).toBe(btn('このメンツを消す'));
  });

  it('Given 別のタブが保存を変えた / When storage イベント / Then 一覧が変わる', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    seed([{ id: 'b', name: '夕会', usedAt: 1, members: ['すずき'] }]);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: REGULARS_KEY }));
    });
    expect(screen.queryByRole('button', { name: '朝会 1 人を入れる' })).toBeNull();
    expect(btn('夕会 1 人を入れる')).toBeInTheDocument();
  });

  it('Given 別のタブが無関係なキーを変えた / Then 一覧は読み直さない', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    seed([{ id: 'b', name: '夕会', usedAt: 1, members: ['すずき'] }]);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    });
    expect(btn('朝会 1 人を入れる')).toBeInTheDocument();
  });

  it('Given 直している組が別のタブで消された / Then 欄を閉じて一覧へ戻り、新しく作るへフォーカス', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup();
    fireEvent.click(btn('朝会 を直す'));
    localStorage.setItem(REGULARS_KEY, JSON.stringify({ version: 1, items: [] }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: REGULARS_KEY }));
    });
    expect(screen.queryByLabelText('メンツの名前')).toBeNull();
    expect(document.activeElement).toBe(btn('新しく作る'));
  });

  it('Given 見えない文字だけの組名 / When 保存 / Then 名前を入れてくださいで名前の欄に印', () => {
    setup();
    fireEvent.click(btn('新しく作る'));
    type('メンツの名前', '\u200b');
    type('ほかの名前（1 行に 1 人）', 'さとう');
    fireEvent.click(btn('この端末に保存'));
    expect(screen.getByRole('alert')).toHaveTextContent('メンツの名前を入れてください');
    expect(screen.getByLabelText('メンツの名前')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([[' Alice'], ['ｱﾘｽ']])('Given 保存に正規化されていない名前「%s」の組 / Then 一覧に出ない', (member) => {
    seed([
      { id: 'a', name: '壊れ', usedAt: 2, members: [member] },
      { id: 'b', name: '朝会', usedAt: 1, members: ['さとう'] },
    ]);
    setup();
    expect(screen.queryByRole('button', { name: /壊れ/ })).toBeNull();
    expect(btn('朝会 1 人を入れる')).toBeInTheDocument();
  });
});

describe('知らせ', () => {
  it('Given 同じ文が続く / When 2 回入れる / Then 文が変わらなくても一度空にして入れ直す（読み上げに届く）', () => {
    seed([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    setup({ onInsert: () => '全員もう入っています' });
    const observer = new MutationObserver(() => undefined);
    observer.observe(status(), { childList: true, characterData: true, subtree: true });
    fireEvent.click(btn('朝会 1 人を入れる'));
    expect(status()).toHaveTextContent('全員もう入っています');
    observer.takeRecords();
    fireEvent.click(btn('朝会 1 人を入れる'));
    const records = observer.takeRecords();
    observer.disconnect();
    expect(status()).toHaveTextContent('全員もう入っています');
    expect(records.length).toBeGreaterThan(0);
  });
});
