/**
 * 接続状態の告知文の決め方（#76 F-2）。
 *
 * 同期サーバーが起動していないとき、画面には「接続中です…（切断された場合は自動で
 * 再接続します）」だけが出て、「ルームを作成」「参加する」は無効のまま永久に待った。
 * 一時的な状態にしか見えないため、利用者は原因も対処も分からない。
 * 「繋がらない」ことを「切れて戻る途中」と区別して伝える。
 */
import { describe, it, expect } from 'vitest';
import { connectionNotice } from '../src/connection-notice';

describe('connectionNotice', () => {
  it('接続できているときは何も出さない', () => {
    expect(connectionNotice({ status: 'open', everConnected: true, failedAttempts: 0 })).toEqual({
      kind: 'none',
    });
  });

  it('繋ぎに行っている最初の一瞬は何も出さない（画面をちらつかせない）', () => {
    // Given: ページを開いた直後、まだ 1 度も失敗していない
    // When: 告知を決める
    // Then: 出さない。正常時に一瞬だけ警告が出るのは害でしかない
    expect(
      connectionNotice({ status: 'connecting', everConnected: false, failedAttempts: 0 }),
    ).toEqual({ kind: 'none' });
  });

  it('一度も繋がらないまま失敗したら「接続できない」と伝える', () => {
    // Given: 同期サーバーが起動していない
    // When: 1 回目の接続に失敗する
    // Then: 再接続中ではなく、繋がらないこととして伝える。
    // 一度も繋がっていない以上「切断された」わけではなく、待っても直らない
    const notice = connectionNotice({
      status: 'closed',
      everConnected: false,
      failedAttempts: 1,
    });

    expect(notice.kind).toBe('unreachable');
  });

  it('接続できないときは、操作できない理由まで伝える', () => {
    // ボタンが無効な理由が画面から分からないのが問題の本体だった
    const notice = connectionNotice({
      status: 'closed',
      everConnected: false,
      failedAttempts: 1,
    });

    expect(notice.kind === 'unreachable' && notice.text).toContain('作成');
    expect(notice.kind === 'unreachable' && notice.text).toContain('参加');
  });

  it('一度繋がった後の切断は、まず再接続中として扱う', () => {
    // Given: 使えていた接続が切れた
    // When: 1 回目の再接続を待っている
    // Then: 自動で戻る見込みがあるので、驚かせない
    expect(
      connectionNotice({ status: 'closed', everConnected: true, failedAttempts: 1 }),
    ).toEqual({ kind: 'reconnecting', text: expect.stringContaining('再接続') });
  });

  it('再接続が続けて失敗するなら「接続できない」に切り替える', () => {
    // Given: 切断後、何度試しても戻らない（サーバーが落ちた等）
    // When: 失敗が続く
    // Then: いつまでも「再接続します」と言い続けない
    const notice = connectionNotice({
      status: 'closed',
      everConnected: true,
      failedAttempts: 3,
    });

    expect(notice.kind).toBe('unreachable');
  });

  it('接続が戻れば告知は消える', () => {
    expect(
      connectionNotice({ status: 'open', everConnected: true, failedAttempts: 3 }),
    ).toEqual({ kind: 'none' });
  });
});
