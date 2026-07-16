import { describe, expect, it } from 'vitest';
import { parseRoute, roomPath } from '../src/router';

describe('parseRoute', () => {
  it.each([
    ['/poker/', { name: 'top' }],
    ['/poker', { name: 'top' }],
  ])('%s → トップ', (path, expected) => {
    expect(parseRoute(path)).toEqual(expected);
  });

  it.each([
    ['/poker/room/a1b2c3d4', 'a1b2c3d4'],
    ['/poker/room/a1b2c3d4/', 'a1b2c3d4'],
  ])('%s → ルーム（roomId 抽出）', (path, roomId) => {
    expect(parseRoute(path)).toEqual({ name: 'room', roomId });
  });

  it.each([
    ['/poker/unknown'],
    ['/poker/room/'],
    ['/poker/room/has/slash'],
    ['/other'],
  ])('%s → not-found（不正な形式のリンク FR-015）', (path) => {
    expect(parseRoute(path)).toEqual({ name: 'not-found' });
  });
});

describe('roomPath', () => {
  it('roomId からルーム画面のパスを生成する', () => {
    expect(roomPath('a1b2c3d4')).toBe('/poker/room/a1b2c3d4');
  });
});
