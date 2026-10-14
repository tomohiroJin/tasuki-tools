import { describe, expect, it } from 'vitest';
import { E2E_MAX_ROOMS, syncEnv } from '../harness/sync';
import { LOCAL_BASE_URL } from '../harness/target';

/**
 * E2E のハーネスが同期サーバーへ渡す env（#387）。
 * ルーム枠だけを E2E 用に広げ、本番と同じ経路を通すための値（NODE_ENV など）は変えないことを見る。
 */
describe('syncEnv', () => {
  it('ルーム枠を E2E 用に広げる（手元の env に MAX_ROOMS があっても上書きする）', () => {
    const env = syncEnv({ MAX_ROOMS: '5' }, 1234);
    expect(env['MAX_ROOMS']).toBe(String(E2E_MAX_ROOMS));
    // 本番の既定（100）より広いこと。等しいと「広げた」が恒真になる
    expect(E2E_MAX_ROOMS).toBeGreaterThan(100);
  });

  it('本番と同じ経路を通す値はそのまま渡す', () => {
    const env = syncEnv({ PATH: '/bin' }, 1234);
    expect(env['PORT']).toBe('1234');
    expect(env['HOST']).toBe('127.0.0.1');
    expect(env['ALLOWED_ORIGINS']).toBe(LOCAL_BASE_URL);
    expect(env['NODE_ENV']).toBe('production');
    expect(env['PATH']).toBe('/bin');
  });
});
