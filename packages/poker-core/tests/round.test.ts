import { describe, expect, it } from 'vitest';
import { EMPTY_ESTIMATE_LOG } from '../src/estimate-log.js';
import {
  applyAutoReveal,
  castVote,
  createRound,
  discardVote,
  nextItem,
  revealBy,
  revote,
  setItem,
  setPoints,
  setSpectator,
  shouldAutoReveal,
  type Round,
  type VoterView,
} from '../src/round.js';

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
    round = revealBy(round, 'p1', 1000)._unsafeUnwrap();
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
    expect(applyAutoReveal(round, votersOf(2), 1000).status).toBe('revealed');
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
    expect(applyAutoReveal(round, votersOf(3), 1000).status).toBe('voting');
  });

  it('revealed のラウンドでは成立しない（再公開しない）', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    round = applyAutoReveal(round, votersOf(1), 1000);
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
    const revealed = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    // Then
    expect(revealed.status).toBe('revealed');
    expect(revealed.votes.size).toBe(1);
  });

  it('作成者でない参加者も公開できる（役割は無い）', () => {
    // Given
    const round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const revealed = revealBy(round, 'p2', 1000)._unsafeUnwrap();
    // Then
    expect(revealed.status).toBe('revealed');
    expect(revealed.votes.get('p1')).toEqual(five);
  });

  it('revealed 中の再公開は not-voting エラー', () => {
    // Given
    const round = revealBy(createRound(), 'p1', 1000)._unsafeUnwrap();
    // When
    const result = revealBy(round, 'p1', 1000);
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-voting');
  });
});

describe('revote（FR-011）', () => {
  function revealedRound(): Round {
    let round = createRound();
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = castVote(round, 'p2', eight)._unsafeUnwrap();
    return applyAutoReveal(round, votersOf(2), 1000);
  }

  it('revealed → voting に戻り、全票がリセットされる。item と open の束は残る', () => {
    // Given: revealedRound() の呼び出し自体が前提のラウンドを用意する
    const revealed = setItem(revealedRound(), 'PROJ-1');
    // When
    const round = revote(revealed, 'p1')._unsafeUnwrap();
    // Then
    expect(round.status).toBe('voting');
    expect(round.votes.size).toBe(0);
    expect(round.item).toBe('PROJ-1');
    expect(round.log).toBe(revealed.log);
    expect(round.log.groups[0]!.open).toBe(true);
  });

  it('voting 中の revote は not-revealed エラー（op は revote）', () => {
    // When
    const result = revote(createRound(), 'p1');
    // Then
    expect(result._unsafeUnwrapErr()).toEqual({ code: 'not-revealed', op: 'revote' });
  });

  it('作成者でない参加者も再投票を開始できる（役割は無い）', () => {
    // When
    const next = revote(revealedRound(), 'p2')._unsafeUnwrap();
    // Then
    expect(next.status).toBe('voting');
    expect(next.votes.size).toBe(0);
  });
});

describe('nextItem（#93）', () => {
  function revealedRound(): Round {
    let round = setItem(createRound(), 'PROJ-1');
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    return revealBy(round, 'p1', 1000)._unsafeUnwrap();
  }

  it('Given 公開済み / When nextItem 8 / Then voting・票は空・item は空・open の束が閉じて points 8', () => {
    // When
    const round = nextItem(revealedRound(), 'p1', 8)._unsafeUnwrap();
    // Then
    expect(round.status).toBe('voting');
    expect(round.votes.size).toBe(0);
    expect(round.item).toBe('');
    expect(round.log.groups[0]!.open).toBe(false);
    expect(round.log.groups[0]!.points).toBe(8);
  });

  it('Given 公開済み / When nextItem null / Then 束は閉じて points null', () => {
    // When
    const round = nextItem(revealedRound(), 'p1', null)._unsafeUnwrap();
    // Then
    expect(round.log.groups[0]!.open).toBe(false);
    expect(round.log.groups[0]!.points).toBeNull();
  });

  it('Given voting 中 / When nextItem / Then not-revealed（op は next-item）', () => {
    expect(nextItem(createRound(), 'p1', 5)._unsafeUnwrapErr()).toEqual({
      code: 'not-revealed',
      op: 'next-item',
    });
  });
});

