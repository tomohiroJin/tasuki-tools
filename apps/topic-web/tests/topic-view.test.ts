import { describe, expect, it } from 'vitest';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from '../src/copy';
import { canOperate, canSubmitTopic, canUnlock, connectionNotice, generationNotice, toSingleLine } from '../src/topic-view';

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

  it('Given 告知の種類 / When 文にする / Then 種類ごとの文言になり、何も無いときは文を持たない', () => {
    // 種類を決める規則は `@tasuki/sync-client` のテストが見る（ここは文言の当て方だけ）。
    // 配線（切れたら再接続中・一度も繋がらないなら繋がらない）は topic-room.test.tsx が画面で見る
    expect(connectionNotice('unreachable')).toEqual({ kind: 'unreachable', text: UNREACHABLE_TEXT });
    expect(connectionNotice('reconnecting')).toEqual({ kind: 'reconnecting', text: RECONNECTING_TEXT });
    expect(connectionNotice('stale')).toEqual({ kind: 'stale', text: STALE_TEXT });
    expect(connectionNotice('none')).toEqual({ kind: 'none' });
  });
});

/**
 * タイトルは各画面で見出しの素の文字として出るので、改行を持たせない。
 *
 * @requirements #313 正本 D3・FR-004
 */
describe('タイトルを 1 行にする', () => {
  it.each([
    ['改行なし', 'FizzBuzz', 'FizzBuzz'],
    ['LF', 'Fizz\nBuzz', 'Fizz Buzz'],
    ['CRLF は 1 つの改行', 'Fizz\r\nBuzz', 'Fizz Buzz'],
    ['CR', 'Fizz\rBuzz', 'Fizz Buzz'],
    ['連続する改行は 1 つずつ', 'Fizz\n\nBuzz', 'Fizz  Buzz'],
    ['空白は畳まない', 'Fizz  Buzz', 'Fizz  Buzz'],
  ])('Given %s / When 1 行にする / Then 改行だけが空白になる', (_label, input, expected) => {
    // Given / When / Then
    expect(toSingleLine(input)).toBe(expected);
  });
});
