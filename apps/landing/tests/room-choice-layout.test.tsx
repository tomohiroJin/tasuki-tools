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
    render(<RoomChoice code={roster.code} inviteUrl="https://example.test/?room=ab12" roster={roster} connection="online" topicTitle={null} />);
    // Then
    expect(within(screen.getByRole('region', { name: '道具を選ぶ' })).getByRole('list', { name: 'ツール' })).toBeVisible();
    const people = within(screen.getByRole('region', { name: '参加者' }));
    expect(people.getByText('TDD Mob Pro Timer にいます')).toBeVisible();
    expect(people.getByText('切断中')).toBeVisible();
    expect(within(screen.getByRole('region', { name: '仲間を招く' })).getByLabelText('参加用 URL')).toHaveValue('https://example.test/?room=ab12');
  });
});

/**
 * 在席の表示の名前は、ツール ID で `TOOLS` から引く（spec §5.5）。並び順で引いていた頃は、
 * 札を足すとお題ツールに居る人が「topic にいます」と生の ID で出た。
 *
 * @requirements #91 spec §5.5
 */
describe('どのツールに居るか', () => {
  it('Given お題ツールと timer に居る人 / When 選択画面を開く / Then 札の名前で出る', () => {
    // Given
    const roster = { code: 'R1', participants: [
      { participantId: 'a', displayName: 'あや', presence: 'online' as const, tools: ['topic', 'timer'] },
    ] };
    // When
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={roster} connection="online" topicTitle={null} />);
    // Then
    expect(screen.getByText('Topic Board / TDD Mob Pro Timer にいます')).toBeVisible();
  });
});

/**
 * @requirements #91 E15 E16
 */
describe('玄関のいまのお題', () => {
  it('Given ルームにお題がある / When 選択画面を開く / Then 札の近くにタイトルだけが出る', () => {
    // Given: ルームにお題がある
    // When: 選択画面を開く
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={null} connection="online" topicTitle="FizzBuzz" />);
    const tools = within(screen.getByRole('region', { name: '道具を選ぶ' }));
    // Then
    expect(tools.getByText('いまのお題')).toBeVisible();
    expect(tools.getByText('FizzBuzz')).toBeVisible();
  });

  it('Given ルームにお題が無い / When 選択画面を開く / Then お題の行は出ない', () => {
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={null} connection="online" topicTitle={null} />);
    expect(screen.queryByText('いまのお題')).toBeNull();
  });
});
