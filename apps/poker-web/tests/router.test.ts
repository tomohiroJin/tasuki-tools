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

/**
 * 選択画面（ハブ）から渡ってくる形（#95 S5b・#248）。
 *
 * 選択画面の札は `/poker/?room=CODE` を出す。**S5a まで `parseRoute` は `pathname` しか
 * 見ておらず、この URL は `{name:'top'}` に落ちてクエリが捨てられていた** ——
 * ハブからルームへ入れないのは poker だけで、timer は元から `?room=` を解する。
 */
describe('parseRoute（?room= つき・#95 S5b）', () => {
  it.each([
    ['/poker/', '?room=a1b2c3d4', 'a1b2c3d4'],
    ['/poker', '?room=a1b2c3d4', 'a1b2c3d4'],
    // ルームコードにはルーム名がそのまま入り、日本語も許される（`?room=` は符号化される）
    ['/poker/', `?room=${encodeURIComponent('朝会モブ-a1b2')}`, '朝会モブ-a1b2'],
  ])('%s%s → ルーム（%s）', (path, search, roomId) => {
    // Given: 渡す path と search 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path, search)).toEqual({ name: 'room', roomId });
  });

  it.each([
    ['?room='],
    ['?other=x'],
    [''],
  ])('%s → トップのまま（空のコードで入室させない）', (search) => {
    // Given: 渡す search 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute('/poker/', search)).toEqual({ name: 'top' });
  });

  it('ルーム画面のパスに ?room= が付いていても、パスのルームを優先する', () => {
    // Given: 旧リンク（/poker/room/<id>）を開いたまま ?room= が残っている状況
    // When / Then: 画面に出ているルームを勝手に乗り換えない
    expect(parseRoute('/poker/room/a1b2c3d4', '?room=other')).toEqual({
      name: 'room',
      roomId: 'a1b2c3d4',
    });
  });
});
