import { describe, expect, it } from 'vitest';
import { castVote, createRound, revealBy, type Round } from '../src/round';
import { createSnapshotBuilder, type ParticipantFragment } from '../src/snapshot';

/**
 * 受信者 1 人ぶんの投影を取る。
 *
 * **`createSnapshotBuilder` は公開の入口そのものである。** 以前は同じ 1 行を
 * `snapshotFor` として src 側に置いていたが、取り込んでいたのはこのテストだけで、
 * 製品コードは 1 箇所も使っていなかった（#223 で削除した）。検証している中身は
 * 変えていない —— ビルダーが返す関数を 1 回呼ぶだけで、以前と同じ値が得られる。
 */
function snapshotFor(round: Round, viewerId: string) {
  return createSnapshotBuilder('room0001', round, twoPeople)(viewerId);
}

/**
 * 2 人の名簿の断片。
 *
 * **#95 S4a でトークンは引数から消えた。** 以前は `Room.participants` の要素が
 * `token` を持っており、スナップショットが**落とし忘れないこと**を SC-004 のテストが
 * 見張っていた。いまは `ParticipantFragment` に `token` というフィールドが無い
 * ——「受け取らないものは漏らせない」——ので、秘匿は型の側で構造的に保証される。
 * それでも下の SC-004 のテストは残す（**組み立て側が名簿の断片以外の出所から
 * 秘密を混ぜないこと**は、型では保証されないため）。
 */
const twoPeople: ParticipantFragment[] = [
  { id: 'p-creator', name: 'たろう', connected: true },
  { id: 'p-guest', name: 'はなこ', connected: true },
];

describe('snapshotFor（受信者別投影, research R1）', () => {
  /**
   * @requirements SC-004
   */
  it('participants に token がいかなる形でも含まれない', () => {
    // Given: createRound() の呼び出し自体が前提のラウンドを用意する
    // When
    const snapshot = snapshotFor(createRound(), 'p-creator');
    const json = JSON.stringify(snapshot);
    // Then
    expect(json).not.toContain('token');
  });

  it('you は受信者自身の participantId になる', () => {
    // Given
    const round = createRound();
    // When / Then（snapshotFor は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(snapshotFor(round, 'p-creator').you).toBe('p-creator');
    expect(snapshotFor(round, 'p-guest').you).toBe('p-guest');
  });

  it('room-state 型で voting ラウンドと参加者一覧（hasVoted 付き）を返す', () => {
    // Given: createRound() の呼び出し自体が前提のラウンドを用意する
    // When
    const snapshot = snapshotFor(createRound(), 'p-guest');
    // Then
    expect(snapshot.type).toBe('room-state');
    expect(snapshot.roomId).toBe('room0001');
    expect(snapshot.round).toEqual({ status: 'voting' });
    expect(snapshot.participants).toEqual([
      { id: 'p-creator', name: 'たろう', connected: true, hasVoted: false },
      { id: 'p-guest', name: 'はなこ', connected: true, hasVoted: false },
    ]);
    expect(snapshot.yourVote).toBeNull();
  });

  it('名簿の connected がそのまま participants に載る', () => {
    // 名簿と `Round` を別々に受ける形にしたので、connected の出所は名簿の断片だけになった。
    // 引数を落とすと全員 connected: true に見えてしまうため、false を 1 人置いて固定する
    // Given
    const roster: ParticipantFragment[] = [
      { id: 'p-creator', name: 'たろう', connected: true },
      { id: 'p-guest', name: 'はなこ', connected: false },
    ];
    // When
    const snapshot = createSnapshotBuilder('room0001', createRound(), roster)('p-creator');
    // Then
    expect(snapshot.participants.map((p) => p.connected)).toEqual([true, false]);
  });
});

describe('snapshotFor: 投票中の秘匿（SC-004 / FR-006）', () => {
  const five = { kind: 'number', value: 5 } as const;

  function votedRound(): Round {
    // p-guest だけが「5」に投票済みの voting 状態
    return castVote(createRound(), 'p-guest', five)._unsafeUnwrap();
  }

  it('他者の票は hasVoted のみで、選択値がいかなる形でも含まれない', () => {
    // Given: votedRound() の呼び出し自体が前提のラウンドを用意する
    // When
    const snapshot = snapshotFor(votedRound(), 'p-creator');
    const json = JSON.stringify(snapshot);
    // Then
    expect(json).not.toContain('"kind"'); // カード表現そのものが存在しない
    const guest = snapshot.participants.find((p) => p.id === 'p-guest');
    expect(guest?.hasVoted).toBe(true);
    expect(snapshot.yourVote).toBeNull();
  });

  it('本人には yourVote として自分の票が見える', () => {
    const snapshot = snapshotFor(votedRound(), 'p-guest');
    expect(snapshot.yourVote).toEqual(five);
  });
});

describe('snapshotFor: 公開後（FR-006 / 契約 #5）', () => {
  const five = { kind: 'number', value: 5 } as const;

  it('revealed 後は全票が votes に載り、未投票者は含まれない', () => {
    // Given
    let round = castVote(createRound(), 'p-guest', five)._unsafeUnwrap();
    round = revealBy(round, 'p-creator')._unsafeUnwrap();
    // When
    const snapshot = snapshotFor(round, 'p-creator');
    // Then
    expect(snapshot.round.status).toBe('revealed');
    if (snapshot.round.status !== 'revealed') throw new Error('unreachable');
    expect(snapshot.round.votes).toEqual([{ participantId: 'p-guest', card: five }]);
    expect(snapshot.round.stats).toBeDefined();
  });
});
