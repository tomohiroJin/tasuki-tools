/**
 * 結果の節が集計だけを持つことを固定する（#348・設計正本 D3）。
 *
 * 各自の票は場の席の札がめくれて見せる。結果の節に票の行を残すと、同じ票が 2 度出る。
 *
 * @requirements #348
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { RoundStats } from '@tasuki/poker-core';
import { Results, SPREAD_COPY, effectAnnounceDelay } from '../src/components/Results';
import { CUTIN_KICKER, EFFECT_COPY, EFFECT_SUB, announcementOf, streakSub } from '../src/effect-copy';
import { baseFaces, outsideBase } from '@tasuki/test-css/font-base';

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

  it.each([
    ['break', '全員休憩'],
    ['unanimous', '全員同じ'],
    ['split', '大きく割れた'],
    ['near', 'ほぼ同じ'],
    ['scattered', '全員バラバラ'],
    ['complete', '全員出そろいました'],
  ] as const)('E1（#639）: Given 演出 %s / When 描く / Then 見える帯は読み上げから隠し、読み上げの知らせ（status）は 1 つだけで「%s」を後から受ける', (effect, text) => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Results stats={stats} seatCount={3} afterFlip spread={null} effect={effect} />);
      const bands = container.querySelectorAll('.results .results-effect');
      expect(bands).toHaveLength(1);
      expect(bands[0]?.textContent).toBe(text);
      expect(bands[0]?.getAttribute('aria-hidden')).toBe('true');
      expect(bands[0]?.getAttribute('data-effect')).toBe(effect);
      // 二重に読ませない: 読み上げの知らせは 1 つ。挿入されたときは空（中身を持って挿入された live region は読まれないことがある）
      const live = container.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
      expect(live).toHaveLength(1);
      expect(live[0]?.textContent).toBe('');
      // 札がめくれ終わった後（統計と同じ待ち）に、文言が入る
      act(() => {
        vi.advanceTimersByTime(effectAnnounceDelay(3, true) - 1);
      });
      expect(live[0]?.textContent).toBe('');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(live[0]?.textContent).toBe(text);
    } finally {
      vi.useRealTimers();
    }
  });

  it('E4（#639）: Given 席の数が多い・札がめくれる公開 / Then 読み上げの待ちは統計と同じ（最後の札がめくれた後）', () => {
    expect(effectAnnounceDelay(8, true)).toBe(7 * 90 + 450);
    expect(effectAnnounceDelay(20, true)).toBe(8 * 90 + 450);
    expect(effectAnnounceDelay(8, false)).toBe(0);
  });

  it('E2（#639）: Given 演出なし / When 描く / Then 帯は出ず、結果・統計・記録の中身は同じ', () => {
    const base = render(<Results stats={stats} seatCount={3} afterFlip spread={null} effect={null} />);
    expect(base.container.querySelector('.results-effect')).toBeNull();
    const html = base.container.innerHTML;
    cleanup();
    const withEffect = render(<Results stats={stats} seatCount={3} afterFlip spread={null} effect="unanimous" />);
    // 演出は見た目だけ: 帯を除けば同じ DOM
    withEffect.container.querySelector('.results-effect')?.remove();
    expect(withEffect.container.innerHTML).toBe(html);
  });

  it('E3（#639）: Given 演出の決まった文言 / When 書体の常用の層に当てる / Then 外れる字は無い', () => {
    expect(outsideBase(Object.values(EFFECT_COPY))).toEqual([]);
  });

  it('E3b（#670）: Given 添え書き・連続・カットインの見出しと読み上げの文言 / When 書体の常用の層に当てる / Then 外れる字は無い', () => {
    expect(outsideBase(Object.values(EFFECT_SUB))).toEqual([]);
    expect(outsideBase([streakSub(2), streakSub(12), CUTIN_KICKER])).toEqual([]);
    for (const effect of Object.keys(EFFECT_COPY) as (keyof typeof EFFECT_COPY)[]) {
      expect(outsideBase([announcementOf(effect, EFFECT_SUB[effect] ?? streakSub(3))]), effect).toEqual([]);
    }
  });

  it('E5（#670）: Given 題は 9 字以下（カットインの大きな字が 320px で 1 行に収まる）', () => {
    for (const title of Object.values(EFFECT_COPY)) expect([...title].length, title).toBeLessThanOrEqual(9);
  });

  it('E6（#670）: Given 添え書きのある場面 / When 描く / Then 帯に添え書きが残り、読み上げは題と続けて読む', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Results stats={stats} seatCount={3} afterFlip spread={null} effect="unanimous" effectSub="3 回続けて" />);
      const band = container.querySelector('.results-effect');
      expect(band?.textContent).toContain('全員同じ');
      expect(band?.textContent).toContain('3 回続けて');
      act(() => {
        vi.advanceTimersByTime(effectAnnounceDelay(3, true));
      });
      expect(container.querySelector('[role="status"]')?.textContent).toBe('全員同じ。3 回続けて');
    } finally {
      vi.useRealTimers();
    }
  });

  it('U10（#405）: Given 割れた票 / When 描く / Then 名前は 1 人ずつ折り返さない塊になる', () => {
    const { container } = render(<Results stats={stats} seatCount={3} afterFlip spread={spread} />);
    const names = [...container.querySelectorAll('.results-spread-name')].map((e) => e.textContent);
    expect(names).toEqual(['あお', 'しろ', 'きい']);
  });
});
