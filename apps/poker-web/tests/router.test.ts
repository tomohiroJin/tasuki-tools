import { describe, expect, it } from 'vitest';
import { hubPathFor, parseRoute } from '../src/router';

/**
 * 旧入口（`TopPage`）を撤去した後のルート判定（#95 S5c・R9）。
 *
 * ルームコードを伴わない URL には行き先が無い。**玄関（`/`）へ送る** ——
 * 名乗りと合言葉の入力はそこに 1 つだけある。
 */
describe('parseRoute', () => {
  it.each([
    ['/poker/'],
    ['/poker'],
    ['/poker/unknown'],
    ['/poker/room/'],
    ['/poker/room/has/slash'],
    ['/other'],
  ])('Given ルームコードが無い / When %s を開く / Then 玄関へ送る', (path) => {
    // Given: 渡す path 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path, '')).toEqual({ name: 'redirect', to: '/' });
  });

  it.each([
    ['/poker/room/a1b2c3d4', '/?room=a1b2c3d4'],
    ['/poker/room/a1b2c3d4/', '/?room=a1b2c3d4'],
    // ルーム名がそのままコードに入り、日本語も許される。**符号化して運ぶ**
    ['/poker/room/朝会モブ-a1b2', '/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2'],
  ])('Given 旧リンク / When %s を開く / Then コードを保ったまま玄関へ送る', (path, to) => {
    // Given: 旧リンクはもう配られないが、ブックマークと履歴からは来る
    // When / Then: **コードを落とさない**（落とすと入りたかったルームを失う）
    expect(parseRoute(path, '')).toEqual({ name: 'redirect', to });
  });

  it.each([
    ['/poker/', '?room=a1b2c3d4', 'a1b2c3d4'],
    ['/poker', '?room=a1b2c3d4', 'a1b2c3d4'],
    ['/poker/', `?room=${encodeURIComponent('朝会モブ-a1b2')}`, '朝会モブ-a1b2'],
  ])('Given ハブの札から来た / When %s%s を開く / Then そのルームへ入る', (path, search, roomId) => {
    // Given: 渡す path と search 自体が前提の指定を兼ねる
    // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(parseRoute(path, search)).toEqual({ name: 'room', roomId });
  });

  it.each([['?room='], ['?other=x'], ['']])(
    'Given 空のコード（%s） / When /poker/ を開く / Then 入室させず玄関へ送る',
    (search) => {
      // Given: 渡す search 自体が前提の指定を兼ねる
      // When / Then（parseRoute は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
      expect(parseRoute('/poker/', search)).toEqual({ name: 'redirect', to: '/' });
    },
  );

  it('Given 旧リンクに ?room= が残っている / When 開く / Then パスのコードを保って送る', () => {
    // Given: 旧リンク（/poker/room/<id>）を開いたまま ?room= が残っている状況
    // When / Then: 画面に出ているルームを勝手に乗り換えない
    expect(parseRoute('/poker/room/a1b2c3d4', '?room=other')).toEqual({
      name: 'redirect',
      to: '/?room=a1b2c3d4',
    });
  });
});

describe('hubPathFor', () => {
  it('Given 日本語を含むルームコード / When 玄関の URL を組む / Then 符号化して載せる', () => {
    // Given: ルームコードにはルーム名がそのまま入る
    // When / Then: 素の連結ではなく符号化を通す（`docs/adr/0018` 決定 2 の参加用 URL と同じ形）
    expect(hubPathFor('朝会モブ-a1b2')).toBe('/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2');
    expect(hubPathFor('a1b2c3d4')).toBe('/?room=a1b2c3d4');
  });
});
