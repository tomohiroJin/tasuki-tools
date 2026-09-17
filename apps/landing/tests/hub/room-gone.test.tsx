/**
 * ルームが見つからないことを知らせる画面（#274）。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。
 * どちらへ落ちるかを決めるのは `hub/hub-state.ts` の `screenFor` である。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomGone } from '../../src/screens/RoomGone.js';

describe('不在の知らせ', () => {
  it('Given 見つからないルーム / When 描く / Then 名乗りフォームが出ない', () => {
    // **これが #274 の本体である。** 名前を入れさせてから不在を告げるのをやめる
    render(<RoomGone code="朝会モブ-a1b2" />);

    // 見出しが出ていることを先に確かめる。**不在の判定だけに頼らない** ——
    // 何も描かれていない画面に対しても「フォームが無い」は緑になる
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
    expect(screen.queryByRole('button', { name: '参加する' })).toBeNull();
  });

  it('Given 見つからないルーム / When 描く / Then どのコードかが出る', () => {
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.getByText('朝会モブ-a1b2')).toBeTruthy();
  });

  it('Given 見つからないルーム / When 描く / Then 戻る道がある', () => {
    // これが無いと行き止まりになる（poker の同じ画面が持っている性質）
    render(<RoomGone code="朝会モブ-a1b2" />);

    const back = screen.getByRole('link', { name: '新しいルームを作る' });
    expect(back.getAttribute('href')).toBe('/');
  });

  it('Given 見つからないルーム / When 描く / Then 理由を断定しない', () => {
    // **玄関は入れない理由を知らない**（設計正本 D10）。終了したのか、
    // 最初から無いコードなのか、サーバーが再起動したのかを言い分けられない
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.queryByText(/終了しています/)).toBeNull();
  });

  it('Given 見つからないルーム / When 描く / Then 端末の記録は見られる', () => {
    // ルームに入っていなくても記録は見られる（撤去した旧入口の性質を保つ）
    render(<RoomGone code="朝会モブ-a1b2" />);

    expect(screen.getByRole('link', { name: '記録を見る' })).toBeTruthy();
  });
});
