// 環境変数の解釈（Issue #63）。
// 防御の設定値がサイレントに緩むことを防ぐのがこのモジュールの役目なので、
// 「既定値」「不正値の扱い」「本番の fail-closed」を明示的に固定する。
import { describe, it, expect } from 'vitest';
import { loadPokerSyncConfig } from '../src/config';

describe('loadPokerSyncConfig', () => {
  it('env が空なら安全側の既定値を返す', () => {
    const config = loadPokerSyncConfig({});

    expect(config).toEqual({
      port: 3311,
      host: '127.0.0.1',
      allowedOrigins: [],
      maxConnections: 200,
      maxRooms: 50,
      maxMessageBytes: 64 * 1024,
      heartbeatIntervalMs: 15_000,
      heartbeatMaxMisses: 2,
    });
  });

  it('ALLOWED_ORIGINS をカンマ区切りで解釈し、空要素と前後の空白を捨てる', () => {
    const config = loadPokerSyncConfig({
      ALLOWED_ORIGINS: ' https://a.example , ,https://b.example ',
    });

    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら起動を拒否する', () => {
    // 全 Origin 許可（CSWSH）へサイレントに緩むのを防ぐ fail-closed。
    expect(() => loadPokerSyncConfig({ NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('本番でも ALLOWED_ORIGINS があれば起動できる', () => {
    const config = loadPokerSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://a.example',
    });

    expect(config.allowedOrigins).toEqual(['https://a.example']);
  });

  it('数値 env を解釈する', () => {
    const config = loadPokerSyncConfig({
      PORT: '4000',
      HOST: '0.0.0.0',
      MAX_CONNECTIONS: '10',
      MAX_ROOMS: '3',
      MAX_MESSAGE_BYTES: '2048',
      HEARTBEAT_INTERVAL_MS: '30',
      HEARTBEAT_MAX_MISSES: '1',
    });

    expect(config).toMatchObject({
      port: 4000,
      host: '0.0.0.0',
      maxConnections: 10,
      maxRooms: 3,
      maxMessageBytes: 2048,
      heartbeatIntervalMs: 30,
      heartbeatMaxMisses: 1,
    });
  });

  it('数値 env が不正なら既定値へ倒す（0・負数・非数値は上限として無意味なため）', () => {
    const config = loadPokerSyncConfig({
      MAX_CONNECTIONS: '0',
      MAX_ROOMS: '-1',
      MAX_MESSAGE_BYTES: 'いくつでも',
      HEARTBEAT_INTERVAL_MS: '0',
    });

    expect(config).toMatchObject({
      maxConnections: 200,
      maxRooms: 50,
      maxMessageBytes: 64 * 1024,
      heartbeatIntervalMs: 15_000,
    });
  });

  it('PORT=0 は「任意の空きポート」として通す（テストのサブプロセス起動が使う）', () => {
    // 他の上限値と違い、ポートの 0 には意味がある。既定へ倒してはいけない。
    expect(loadPokerSyncConfig({ PORT: '0' }).port).toBe(0);
  });

  it('HEARTBEAT_MAX_MISSES=0 は「1 回の欠落で切断」として通す', () => {
    // 0 は「猶予なし」という有効な設定。上限値と違い既定へ倒さない。
    expect(loadPokerSyncConfig({ HEARTBEAT_MAX_MISSES: '0' }).heartbeatMaxMisses).toBe(0);
  });
});