describe('開票の記録（#93）', () => {
  it('Given 票と item / When revealBy / Then log に at・item・票の枚数の行が足される', () => {
    // Given
    let round = setItem(createRound(), 'PROJ-1');
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = castVote(round, 'p2', five)._unsafeUnwrap();
    // When
    const revealed = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    // Then
    expect(revealed.log.groups[0]!.entries).toEqual([
      { attempt: 1, at: 1000, item: 'PROJ-1', counts: [{ card: five, count: 2 }] },
    ]);
  });

  it('Given 全員投票 / When applyAutoReveal / Then 1 行足される。立たなければ log は同じ参照', () => {
    // Given
    const voted = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    const revealed = applyAutoReveal(voted, votersOf(1), 2000);
    const held = applyAutoReveal(voted, votersOf(2), 2000);
    // Then
    expect(revealed.log.groups[0]!.entries).toHaveLength(1);
    expect(revealed.log.groups[0]!.entries[0]!.at).toBe(2000);
    expect(held.log).toBe(voted.log);
  });
});

describe('開票後の名前・票なしの開票（#93 PR レビュー）', () => {
  it('Given 名前なしで開票 / When 開票後に setItem / Then 最後の行の item が追う。前の行は変わらない', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    round = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    round = revote(round, 'p1')._unsafeUnwrap();
    round = castVote(round, 'p1', five)._unsafeUnwrap();
    round = revealBy(round, 'p1', 2000)._unsafeUnwrap();
    // When
    const after = setItem(round, 'PROJ-9');
    // Then
    const entries = after.log.groups[0]!.entries;
    expect(entries.map((e) => e.item)).toEqual(['', 'PROJ-9']);
    expect(after.item).toBe('PROJ-9');
  });

  it('Given 開票後 / When setItem して nextItem / Then 閉じた束は後から変わらない', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    round = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    const closed = nextItem(setItem(round, 'A'), 'p1', 5)._unsafeUnwrap();
    // When
    const after = setItem(closed, 'B');
    // Then
    expect(after.log).toBe(closed.log);
  });

  it('Given 投票中 / When setItem / Then log は同じ参照', () => {
    const round = createRound();
    expect(setItem(round, 'X').log).toBe(round.log);
  });

  it('Given 票が 0 / When revealBy / Then 開票はするが log は変わらない', () => {
    const round = createRound();
    const revealed = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    expect(revealed.status).toBe('revealed');
    expect(revealed.log).toBe(round.log);
  });

  it('setItem は不可視・双方向制御文字を取り除く', () => {
    expect(setItem(createRound(), 'A\u202EB\u200B\u0007').item).toBe('AB');
  });
});

