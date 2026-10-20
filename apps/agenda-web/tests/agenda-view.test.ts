/**
 * 盤の文字（#429 spec §7.3・§7.6）。どの局面で何を出すかを、agenda-core の遷移で作った写しで見る。
 */
import { describe, expect, it } from 'vitest';
import {
  centerLines,
  driftShort,
  driftTone,
  extensionLine,
  footerLine,
  nextStepName,
  projectedEndClock,
  signedDuration,
  stepRows,
  summaryText,
} from '../src/agenda-view';
import { Driver, MIN, idleView } from './support/agenda-states';

/** 2026-10-20 14:00 の手元の時計 */
const WALL = new Date(2026, 9, 20, 14, 0, 0);

/**
 * @requirements #429 spec §7.3（文字の優先順位）・§7.4（色以外の手がかり）
 */
describe('盤の中央の文字', () => {
  it('進行中は残りを m:ss で出す（秒は切り上げ。残り 0.4 秒は 0:01）', () => {
    const d = new Driver([5, 7]);
    expect(centerLines(d.view(1 * MIN)).primary).toBe('4:00');
    expect(centerLines(d.view(5 * MIN - 400)).primary).toBe('0:01');
    expect(centerLines(d.view(1 * MIN)).isOverrun).toBe(false);
  });

  it('オーバー中は「+」が付いて +0:30 で始まり、isOverrun になる（m446）', () => {
    const lines = centerLines(new Driver([5, 7]).view(5 * MIN + 30_000));
    expect(lines.primary).toBe('+0:30');
    expect(lines.isOverrun).toBe(true);
  });

  it('残りがちょうど 0 になったら +0:00（0:00 から切り替わる）', () => {
    const lines = centerLines(new Driver([5]).view(5 * MIN));
    expect(lines.primary).toBe('+0:00');
    expect(lines.isOverrun).toBe(true);
  });

  it('60 分を超える残りも分を繰り上げずに出す', () => {
    expect(centerLines(new Driver([90]).view(0)).primary).toBe('90:00');
  });

  it('押し巻きは 3 通り: 予定より +3 分・予定より −2 分（U+2212）・予定どおり', () => {
    const late = new Driver([5, 7]).extend(3).view(1 * MIN);
    expect(centerLines(late).drift).toBe('予定より +3 分');
    expect(driftTone(late)).toBe('late');
    const early = new Driver([5, 7]).next(3 * MIN).view(3 * MIN);
    expect(centerLines(early).drift).toBe('予定より −2 分');
    expect(driftTone(early)).toBe('early');
    const even = new Driver([5, 7]).view(2 * MIN);
    expect(centerLines(even).drift).toBe('予定どおり');
    expect(driftTone(even)).toBe('even');
  });

  it('巻きも押しと同じ境目で丸める（−30 秒は −1 分・−29 秒は予定どおり・−90 秒は −2 分）', () => {
    // 5 分 + 7 分。1 つ目を早めに終えた分だけ巻く（見込み = 経過 + 7 分）
    const at = (earlyMs: number) => new Driver([5, 7]).next(5 * MIN - earlyMs).view(5 * MIN - earlyMs);
    expect(centerLines(at(30_000)).drift).toBe('予定より \u22121 分');
    expect(driftTone(at(30_000))).toBe('early');
    expect(centerLines(at(29_000)).drift).toBe('予定どおり');
    expect(driftTone(at(29_000))).toBe('even');
    expect(centerLines(at(90_000)).drift).toBe('予定より \u22122 分');
  });

  it('押し巻きは分へ丸める（29 秒の押しは予定どおり・31 秒は +1 分）', () => {
    expect(centerLines(new Driver([5, 7]).view(5 * MIN + 29_000)).drift).toBe('予定どおり');
    expect(centerLines(new Driver([5, 7]).view(5 * MIN + 31_000)).drift).toBe('予定より +1 分');
  });

  it('名前は 40 字でも切らずにそのまま返す（切り詰めは CSS の 2 行）', () => {
    const long = 'あ'.repeat(40);
    const d = new Driver([5]);
    const v = { ...d.view(0), steps: d.view(0).steps.map((x) => ({ ...x, name: long })) };
    expect(centerLines(v).name).toBe(long);
  });

  it('開始前は予定の合計・ステップの数・開始前を出す', () => {
    const lines = centerLines(idleView([5, 7, 1, 40, 7]));
    expect(lines).toEqual({ primary: '60:00', isOverrun: false, name: '今日の進行 5 ステップ', drift: '開始前' });
    expect(driftTone(idleView([5]))).toBe('idle');
  });

  it('終了したら、かかった時間と確定した押し巻きを出す', () => {
    const v = new Driver([5, 5]).next(6 * MIN).next(14 * MIN).view(20 * MIN);
    const lines = centerLines(v);
    expect(lines.primary).toBe('14:00');
    expect(lines.drift).toBe('予定より +4 分');
    expect(lines.isOverrun).toBe(false);
  });
});

