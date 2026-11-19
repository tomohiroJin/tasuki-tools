/**
 * 開票後の票の「全員一致」「全員バラバラ」の判定（#639）。
 *
 * - 数字の札だけで判定する。? と ☕ が 1 枚でも混ざれば、一致にもバラバラにもしない
 * - 一致は票 2 人以上、バラバラは票 3 人以上（2 人で違うのはよくあるので出さない）
 * - 見学者は票を持たない（#419）。判定は票の配列だけを見るので、票の無い見学者は数に入らない
 *
 * @requirements #639
 */
import { describe, expect, it } from 'vitest';
import { SCATTER_MIN_VOTES, UNANIMOUS_MIN_VOTES, judgeAgreement } from '../src/agreement.js';
import type { Card } from '../src/deck.js';
import type { VoteView } from '../src/protocol.js';

const n = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const q: Card = { kind: 'question' };
const coffee: Card = { kind: 'coffee' };
const vote = (participantId: string, card: Card): VoteView => ({ participantId, card });

describe('judgeAgreement（#639）', () => {
  it('閾値は一致 2 票・バラバラ 3 票', () => {
    expect(UNANIMOUS_MIN_VOTES).toBe(2);
    expect(SCATTER_MIN_VOTES).toBe(3);
  });

  describe('全員一致', () => {
    it('Given 2 人が同じ数字 / When 判定する / Then unanimous', () => {
      expect(judgeAgreement([vote('a', n(5)), vote('b', n(5))])).toBe('unanimous');
    });

    it('Given 4 人が同じ数字（0 を含む） / When 判定する / Then unanimous', () => {
      expect(judgeAgreement([vote('a', n(0)), vote('b', n(0)), vote('c', n(0)), vote('d', n(0))])).toBe('unanimous');
    });

    it('Given 1 人だけ / When 判定する / Then 一致ではない（下限 2 人）', () => {
      expect(judgeAgreement([vote('a', n(5))])).toBeNull();
    });

    it('Given 2 人が隣の数字 / When 判定する / Then 一致でもバラバラでもない', () => {
      expect(judgeAgreement([vote('a', n(5)), vote('b', n(8))])).toBeNull();
    });

    it('Given 3 人のうち 1 人だけ違う / When 判定する / Then 一致ではない', () => {
      expect(judgeAgreement([vote('a', n(5)), vote('b', n(5)), vote('c', n(8))])).toBeNull();
    });

    it('Given 全員が ? / When 判定する / Then 一致にしない', () => {
      expect(judgeAgreement([vote('a', q), vote('b', q)])).toBeNull();
    });

    it('Given 全員が ☕ / When 判定する / Then 一致にしない（休憩は第 2 段）', () => {
      expect(judgeAgreement([vote('a', coffee), vote('b', coffee)])).toBeNull();
    });

    it('Given 同じ数字に ? が 1 枚混ざる / When 判定する / Then 一致にしない', () => {
      expect(judgeAgreement([vote('a', n(5)), vote('b', n(5)), vote('c', q)])).toBeNull();
    });

    it('Given 同じ数字に ☕ が 1 枚混ざる / When 判定する / Then 一致にしない', () => {
      expect(judgeAgreement([vote('a', n(5)), vote('b', coffee), vote('c', n(5))])).toBeNull();
    });
  });

  describe('全員バラバラ', () => {
    it('Given 3 人が互いに違う数字 / When 判定する / Then scattered', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(5)), vote('c', n(13))])).toBe('scattered');
    });

    it('Given 隣同士の数字だけで 3 人が違う / When 判定する / Then scattered（段の離れは見ない。割れの促しは #405 の別の判定）', () => {
      expect(judgeAgreement([vote('a', n(3)), vote('b', n(5)), vote('c', n(8))])).toBe('scattered');
    });

    it('Given 2 人が違う数字 / When 判定する / Then バラバラにしない（下限 3 人）', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(21))])).toBeNull();
    });

    it('Given 3 人のうち 2 人が同じ / When 判定する / Then バラバラにしない（同じ札が 1 組ある）', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(1)), vote('c', n(13))])).toBeNull();
    });

    it('Given 4 人が 2 組に割れた / When 判定する / Then バラバラにしない', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(1)), vote('c', n(8)), vote('d', n(8))])).toBeNull();
    });

    it('Given 数字 2 枚と ? が違う札 / When 判定する / Then バラバラにしない（? は見積もりではないので数えない）', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(5)), vote('c', q)])).toBeNull();
    });

    it('Given 数字 2 枚と ☕ / When 判定する / Then バラバラにしない', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(5)), vote('c', coffee)])).toBeNull();
    });

    it('Given 数字 3 枚が違い ? も 1 枚混ざる / When 判定する / Then バラバラにしない（混ざれば判定しない）', () => {
      expect(judgeAgreement([vote('a', n(1)), vote('b', n(5)), vote('c', n(8)), vote('d', q)])).toBeNull();
    });

    it('Given ? と ☕ と数字が全部違う / When 判定する / Then バラバラにしない', () => {
      expect(judgeAgreement([vote('a', q), vote('b', coffee), vote('c', n(3))])).toBeNull();
    });
  });

  describe('境界', () => {
    it('Given 票が 0 件 / When 判定する / Then null', () => {
      expect(judgeAgreement([])).toBeNull();
    });

    it('Given 見学者が票を持たず、投票者 2 人が同じ数字 / When 票だけで判定する / Then unanimous（見学者は数に入らない）', () => {
      // 見学者は票の配列に現れない。参加者は 3 人でも、票は 2 票
      expect(judgeAgreement([vote('voter-1', n(3)), vote('voter-2', n(3))])).toBe('unanimous');
    });

    it('Given 見学者が票を残している（切り替え前の票） / When 判定する / Then 集計に入っている票として数える', () => {
      expect(judgeAgreement([vote('a', n(3)), vote('b', n(3)), vote('spectator', n(3))])).toBe('unanimous');
    });

    it('Given 投票者 2 人が違う数字で見学者は票なし / When 判定する / Then バラバラにしない（票は 2 票）', () => {
      expect(judgeAgreement([vote('voter-1', n(3)), vote('voter-2', n(13))])).toBeNull();
    });
  });
});