describe('setItem / setPoints（#93）', () => {
  it('setItem は前後の空白を削る。status・votes・log は変わらない', () => {
    // Given
    const round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    // When
    const after = setItem(round, '  PROJ-1  ');
    // Then
    expect(after.item).toBe('PROJ-1');
    expect(after.status).toBe(round.status);
    expect(after.votes).toBe(round.votes);
    expect(after.log).toBe(round.log);
  });

  it('setPoints は閉じた束のポイントを直し、setGroupPoints のエラーを RoundError として返す', () => {
    // Given
    let round = castVote(createRound(), 'p1', five)._unsafeUnwrap();
    round = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    // Then: open の束
    expect(setPoints(round, 1, 5)._unsafeUnwrapErr()).toEqual({ code: 'estimate-open' });
    // When: 閉じる
    const closed = nextItem(round, 'p1', 5)._unsafeUnwrap();
    // Then
    expect(setPoints(closed, 1, 8)._unsafeUnwrap().log.groups[0]!.points).toBe(8);
    expect(setPoints(closed, 99, 8)._unsafeUnwrapErr()).toEqual({ code: 'estimate-not-found' });
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
  const votingRound = (): Round => ({ status: 'voting', votes: new Map(), item: '', log: EMPTY_ESTIMATE_LOG, spectators: new Set() });

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
    expect(applyAutoReveal(round, voters, 1000).status).toBe('voting');
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

});

describe('discardVote（退出した人の票を捨てる・R8）', () => {
  const votingRound = (): Round => ({ status: 'voting', votes: new Map(), item: '', log: EMPTY_ESTIMATE_LOG, spectators: new Set() });

  it('Given 票のある人 / When 退出する / Then その票だけが消える', () => {
    // Given: 2 人が投票している
    const voted = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    const both = castVote(voted, 'p2', { kind: 'number', value: 5 })._unsafeUnwrap();

    // When
    const after = discardVote(both, 'p1');

    // Then: 残った人の票は触らない
    expect(after.votes.has('p1')).toBe(false);
    expect(after.votes.get('p2')).toEqual({ kind: 'number', value: 5 });
  });

  it('Given 票のない人 / When 退出する / Then 何も起きない', () => {
    // Given
    const round = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();

    // When: 投票していない人（名簿にすら居ない ID）を渡す
    const after = discardVote(round, 'いない人');

    // Then: 同じ内容のまま（票を消しも足しもしない）
    expect(after.votes.size).toBe(1);
    expect(after.votes.get('p1')).toEqual({ kind: 'number', value: 3 });
  });

  it('Given 公開済みのラウンド / When 票を捨てる / Then status は変わらない', () => {
    // Given: 公開済みのラウンド（集計の正しさは捨てた後の votes で決まる）
    const voted = castVote(votingRound(), 'p1', { kind: 'number', value: 3 })._unsafeUnwrap();
    const revealed = revealBy(voted, 'p1', 1000)._unsafeUnwrap();

    // When
    const after = discardVote(revealed, 'p1');

    // Then: 遷移の判断は呼び出し側（applyAutoReveal）の責務で、ここは票だけを触る
    expect(after.status).toBe('revealed');
    expect(after.votes.size).toBe(0);
  });
});

describe('見学（#419）', () => {
  const voted = (ids: string[]): Round =>
    ids.reduce((r, id) => castVote(r, id, five)._unsafeUnwrap(), createRound());

  it('Given 投票済みの A When 見学へ移る Then 票を捨て見学の集合に入る', () => {
    const round = setSpectator(voted(['p1', 'p2']), 'p1', true);
    expect(round.votes.has('p1')).toBe(false);
    expect(round.votes.has('p2')).toBe(true);
    expect(round.spectators.has('p1')).toBe(true);
  });

  it('Given 開票後 When 見学へ移る Then 票もログも変えない', () => {
    const revealed = revealBy(voted(['p1', 'p2']), 'p1', 1000)._unsafeUnwrap();
    const after = setSpectator(revealed, 'p1', true);
    expect(after.votes.size).toBe(2);
    expect(after.log).toBe(revealed.log);
    expect(after.spectators.has('p1')).toBe(true);
  });

  it('Given 見学者 When 投票する Then spectating で拒否される', () => {
    const round = setSpectator(createRound(), 'p1', true);
    expect(castVote(round, 'p1', five)._unsafeUnwrapErr()).toEqual({ code: 'spectating', op: 'vote' });
  });

  it('Given 見学者 A（未投票）と投票済み B When 自動公開を判定 Then 立つ（対照: 見学でなければ立たない）', () => {
    const base = voted(['p2']);
    const voters = votersOf(2);
    expect(shouldAutoReveal(base, voters)).toBe(false);
    expect(shouldAutoReveal(setSpectator(base, 'p1', true), voters)).toBe(true);
  });

  it('Given 接続中の全員が見学 When 自動公開を判定 Then 立たない。手動公開は通り記録は増えない', () => {
    let round = setSpectator(createRound(), 'p1', true);
    round = setSpectator(round, 'p2', true);
    expect(shouldAutoReveal(round, votersOf(2))).toBe(false);
    const revealed = revealBy(round, 'p1', 1000)._unsafeUnwrap();
    expect(revealed.status).toBe('revealed');
    expect(revealed.log).toBe(round.log);
  });

  it('Given 見学から投票へ戻った A When B だけ投票済み Then 自動公開は立たない（未投票から）', () => {
    let round = setSpectator(voted(['p2']), 'p1', true);
    round = setSpectator(round, 'p1', false);
    expect(round.spectators.has('p1')).toBe(false);
    expect(shouldAutoReveal(round, votersOf(2))).toBe(false);
  });

  it('Given 同じ状態への切り替え When setSpectator Then 同じ参照を返す', () => {
    const round = createRound();
    expect(setSpectator(round, 'p1', false)).toBe(round);
    const spec = setSpectator(round, 'p1', true);
    expect(setSpectator(spec, 'p1', true)).toBe(spec);
  });

  it('Given 見学者 When 退出で discardVote Then 見学の集合からも外れる', () => {
    const spec = setSpectator(createRound(), 'p1', true);
    expect(discardVote(spec, 'p1').spectators.has('p1')).toBe(false);
  });
});
