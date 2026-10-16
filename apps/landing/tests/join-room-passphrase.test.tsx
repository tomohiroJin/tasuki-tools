/**
 * 参加の画面の合言葉の欄の上限（#377）。
 *
 * 玄関の `room.join` は、timer と同じ上限（`@tasuki/room-core` の `MAX_PASSPHRASE`）で
 * 合言葉の長さを確かめ、超えたら「コマンドの形式が不正です」で断る。欄に上限が無いと、
 * 長い合言葉を貼った人はなぜ入れないのかを知る手段が無い（timer の合言葉の欄も同じ上限を持つ）。
 *
 * **期待値に 128 を書かない**（上限を動かしたときに画面とテストが揃って古いまま緑になる）。
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MAX_PASSPHRASE } from '@tasuki/room-core';
import { JoinRoom } from '../src/screens/JoinRoom.js';

describe('参加の画面の合言葉の欄', () => {
  it('Given 合言葉を求められた / When 合言葉の入力を見る / Then 合言葉の上限で打ち切られる', () => {
    // Given / When
    render(
      <JoinRoom
        departure={null}
        code="ABC123"
        defaultDisplayName="いずみ"
        error={null}
        needsPassphrase
        connection="online"
        onJoin={() => {}}
      />,
    );

    // Then
    expect(screen.getByLabelText<HTMLInputElement>('合言葉').maxLength).toBe(MAX_PASSPHRASE);
  });
});
