import { describe, it, expect } from 'vitest';
import { revealBy, nextRound, type Round } from '../src/round';

/**
 * @requirements FR-009 FR-011
 *
 * #95 S4a で `Round` が集約ルートになり、名簿は `@tasuki/room-core` が持つ。
 * 「作成者かどうか」は**もともとラウンドの外の情報**で、`revealBy` / `nextRound` は
 * 実行者 ID を受け取っても見ない。名簿を渡さない形になったことで、
 * 「見ていない」ことが署名から読めるようになった（振る舞いは S3 から変わっていない）。
 */
describe('#95 S3: poker は全員が同格である', () => {
  /** 作成者ではない参加者。名簿を持たないラウンドから見れば、ただの ID である */
  const joinerId = 'p-minato';

  it('作成者でない参加者が手動公開できる', () => {
    // Given
    const voting: Round = { status: 'voting', votes: new Map() };
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const revealed = revealBy(voting, joinerId)._unsafeUnwrap();
    // Then
    expect(revealed.status).toBe('revealed');
  });

  it('作成者でない参加者が次のラウンドを始められる', () => {
    // Given
    const revealed: Round = { status: 'revealed', votes: new Map() };
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const next = nextRound(revealed, joinerId)._unsafeUnwrap();
    // Then
    expect(next.status).toBe('voting');
    expect(next.votes.size).toBe(0);
  });
});
