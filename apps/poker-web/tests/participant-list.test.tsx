/**
 * 席の札が公開でその場でめくれる形になっていることを固定する（#348・設計正本 D1・D2・D6）。
 *
 * 札は「回る軸・裏・表」の 3 枚で、公開は `.revealed` を付けるだけ。札を作り直すと CSS の
 * transition の起点が無く、めくれずに表が出る。席順は CSS 変数 `--seat-order` で渡す。
 *
 * @requirements #348
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Card } from '@tasuki/poker-core';
import { ParticipantList } from '../src/components/ParticipantList';

afterEach(cleanup);

const five: Card = { kind: 'number', value: 5 };
const eight: Card = { kind: 'number', value: 8 };

function people(votedP1: boolean, votedP2 = false) {
  return [
    { id: 'p1', name: 'あかり', connected: true, hasVoted: votedP1 },
    { id: 'p2', name: 'いずみ', connected: true, hasVoted: votedP2 },
  ];
}

function rowOf(name: string): HTMLElement {
  const li = screen.getByText(name, { exact: false }).closest('li');
  if (li === null) throw new Error(`${name} の行が無い`);
  return li;
}

describe('ParticipantList の席の札（#348）', () => {
  it('U1: Given 公開後 / When 描く / Then 票のある席の札の名前は表の値、無い席は「未投票」', () => {
    render(<ParticipantList participants={people(true)} you="p1" votes={new Map([['p1', five]])} />);
    expect(within(rowOf('あかり')).getByRole('img').getAttribute('aria-label')).toBe('5');
    expect(within(rowOf('あかり')).queryByText('投票済み')).toBeNull();
    expect(within(rowOf('いずみ')).getByRole('img').getAttribute('aria-label')).toBe('未投票');
    expect(within(rowOf('いずみ')).getByText('未投票')).toBeTruthy();
  });

  it('U1 対照: Given 投票中 / When 描く / Then 票の値は出ず、名前は「投票済み」', () => {
    render(<ParticipantList participants={people(true)} you="p1" votes={null} />);
    expect(within(rowOf('あかり')).getByRole('img').getAttribute('aria-label')).toBe('投票済み');
    expect(within(rowOf('あかり')).getByText('投票済み')).toBeTruthy();
    expect(rowOf('あかり').textContent).not.toContain('5');
    expect(within(rowOf('いずみ')).getByRole('img').getAttribute('aria-label')).toBe('未投票');
  });

  it('U2: Given 投票中 / When votes を足して描き直す / Then 席の札は同じ要素で revealed を持つ', () => {
    const { container, rerender } = render(
      <ParticipantList participants={people(true)} you="p1" votes={null} />,
    );
    const before = container.querySelector('.seat-card');
    expect(before).not.toBeNull();
    expect(before?.classList.contains('revealed')).toBe(false);
    rerender(<ParticipantList participants={people(true)} you="p1" votes={new Map([['p1', eight]])} />);
    const after = container.querySelector('.seat-card');
    expect(after).toBe(before);
    expect(after?.classList.contains('revealed')).toBe(true);
    expect(after?.getAttribute('aria-label')).toBe('8');
  });

  it('U3: Given 3 人 / When 描く / Then 席の札の --seat-order が 0・1・2', () => {
    const three = [...people(false), { id: 'p3', name: 'うみ', connected: true, hasVoted: false }];
    const { container } = render(<ParticipantList participants={three} you="p1" votes={null} />);
    const orders = [...container.querySelectorAll<HTMLElement>('.seat-card')].map((el) =>
      el.style.getPropertyValue('--seat-order'),
    );
    expect(orders).toEqual(['0', '1', '2']);
  });
});
