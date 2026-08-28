import { describe, expect, it } from 'vitest';
import { parseRoute, roomPath, topPath } from '../src/router';

describe('parseRoute', () => {
  it.each([
    ['/poker/', { name: 'top' }],
    ['/poker', { name: 'top' }],
  ])('%s → トップ', (path, expected) => {
    // Given: 渡す path 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path)).toEqual(expected);
  });

  it.each([
    ['/poker/room/a1b2c3d4', 'a1b2c3d4'],
    ['/poker/room/a1b2c3d4/', 'a1b2c3d4'],
  ])('%s → ルーム（roomId 抽出）', (path, roomId) => {
    // Given: 渡す path 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path)).toEqual({ name: 'room', roomId });
  });

  it.each([
    ['/poker/unknown'],
    ['/poker/room/'],
    ['/poker/room/has/slash'],
    ['/other'],
  ])('%s → not-found（不正な形式のリンク FR-015）', (path) => {
    // Given: 渡す path 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path)).toEqual({ name: 'not-found' });
  });
});

describe('roomPath / topPath', () => {
  it('roomId からルーム画面のパスを生成する', () => {
    expect(roomPath('a1b2c3d4')).toBe('/poker/room/a1b2c3d4');
  });

  it('topPath はトップ画面のパスを返し、parseRoute と往復できる', () => {
    // Given: topPath・roomPath の呼び出し自体が前提の指定を兼ねる
    // When / Then（topPath・parseRoute・roomPath は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(topPath()).toBe('/poker/');
    expect(parseRoute(topPath())).toEqual({ name: 'top' });
    expect(parseRoute(roomPath('a1b2c3d4'))).toEqual({ name: 'room', roomId: 'a1b2c3d4' });
  });
});
