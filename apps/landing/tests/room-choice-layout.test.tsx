import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoomChoice } from '../src/screens/RoomChoice.js';

describe('選択画面の情報の区切り', () => {
  it('Given 同じルームに在席・切断中の人がいる / When 選択画面を開く / Then 道具・参加者・招待を区別できる', () => {
    // Given
    const roster = { code: '朝会-ab12', participants: [
      { participantId: 'a', displayName: 'あや', presence: 'online' as const, tools: ['timer'] },
      { participantId: 'b', displayName: 'いずみ', presence: 'offline' as const, tools: [] },
    ] };
    // When
    render(<RoomChoice code={roster.code} inviteUrl="https://example.test/?room=ab12" roster={roster} connection="online" />);
    // Then
    expect(within(screen.getByRole('region', { name: '道具を選ぶ' })).getByRole('list', { name: 'ツール' })).toBeVisible();
    const people = within(screen.getByRole('region', { name: '参加者' }));
    expect(people.getByText('TDD Mob Pro Timer にいます')).toBeVisible();
    expect(people.getByText('切断中')).toBeVisible();
    expect(within(screen.getByRole('region', { name: '仲間を招く' })).getByLabelText('参加用 URL')).toHaveValue('https://example.test/?room=ab12');
  });
});
