/**
 * 呼びかけの知らせ（#677）。行き先の表・知らせの部品・知らせの見分け。
 *
 * **オラクルは文字列と公開パスを手で書く**（実装の定数を引かない）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomCallNotice, TOOL_DESTINATIONS, toolDestination } from '../src/room/index.js';
import { parseRoomCallFrame } from '../src/sync/index.js';

afterEach(cleanup);

describe('道具の行き先の表', () => {
  it.each([
    ['timer', 'TDD Mob Pro Timer', '/timer/'],
    ['poker', 'Planning Poker', '/poker/'],
    ['roulette', 'Facilitator Roulette', '/roulette/'],
    ['topic', 'Topic Board', '/topic/'],
    ['agenda', 'Agenda Timer', '/agenda/'],
    ['checkin', 'Check-in Cards', '/checkin/'],
    ['track', 'Uchiwake', '/track/'],
  ])('Given %s / When 引く / Then 名前 %s・公開パス %s', (id, name, href) => {
    expect(toolDestination(id)).toEqual({ name, href });
  });

  it('Given 表 / When 鍵を数える / Then 7 道具', () => {
    expect(Object.keys(TOOL_DESTINATIONS)).toHaveLength(7);
  });

  it.each(['', 'unknown', 'Timer', 'toString', '__proto__', 'constructor'])('Given 知らない ID「%s」/ When 引く / Then undefined', (id) => {
    expect(toolDestination(id)).toBeUndefined();
  });
});

describe('RoomCallNotice', () => {
  const call = { tool: 'poker', fromParticipantId: 'p2', fromName: 'あや' };

  it('Given poker への呼びかけ / When 描く / Then 名前と道具の名前を入れた一文を role=status で出す', () => {
    render(<RoomCallNotice call={call} roomCode="ABC" onDismiss={() => undefined} />);
    const notice = screen.getByRole('status');
    expect(notice.className).toBe('ui-call');
    expect(notice.querySelector('p')?.textContent).toBe('あやさんが Planning Poker に呼んでいます');
  });

  it('Given ルームコード / When 描く / Then 「移る」は同じルームの道具のページへのリンク（コードは符号化する）', () => {
    render(<RoomCallNotice call={call} roomCode="A B&C" onDismiss={() => undefined} />);
    expect(screen.getByRole('link', { name: '移る' }).getAttribute('href')).toBe('/poker/?room=A%20B%26C');
  });

  it('Given 別の道具 / When 描く / Then その道具の公開パスへ移る', () => {
    render(<RoomCallNotice call={{ ...call, tool: 'agenda' }} roomCode="ABC" onDismiss={() => undefined} />);
    expect(screen.getByRole('link', { name: '移る' }).getAttribute('href')).toBe('/agenda/?room=ABC');
    expect(screen.getByRole('status').textContent).toContain('Agenda Timer');
  });

  it('Given 描いた / When 「閉じる」を押す / Then onDismiss を 1 回呼ぶ（リンクは動かさない）', () => {
    const onDismiss = vi.fn();
    render(<RoomCallNotice call={call} roomCode="ABC" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Given 知らない道具 / When 描く / Then 何も描かない', () => {
    const { container } = render(<RoomCallNotice call={{ ...call, tool: 'unknown' }} roomCode="ABC" onDismiss={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('parseRoomCallFrame', () => {
  it('Given 呼びかけの知らせ / When 見分ける / Then RoomCall を返す', () => {
    const raw = JSON.stringify({ type: 'room.call', call: { tool: 'poker', fromParticipantId: 'p2', fromName: 'あや' } });
    expect(parseRoomCallFrame(raw)).toEqual({ tool: 'poker', fromParticipantId: 'p2', fromName: 'あや' });
  });

  it.each([
    ['お題のフレーム', JSON.stringify({ type: 'topic', topic: { text: 'x' } })],
    ['ハブの受け付け', JSON.stringify({ type: 'room.called', tool: 'poker' })],
    ['中身が欠けた知らせ', JSON.stringify({ type: 'room.call', call: { tool: 'poker' } })],
    ['壊れた JSON', '{"type":'],
    ['JSON ではない文字', 'room.call'],
  ])('Given %s / When 見分ける / Then null', (_label, raw) => {
    expect(parseRoomCallFrame(raw)).toBeNull();
  });
});
