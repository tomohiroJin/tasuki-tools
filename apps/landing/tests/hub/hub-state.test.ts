/**
 * 選択画面・参加・作成の分岐（#95 S5a・設計正本 §5.7）。
 *
 * 判定を純粋関数に切り出しておく（`docs/adr/0015` MUST 1）。画面側に書くと、
 * 状態の組み合わせを確かめるのに毎回レンダリングが要る。
 */
import { describe, it, expect } from 'vitest';
import { screenFor } from '../../src/hub/hub-state.js';

describe('画面の決め方', () => {
  it('Given ルームコードが無い / When 画面を決める / Then 作成になる', () => {
    expect(screenFor({ code: null, joined: false, resuming: false })).toBe('create');
  });

  it('Given ルームコードがあり未参加 / When 画面を決める / Then 参加になる', () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false, resuming: false })).toBe('join');
  });

  it('Given ルームコードがあり参加済み / When 画面を決める / Then 選択画面になる', () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: true, resuming: false })).toBe('choice');
  });

  it('Given ルームコードが無いのに参加済み / When 画面を決める / Then 作成になる', () => {
    // 参加用 URL から room を消した状態。**選択画面を出さない** ——
    // どのルームを映すか決まらないので、入口へ戻す
    expect(screenFor({ code: null, joined: true, resuming: false })).toBe('create');
  });
});

/**
 * 「まだ分からない」を「名乗ってもらう」と混同しない（#95 S5c 追補）。
 *
 * ツールから `/?room=CODE` で戻ってきた人は、**接続して復帰の返事が来るまで
 * `joined` が false** である。そこを「未参加」と読むと、既に参加している人に
 * 「◯◯ に参加します／あなたの名前」を一瞬見せてしまう。
 */
describe('復帰を試している間', () => {
  it('Given 復帰の返事待ち / When 画面を決める / Then 名乗る画面にはしない', () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false, resuming: true })).toBe('resuming');
  });

  it('Given 復帰できた / When 画面を決める / Then 選択画面になる', () => {
    // 返事が来た時点で resuming は降りるが、行き違っても選択画面が勝つ
    expect(screenFor({ code: '朝会モブ-a1b2', joined: true, resuming: true })).toBe('choice');
  });

  it('Given 復帰を試していない（端末に同一性が無い）/ When 画面を決める / Then 名乗る画面になる', () => {
    // ⚠ この 1 本が無いと「常に名乗らせない」実装でも緑になる
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false, resuming: false })).toBe('join');
  });

  it('Given ルームコードが無いのに復帰中 / When 画面を決める / Then 作成になる', () => {
    // どのルームを映すか決まらない以上、待つ対象も無い
    expect(screenFor({ code: null, joined: false, resuming: true })).toBe('create');
  });
});
