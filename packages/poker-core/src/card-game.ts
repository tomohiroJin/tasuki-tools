// 隠しモードのゲーム（#403・設計 §4・§6.1）。5 枚を配り、1 回だけチェンジして、全員の手と役を開く。
//
// **見積もりとは別の部分として `Round.game` に持つ**（設計 D5）。乱数は注入する（憲法 原則 VI）。
// 勝ち負けは付けない（設計 D2）—— 役の判定は投影（`snapshot.ts`）が手ごとに行うだけである。
import { err, ok, type Result } from 'neverthrow';
import { FULL_DECK, type PlayingCard } from './playing-card.js';

/** 1 人に配る枚数 */
export const HAND_SIZE = 5;
/** プレイヤーの上限。52 枚で 5 枚ずつ配れるのは 10 人まで（G-2） */
export const MAX_PLAYERS = 10;

export interface CardGame {
  status: 'exchanging' | 'shown';
  /** プレイヤーの参加者 ID（席順） */
  players: readonly string[];
  /** 参加者 ID → 手（5 枚。チェンジで替えた札は同じ位置に入る） */
  hands: ReadonlyMap<string, readonly PlayingCard[]>;
  /** チェンジを済ませた人（このまま、を含む） */
  exchanged: ReadonlySet<string>;
  /** 残りの山（wire には出さない） */
  deck: readonly PlayingCard[];
  /** 捨て札（wire には出さない） */
  discards: readonly PlayingCard[];
}

export type GameError =
  | { code: 'table-not-player' }
  | { code: 'table-exchanged' }
  | { code: 'table-no-game' }
  | { code: 'table-in-play' };

/** `[0, n)` の整数を返す乱数 */
export type RandomInt = (n: number) => number;

/** 52 枚を切り、先頭 {@link MAX_PLAYERS} 人へ席順に 5 枚ずつ配る（G-1・G-2）。プレイヤーが居なければ null */
export function dealGame(candidates: readonly string[], randomInt: RandomInt): CardGame | null {
  const players = candidates.slice(0, MAX_PLAYERS);
  if (players.length === 0) return null;
  const deck = shuffle([...FULL_DECK], randomInt);
  const hands = new Map(players.map((id, i) => [id, deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)] as const));
  return {
    status: 'exchanging',
    players,
    hands,
    exchanged: new Set(),
    deck: deck.slice(players.length * HAND_SIZE),
    discards: [],
  };
}

/**
 * チェンジ（G-4〜G-6）。`discard` は手の位置（0〜4）。選んだ札を捨て、同じ位置へ山の上から引く。
 * 何も選ばなければ「このまま」で、それも 1 回と数える。
 *
 * 山が足りなければ、まず捨て札を切り直して足す（G-5）。それでも足りないのは、10 人が配られて山が 2 枚しか無いときだけで、
 * そのときは今捨てた札も切り直して足す（札の外に 52 枚以外の札は無いので、自分の札が戻ることは避けられない）。
 */
export function exchangeCards(
  game: CardGame,
  playerId: string,
  discard: readonly number[],
  randomInt: RandomInt,
): Result<CardGame, GameError> {
  const hand = game.hands.get(playerId);
  if (hand === undefined) return err({ code: 'table-not-player' });
  if (game.status !== 'exchanging' || game.exchanged.has(playerId)) return err({ code: 'table-exchanged' });

  const drop = new Set(discard.filter((i) => i >= 0 && i < hand.length));
  let thrown = hand.filter((_, i) => drop.has(i));
  let deck = [...game.deck];
  let discards = [...game.discards];
  if (deck.length < thrown.length) {
    deck = [...deck, ...shuffle(discards, randomInt)];
    discards = [];
  }
  if (deck.length < thrown.length) {
    deck = [...deck, ...shuffle(thrown, randomInt)];
    thrown = [];
  }
  let drawn = 0;
  const next = hand.map((card, i) => (drop.has(i) ? deck[drawn++]! : card));
  const hands = new Map(game.hands);
  hands.set(playerId, next);
  return ok({
    ...game,
    hands,
    exchanged: new Set([...game.exchanged, playerId]),
    deck: deck.slice(drawn),
    discards: [...discards, ...thrown],
  });
}

/**
 * 接続中のプレイヤーが全員チェンジを済ませていれば開く（G-7）。そうでなければ入力と同じ値を返す。
 *
 * **接続の切れた人は待たない**（席を離れたまま戻らない人でゲームが止まらないように）。手は残すので、
 * 戻ってくれば開いた結果に自分の手も並ぶ。接続中のプレイヤーが 1 人も居なければ開かない。
 */
export function revealIfReady(game: CardGame, isConnected: (participantId: string) => boolean): CardGame {
  if (game.status !== 'exchanging') return game;
  const waiting = game.players.filter(isConnected);
  if (waiting.length === 0 || !waiting.every((id) => game.exchanged.has(id))) return game;
  return { ...game, status: 'shown' };
}

/** プレイヤーを外す（G-8）。手は捨て札へ。プレイヤーが居なくなればゲームを終える（null） */
export function dropPlayer(game: CardGame, participantId: string): CardGame | null {
  const hand = game.hands.get(participantId);
  if (hand === undefined) return game;
  const players = game.players.filter((id) => id !== participantId);
  if (players.length === 0) return null;
  const hands = new Map(game.hands);
  hands.delete(participantId);
  const exchanged = new Set(game.exchanged);
  exchanged.delete(participantId);
  return { ...game, players, hands, exchanged, discards: [...game.discards, ...hand] };
}

/** Fisher–Yates（その場で並べ替えて返す） */
function shuffle<T>(arr: T[], randomInt: RandomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
