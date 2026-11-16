/**
 * ルーム画面の入口の判断（#595。`useRoomEntry` の効果から切り出した純粋関数）の単体テスト。
 *
 * 分岐の網羅はここで安く見る。効果の配線（いつ走るか・依存配列）は
 * `room-page-redirect.test.tsx`・`room-page-join-retry.test.tsx` が見る。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  decideAutoRejoin,
  decideEntryRedirect,
  decideRetryAction,
  isRateLimited,
  shouldForgetIdentity,
  shouldResetRetry,
  type AutoRejoinInput,
} from '../src/room-entry-plan';

describe('decideEntryRedirect', () => {
  it('名乗りが無ければ、決めたうえで玄関へ送る', () => {
    expect(decideEntryRedirect(false, undefined, () => false)).toEqual({ applied: true, redirect: true });
  });

  it('名乗りがあれば、決めたうえで送らない', () => {
    expect(decideEntryRedirect(false, undefined, () => true)).toEqual({ applied: true, redirect: false });
  });

  it('すでに決めていれば、名乗りを尋ねもせず何もしない（1 回だけ決める）', () => {
    const hasIdentity = vi.fn(() => false);
    expect(decideEntryRedirect(true, undefined, hasIdentity)).toEqual({ applied: true, redirect: false });
    expect(hasIdentity).not.toHaveBeenCalled();
  });

  it('消滅したルームを受けている間は、決めず送らない（消滅の案内より先に玄関へ飛ばない）', () => {
    const hasIdentity = vi.fn(() => false);
    expect(decideEntryRedirect(false, 'room-not-found', hasIdentity)).toEqual({ applied: false, redirect: false });
    expect(hasIdentity).not.toHaveBeenCalled();
  });

  it('消滅以外のエラーでは決める', () => {
    expect(decideEntryRedirect(false, 'rate-limited', () => false)).toEqual({ applied: true, redirect: true });
  });
});

describe('decideAutoRejoin', () => {
  const stored = { displayName: 'はなこ', resumeToken: 'tok-1' };
  const base: AutoRejoinInput = {
    status: 'open',
    attempted: false,
    joinedThisConnection: false,
    errorCode: undefined,
    stored: () => stored,
  };

  it('接続が開いていて未入室なら、保存した組で入り直す', () => {
    expect(decideAutoRejoin(base)).toEqual({ attempted: true, join: stored });
  });

  it('接続が開いていなければ、何もせず「試みた」を戻す', () => {
    const lookup = vi.fn(() => stored);
    expect(decideAutoRejoin({ ...base, status: 'closed', attempted: true, stored: lookup })).toEqual({
      attempted: false,
      join: null,
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('この接続ですでに試みたら、もう試みない', () => {
    expect(decideAutoRejoin({ ...base, attempted: true })).toEqual({ attempted: true, join: null });
  });

  it('この接続で入室済みなら、試みない', () => {
    expect(decideAutoRejoin({ ...base, joinedThisConnection: true })).toEqual({ attempted: false, join: null });
  });

  it('消滅したルームへは再試行しない', () => {
    expect(decideAutoRejoin({ ...base, errorCode: 'room-not-found' })).toEqual({ attempted: false, join: null });
  });

  it('保存が無ければ試みず、「試みた」にもしない', () => {
    expect(decideAutoRejoin({ ...base, stored: () => null })).toEqual({ attempted: false, join: null });
  });
});

describe('shouldResetRetry', () => {
  const none = { joinedThisConnection: false, wasJoinedThisConnection: false, isOpen: true, wasOpen: true };

  it('入室できた瞬間に数え直す', () => {
    expect(shouldResetRetry({ ...none, joinedThisConnection: true })).toBe(true);
  });

  it('入室済みのままなら数え直さない', () => {
    expect(
      shouldResetRetry({ ...none, joinedThisConnection: true, wasJoinedThisConnection: true }),
    ).toBe(false);
  });

  it('接続し直した（閉じていたのが開いた）ら数え直す', () => {
    expect(shouldResetRetry({ ...none, wasOpen: false })).toBe(true);
  });

  it('開いたまま・閉じたままなら数え直さない', () => {
    expect(shouldResetRetry(none)).toBe(false);
    expect(shouldResetRetry({ ...none, isOpen: false, wasOpen: false })).toBe(false);
  });

  it('開いていたのが閉じても数え直さない', () => {
    expect(shouldResetRetry({ ...none, isOpen: false })).toBe(false);
  });
});

describe('shouldForgetIdentity / isRateLimited', () => {
  it('消滅したルームのときだけ保存を捨てる', () => {
    expect(shouldForgetIdentity('room-not-found')).toBe(true);
    expect(shouldForgetIdentity('rate-limited')).toBe(false);
    expect(shouldForgetIdentity(undefined)).toBe(false);
  });

  it('混雑のときだけ入り直しを計画する', () => {
    expect(isRateLimited('rate-limited')).toBe(true);
    expect(isRateLimited('room-not-found')).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});

describe('decideRetryAction', () => {
  it('名前があれば入り直す（トークンつき）', () => {
    expect(decideRetryAction('はなこ', 'tok-1')).toEqual({ kind: 'join', displayName: 'はなこ', resumeToken: 'tok-1' });
  });

  it('名前が無ければルームの生死だけを尋ね直す', () => {
    expect(decideRetryAction(null, undefined)).toEqual({ kind: 'check' });
  });

  it('空の名前でも、名前を持つものとして入り直す（null だけが「持たない」）', () => {
    expect(decideRetryAction('', undefined)).toEqual({ kind: 'join', displayName: '', resumeToken: undefined });
  });
});
