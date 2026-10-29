/**
 * 札の SVG（#403・設計 §5.3）。本物のトランプに寄せる: 角の文字・マークの並び・絵札・裏面。
 *
 * @requirements #403 設計 §5.3
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PlayingCard, Rank, Suit } from '@tasuki/poker-core';
import { PlayingCardSvg } from '../src/components/playing-card/PlayingCardSvg';
import { CARD_HEIGHT, CARD_WIDTH, pipLayout } from '../src/components/playing-card/pip-layout';

afterEach(cleanup);

const card = (rank: Rank, suit: Suit = 'S'): PlayingCard => ({ rank, suit });

describe('マークの並び（#403 §5.3）', () => {
  it('札はポーカーサイズの比率（63:88）', () => {
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(63 / 88, 2);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10] as const)('%i はマークを %i 個並べる', (rank) => {
    expect(pipLayout(rank)).toHaveLength(rank);
  });

  it('7 は 6 の並びに、上の真ん中のマークを 1 つ足す（実物も上下対称でない）', () => {
    const extra = pipLayout(7).filter((p) => !pipLayout(6).some((q) => q.x === p.x && q.y === p.y));
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ x: CARD_WIDTH / 2, flipped: false });
    expect(extra[0]!.y).toBeLessThan(CARD_HEIGHT / 2);
  });

  it('A は真ん中に大きいマークを 1 つ', () => {
    const [ace] = pipLayout(14);
    expect(pipLayout(14)).toHaveLength(1);
    expect(ace).toMatchObject({ x: CARD_WIDTH / 2, y: CARD_HEIGHT / 2 });
  });

  it.each([11, 12, 13] as const)('絵札（%i）はマークを並べない', (rank) => {
    expect(pipLayout(rank)).toEqual([]);
  });

  it.each([2, 3, 4, 5, 6, 8, 9, 10] as const)('%i の並びは上下・左右に対称で、下半分のマークは逆さ', (rank) => {
    const pips = pipLayout(rank);
    for (const p of pips) {
      const mirror = pips.find((q) => q.x === CARD_WIDTH - p.x && q.y === CARD_HEIGHT - p.y);
      expect(mirror).toBeDefined();
      expect(p.flipped).toBe(p.y > CARD_HEIGHT / 2);
    }
  });
});

describe('PlayingCardSvg（#403 §5.3）', () => {
  it('Given ハートの 7 / When 描く / Then 読み上げ名・角の文字 2 つ・マーク 7 つ・赤', () => {
    render(<PlayingCardSvg card={card(7, 'H')} />);
    const svg = screen.getByRole('img', { name: 'ハートの7' });
    expect(svg.getAttribute('data-color')).toBe('red');
    expect([...svg.querySelectorAll('.pc-index-rank')].map((t) => t.textContent)).toEqual(['7', '7']);
    expect(svg.querySelectorAll('.pc-pip')).toHaveLength(7);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`);
  });

  it('Given スペードの A / When 描く / Then 黒、大きなマーク 1 つと飾り', () => {
    render(<PlayingCardSvg card={card(14, 'S')} />);
    const svg = screen.getByRole('img', { name: 'スペードのA' });
    expect(svg.getAttribute('data-color')).toBe('black');
    expect(svg.querySelectorAll('.pc-pip')).toHaveLength(1);
    expect(svg.querySelector('.pc-ace-ornament')).not.toBeNull();
  });

  it.each([
    [11, 'jack', 'J'],
    [12, 'queen', 'Q'],
    [13, 'king', 'K'],
  ] as const)('Given %i / When 描く / Then 上下対称の絵札（%s）で、角の文字は %s', (rank, court, label) => {
    render(<PlayingCardSvg card={card(rank, 'D')} />);
    const svg = screen.getByRole('img', { name: `ダイヤの${label}` });
    const figure = svg.querySelector('.pc-court');
    expect(figure?.getAttribute('data-court')).toBe(court);
    // 上半分の絵を 180° 回して下半分に置く（上下対称）
    expect(svg.querySelectorAll('.pc-court-half')).toHaveLength(2);
    expect(svg.querySelector('.pc-court-half[transform^="rotate(180"]')).not.toBeNull();
    expect(svg.querySelectorAll('.pc-pip')).toHaveLength(0);
  });

  it('Given 札が無い（伏せ札） / When 描く / Then 裏面', () => {
    render(<PlayingCardSvg card={null} />);
    const svg = screen.getByRole('img', { name: 'ふせたカード' });
    expect(svg.querySelector('.pc-back')).not.toBeNull();
    expect(svg.querySelector('.pc-pip')).toBeNull();
  });

  it('Given 裏面を 2 枚 / When 描く / Then 模様の id がぶつからない', () => {
    render(
      <>
        <PlayingCardSvg card={null} />
        <PlayingCardSvg card={null} />
      </>,
    );
    const ids = [...document.querySelectorAll('pattern')].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
