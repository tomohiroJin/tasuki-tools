/**
 * 席の一覧の見学者（#419・設計 §5.1）。
 *
 * @requirements #419 spec §5.1
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Card } from '@tasuki/poker-core';
import { ParticipantList } from '../src/components/ParticipantList';

afterEach(cleanup);

const five: Card = { kind: 'number', value: 5 };

const p = (id: string, name: string, spectator: boolean, extra: { hasVoted?: boolean; connected?: boolean } = {}) => ({
  id,
  name,
  connected: extra.connected ?? true,
  hasVoted: extra.hasVoted ?? false,
  spectator,
});

// 見学者を間に挟んだ並び
const mixed = [p('a', 'あかり', false), p('b', 'いずみ', true), p('c', 'うみ', false), p('d', 'えり', true)];

function names(): string[] {
  return [...document.querySelectorAll('.participants li .name')].map((n) => n.textContent ?? '');
}

describe('ParticipantList の見学者', () => {
  it('Given 見学者が間に居る / When 描く / Then 投票者が先・見学者が後（それぞれ元の順）', () => {
    render(<ParticipantList participants={mixed} you="a" votes={null} />);
    expect(names().map((n) => n.replace('（あなた）', ''))).toEqual(['あかり', 'うみ', 'いずみ', 'えり']);
  });

  it('Given 投票中 / When 描く / Then 見学者の行は札を持たず「見学」の印がある', () => {
    render(<ParticipantList participants={mixed} you="a" votes={null} />);
    const row = screen.getByText('いずみ').closest('li') as HTMLElement;
    expect(within(row).queryByRole('img')).toBeNull();
    expect(row.querySelector('.seat-card')).toBeNull();
    expect(within(row).getByText('見学')).toBeTruthy();
    const voterRow = screen.getByText('うみ').closest('li') as HTMLElement;
    expect(within(voterRow).queryByText('見学')).toBeNull();
    expect(within(voterRow).getByRole('img')).toBeTruthy();
  });

  it('Given 開票後に票を持つ見学者 / When 描く / Then 札が出る。票の無い見学者には出ない', () => {
    render(<ParticipantList participants={mixed} you="a" votes={new Map([['b', five]])} />);
    const row = screen.getByText('いずみ').closest('li') as HTMLElement;
    expect(within(row).getByRole('img').getAttribute('aria-label')).toBe('5');
    const noVote = screen.getByText('えり').closest('li') as HTMLElement;
    expect(within(noVote).queryByRole('img')).toBeNull();
    expect(within(noVote).queryByText('未投票')).toBeNull();
  });

  it('Given 見学者を挟んだ並び / When 描く / Then --seat-order は札の行だけで 0,1,2 と続く', () => {
    render(<ParticipantList participants={mixed} you="a" votes={new Map([['d', five]])} />);
    const orders = [...document.querySelectorAll<HTMLElement>('.participants li .seat-card')].map((el) =>
      el.style.getPropertyValue('--seat-order'),
    );
    // 並びは あかり・うみ・いずみ(札なし)・えり(札あり)
    expect(orders).toEqual(['0', '1', '2']);
  });

  it('Given 切断中の見学者 / When 描く / Then 切断中の印が付く', () => {
    render(<ParticipantList participants={[p('b', 'いずみ', true, { connected: false })]} you="a" votes={null} />);
    const row = screen.getByText('いずみ').closest('li') as HTMLElement;
    expect(within(row).getByText('切断中')).toBeTruthy();
    expect(row.className).toContain('disconnected');
  });
});
