// 環境変数の解釈（Issue #63）。
// 防御の設定値がサイレントに緩むことを防ぐのがこのモジュールの役目なので、
// 「既定値」「不正値の扱い」「本番の fail-closed」を明示的に固定する。
import { describe, it, expect } from 'bun:test';
import { loadPokerSyncConfig } from '../src/config';

describe('loadPokerSyncConfig', () => {
  it('env が空なら安全側の既定値を返す', () => {
    // Given: 渡す env が空であること自体が前提の指定を兼ねる
    // When
    const config = loadPokerSyncConfig({});

    // Then
    expect(config).toEqual({
      port: 3311,
      host: '127.0.0.1',
      requireClientAddress: false,
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
    // Given: 渡す ALLOWED_ORIGINS の値自体が前提の指定を兼ねる
    // When
    const config = loadPokerSyncConfig({
      ALLOWED_ORIGINS: ' https://a.example , ,https://b.example ',
    });

    // Then
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら起動を拒否する', () => {
    // 全 Origin 許可（CSWSH）へサイレントに緩むのを防ぐ fail-closed。
    expect(() => loadPokerSyncConfig({ NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('本番でも ALLOWED_ORIGINS があれば起動できる', () => {
    // Given: 渡す NODE_ENV・ALLOWED_ORIGINS 自体が前提の指定を兼ねる
    // When
    const config = loadPokerSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://a.example',
    });

    // Then
    expect(config.allowedOrigins).toEqual(['https://a.example']);
  });

  it('数値 env を解釈する', () => {
    // Given: 渡す各数値 env 自体が前提の指定を兼ねる
    // When
    const config = loadPokerSyncConfig({
      PORT: '4000',
      HOST: '0.0.0.0',
      MAX_CONNECTIONS: '10',
      MAX_ROOMS: '3',
      MAX_MESSAGE_BYTES: '2048',
      HEARTBEAT_INTERVAL_MS: '30',
      HEARTBEAT_MAX_MISSES: '1',
    });

    // Then
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
    // Given: 渡す不正な数値 env 自体が前提の指定を兼ねる
    // When
    const config = loadPokerSyncConfig({
      MAX_CONNECTIONS: '0',
      MAX_ROOMS: '-1',
      MAX_MESSAGE_BYTES: 'いくつでも',
      HEARTBEAT_INTERVAL_MS: '0',
    });

    // Then
    expect(config).toMatchObject({
      maxConnections: 200,
      maxRooms: 50,
      maxMessageBytes: 64 * 1024,
      heartbeatIntervalMs: 15_000,
    });
  });

  it('MAX_MESSAGE_BYTES は天井（1MB）で丸める', () => {
    // Given: 渡す MAX_MESSAGE_BYTES の値自体が前提の指定を兼ねる
    // When / Then（読み込みと同じ式で丸め結果を検証するため、操作と検証が同じ式になる）
    // 天井が無いと、フレーム上限（= この値から導出する）も無制限に上げられてしまい、
    // 1 フレームあたりの確保量が青天井になる。poker の正当なメッセージは 64KB の
    // 遥か下なので、1MB は十分な余裕がある。
    expect(loadPokerSyncConfig({ MAX_MESSAGE_BYTES: String(64 * 1024 * 1024) }).maxMessageBytes).toBe(
      1024 * 1024,
    );
  });

  it('MAX_MESSAGE_BYTES が天井以下ならそのまま使う', () => {
    // Given: 渡す MAX_MESSAGE_BYTES の値自体が前提の指定を兼ねる
    // When / Then（読み込みと同じ式で値をそのまま使うことを検証するため、操作と検証が同じ式になる）
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

  // timer-sync の config.ts と同じ規律を poker にも入れる（#103 Task 7）。
  describe('本番の HOST 検査（起動時 fail-closed・#103・D6）', () => {
    it('本番でループバック以外は起動を拒否する', () => {
      // Given
      const env = {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
        HOST: '0.0.0.0',
      };
      // When / Then（読み込みが throw するので操作と検証が同じ式になる）
      expect(() => loadPokerSyncConfig(env)).toThrow(/HOST/);
    });

    it.each(['127.0.0.1', '127.1.2.3', '::1', '[::1]', 'localhost'])(
      '本番でも %s はループバック扱いで通る',
      (host) => {
        // Given
        const env = {
          NODE_ENV: 'production',
          ALLOWED_ORIGINS: 'https://tasuki.example.com',
          HOST: host,
        };
        // When
        const c = loadPokerSyncConfig(env);
        // Then
        expect(c.host).toBe(host);
      },
    );

    it('HOST 未設定なら既定の 127.0.0.1 で本番でも通る', () => {
      // Given
      const env = {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
      };
      // When
      const c = loadPokerSyncConfig(env);
      // Then
      expect(c.host).toBe('127.0.0.1');
      expect(c.requireClientAddress).toBe(true);
    });

    it('本番以外なら 0.0.0.0 でも拒否しない', () => {
      // Given
      const env = { HOST: '0.0.0.0' };
      // When
      const c = loadPokerSyncConfig(env);
      // Then
      expect(c.host).toBe('0.0.0.0');
      expect(c.requireClientAddress).toBe(false);
    });

    // env の値には末尾改行・前後空白・表記ゆれが混ざりやすい。正規化していないと
    // 正当なループバック指定が「ループバック外」と誤判定され、本番が起動しなくなる。
    it.each([
      ['末尾の空白', '127.0.0.1 '],
      ['先頭の空白', ' 127.0.0.1'],
      ['末尾の改行', '127.0.0.1\n'],
      ['CRLF', '127.0.0.1\r\n'],
      ['大文字のホスト名', 'LOCALHOST'],
      ['大文字小文字混在', 'Localhost'],
      ['前後の空白つきホスト名', '  localhost  '],
    ])('整形ゆれ（%s）でも本番の起動を止めない', (_label, host) => {
      // Given
      const env = {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
        HOST: host,
      };
      // When
      const c = loadPokerSyncConfig(env);
      // Then
      // 実際の bind にも整形済みの値を使う（末尾空白つきで listen しない）。
      expect(c.host).toBe(host.trim());
    });

    it('HOST が空白だけなら既定の 127.0.0.1 に落ちる', () => {
      // Given: 渡す HOST が空白だけであること自体が前提の指定を兼ねる
      // When
      const c = loadPokerSyncConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://x.example',
        HOST: '   ',
      });
      // Then
      expect(c.host).toBe('127.0.0.1');
    });

    // 許可リストは「正確な値だけを通す」方針。IP ですらない値まで通してはいけない。
    it.each(['127.999.999.999', '127.0.0.256', '127.01.0.1', '127.0.0', '1270.0.0.1'])(
      '127 で始まっても IP として不正な %s は通さない',
      (host) => {
        // Given
        const env = {
          NODE_ENV: 'production',
          ALLOWED_ORIGINS: 'https://tasuki.example.com',
          HOST: host,
        };
        // When / Then（読み込みが throw するので操作と検証が同じ式になる）
        expect(() => loadPokerSyncConfig(env)).toThrow(/HOST/);
      },
    );

    it('起動時のエラーは対処方法を伝える', () => {
      // Given
      const env = {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://x.example',
        HOST: '0.0.0.0',
      };
      // When / Then（読み込みが throw するので操作と検証が同じ式になる）
      expect(() => loadPokerSyncConfig(env)).toThrow(/対処/);
    });
  });

  // NODE_ENV の完全一致比較だと、表記ゆれ 1 つで requireClientAddress・HOST 検査・
  // ALLOWED_ORIGINS 検査の三段すべてが無言で消える。正規化（trim + 小文字化）で塞ぐ。
  describe('NODE_ENV の正規化', () => {
    it.each(['production', 'Production', 'PRODUCTION', 'production ', ' production', 'production\n'])(
      'NODE_ENV=%j は正規化後に本番として扱われる（requireClientAddress=true）',
      (nodeEnv) => {
        // Given
        const env = { NODE_ENV: nodeEnv, ALLOWED_ORIGINS: 'https://tasuki.example.com' };
        // When
        const c = loadPokerSyncConfig(env);
        // Then
        expect(c.requireClientAddress).toBe(true);
      },
    );

    it("NODE_ENV='Production'（大文字ゆれ）でも ALLOWED_ORIGINS 未設定なら起動を拒否する", () => {
      const env = { NODE_ENV: 'Production' };
      expect(() => loadPokerSyncConfig(env)).toThrow(/ALLOWED_ORIGINS/);
    });

    it("NODE_ENV=' production\\n'（前後の空白・改行）でも HOST 検査が発火する", () => {
      // Given
      const env = {
        NODE_ENV: ' production\n',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
        HOST: '0.0.0.0',
      };
      // When / Then（読み込みが throw するので操作と検証が同じ式になる）
      expect(() => loadPokerSyncConfig(env)).toThrow(/HOST/);
    });
  });

  // trim().toLowerCase() だけでは、ゼロ幅スペース・BOM・引用符つきの値で正規化が抜け、
  // 三段の防御が無言で消える。正規化を少しだけ広げる＋未知の値は無言で通さず throw する
  // の 2 段構えで塞ぐ。
  describe('NODE_ENV の正規化の抜け穴を塞ぐ', () => {
    it.each([
      ['ゼロ幅スペース（末尾）', 'production​'],
      ['二重引用符つき', '"production"'],
      ["単引用符つき", "'production'"],
      ['BOM（先頭）', '﻿production'],
      ['全角スペース（末尾）', 'production　'],
    ])('NODE_ENV=%s でも本番として判定される（requireClientAddress=true）', (_label, nodeEnv) => {
      // Given
      const env = { NODE_ENV: nodeEnv, ALLOWED_ORIGINS: 'https://tasuki.example.com' };
      // When
      const c = loadPokerSyncConfig(env);
      // Then
      expect(c.requireClientAddress).toBe(true);
    });

    it('NODE_ENV=ゼロ幅スペースつき production は ALLOWED_ORIGINS 未設定なら起動を拒否する', () => {
      const env = { NODE_ENV: 'production​' };
      expect(() => loadPokerSyncConfig(env)).toThrow(/ALLOWED_ORIGINS/);
    });

    it('NODE_ENV=引用符つき production は HOST 検査も発火する', () => {
      // Given
      const env = {
        NODE_ENV: '"production"',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
        HOST: '0.0.0.0',
      };
      // When / Then（読み込みが throw するので操作と検証が同じ式になる）
      expect(() => loadPokerSyncConfig(env)).toThrow(/HOST/);
    });

    // 意図した変更: これまで "prod" は「本番として扱わない」（=通す）判断だったが、
    // 未知の値を無言で通さない方針への転換により throw になる。
    it.each(['prod', 'staging', 'PRD'])(
      "NODE_ENV='%s'（未知の値）は起動を拒否する", (nodeEnv) => {
        // Given
        const env = { NODE_ENV: nodeEnv, HOST: '0.0.0.0' };
        // When / Then（読み込みが throw するので操作と検証が同じ式になる）
        expect(() => loadPokerSyncConfig(env)).toThrow(/NODE_ENV/);
      },
    );

    it('未知の NODE_ENV のエラーメッセージには受け取った値と既知の値の一覧が載る', () => {
      // Given
      const env = { NODE_ENV: 'staging' };
      // When / Then（読み込みが throw するので操作と検証が同じ式になる）
      expect(() => loadPokerSyncConfig(env)).toThrow(/staging/);
      expect(() => loadPokerSyncConfig(env)).toThrow(/production/);
      expect(() => loadPokerSyncConfig(env)).toThrow(/development/);
      expect(() => loadPokerSyncConfig(env)).toThrow(/test/);
    });

    // %j は undefined の書式化が vitest と bun:test で異なる
    // （vitest は "undefined"、bun は空文字を出力）ため、明示ラベル + %s にして
    // テストランナー間でテスト名を一致させる。
    it.each([
      ['"production"', 'production'],
      ['"development"', 'development'],
      ['"test"', 'test'],
      ['undefined', undefined],
      ['""', ''],
    ])(
      '既知の値・未設定・空文字 NODE_ENV=%s は throw しない',
      (_label, nodeEnv) => {
        // Given
        const env: Record<string, string | undefined> =
          nodeEnv === 'production'
            ? { NODE_ENV: nodeEnv, ALLOWED_ORIGINS: 'https://tasuki.example.com' }
            : { NODE_ENV: nodeEnv };
        // When / Then（throw しないことを見る）
        expect(() => loadPokerSyncConfig(env)).not.toThrow();
      },
    );
  });
});
