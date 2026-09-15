import { describe, expect, it } from 'vitest';
import { wsUrl } from '../src/hooks/useSync';

describe('poker の接続先', () => {
  it('Given 玄関と同じホスト / When URL を組み立てる / Then /ws で poker を宣言する', () => {
    // Given: location を差し替えずに読めるよう、テストは jsdom の既定ホストで判定する

    // When / Then: 接続先の URL を組み立てると、/ws にツール（poker）をクエリで宣言する
    expect(new URL(wsUrl()).pathname).toBe('/ws');
    expect(new URL(wsUrl()).searchParams.get('tool')).toBe('poker');
  });
});
