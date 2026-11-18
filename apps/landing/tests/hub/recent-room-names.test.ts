/**
 * 前に作ったルーム名の規則（#633）。端末にも React にも触らない純粋な判断だけを見る。
 */
import { describe, expect, it } from 'vitest';
import { forgetRoomName, parseRecentRoomNames, rememberRoomName } from '../../src/hub/recent-room-names.js';

/**
 * 上限は**実装の定数を読まず、ここに数で書く**。読むと、定数を書き換えたときにテストも一緒に動いて緑のままになる
 * （#633 で、上限を 6 にする壊し方が生き残った）。数の正本は ISSUE #633 の「決めること 1」。
 */
const RECENT_LIMIT = 5;
/** 覚える名前の長さの上限（`apps/landing/src/hub/recent-room-names.ts` の決定。同じ理由で数で書く）。 */
const MAX_REMEMBERED_ROOM_NAME = 100;

describe('rememberRoomName', () => {
  it('Given 空の候補 / When 名前を覚える / Then 先頭に入る', () => {
    expect(rememberRoomName([], '朝会モブ')).toEqual(['朝会モブ']);
  });

  it('Given 候補がある / When 別の名前を覚える / Then 新しい名前が先頭に来る', () => {
    expect(rememberRoomName(['定例'], '朝会モブ')).toEqual(['朝会モブ', '定例']);
  });

  it('Given 同じ名前が候補にある / When もう一度覚える / Then 1 つにまとめて先頭へ移す', () => {
    expect(rememberRoomName(['定例', '朝会モブ', '振り返り'], '朝会モブ')).toEqual(['朝会モブ', '定例', '振り返り']);
  });

  it('Given 前後に空白 / When 覚える / Then 空白を落として覚える（同じ名前として 1 つにまとめる）', () => {
    expect(rememberRoomName(['朝会モブ'], '  朝会モブ ')).toEqual(['朝会モブ']);
  });

  it(`Given 候補が 5 件 / When 新しい名前を覚える / Then 最も古いものが落ちる`, () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `会${i}`);
    const next = rememberRoomName(full, '新しい会');
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe('新しい会');
    expect(next).not.toContain(`会4`);
    expect(next).toContain('会0');
  });

  it.each([
    ['空', ''],
    ['空白だけ', '   '],
    ['字面の無い文字だけ', '‍'],
    ['上限を超える', 'あ'.repeat(MAX_REMEMBERED_ROOM_NAME + 1)],
    ['制御文字を含む', '朝会\nモブ'],
  ])('Given %s の名前 / When 覚える / Then 候補は変わらない', (_label, name) => {
    expect(rememberRoomName(['定例'], name)).toEqual(['定例']);
  });

  it('Given 上限ちょうどの長さ / When 覚える / Then 覚える', () => {
    const name = 'あ'.repeat(MAX_REMEMBERED_ROOM_NAME);
    expect(rememberRoomName([], name)).toEqual([name]);
  });
});

describe('forgetRoomName', () => {
  it('Given 候補がある / When 1 つを消す / Then その名前だけが外れ、並びは保たれる', () => {
    expect(forgetRoomName(['朝会モブ', '定例', '振り返り'], '定例')).toEqual(['朝会モブ', '振り返り']);
  });

  it('Given 候補に無い名前 / When 消す / Then 候補は変わらない', () => {
    expect(forgetRoomName(['朝会モブ'], '定例')).toEqual(['朝会モブ']);
  });
});

describe('parseRecentRoomNames（端末から読んだ値を検める）', () => {
  it('Given 正しい保存 / When 読む / Then そのまま返す', () => {
    expect(parseRecentRoomNames(['朝会モブ', '定例'])).toEqual(['朝会モブ', '定例']);
  });

  it.each([
    ['null', null],
    ['文字列', '朝会モブ'],
    ['数', 3],
    ['オブジェクト', { items: ['朝会モブ'] }],
  ])('Given 形の違う保存（%s） / When 読む / Then 空を返す', (_label, raw) => {
    expect(parseRecentRoomNames(raw)).toEqual([]);
  });

  it('Given 文字列でない要素が混ざった配列 / When 読む / Then その要素だけを外し、残りの名前は失わない', () => {
    expect(parseRecentRoomNames(['朝会モブ', 3, null, { name: 'x' }, '定例'])).toEqual(['朝会モブ', '定例']);
  });

  it('Given 使えない名前と重複を含む / When 読む / Then 使えるものだけを、最初に出た順で 1 つずつ返す', () => {
    expect(parseRecentRoomNames(['朝会モブ', '', '‍', '朝会モブ', '定例'])).toEqual(['朝会モブ', '定例']);
  });

  it('Given 前後に空白のある保存 / When 読む / Then 整えた名前で返す', () => {
    expect(parseRecentRoomNames([' 朝会モブ '])).toEqual(['朝会モブ']);
  });

  it(`Given 5 件を超える保存 / When 読む / Then 新しい 5 件だけを返す`, () => {
    const many = Array.from({ length: 8 }, (_, i) => `会${i}`);
    expect(parseRecentRoomNames(many)).toEqual(many.slice(0, RECENT_LIMIT));
  });
});
