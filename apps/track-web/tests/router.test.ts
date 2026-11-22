import { describe, expect, it } from 'vitest';
import { hubPathFor, parseRoute } from '../src/router';

/**
 * うちわけの入口は玄関の札（`/track/?room=CODE`）だけである（`docs/adr/0018`）。
 * 解析と玄関への道の表は `packages/room-core/tests/room-route.test.ts`。ここは BASE の結線だけ。
 *
 * @requirements #476 設計 §1（公開パスは /track/）
 */
describe('うちわけの URL', () => {
  it('Given 自アプリの玄関の札 / When 開く / Then そのルームの画面になる', () => {
    expect(parseRoute('/track/', '?room=R1')).toEqual({ name: 'room', roomCode: 'R1' });
  });

  it('Given 他アプリの玄関の札 / When 開く / Then 入口ではないので玄関のそのルームへ送る', () => {
    expect(parseRoute('/agenda/', '?room=R1')).toEqual({ name: 'redirect', to: '/?room=R1' });
  });

  it('Given 知らない下位パス / When 開く / Then 玄関へ送り返す', () => {
    expect(parseRoute('/track/room/R1', '')).toEqual({ name: 'redirect', to: '/' });
  });

  it('Given 抜けた理由 / When 玄関のそのルームを組み立てる / Then 理由を ?left= で運ぶ', () => {
    expect(hubPathFor('R1', 'self')).toBe('/?room=R1&left=self');
  });
});
