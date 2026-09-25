/**
 * poker が `topic` フレームを受け取り、いまのお題を保持することを固定する（#91 PR 3・spec §5.5）。
 *
 * **お題のフレームは poker の契約（`ServerMsgSchema` 相当の `parseServerMessage`）には無い。**
 * 見分けを逆にする（poker の契約を先に見てしまう）と `parseServerMessage` が
 * 未知の `type` として落とし、#212 の「同期できていません」が立つ ——
 * ここではそれが起きないことも合わせて固定する。
 *
 * @requirements #91
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePokerSync } from '../src/hooks/useSync';
import { FakeListenerSocket } from './support/fakes';

/** サーバーからのフレーム 1 通を届ける。 */
function deliver(frame: unknown): void {
  act(() => {
    FakeListenerSocket.latest().fire('message', { data: JSON.stringify(frame) });
  });
}

function open(): void {
  act(() => {
    FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
    FakeListenerSocket.latest().fire('open');
  });
}

const A_TOPIC_FRAME = {
  type: 'topic',
  state: {
    topic: { title: 'FizzBuzz', body: '# 振る舞い\n3 のときは Fizz', source: 'manual' },
    generating: false,
    degraded: false,
    aiUnlocked: false,
  },
};

const NO_TOPIC_FRAME = {
  type: 'topic',
  state: {
    topic: null,
    generating: false,
    degraded: false,
    aiUnlocked: false,
  },
};

beforeEach(() => {
  FakeListenerSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  // 捨てたフレームの devtools 出力（本テストの対象外）でログを汚さない。
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('poker が topic フレームを読む(#91)', () => {
  it('Given 接続済み / When お題のフレームが届く / Then topic にタイトルと本文が入り、syncStale は立たない', () => {
    // Given
    const { result } = renderHook(() => usePokerSync());
    open();
    // When
    deliver(A_TOPIC_FRAME);
    // Then
    expect(result.current.topic).toEqual({
      title: 'FizzBuzz',
      body: '# 振る舞い\n3 のときは Fizz',
      source: 'manual',
    });
    expect(result.current.syncStale).toBe(false);
  });

  it('Given お題がある / When お題なしのフレームが届く / Then topic が null に戻る', () => {
    // Given
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver(A_TOPIC_FRAME);
    expect(result.current.topic).not.toBeNull();
    // When
    deliver(NO_TOPIC_FRAME);
    // Then
    expect(result.current.topic).toBeNull();
  });
});
