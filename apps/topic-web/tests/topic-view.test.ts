import { describe, expect, it } from 'vitest';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from '../src/copy';
import { canOperate, canSubmitTopic, canUnlock, connectionNotice, generationNotice } from '../src/topic-view';

const IDLE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * 切断中・入り直しの途中の操作は、確立時に入り直しより先に流れて `NOT_IN_ROOM` で拒まれる
 * （`SyncConnection` の送信キュー）。押せなくすることで防ぐ。
 *
 * @requirements #91 spec §5.4
 */
describe('お題ツールの操作可否と知らせ', () => {
  it('Given 繋がっていて参加済み / When 可否を見る / Then 操作できる', () => {
    expect(canOperate('open', true)).toBe(true);
  });

  it('Given 繋がっているが参加前 / When 可否を見る / Then 操作できない', () => {
    expect(canOperate('open', false)).toBe(false);
  });

  it('Given 切断中 / When 可否を見る / Then 参加済みの印が残っていても操作できない', () => {
    expect(canOperate('closed', true)).toBe(false);
  });

  it('Given 空白だけのタイトル・書いたタイトル / When 押せるかを決める / Then 空白だけなら押せない', () => {
    // Given: 空白だけのタイトル・書いたタイトル（有効・無効の両方）
    // When: 押せるかを決める
    // Then: 空白だけなら押せない。書いてあり有効なら押せる。無効なら押せない
    expect(canSubmitTopic('   ', true)).toBe(false);
    expect(canSubmitTopic('FizzBuzz', true)).toBe(true);
    expect(canSubmitTopic('FizzBuzz', false)).toBe(false);
  });

  it('Given 空白だけの合言葉・書いた合言葉 / When 押せるかを決める / Then 空白だけなら押せない', () => {
    // Given: 空白だけの合言葉・書いた合言葉（有効・無効の両方）
    // When: 押せるかを決める
    // Then: 空白だけなら押せない。書いてあり有効なら押せる。無効なら押せない
    expect(canUnlock(' ', true)).toBe(false);
    expect(canUnlock('secret', true)).toBe(true);
    expect(canUnlock('secret', false)).toBe(false);
  });

  it('Given 生成中 / When 知らせを決める / Then 作っていると伝える', () => {
    expect(generationNotice({ ...IDLE, generating: true })).toBe(GENERATING_TEXT);
  });

  it('Given 定型に落ちた / When 知らせを決める / Then 定型にしたと伝える', () => {
    expect(generationNotice({ ...IDLE, degraded: true })).toBe(DEGRADED_TEXT);
  });

  it('Given 何も起きていない・状態がまだ無い / When 知らせを決める / Then 何も出さない', () => {
    expect(generationNotice(IDLE)).toBeNull();
    expect(generationNotice(null)).toBeNull();
  });

  it('Given 一度も繋がらないまま失敗した / When 告知を決める / Then 繋がらないと伝える', () => {
    // Given: 一度も繋がらないまま失敗した（everConnected: false）
    // When: 告知を決める
    // Then: 繋がらないと伝える
    expect(connectionNotice({ status: 'closed', everConnected: false, failedAttempts: 1, syncStale: false })).toEqual({
      kind: 'unreachable',
      text: UNREACHABLE_TEXT,
    });
  });

  it('Given 使えていた接続が切れた / When 告知を決める / Then 再接続中と伝える', () => {
    // Given: 使えていた接続が切れた（everConnected: true）
    // When: 告知を決める
    // Then: 再接続中と伝える
    expect(connectionNotice({ status: 'closed', everConnected: true, failedAttempts: 1, syncStale: false })).toEqual({
      kind: 'reconnecting',
      text: RECONNECTING_TEXT,
    });
  });

  it('Given 繋がっているが合わないフレームを捨てた / When 告知を決める / Then 同期できていないと伝える', () => {
    // Given: 繋がっているが合わないフレームを捨てた（status: open・syncStale: true）
    // When: 告知を決める
    // Then: 同期できていないと伝える
    expect(connectionNotice({ status: 'open', everConnected: true, failedAttempts: 0, syncStale: true })).toEqual({
      kind: 'stale',
      text: STALE_TEXT,
    });
  });

  it('Given 繋がり始めたばかり / When 告知を決める / Then 何も出さない（正常時にちらつかせない）', () => {
    // Given: 繋がり始めたばかり（status: connecting・失敗 0 回）
    // When: 告知を決める
    // Then: 何も出さない（正常時にちらつかせない）
    expect(connectionNotice({ status: 'connecting', everConnected: false, failedAttempts: 0, syncStale: false })).toEqual({
      kind: 'none',
    });
  });
});
