/**
 * 見積もりの記録の欄（#93・spec §4.4）。
 *
 * @requirements #93
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EstimateGroupView } from '@tasuki/poker-core';
import { EstimateLog } from '../src/components/EstimateLog';
import {
  ESTIMATE_CHANGE_POINTS,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_NO_POINTS,
  ESTIMATE_OPEN,
  ESTIMATE_UNNAMED,
} from '../src/estimate-copy';

afterEach(cleanup);

// 選択の名前は「アイテム名 + ポイントを変える」（束ごとに違う）。ここでは文言の側だけで引く
const CHANGE_POINTS_NAME = new RegExp(`${ESTIMATE_CHANGE_POINTS}$`);

const AT = Date.UTC(2026, 9, 17, 5, 20);
const hhmm = (at: number) =>
  new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

function group(id: number, over: Partial<EstimateGroupView> = {}): EstimateGroupView {
  return {
    id,
    item: `ITEM-${id}`,
    points: null,
    open: false,
    entries: [{ attempt: 1, at: AT, counts: [{ card: { kind: 'number', value: 5 }, count: 4 }] }],
    ...over,
  };
}

describe('EstimateLog', () => {
  it('Given 束が 0 / When 描く / Then 見出しと空の文言', () => {
    render(<EstimateLog groups={[]} onSetPoints={vi.fn()} disabled={false} />);
    expect(screen.getByRole('heading', { name: ESTIMATE_LOG_HEADING })).toBeTruthy();
    expect(screen.getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });

  it('Given 束 3 つ / When 描く / Then 新しい束が上（wire の逆順）', () => {
    render(<EstimateLog groups={[group(1), group(2), group(3)]} onSetPoints={vi.fn()} disabled={false} />);
    const items = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-group') !== null);
    expect(items.map((li) => li.getAttribute('data-group'))).toEqual(['3', '2', '1']);
  });

  it('Given 束の中に 2 行 / When 描く / Then 新しい行が上で、回・時刻・分布の形', () => {
    const g = group(1, {
      entries: [
        { attempt: 1, at: AT, counts: [{ card: { kind: 'number', value: 3 }, count: 1 }, { card: { kind: 'question' }, count: 2 }] },
        { attempt: 2, at: AT + 60_000, counts: [{ card: { kind: 'number', value: 5 }, count: 4 }] },
      ],
    });
    render(<EstimateLog groups={[g]} onSetPoints={vi.fn()} disabled={false} />);
    const rows = screen.getAllByTestId('estimate-entry');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('2 回め');
    expect(rows[0]!.textContent).toContain(hhmm(AT + 60_000));
    expect(rows[0]!.textContent).toContain('5×4');
    expect(rows[1]!.textContent).toContain('1 回め');
    expect(rows[1]!.textContent).toContain('3×1');
    expect(rows[1]!.textContent).toContain('?×2');
  });

  it('Given open の束 / When 描く / Then 見積もり中でポイントの選択は無い', () => {
    render(<EstimateLog groups={[group(1, { open: true })]} onSetPoints={vi.fn()} disabled={false} />);
    expect(screen.getByText(ESTIMATE_OPEN)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('Given 閉じた束 points 5 / null / When 描く / Then 値は選択が見出しの強い値として 1 回だけ出す', () => {
    const { container } = render(<EstimateLog groups={[group(1, { points: 5 })]} onSetPoints={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME }) as HTMLSelectElement;
    expect(select.value).toBe('5');
    // 見出しに同じ値の別の表示を重ねない
    expect(container.querySelector('strong, [data-testid="estimate-points"]')).toBeNull();
    cleanup();
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled={false} />);
    const none = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME }) as HTMLSelectElement;
    expect(none.value).toBe('');
    expect(screen.queryByTestId('estimate-nopoints')).toBeNull();
  });

  it('Given 閉じた束 points null / 5 / When 描く / Then 部品の .ui-select で、空のときだけ data-empty（弱く見せる印）', () => {
    // 「ポイントなし」が束で一番強く見えていた（#93 最終レビュー・spec §4.4: 強いのは添えたポイント）
    render(<EstimateLog groups={[group(1), group(2, { points: 5 })]} onSetPoints={vi.fn()} disabled={false} />);
    const [withPoints, empty] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(empty!.value).toBe('');
    expect(empty!.classList.contains('ui-select')).toBe(true);
    expect(empty!.classList.contains('ui-input')).toBe(false);
    expect(empty!.hasAttribute('data-empty')).toBe(true);
    expect(withPoints!.value).toBe('5');
    expect(withPoints!.hasAttribute('data-empty')).toBe(false);
  });

  it('Given 閉じた束 / When 選択肢を見る / Then 空と 0 1 2 3 5 8 13 21', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', '0', '1', '2', '3', '5', '8', '13', '21']);
  });

  it('Given 閉じた束 / When 空の選択肢を見る / Then 見える文言は ポイントなし', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    expect((within(select).getAllByRole('option')[0] as HTMLOptionElement).textContent).toBe(ESTIMATE_NO_POINTS);
  });

  it('Given 閉じた束 / When 8 を選ぶ → 空を選ぶ / Then onSetPoints(id, 8) と (id, null)', () => {
    const onSetPoints = vi.fn();
    render(<EstimateLog groups={[group(7, { points: 5 })]} onSetPoints={onSetPoints} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    fireEvent.change(select, { target: { value: '8' } });
    expect(onSetPoints).toHaveBeenLastCalledWith(7, 8);
    fireEvent.change(select, { target: { value: '' } });
    expect(onSetPoints).toHaveBeenLastCalledWith(7, null);
  });

  it('Given disabled / When 描く / Then 選択は押せない', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });

  it('Given 閉じた束 2 つ（名前あり・名前なし） / When 選択の名前を読む / Then 束ごとに違い、アイテム名を含む', () => {
    // どの選択も「ポイントを変える」だけだと、読み上げではどの束の選択か区別できない（#93 最終レビュー）
    render(<EstimateLog groups={[group(1), group(2, { item: '' })]} onSetPoints={vi.fn()} disabled={false} />);
    const names: string[] = [];
    screen.getAllByRole('combobox', { name: (name) => (names.push(name), true) });
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    // 新しい束が上（名前なしの束 2 が先）
    expect(names[0]).toContain(ESTIMATE_UNNAMED);
    expect(names[1]).toContain('ITEM-1');
    for (const name of names) expect(name).toContain(ESTIMATE_CHANGE_POINTS);
  });

  it('Given item が空 / When 描く / Then （名前なし）', () => {
    render(<EstimateLog groups={[group(1, { item: '' })]} onSetPoints={vi.fn()} disabled={false} />);
    expect(screen.getByText(ESTIMATE_UNNAMED)).toBeTruthy();
  });

  it('Given 束 5 つ・limit 3 / When 描く / Then 新しい 3 束だけ', () => {
    const gs = [1, 2, 3, 4, 5].map((i) => group(i));
    render(<EstimateLog groups={gs} onSetPoints={vi.fn()} disabled={false} limit={3} />);
    const shown = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-group') !== null);
    expect(shown.map((li) => li.getAttribute('data-group'))).toEqual(['5', '4', '3']);
  });

  it('Given 束 3 つ・limit 0 / When 描く / Then 束は出ず、空の文言も出さない（limit は切り出しだけ）', () => {
    render(<EstimateLog groups={[group(1), group(2), group(3)]} onSetPoints={vi.fn()} disabled={false} limit={0} />);
    expect(screen.queryByText(ESTIMATE_LOG_EMPTY)).toBeNull();
  });

  it('Given 束 / When 描く / Then 束は ol、領域は見出しで名前を持ち、2 つ描いても id が衝突しない', () => {
    render(
      <>
        <EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled={false} />
        <EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} disabled={false} />
      </>,
    );
    const regions = screen.getAllByRole('region', { name: ESTIMATE_LOG_HEADING });
    expect(regions).toHaveLength(2);
    expect(regions[0]!.getAttribute('aria-labelledby')).not.toBe(regions[1]!.getAttribute('aria-labelledby'));
    expect(regions[0]!.querySelector('ol')).not.toBeNull();
  });
});
