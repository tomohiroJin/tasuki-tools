import { describe, expect, it } from 'vitest';
import { parseTrackRoomCall } from '../src/server-message';

/** 呼びかけの知らせ（`room.call`・#677）の見分け。同期フックが契約より先に呼ぶ。 */
describe('うちわけの呼びかけの知らせの見分け', () => {
  it('Given 呼びかけの知らせ / When 見分ける / Then 中身を返す', () => {
    const call = { tool: 'poker', fromParticipantId: 'p2', fromName: 'あや' };
    expect(parseTrackRoomCall(JSON.stringify({ type: 'room.call', call }))).toEqual(call);
  });

  it.each([
    ['お題のフレーム', JSON.stringify({ type: 'topic', state: { topic: null } })],
    ['ハブの受け付け', JSON.stringify({ type: 'room.called', tool: 'poker' })],
    ['中身が欠けた知らせ', JSON.stringify({ type: 'room.call', call: { tool: 'poker' } })],
    ['壊れた JSON', '{"type":'],
  ])('Given %s / When 見分ける / Then null', (_label, raw) => {
    expect(parseTrackRoomCall(raw)).toBeNull();
  });
});
