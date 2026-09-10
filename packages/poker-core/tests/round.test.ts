import { describe, expect, it } from 'vitest';
import {
  applyAutoReveal,
  castVote,
  createRound,
  discardVote,
  nextRound,
  revealBy,
  shouldAutoReveal,
  type Round,
  type VoterView,
} from '../src/round';

const five = { kind: 'number', value: 5 } as const;
const eight = { kind: 'number', value: 8 } as const;

/**
 * 在室者 N 人ぶんの名簿の断片。**#95 S4a で名簿は `Round` の外に出た**ので、
 * 自動公開の判定を見るテストは在室者を明示して渡す。
 */
function votersOf(count: 1 | 2 | 3): VoterView[] {
  return ['p1', 'p2', 'p3'].slice(0, count).map((id) => ({ id, connected: true }));
}

describe('castVote', () => {
  it('voting 中は投票でき、票が記録される', () => {
    const round = castVote(createRound(), 'p2', five)._unsafeUnwrap();
    expect(round.votes.get('p2')).toEqual(five);
  });

  /**
   * @requirements FR-007
   */
  it('公開前の選び直しは上書きになる', () => {
    // Given
    let round = castVote(createRound(), 'p2', five)._unsafeUnwrap();
    // When
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(round.votes.get('p2')).toEqual(eight);
    expect(round.votes.size).toBe(1);
  });

  it('revealed 中の投票は not-voting エラー', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    round = revealBy(round, 'p1')._unsafeUnwrap();
    // When
    const result = castVote(round, 'p2', eight);
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-voting');
  });
});

describe('shouldAutoReveal / applyAutoReveal（FR-008）', () => {
  it('接続中の全参加者が投票したら自動公開の条件が成立する', () => {
    // Given
    let round = createRound();
    // When
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(round, votersOf(2))).toBe(false);
    // When
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(round, votersOf(2))).toBe(true);
    expect(applyAutoReveal(round, votersOf(2)).status).toBe('revealed');
  });

  it('参加者1人でも投票すれば即成立する（Edge Case）', () => {
    const round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    expect(shouldAutoReveal(round, votersOf(1))).toBe(true);
  });

  it('投票中の途中参加で自動公開が保留される（Clarification Q3）', () => {
    // Given
    let round = createRound();
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(round, votersOf(2))).toBe(true);
    // When: 3 人目が投票中に参加する（名簿だけが増え、ラウンドは変わらない）
    // Then
    expect(shouldAutoReveal(round, votersOf(3))).toBe(false);
    expect(applyAutoReveal(round, votersOf(3)).status).toBe('voting');
  });

  it('revealed のラウンドでは成立しない（再公開しない）', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    round = applyAutoReveal(round, votersOf(1));
    // Then
    expect(shouldAutoReveal(round, votersOf(1))).toBe(false);
  });

  /**
   * 旧 `tests/room.test.ts` の `markDisconnected`（US4）から移した 1 本。
   * 切断そのものは名簿（`@tasuki/room-core` の `detachConnection`）の仕事になったので、
   * ここでは「在室者の `connected` が落ちると条件が立つ」という**ラウンド側の性質**だけを見る。
   *
   * @requirements US4-AS1
   */
  it('未投票者の切断で全員投票が成立しうる', () => {
    // Given: 3 人在室で、p3 だけが未投票
    let round = createRound();
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(round, votersOf(3))).toBe(false);
    // When: 未投票の p3 が切断する（名簿側で connected が落ちる）
    const afterDisconnect: VoterView[] = [
      { id: 'p1', connected: true },
      { id: 'p2', connected: true },
      { id: 'p3', connected: false },
    ];
    // Then
    expect(shouldAutoReveal(round, afterDisconnect)).toBe(true);
  });
});

describe('revealBy（FR-009）', () => {
  it('全員の投票を待たずに公開できる', () => {
    // Given
    const round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    const revealed = revealBy(round, 'p1')._unsafeUnwrap();
    // Then
    expect(revealed.status).toBe('revealed');
    expect(revealed.votes.size).toBe(1);
  });

  it('作成者でない参加者も公開できる（役割は無い）', () => {
    // Given
    const round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const revealed = revealBy(round, 'p2')._unsafeUnwrap();
    // Then
    expect(revealed.status).toBe('revealed');
    expect(revealed.votes.get('p1')).toEqual(five);
  });

  it('revealed 中の再公開は not-voting エラー', () => {
    // Given
    const round = revealBy(createRound(), 'p1')._unsafeUnwrap();
    // When
    const result = revealBy(round, 'p1');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-voting');
  });
});

