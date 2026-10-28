/**
 * 入口（全員 ☕ → 開く → 再投票 → 全員 ☕ → 開く）と、見積もりとの関係（#403・設計 §4）。
 *
 * @requirements #403 E-1 E-2 E-3 E-4 E-5 G-8 G-9 G-10
 *
 * G-11（最中の見積もりの操作を拒む）はサーバーの振り分けが 1 か所で守る（`apps/tasuki-sync/test/poker/card-game.test.ts`）。
 */
import { describe, expect, it } from 'vitest';
import {
  castVote,
  closeGame,
  createRound,
  dealAgain,
  discardVote,
  exchangeHand,
  gameDeadline,
  nextItem,
  revealBy,
  revote,
  setItem,
  setSpectator,
  settleRound,
  type Round,
  type VoterView,
} from '../src/round.js';
import type { Card } from '../src/deck.js';
import { AWAY_GRACE_MS } from '../src/card-game.js';

const COFFEE: Card = { kind: 'coffee' };
const FIVE: Card = { kind: 'number', value: 5 };
const identity = (n: number) => n - 1;
const people = (...ids: string[]): VoterView[] => ids.map((id) => ({ id, connected: true }));

/** 1 つの操作を、サーバーと同じく settleRound を通して当てる */
function act(round: Round, voters: readonly VoterView[], op: (r: Round) => Round): Round {
  return settleRound(round, op(round), voters, 0, identity);
}

/** 全員が同じ札を出す（最後の 1 枚で自動公開が立つ） */
function everyone(round: Round, voters: readonly VoterView[], card: Card): Round {
  return voters.reduce((r, v) => act(r, voters, (x) => castVote(x, v.id, card)._unsafeUnwrap()), round);
}

const again = (r: Round, voters: readonly VoterView[]) => act(r, voters, (x) => revote(x, 'a')._unsafeUnwrap());

describe('入口（E-1〜E-5）', () => {
  const two = people('a', 'b');

  it('Given 2 人 / When 全員 ☕ で開く / Then 構えるだけで、まだ始まらない（E-1）', () => {
    const r = everyone(createRound(), two, COFFEE);
    expect(r.status).toBe('revealed');
    expect(r.coffeeArmed).toBe(true);
    expect(r.game).toBeNull();
  });

  it('Given 構えている / When 再投票して、また全員 ☕ で開く / Then 全員に配って始まる（E-2）', () => {
    const r = everyone(again(everyone(createRound(), two, COFFEE), two), two, COFFEE);
    expect(r.game?.players).toEqual(['a', 'b']);
    expect(r.game?.hands.get('a')).toHaveLength(5);
    expect(r.coffeeArmed).toBe(false);
  });

  it('Given 1 人のルーム / When 同じ手順 / Then 同じく始まる（E-4）', () => {
    const solo = people('a');
    const r = everyone(again(everyone(createRound(), solo, COFFEE), solo), solo, COFFEE);
    expect(r.game?.players).toEqual(['a']);
  });

  it('Given 全員 ☕ が 1 回だけ / When 再投票して ☕ 以外が混ざる / Then 始まらず、構えも解ける（E-3）', () => {
    let r = again(everyone(createRound(), two, COFFEE), two);
    r = act(r, two, (x) => castVote(x, 'a', COFFEE)._unsafeUnwrap());
    r = act(r, two, (x) => castVote(x, 'b', FIVE)._unsafeUnwrap());
    expect(r.game).toBeNull();
    expect(r.coffeeArmed).toBe(false);
    // 次に全員 ☕ でも 1 回目に数え直す
    r = everyone(again(r, two), two, COFFEE);
    expect(r.game).toBeNull();
    expect(r.coffeeArmed).toBe(true);
  });

  it('Given 構えている / When 次のアイテムへ / Then 構えが解ける（E-3）', () => {
    let r = everyone(createRound(), two, COFFEE);
    r = act(r, two, (x) => nextItem(x, 'a', null)._unsafeUnwrap());
    expect(r.coffeeArmed).toBe(false);
    r = everyone(r, two, COFFEE);
    expect(r.game).toBeNull();
  });

  it('Given ☕ を出したのが 1 人だけ / When 手動で開く / Then 全員 ☕ と数えない（E-5）', () => {
    let r = act(createRound(), two, (x) => castVote(x, 'a', COFFEE)._unsafeUnwrap());
    r = act(r, two, (x) => revealBy(x, 'a', 0)._unsafeUnwrap());
    expect(r.coffeeArmed).toBe(false);
  });

  it('Given 見学者が 1 人 / When 投票者の全員が ☕ を 2 回 / Then 始まり、見学者はプレイヤーにならない', () => {
    const three = people('a', 'b', 's');
    let r = act(createRound(), three, (x) => setSpectator(x, 's', true));
    r = everyone(r, people('a', 'b'), COFFEE);
    r = everyone(again(r, three), people('a', 'b'), COFFEE);
    expect(r.game?.players).toEqual(['a', 'b']);
  });

  it('Given 普段の見積もり / When ☕ 以外で開く / Then 構えない', () => {
    expect(everyone(createRound(), two, FIVE).coffeeArmed).toBe(false);
  });
});

