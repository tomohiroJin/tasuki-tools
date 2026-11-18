/**
 * やり方の選択（#406・設計 §4）。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { METHOD_GROUPS, SIDES, groupsOf } from '@tasuki/checkin-core';
import { MethodPicker } from '../src/components/MethodPicker';
import { METHOD_COPY } from '../src/method-copy';
import { GROUP_TITLES } from '../src/method-groups';

describe('やり方の選択', () => {
  it('Given 初期 / When 描く / Then チェックインの 13 のやり方とランダムの 14 枚が出る（#635）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(14);
    expect(screen.getByRole('button', { name: /準備の度合い/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /今日の気がかり/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /期待の大きさ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /始まりの気分/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'チェックイン' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'チェックアウト' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /今日の天気/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ROTI/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
  });

  it('Given チェックアウトへ切り替え / When 描く / Then チェックアウトのやり方に替わる', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(14);
    expect(screen.getByRole('button', { name: /なっとく度/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /だれかに言いたいこと/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ROTI/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /終わりの天気/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /わかった度/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /今日の天気/ })).toBeNull();
  });

  it('Given やり方を押す / Then choose が 1 回だけ呼ばれる', () => {
    const onChoose = vi.fn();
    const onDraw = vi.fn();
    render(<MethodPicker canOperate initialSide="checkin" onChoose={onChoose} onDraw={onDraw} />);
    fireEvent.click(screen.getByRole('button', { name: /今日の天気/ }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('weather');
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('Given チェックアウトでランダム / Then draw に側を載せる', () => {
    const onDraw = vi.fn();
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={onDraw} />);
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    fireEvent.click(screen.getByRole('button', { name: 'ランダム' }));
    expect(onDraw).toHaveBeenCalledExactlyOnceWith('checkout');
  });

  it('Given 戻れる場合 / When 「いまの回に戻る」を押す / Then onCancel', () => {
    const onCancel = vi.fn();

    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'いまの回に戻る' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Given 回がある（onCancel あり） / Then 見出しの行は見出しと戻るの 2 つで、注意文は行の直後に出る（#468 D5）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} onCancel={vi.fn()} />);

    const head = screen.getByRole('heading', { name: 'やり方を選んでください' }).parentElement as HTMLElement;
    expect(head).toHaveClass('method-picker-head');
    expect(head).toContainElement(screen.getByRole('button', { name: 'いまの回に戻る' }));
    // 部品は見出しと戻るの 2 子の前提。注意文は外（直後の兄弟）に置く
    expect(head.children).toHaveLength(2);
    expect(head).not.toContainElement(screen.getByText(/選ぶと新しい回が始まります/));
    expect(head.nextElementSibling).toBe(screen.getByText(/選ぶと新しい回が始まります/));
    expect(screen.getByText(/選ぶと新しい回が始まります/)).toBeInTheDocument();
    expect(screen.getByText(/いまの回の札は消えます/)).toBeInTheDocument();
  });

  it('Given 回がある / Then 「いまの回に戻る」は枠付きの小さなボタン（RoomHeader のリンクと見分ける）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'いまの回に戻る' })).toHaveClass('ui-button', 'ui-button--secondary', 'ui-button--sm');
  });

  it('Given 回が無い（onCancel なし） / Then 戻るボタンも添え書きも出ない（#468 D5）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /戻る/ })).toBeNull();
    expect(screen.queryByText(/新しい回が始まります/)).toBeNull();
  });

  it('Given 側を切り替える / Then 切り替えの下の一文がその側の使いどころに替わる（#468 D4）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);

    expect(screen.getByText('チェックインは会の始まりに使います')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    expect(screen.getByText('チェックアウトは会の終わりに使います')).toBeInTheDocument();
    expect(screen.queryByText('チェックインは会の始まりに使います')).toBeNull();
  });

  it('Given 描く / Then 末尾がランダムで、破線の札として他と同じ枠に並ぶ（#468 D3）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(14);
    const last = items[13]!.querySelector('button') as HTMLElement;
    expect(last).toHaveAccessibleName('ランダム');
    expect(last).toHaveClass('method-option', 'method-option--random');
    for (const item of items) expect(item.querySelector('button')).toHaveClass('method-option');
  });

  it('Given 回がある / Then すべての札の説明が「お題の説明 + 注意文」になり、回が無ければ注意文は無い（#468 D5）', () => {
    const { unmount } = render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} onCancel={vi.fn()} />);
    const cards = screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLElement);
    expect(cards).toHaveLength(14);
    for (const c of cards) {
      expect(c).toHaveAccessibleDescription(/新しい回が始まります（いまの回の札は消えます）$/);
      // 先頭はその札の説明（注意文だけの説明にならない）
      expect(c.getAttribute('aria-describedby')).toMatch(/^method-[a-z-]+-(prompt|hint) method-picker-note$/);
    }
    for (const list of screen.getAllByRole('list')) expect(list).not.toHaveAttribute('aria-describedby');
    unmount();
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);
    for (const li of screen.getAllByRole('listitem')) {
      const c = li.querySelector('button') as HTMLElement;
      expect(c).not.toHaveAccessibleDescription(/新しい回が始まります/);
      expect(c.getAttribute('aria-describedby')).not.toContain('method-picker-note');
    }
  });

  it('Given 側の切り替え / Then 一文がグループの説明になり、切り替えで替わる（#468 D4）', () => {
    render(<MethodPicker canOperate initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'やり方を選んでください' });
    expect(group).toHaveAccessibleDescription('チェックインは会の始まりに使います');
    fireEvent.click(screen.getByRole('button', { name: 'チェックアウト' }));
    expect(group).toHaveAccessibleDescription('チェックアウトは会の終わりに使います');
  });

  it.each(SIDES)('Given %s / Then やり方は小見出しの順と並びのとおりに出て、各並びは小見出しを名前に持つ（#635）', (side) => {
    render(<MethodPicker canOperate initialSide={side} onChoose={vi.fn()} onDraw={vi.fn()} />);

    const lists = screen.getAllByRole('list');
    const want = [...groupsOf(side).map((g) => ({ title: GROUP_TITLES[g], items: METHOD_GROUPS[g].methods.map((m) => METHOD_COPY[m].title) })), { title: 'おまかせ', items: ['ランダム'] }];
    expect(lists.map((l) => ({ title: l.getAttribute('aria-labelledby') && document.getElementById(l.getAttribute('aria-labelledby')!)?.textContent, items: within(l).getAllByRole('button').map((b) => document.getElementById(b.getAttribute('aria-labelledby')!)?.textContent) }))).toEqual(want);
    for (const [i, g] of want.entries()) {
      expect(screen.getByRole('heading', { level: 3, name: g.title })).toBeInTheDocument();
      expect(lists[i]).toHaveAccessibleName(g.title);
    }
  });

  it.each(SIDES)('Given %s / When 小見出しのランダムを押す / Then onDrawGroup にその小見出しが載り、choose・draw は呼ばれない（#635）', (side) => {
    const onChoose = vi.fn();
    const onDraw = vi.fn();
    const onDrawGroup = vi.fn();
    render(<MethodPicker canOperate initialSide={side} onChoose={onChoose} onDraw={onDraw} onDrawGroup={onDrawGroup} />);
    for (const g of groupsOf(side)) {
      const button = screen.getByRole('button', { name: `${GROUP_TITLES[g]}からランダム` });
      // 小見出しの行に置く（並びの札ではない）
      expect(button.closest('.method-list')).toBeNull();
      expect(button.closest('.method-group-head')).toContainElement(screen.getByRole('heading', { level: 3, name: GROUP_TITLES[g] }));
      fireEvent.click(button);
    }
    expect(onDrawGroup.mock.calls).toEqual(groupsOf(side).map((g) => [g]));
    expect(onChoose).not.toHaveBeenCalled();
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('Given 切断中 / Then 小見出しのランダムも押せない', () => {
    render(<MethodPicker canOperate={false} initialSide="checkin" onChoose={vi.fn()} onDraw={vi.fn()} onDrawGroup={vi.fn()} />);
    for (const g of groupsOf('checkin')) expect(screen.getByRole('button', { name: `${GROUP_TITLES[g]}からランダム` })).toBeDisabled();
  });

  it('Given 新しいやり方を押す / Then choose にそのやり方の ID が載る（#635）', () => {
    const onChoose = vi.fn();
    render(<MethodPicker canOperate initialSide="checkout" onChoose={onChoose} onDraw={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /進むペース/ }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('pace');
  });
});
