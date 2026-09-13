/**
 * 選択画面・参加・作成の分岐（#95 S5a・設計正本 §5.7）。
 *
 * 判定を純粋関数に切り出しておく（`docs/adr/0015` MUST 1）。画面側に書くと、
 * 3 状態の組み合わせを確かめるのに毎回レンダリングが要る。
 */
import { describe, it, expect } from 'vitest';
import { screenFor } from '../../src/hub/hub-state.js';

describe('画面の決め方', () => {
  it('Given ルームコードが無い / When 画面を決める / Then 作成になる', () => {
    expect(screenFor({ code: null, joined: false })).toBe('create');
  });

  it('Given ルームコードがあり未参加 / When 画面を決める / Then 参加になる', () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: false })).toBe('join');
  });

  it('Given ルームコードがあり参加済み / When 画面を決める / Then 選択画面になる', () => {
    expect(screenFor({ code: '朝会モブ-a1b2', joined: true })).toBe('choice');
  });

  it('Given ルームコードが無いのに参加済み / When 画面を決める / Then 作成になる', () => {
    // 参加用 URL から room を消した状態。**選択画面を出さない** ——
    // どのルームを映すか決まらないので、入口へ戻す
    expect(screenFor({ code: null, joined: true })).toBe('create');
  });
});
