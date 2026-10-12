/**
 * 結果の節が集計だけを持つことを固定する（#348・設計正本 D3）。
 *
 * 各自の票は場の席の札がめくれて見せる。結果の節に票の行を残すと、同じ票が 2 度出る。
 *
 * @requirements #348
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Results } from '../src/components/Results';

afterEach(cleanup);

describe('Results（#348）', () => {
  it('U4: Given 平均 5・最頻値 5 / When 描く / Then 見出しと集計だけで票の行が無く、席の数を渡す', () => {
    const { container } = render(
      <Results stats={{ average: 5, modes: [{ kind: 'number', value: 5 }] }} seatCount={3} />,
    );
    expect(screen.getByRole('heading', { name: '結果' })).toBeTruthy();
    expect(screen.getByText('平均')).toBeTruthy();
    expect(screen.getByText('最頻値')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const section = container.querySelector<HTMLElement>('.results');
    expect(section?.style.getPropertyValue('--seat-count')).toBe('3');
  });
});
