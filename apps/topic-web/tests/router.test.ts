import { describe, expect, it } from 'vitest';
import { hubPathFor, parseRoute } from '../src/router';

/**
 * お題ツールの入口は玄関の札（`/topic/?room=CODE`）だけである（`docs/adr/0018`）。
 *
 * @requirements #91 spec §5.4
 */
describe('お題ツールの URL', () => {
  it('Given 玄関の札の URL / When 開く / Then そのルームの画面になる', () => {
    expect(parseRoute('/topic/', '?room=R1')).toEqual({ name: 'room', roomCode: 'R1' });
  });

  it('Given 日本語を含むルームコード / When 開く / Then 復号したコードで入る', () => {
    const search = `?room=${encodeURIComponent('朝会モブ-a1b2')}`;
    expect(parseRoute('/topic/', search)).toEqual({ name: 'room', roomCode: '朝会モブ-a1b2' });
  });

  it('Given ルームコードの無い URL / When 開く / Then 玄関へ送り返す', () => {
    expect(parseRoute('/topic/', '')).toEqual({ name: 'redirect', to: '/' });
    expect(parseRoute('/topic/', '?room=')).toEqual({ name: 'redirect', to: '/' });
  });

  it('Given 知らない下位パス / When 開く / Then 玄関へ送り返す', () => {
    expect(parseRoute('/topic/room/R1', '')).toEqual({ name: 'redirect', to: '/' });
  });

  it('Given ルームコード / When 玄関のそのルームを組み立てる / Then 符号化した ?room= になる', () => {
    // 玄関は `URLSearchParams` で読む（`apps/landing/src/hub/room-param.ts`）ので、読み戻して比べる
    const url = new URL(hubPathFor('朝会 a&b'), 'http://x');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('room')).toBe('朝会 a&b');
  });

  it('Given 抜けた理由 / When 玄関のそのルームを組み立てる / Then 理由を ?left= で運ぶ', () => {
    // 玄関が告知を出す（#290・`@tasuki/room-core` の DEPARTURE_PARAM）
    expect(hubPathFor('R1', 'self')).toBe('/?room=R1&left=self');
    expect(hubPathFor('R1', 'removed')).toBe('/?room=R1&left=removed');
  });
});
