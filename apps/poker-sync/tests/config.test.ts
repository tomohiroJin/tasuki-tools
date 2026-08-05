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
      maxFrameBytes: 128 * 1024,
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

  it('MAX_MESSAGE_BYTES は天井（1MB）で丸める', () => {
    // 天井が無いと、フレーム上限（= この値から導出する）も無制限に上げられてしまい、
    // 1 フレームあたりの確保量が青天井になる。poker の正当なメッセージは 64KB の
    // 遥か下なので、1MB は十分な余裕がある。
    expect(loadPokerSyncConfig({ MAX_MESSAGE_BYTES: String(64 * 1024 * 1024) }).maxMessageBytes).toBe(
      1024 * 1024,
    );
  });

  it('MAX_MESSAGE_BYTES が天井以下ならそのまま使う', () => {
    expect(loadPokerSyncConfig({ MAX_MESSAGE_BYTES: String(512 * 1024) }).maxMessageBytes).toBe(
      512 * 1024,
    );
  });

  it('フレーム上限はメッセージ上限の 2 倍（超過を検出して返答する余地を残す）', () => {
    // フレーム上限とメッセージ上限を同じにすると、超過フレームがプロトコル層で
    // 切られてしまい、message-too-large を返して接続を保つ振る舞いが成立しない。
    expect(loadPokerSyncConfig({ MAX_MESSAGE_BYTES: '1000' }).maxFrameBytes).toBe(2000);
    expect(loadPokerSyncConfig({}).maxFrameBytes).toBe(128 * 1024);
  });

  it('PORT=0 は「任意の空きポート」として通す（テストのサブプロセス起動が使う）', () => {
    // 他の上限値と違い、ポートの 0 には意味がある。既定へ倒してはいけない。
    expect(loadPokerSyncConfig({ PORT: '0' }).port).toBe(0);
  });

  it('HEARTBEAT_MAX_MISSES=0 は既定へ倒す（ping を送る前に切断してしまうため）', () => {
    // 0 を通すと、ハートビートの最初の tick で「欠落 0 回 >= 上限 0 回」が成立し、
    // **ping を 1 度も送らないまま全接続が terminate される**（実測で確認）。
    // 猶予回数として意味を成さない値なので、他の上限値と同じく既定へ倒す。
    expect(loadPokerSyncConfig({ HEARTBEAT_MAX_MISSES: '0' }).heartbeatMaxMisses).toBe(2);
  });
});
