/**
 * WS フレームの走査が「見つけるべきものを見つける」ことを固定する。
 *
 * `collectCards` は poker の秘匿判定の中核で、**空を返すことが合格**という向きの
 * 検査に使う。つまり走査が壊れて何も見つけられなくなっても、E2E は緑のままになる。
 * ここでその型の劣化を落とす。Caddy もブラウザも要らないので `pnpm test` の速い側に置く。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../harness/paths';
import { CARD_KINDS, collectCards, describeCards, parseFrames } from '../support/ws-frames';

/** カードの単一情報源。ここがずれると走査が実体を取りこぼす。 */
const DECK_SOURCE = readFileSync(path.join(REPO_ROOT, 'packages/poker-core/src/deck.ts'), 'utf8');

/** deck.ts が宣言しているカード種別を拾う。 */
function declaredCardKinds(): string[] {
  const kinds = new Set<string>();
  for (const match of DECK_SOURCE.matchAll(/kind:\s*'([a-z]+)'/g)) {
    const kind = match[1];
    if (kind !== undefined) kinds.add(kind);
  }
  return [...kinds].sort();
}

const PARTICIPANT_A = { id: 'p1', name: 'e2e-a', isHost: true, connected: true, hasVoted: false };
const PARTICIPANT_B = { id: 'p2', name: 'e2e-b', isHost: false, connected: true, hasVoted: true };

/** 投票中にサーバーが実際に送る形（`packages/poker-core/src/snapshot.ts:22-24`）。 */
const VOTING_FRAME = {
  type: 'room-state',
  roomId: 'abc12345',
  you: 'p1',
  participants: [PARTICIPANT_A, PARTICIPANT_B],
  round: { status: 'voting' },
  yourVote: null,
};

/** 公開後の形（同 26-30 行）。 */
const REVEALED_FRAME = {
  type: 'room-state',
  roomId: 'abc12345',
  you: 'p1',
  participants: [{ ...PARTICIPANT_A, hasVoted: true }, PARTICIPANT_B],
  round: {
    status: 'revealed',
    votes: [
      { participantId: 'p1', card: { kind: 'number', value: 5 } },
      { participantId: 'p2', card: { kind: 'coffee' } },
    ],
    stats: { average: 5, modes: [] },
  },
  yourVote: { kind: 'number', value: 5 },
};

describe('カード種別の単一情報源との一致', () => {
  it('Given deck.ts / When kind の宣言を数える / Then 1 つ以上ある（走査先を間違えていない）', () => {
    // Given: deck.ts を読む / When: kind: '...' を集める
    // Then: 0 件だと次のテストが空集合同士の比較で素通りする
    expect(declaredCardKinds().length).toBeGreaterThan(0);
  });

  it('Given deck.ts / When CARD_KINDS と突き合わせる / Then 完全に一致する', () => {
    // Given / When
    // Then: 種別が増えたのに走査が知らないままだと、その種別の漏洩を見逃す
    expect(declaredCardKinds()).toEqual([...CARD_KINDS].sort());
  });
});

describe('collectCards', () => {
  it('Given 投票中のフレーム / When 走査する / Then カードは 1 枚も無い', () => {
    // Given: サーバーが実際に送る voting の形
    // When / Then: これが秘匿の合格状態
    expect(collectCards(VOTING_FRAME)).toEqual([]);
  });

  it('Given 公開後のフレーム / When 走査する / Then 全員ぶんと自分の票を見つける', () => {
    // Given / When: votes 2 枚 + yourVote 1 枚
    const found = describeCards(collectCards(REVEALED_FRAME)).split(', ').sort();
    // Then: 見つけられること自体を固定する（常に空を返す実装へ劣化させない）
    expect(found).toEqual(['coffee', 'number:5', 'number:5']);
  });

  it('Given 参加者行に票が混ざったフレーム / When 走査する / Then 見つける', () => {
    // Given: **これが検出したい壊れ方そのもの。** 参加者行に card が生えても
    //        UI は参照しないので DOM には出ない
    const leaked = {
      ...VOTING_FRAME,
      participants: [PARTICIPANT_A, { ...PARTICIPANT_B, card: { kind: 'coffee' } }],
    };
    // When / Then
    expect(describeCards(collectCards(leaked))).toBe('coffee');
  });

  it('Given round に見慣れない名前で票が付いたフレーム / When 走査する / Then 見つける', () => {
    // Given: 場所を決め打ちしていないことの確認（votes という名前でなくても拾う）
    const leaked = {
      ...VOTING_FRAME,
      round: { status: 'voting', peek: [{ card: { kind: 'number', value: 13 } }] },
    };
    // When / Then
    expect(describeCards(collectCards(leaked))).toBe('number:13');
  });

  it.each([null, undefined, 42, 'coffee', { kind: 'espresso' }, { kind: 5 }])(
    'Given カードでない値 %s / When 走査する / Then 何も見つけない',
    (value) => {
      // Given: 文字列 'coffee' のような紛らわしい値で誤検知しないこと
      expect(collectCards(value)).toEqual([]);
    },
  );
});

describe('parseFrames', () => {
  it('Given JSON と非 JSON が混ざったフレーム列 / When 解釈する / Then JSON だけを受信順に返す', () => {
    // Given: 制御用の非 JSON が混ざっても落ちない
    const parsed = parseFrames(['{"type":"a"}', 'not json', '{"type":"b"}']);
    // When / Then
    expect(parsed).toEqual([{ type: 'a' }, { type: 'b' }]);
  });
});
