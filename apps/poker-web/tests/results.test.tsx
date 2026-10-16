/**
 * 結果の節が集計だけを持つことを固定する（#348・設計正本 D3）。
 *
 * 各自の票は場の席の札がめくれて見せる。結果の節に票の行を残すと、同じ票が 2 度出る。
 *
 * @requirements #348
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RoundStats } from '@tasuki/poker-core';
import { Results, SPREAD_COPY } from '../src/components/Results';
import { baseFaces, outsideBase } from './support/font-base';

afterEach(cleanup);

describe('Results（#348）', () => {
  it('U4: Given 平均 5・最頻値 5 / When 描く / Then 見出しと集計だけで票の行が無く、席の数を渡す', () => {
    const { container } = render(
      <Results stats={{ average: 5, modes: [{ kind: 'number', value: 5 }] }} seatCount={3} afterFlip spread={null} />,
    );
    expect(screen.getByRole('heading', { name: '結果' })).toBeTruthy();
    expect(screen.getByText('平均')).toBeTruthy();
    expect(screen.getByText('最頻値')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const section = container.querySelector<HTMLElement>('.results');
    expect(section?.style.getPropertyValue('--seat-count')).toBe('3');
  });

  it('U6: Given 札がめくれる公開・最初から公開済み / When 描く / Then 集計を待たせる印はめくれる公開のときだけ付く', () => {
    const stats: RoundStats = { average: 5, modes: [{ kind: 'number', value: 5 }] };
    const { container, rerender } = render(<Results stats={stats} seatCount={3} afterFlip spread={null} />);
    expect(container.querySelector('.results')?.classList.contains('results--after-flip')).toBe(true);
    rerender(<Results stats={stats} seatCount={3} afterFlip={false} spread={null} />);
    expect(container.querySelector('.results')?.classList.contains('results--after-flip')).toBe(false);
  });

  const stats: RoundStats = { average: 5, modes: [{ kind: 'number', value: 5 }] };
  const spread = {
    high: { card: { kind: 'number', value: 8 }, names: ['あお', 'しろ'] },
    low: { card: { kind: 'number', value: 2 }, names: ['きい'] },
  } as const;

  it('U7（#405）: Given 割れた票 / When 描く / Then 最大と最小を出した人に話してもらうよう促す 1 行が集計と同じ節に出る', () => {
    const { container } = render(
      <Results stats={stats} seatCount={3} afterFlip spread={spread} />,
    );
    const note = container.querySelector('.results .results-spread');
    expect(note?.textContent).toBe('見積もりが割れました。いちばん上の 8 を出した あお・しろ と、いちばん下の 2 を出した きい に、どう見たかを話してもらいませんか。');
  });

  it('U8（#405）: Given 割れていない / When 描く / Then 促しは出ない', () => {
    const { container } = render(<Results stats={stats} seatCount={3} afterFlip spread={null} />);
    expect(container.querySelector('.results-spread')).toBeNull();
  });

  it('U9（#405）: Given 促しの決まった文言（名前を除く） / When 書体の常用の層に当てる / Then 外れる字は無い', () => {
    expect(baseFaces().size).toBe(3);
    expect(outsideBase(Object.values(SPREAD_COPY))).toEqual([]);
  });

  it('U10（#405）: Given 割れた票 / When 描く / Then 名前は 1 人ずつ折り返さない塊になる', () => {
    const { container } = render(<Results stats={stats} seatCount={3} afterFlip spread={spread} />);
    const names = [...container.querySelectorAll('.results-spread-name')].map((e) => e.textContent);
    expect(names).toEqual(['あお', 'しろ', 'きい']);
  });
});