/** 2 人で始まったところ */
function playing(): { round: Round; voters: VoterView[] } {
  const voters = people('a', 'b');
  return { round: everyone(again(everyone(createRound(), voters, COFFEE), voters), voters, COFFEE), voters };
}

describe('ゲームの最中（G-7・G-11）', () => {
  it('Given 最中 / When アイテム名を設定 / Then 受ける', () => {
    expect(setItem(playing().round, 'ログイン').item).toBe('ログイン');
  });

  it('Given 2 人 / When 2 人ともチェンジ / Then settleRound が開く', () => {
    const { round, voters } = playing();
    let r = act(round, voters, (x) => exchangeHand(x, 'a', [0], identity)._unsafeUnwrap());
    expect(r.game?.status).toBe('exchanging');
    r = act(r, voters, (x) => exchangeHand(x, 'b', [], identity)._unsafeUnwrap());
    expect(r.game?.status).toBe('shown');
  });

  it('Given b の接続が切れた / When a がチェンジ / Then 猶予の間は待ち、猶予を過ぎた判定で開く', () => {
    const { round } = playing();
    const away = [{ id: 'a', connected: true }, { id: 'b', connected: false }];
    const r = settleRound(round, exchangeHand(round, 'a', [], identity)._unsafeUnwrap(), away, 1000, identity);
    expect(r.game?.status).toBe('exchanging');
    expect(gameDeadline(r)).toBe(1000 + AWAY_GRACE_MS);
    expect(settleRound(r, r, away, 1000 + AWAY_GRACE_MS, identity).game?.status).toBe('shown');
  });

  it('Given ゲームが無い / 開いたあと / When 予約の時刻を尋ねる / Then 要らない', () => {
    expect(gameDeadline(createRound())).toBeNull();
  });

  it('Given ゲームが無い / When チェンジ / Then table-no-game', () => {
    expect(exchangeHand(createRound(), 'a', [], identity)._unsafeUnwrapErr()).toEqual({ code: 'table-no-game' });
  });
});

describe('もう一度・見積もりに戻る・抜ける（G-8〜G-10）', () => {
  function shown(): { round: Round; voters: VoterView[] } {
    const { round, voters } = playing();
    let r = act(round, voters, (x) => exchangeHand(x, 'a', [], identity)._unsafeUnwrap());
    r = act(r, voters, (x) => exchangeHand(x, 'b', [], identity)._unsafeUnwrap());
    return { round: r, voters };
  }

  it('Given 開いたあと / When もう一度 / Then いまの投票者で配り直す（G-9）', () => {
    const { round } = shown();
    const r = dealAgain(round, 'a', people('a', 'b', 'c'), identity)._unsafeUnwrap();
    expect(r.game?.status).toBe('exchanging');
    expect(r.game?.players).toEqual(['a', 'b', 'c']);
  });

  it('Given チェンジの最中 / When もう一度 / Then table-in-play', () => {
    const { round, voters } = playing();
    expect(dealAgain(round, 'a', voters, identity)._unsafeUnwrapErr()).toEqual({ code: 'table-in-play' });
  });

  it('Given 最中 / When 見積もりに戻る / Then ゲームが消え、票の無い投票中へ戻る（G-10）', () => {
    const { round } = playing();
    const r = closeGame(round)._unsafeUnwrap();
    expect(r.game).toBeNull();
    expect(r.status).toBe('voting');
    expect(r.votes.size).toBe(0);
    expect(r.coffeeArmed).toBe(false);
  });

  it('Given ゲームが無い / When 見積もりに戻る・もう一度 / Then table-no-game', () => {
    expect(closeGame(createRound())._unsafeUnwrapErr()).toEqual({ code: 'table-no-game' });
    expect(dealAgain(createRound(), 'a', people('a'), identity)._unsafeUnwrapErr()).toEqual({ code: 'table-no-game' });
  });

  it('Given 2 人 / When 1 人がルームから外れる / Then その人だけプレイヤーから消える（G-8）', () => {
    const r = discardVote(playing().round, 'a');
    expect(r.game?.players).toEqual(['b']);
  });

  it('Given 1 人だけのゲーム / When その人が外れる / Then ゲームが終わり、投票中へ戻る（G-8）', () => {
    const solo = people('a');
    const round = everyone(again(everyone(createRound(), solo, COFFEE), solo), solo, COFFEE);
    const r = discardVote(round, 'a');
    expect(r.game).toBeNull();
    expect(r.status).toBe('voting');
  });

  it('Given 票もゲームも無い人 / When discardVote / Then 入力と同じ値', () => {
    const { round } = playing();
    expect(discardVote(round, 'x')).toBe(round);
  });
});