describe('盤の下の一行', () => {
  it('次のステップの名前と終了見込みを出す', () => {
    // 10 分の盤の 1 分目・予定どおり → 14:09 に終わる見込み
    expect(footerLine(new Driver([5, 5]).view(1 * MIN), WALL)).toBe('次は S2 ・ 14:09 に終了見込み');
  });

  it('飛ばしたステップは次に数えない。最後のステップなら終了見込みだけ', () => {
    expect(footerLine(new Driver([5, 5, 5]).skip('s-2').view(0), WALL)).toBe('次は S3 ・ 14:10 に終了見込み');
    expect(footerLine(new Driver([5]).view(0), WALL)).toBe('14:05 に終了見込み');
  });

  it('開始前は 1 つ目と、いま始めたときの終了見込み。終了後は出さない', () => {
    expect(footerLine(idleView([30, 32]), WALL)).toBe('次は S1 ・ 15:02 に終了見込み');
    expect(footerLine(new Driver([5]).next(1 * MIN).view(2 * MIN), WALL)).toBe('');
  });
});

describe('進行表の行', () => {
  it('済み・いま・スキップ・まだ を分ける', () => {
    const v = new Driver([5, 5, 5, 5]).skip('s-3').next(4 * MIN).extend(3).view(5 * MIN);
    expect(stepRows(v).map((r) => [r.number, r.status, r.plannedMin, r.extensionMin])).toEqual([
      [1, 'done', 5, 0],
      [2, 'now', 5, 3],
      [3, 'skipped', 5, 0],
      [4, 'todo', 5, 0],
    ]);
  });
});

describe('読み上げの要約', () => {
  it('進行中: 名前・残り・押し巻き', () => {
    expect(summaryText(new Driver([5, 7]).view(1 * MIN))).toBe('S1、残り 4 分、予定どおり');
  });

  it('オーバー中・一時停止中は、それぞれを言葉で添える', () => {
    expect(summaryText(new Driver([5, 7]).view(7 * MIN))).toBe('S1、オーバー 2 分、予定より +2 分');
    expect(summaryText(new Driver([5, 7]).pause(1 * MIN).view(3 * MIN))).toBe('S1、残り 4 分、予定より +2 分、一時停止中');
  });

  it('オーバーの最初の 1 分は「0 分」と言わない', () => {
    expect(summaryText(new Driver([5, 7]).view(5 * MIN + 20_000))).toBe('S1、オーバー、予定どおり');
    expect(summaryText(new Driver([5, 7]).view(6 * MIN + 1000))).toBe('S1、オーバー 1 分、予定より +1 分');
  });

  it('開始前と終了', () => {
    expect(summaryText(idleView([5, 7]))).toBe('今日の進行 2 ステップ、予定 12 分、開始前');
    expect(summaryText(new Driver([5, 5]).next(6 * MIN).next(14 * MIN).view(20 * MIN))).toBe('終了、予定より +4 分');
  });
});

/**
 * @requirements #429 spec §7.2（延長の添え書き）・§7.5（映す表示の右の列）・§4.3（終了の一覧）
 */
describe('進める画面と映す表示の文字', () => {
  it('いまのステップを延長したときだけ「予定 7 分 + 3 分」と添える', () => {
    const d = new Driver([7, 5]);
    expect(extensionLine(d.view(MIN))).toBe('');
    expect(extensionLine(d.extend(3, MIN).view(2 * MIN))).toBe('予定 7 分 + 3 分');
    // 次へ移ったら、前のステップの延長は添えない
    expect(extensionLine(d.next(8 * MIN).view(9 * MIN))).toBe('');
  });

  it('映す表示の押し巻きは「+n 分」「−n 分」「予定どおり」', () => {
    expect(driftShort(new Driver([5, 7]).view(MIN))).toBe('予定どおり');
    expect(driftShort(new Driver([5, 7]).pause(MIN).view(4 * MIN))).toBe('+3 分');
    expect(driftShort(new Driver([5, 7]).next(MIN).view(MIN))).toBe('−4 分');
    expect(driftShort(idleView([5]))).toBe('');
  });

  it('次のステップの名前は飛ばしたものを除き、最後のステップでは空', () => {
    const d = new Driver([1, 2, 3]).skip('s-2');
    expect(nextStepName(d.view(0))).toBe('S3');
    expect(nextStepName(d.next(MIN).view(MIN))).toBe('');
  });

  it('終了見込みの時刻は、いまの時刻に残りの見込みを足す', () => {
    // 12 分の予定を 1 分進めた → 残りの見込みは 11 分
    expect(projectedEndClock(new Driver([5, 7]).view(MIN), WALL)).toBe('14:11');
  });

  it('差は印を付けて m:ss（負は U+2212・0 は印なし・秒は四捨五入）', () => {
    expect(signedDuration(30_000)).toBe('+0:30');
    expect(signedDuration(-110_000)).toBe('−1:50');
    expect(signedDuration(400)).toBe('0:00');
    expect(signedDuration(-29_600)).toBe('−0:30');
  });
});