describe('nextRound（FR-011）', () => {
  function revealedRound(): Round {
    let round = createRound();
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    return applyAutoReveal(round, votersOf(2));
  }

  it('revealed → voting に戻り、全票がリセットされる', () => {
    // Given: revealedRound() の呼び出し自体が前提のラウンドを用意する
    // When
    const round = nextRound(revealedRound(), 'p1')._unsafeUnwrap();
    // Then
    expect(round.status).toBe('voting');
    expect(round.votes.size).toBe(0);
  });

  it('voting 中の next-round は not-revealed エラー', () => {
    // Given: createRound() の呼び出し自体が前提のラウンドを用意する
    // When
    const result = nextRound(createRound(), 'p1');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-revealed');
  });

  it('作成者でない参加者も次のラウンドを開始できる（役割は無い）', () => {
    // Given
    const round = revealedRound();
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const next = nextRound(round, 'p2')._unsafeUnwrap();
    // Then
    expect(next.status).toBe('voting');
    expect(next.votes.size).toBe(0);
  });
});

/**
 * #95 S4a: `Round` が集約ルートになり、名簿は `@tasuki/room-core` が持つ。
 *
 * 名簿の断片は**構造的型（`VoterView`）で受ける**。`packages/poker-core` は
 * `@tasuki/room-core` に依存できない（`scripts/audit-dependency-direction.mjs` の
 * 許可表が `["@tasuki/protocol"]` しか許していない・設計正本 D2）。
 */
describe('Round が集約ルート（#95 S4a）', () => {
  const votingRound = (): Round => ({ status: 'voting', votes: new Map() });

  it('投票は Round だけで完結する', () => {
    // Given: votingRound() の呼び出し自体が前提のラウンドを用意する
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）。
    // 成功を先に確かめる 1 行は SC-031 が数える「前提の構築段階に置かれた検証記述」に当たる
    // （`scripts/audit-structure.mjs`）。検出力は変わらない —— 失敗すれば _unsafeUnwrap が
    // 投げてテストは落ちる。**その 1 行の字面をコメントで例示することもできない**
    // （SC-031 の走査はコメントを剥がさないので、例示がそのまま 1 件に数えられる）
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    // Then
    expect(round.votes.get('p1')).toEqual({ kind: 'number', value: 3 });
  });

  it('在室者が全員投票したら自動公開の条件が立つ', () => {
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    const voters = [
      { id: 'p1', connected: true },
      { id: 'p2', connected: false },
    ];
    // When / Then（shouldAutoReveal は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(shouldAutoReveal(round, voters)).toBe(true);
  });

  it('接続中の未投票が 1 人でも居れば自動公開しない', () => {
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    const voters = [
      { id: 'p1', connected: true },
      { id: 'p2', connected: true },
    ];
    // When / Then
    expect(shouldAutoReveal(round, voters)).toBe(false);
    expect(applyAutoReveal(round, voters).status).toBe('voting');
  });

  /**
   * **空の名簿で恒真化しないこと**（設計正本 §6.4 が名指しする最大の危険）。
   *
   * 名簿を引数で受ける形にすると、空の名簿しか渡さないテストは
   * `connected.every(...)` が真になって常に緑になる。この 1 本がその恒真化を殺す。
   */
  it('在室者が 0 人なら自動公開しない（空集合で恒真化しないこと）', () => {
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    // When / Then
    expect(shouldAutoReveal(round, [])).toBe(false);
  });

  it('退出した人の票は捨てる（R8）', () => {
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    // When / Then
    expect(discardVote(round, 'p1').votes.has('p1')).toBe(false);
  });

  it('居ない人の票を捨てても、残る票は巻き添えにならない（R8・対照）', () => {
    // 上の 1 本は「votes を丸ごと空にする」実装でも緑になる。捨てるものが無いときに
    // 何も起きないことを見て、削除が対象の 1 件に閉じていることを確かめる
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    // When
    const after = discardVote(round, 'p2');
    // Then
    expect(after).toBe(round);
    expect(after.votes.get('p1')).toEqual({ kind: 'number', value: 3 });
  });
});
