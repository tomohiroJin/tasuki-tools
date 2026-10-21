/**
 * 残りの数字の組み方（#429 spec §7.3 MUST: 桁が揺れない）。Fraunces のサブセットに tnum が無いので、
 * 1 字ずつ固定幅の箱に入れ、コロンと符号は別の箱にする。
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimeDigits } from '../src/components/TimeDigits';

describe('残りの数字', () => {
  it('数字は 1 字ずつ桁の箱、コロンと「+」は別の箱に入る', () => {
    const { container } = render(<TimeDigits text="+12:05" />);
    const boxes = [...container.querySelectorAll('.time-digits > span')].map((el) => [el.className, el.textContent]);
    expect(boxes).toEqual([
      ['time-sign', '+'],
      ['time-digit', '1'],
      ['time-digit', '2'],
      ['time-colon', ':'],
      ['time-digit', '0'],
      ['time-digit', '5'],
    ]);
  });

  it('文字としては元の文字列のまま読める', () => {
    const { container } = render(<TimeDigits text="60:00" />);
    expect(container.textContent).toBe('60:00');
  });
});
