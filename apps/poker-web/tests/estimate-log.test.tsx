/**
 * 見積もりの記録の欄（#93・spec §4.4）。
 *
 * @requirements #93
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { EstimateGroupView } from '@tasuki/poker-core';
import { EstimateLog } from '../src/components/EstimateLog';
import {
  ESTIMATE_CHANGE_POINTS,
  ESTIMATE_LOG_COPIED,
  ESTIMATE_LOG_COPY,
  ESTIMATE_LOG_COPY_FAILED,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_LOG_MANUAL_COPY,
  ESTIMATE_NO_POINTS,
  ESTIMATE_OPEN,
  RENAME_GROUP,
} from '../src/estimate-copy';

afterEach(cleanup);

// 選択の名前は「アイテム名 + ポイントを変える」（束ごとに違う）。ここでは文言の側だけで引く
const CHANGE_POINTS_NAME = new RegExp(`${ESTIMATE_CHANGE_POINTS}$`);

const AT = Date.UTC(2026, 9, 17, 5, 20);
const hhmm = (at: number) =>
  new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

function group(id: number, over: Partial<EstimateGroupView> = {}): EstimateGroupView {
  return {
    id,
    item: `ITEM-${id}`,
    points: null,
    open: false,
    entries: [{ attempt: 1, at: AT, counts: [{ card: { kind: 'number', value: 5 }, count: 4 }] }],
    ...over,
  };
}

describe('EstimateLog', () => {
  it('Given 束が 0 / When 描く / Then 見出しと空の文言', () => {
    render(<EstimateLog groups={[]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    expect(screen.getByRole('heading', { name: ESTIMATE_LOG_HEADING })).toBeTruthy();
    expect(screen.getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });

  it('Given 束 3 つ / When 描く / Then 新しい束が上（wire の逆順）', () => {
    render(<EstimateLog groups={[group(1), group(2), group(3)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const items = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-group') !== null);
    expect(items.map((li) => li.getAttribute('data-group'))).toEqual(['3', '2', '1']);
  });

  it('Given 束の中に 2 行 / When 描く / Then 新しい行が上で、回・時刻・分布の形', () => {
    const g = group(1, {
      entries: [
        { attempt: 1, at: AT, counts: [{ card: { kind: 'number', value: 3 }, count: 1 }, { card: { kind: 'question' }, count: 2 }] },
        { attempt: 2, at: AT + 60_000, counts: [{ card: { kind: 'number', value: 5 }, count: 4 }] },
      ],
    });
    render(<EstimateLog groups={[g]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const rows = screen.getAllByTestId('estimate-entry');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('2 回め');
    expect(rows[0]!.textContent).toContain(hhmm(AT + 60_000));
    expect(rows[0]!.textContent).toContain('5×4');
    expect(rows[1]!.textContent).toContain('1 回め');
    expect(rows[1]!.textContent).toContain('3×1');
    expect(rows[1]!.textContent).toContain('?×2');
  });

  it('Given open の束 / When 描く / Then 見積もり中でポイントの選択は無い', () => {
    render(<EstimateLog groups={[group(1, { open: true })]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    expect(screen.getByText(ESTIMATE_OPEN)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('Given 閉じた束 points 5 / null / When 描く / Then 値は選択が見出しの強い値として 1 回だけ出す', () => {
    const { container } = render(<EstimateLog groups={[group(1, { points: 5 })]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME }) as HTMLSelectElement;
    expect(select.value).toBe('5');
    // 見出しに同じ値の別の表示を重ねない
    expect(container.querySelector('strong, [data-testid="estimate-points"]')).toBeNull();
    cleanup();
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const none = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME }) as HTMLSelectElement;
    expect(none.value).toBe('');
    expect(screen.queryByTestId('estimate-nopoints')).toBeNull();
  });

  it('Given 閉じた束 points null / 5 / When 描く / Then 部品の .ui-select で、空のときだけ data-empty（弱く見せる印）', () => {
    // 「ポイントなし」が束で一番強く見えていた（#93 最終レビュー・spec §4.4: 強いのは添えたポイント）
    render(<EstimateLog groups={[group(1), group(2, { points: 5 })]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const [withPoints, empty] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(empty!.value).toBe('');
    expect(empty!.classList.contains('ui-select')).toBe(true);
    expect(empty!.classList.contains('ui-input')).toBe(false);
    expect(empty!.hasAttribute('data-empty')).toBe(true);
    expect(withPoints!.value).toBe('5');
    expect(withPoints!.hasAttribute('data-empty')).toBe(false);
  });

  it('Given 閉じた束 / When 選択肢を見る / Then 空と 0 1 2 3 5 8 13 21', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', '0', '1', '2', '3', '5', '8', '13', '21']);
  });

  it('Given 閉じた束 / When 空の選択肢を見る / Then 見える文言は ポイントなし', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    expect((within(select).getAllByRole('option')[0] as HTMLOptionElement).textContent).toBe(ESTIMATE_NO_POINTS);
  });

  it('Given 閉じた束 / When 8 を選ぶ → 空を選ぶ / Then onSetPoints(id, 8) と (id, null)', () => {
    const onSetPoints = vi.fn();
    render(<EstimateLog groups={[group(7, { points: 5 })]} onSetPoints={onSetPoints} onRenameGroup={vi.fn()} disabled={false} />);
    const select = screen.getByRole('combobox', { name: CHANGE_POINTS_NAME });
    fireEvent.change(select, { target: { value: '8' } });
    expect(onSetPoints).toHaveBeenLastCalledWith(7, 8);
    fireEvent.change(select, { target: { value: '' } });
    expect(onSetPoints).toHaveBeenLastCalledWith(7, null);
  });

  it('Given disabled / When 描く / Then 選択は押せない', () => {
    render(<EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });

  it('Given 閉じた束 2 つ（名前あり・名前なし） / When 選択の名前を読む / Then 束ごとに違い、アイテム名を含む', () => {
    // どの選択も「ポイントを変える」だけだと、読み上げではどの束の選択か区別できない（#93 最終レビュー）
    render(<EstimateLog groups={[group(1), group(2, { item: '' })]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
    const names: string[] = [];
    screen.getAllByRole('combobox', { name: (name) => (names.push(name), true) });
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    // 新しい束が上（名前なしの束 2 が先）
    expect(names[0]).toContain('見積もり 2');
    expect(names[1]).toContain('ITEM-1');
    for (const name of names) expect(name).toContain(ESTIMATE_CHANGE_POINTS);
  });

  it('Given 古い束が上限で消えた記録 / When 名前を変更して空へ戻す / Then 元の通し番号で表示する', () => {
    const props = { onSetPoints: vi.fn(), onRenameGroup: vi.fn(), disabled: false, limit: 1 };
    const groups = [group(104), group(105, { item: '' })];
    const { rerender } = render(<EstimateLog {...props} groups={groups} />);
    fireEvent.click(screen.getByRole('button', { name: '見積もり 105' }));
    const input = screen.getByRole('textbox', { name: RENAME_GROUP });
    fireEvent.change(input, { target: { value: '新しい名前' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onRenameGroup).toHaveBeenLastCalledWith(105, '新しい名前');
    rerender(<EstimateLog {...props} groups={[group(104), group(105, { item: '新しい名前' })]} />);
    fireEvent.click(screen.getByRole('button', { name: '新しい名前' }));
    const namedInput = screen.getByRole('textbox', { name: RENAME_GROUP });
    fireEvent.change(namedInput, { target: { value: '' } });
    fireEvent.keyDown(namedInput, { key: 'Enter' });
    expect(props.onRenameGroup).toHaveBeenLastCalledWith(105, '');
    rerender(<EstimateLog {...props} groups={groups} />);
    expect(screen.getByRole('button', { name: '見積もり 105' })).toBeTruthy();
  });

  it('Given 名前ありと名前なしの記録 / When 直近表示からコピー / Then 全記録に画面と同じ題を使う', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const groups = [
        group(104, { item: 'PROJ-[4] https://example.com/a#section', points: 0 }),
        group(105, { item: '', open: true }),
      ];
      render(<EstimateLog groups={groups} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} limit={1} />);
      expect(screen.getByText('見積もり 105')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '記録をコピー' }));
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('コピーしました'));
      expect(writeText).toHaveBeenCalledExactlyOnceWith([
        '## 見積もりの記録',
        '### 見積もり 105\n見積もり中\n- 1 回め ' + hhmm(AT) + ' 5×4',
        '### PROJ-\\[4\\] https\\://example\\.com/a\\#section\nポイント: 0\n- 1 回め ' + hhmm(AT) + ' 5×4',
      ].join('\n\n'));
    } finally {
      if (previous) Object.defineProperty(navigator, 'clipboard', previous);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  /**
   * 記録のコピーが失敗したとき、Markdown を手で選べる欄に出す（#653）。
   * 押し直し・スクロール・読み上げの局面は、敵対的レビューの 2〜5 回目で足した。
   *
   * @requirements #653
   */
  describe('コピーが失敗したとき', () => {
    const expected = (hh: string) => [
      '## 見積もりの記録',
      '### 見積もり 105\n見積もり中\n- 1 回め ' + hh + ' 5×4',
      '### PROJ-\\[4\\] https\\://example\\.com/a\\#section\nポイント: 0\n- 1 回め ' + hh + ' 5×4',
    ].join('\n\n');
    const groups = () => [
      group(104, { item: 'PROJ-[4] https://example.com/a#section', points: 0 }),
      group(105, { item: '', open: true }),
    ];
    const withoutClipboard = async (run: () => Promise<void>) => {
      // jsdom は navigator.clipboard も document.execCommand も持たない。両方の失敗を明示して作る
      const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      const execCommand = vi.fn().mockReturnValue(false);
      const previousExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
      Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
      try {
        await run();
      } finally {
        if (previous) Object.defineProperty(navigator, 'clipboard', previous);
        else Reflect.deleteProperty(navigator, 'clipboard');
        if (previousExec) Object.defineProperty(document, 'execCommand', previousExec);
        else Reflect.deleteProperty(document, 'execCommand');
      }
    };

    it('Given 両方のコピーが失敗 / When 記録をコピー / Then 失敗の知らせと、コピーするはずだった Markdown を読み取り専用の欄に出す（limit 内の束だけでなく全記録）', async () => {
      await withoutClipboard(async () => {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} limit={1} />);
        expect(screen.queryByRole('textbox')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPY_FAILED));
        const field = screen.getByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY }) as HTMLTextAreaElement;
        expect(field.value).toBe(expected(hhmm(AT)));
        expect(field.readOnly).toBe(true);
      });
    });

    it('Given 両方のコピーが失敗 / When 記録をコピー / Then 欄と目に見える知らせは記録の本体の頭、見出しの行の status は見た目だけ隠す', async () => {
      await withoutClipboard(async () => {
        const { container } = render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        const field = await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY });
        const body = container.querySelector('.estimate-log-body') as HTMLElement;
        const list = body.querySelector('ol') as HTMLElement;
        const notice = within(body).getByText(ESTIMATE_LOG_COPY_FAILED);
        // 本体の中・束の並びより前（欄は札の頭に積まれず、見出しの行にも入らない）
        expect(body.contains(field)).toBe(true);
        expect(notice.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(field.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // 読み上げは見出しの行の status が受け持つ（見た目は隠す。ボタンと見出しの行を動かさない）
        const status = screen.getByRole('status');
        expect(status.textContent).toBe(ESTIMATE_LOG_COPY_FAILED);
        expect(status.className).toContain('ui-visually-hidden');
        expect(body.contains(status)).toBe(false);
        // 目に見える文は live region にしない（読み上げの二重を避ける）
        expect(notice.closest('[role="status"], [aria-live]')).toBeNull();
        expect(screen.getAllByRole('status')).toHaveLength(1);
      });
    });

    it('Given 本体をスクロールしてある / When コピーが失敗する / Then 本体を頭へ戻し、フォーカスは押したボタンに残す（失敗の文と欄が箱の外へ送られない）', async () => {
      await withoutClipboard(async () => {
        const { container } = render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        const body = container.querySelector('.estimate-log-body') as HTMLElement;
        // jsdom は scrollTop を持ち上げない。値を持つ窓口に差し替える
        let top = 200;
        Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
        const button = screen.getByRole('button', { name: ESTIMATE_LOG_COPY });
        button.focus();
        fireEvent.click(button);
        await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY });
        expect(top).toBe(0);
        expect(document.activeElement).toBe(button);
      });
    });

    it('Given 失敗した後に本体をスクロールした / When もう一度コピーして失敗する / Then 本体をもう一度頭へ戻す（失敗のままの 2 回目も見せ直す）', async () => {
      await withoutClipboard(async () => {
        const { container } = render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        const body = container.querySelector('.estimate-log-body') as HTMLElement;
        let top = 200;
        Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
        const button = screen.getByRole('button', { name: ESTIMATE_LOG_COPY });
        fireEvent.click(button);
        await waitFor(() => expect(top).toBe(0));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPY_FAILED));
        for (let round = 0; round < 2; round += 1) {
          top = 200;
          fireEvent.click(button);
          await waitFor(() => expect(top).toBe(0));
          await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPY_FAILED));
        }
      });
    });

    it('Given 失敗して知らせが出ている / When もう一度コピーする / Then 試みの間は見出しの status が空で、終わると「コピーできません」に戻る（押すたびに読み上げが流れる）', async () => {
      await withoutClipboard(async () => {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        const button = screen.getByRole('button', { name: ESTIMATE_LOG_COPY });
        fireEvent.click(button);
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPY_FAILED));
        fireEvent.click(button);
        expect(screen.getByRole('status').textContent).toBe('');
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPY_FAILED));
      });
    });

    it('Given 本体をスクロールしてある / When コピーが成功する / Then 本体のスクロールは動かさない', async () => {
      const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
      try {
        const { container } = render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        const body = container.querySelector('.estimate-log-body') as HTMLElement;
        let top = 200;
        Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPIED));
        expect(top).toBe(200);
      } finally {
        if (previous) Object.defineProperty(navigator, 'clipboard', previous);
        else Reflect.deleteProperty(navigator, 'clipboard');
      }
    });

    it('Given 成功して「コピーしました」が出ている / When もう一度コピーする / Then 試みの間も文を空にしない（空の浮かぶ知らせを描かない）', async () => {
      const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
      try {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        const button = screen.getByRole('button', { name: ESTIMATE_LOG_COPY });
        fireEvent.click(button);
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPIED));
        fireEvent.click(button);
        // 浮かぶ札（estimate-log-copy-status）が出ている間に文だけ空になると、枠と影だけの空の札が描かれる
        const status = screen.getByRole('status');
        expect(status.className).toBe('estimate-log-copy-status');
        expect(status.textContent).toBe(ESTIMATE_LOG_COPIED);
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPIED));
      } finally {
        if (previous) Object.defineProperty(navigator, 'clipboard', previous);
        else Reflect.deleteProperty(navigator, 'clipboard');
      }
    });

    it('Given 失敗した欄 / When フォーカスする / Then 全文が選択される', async () => {
      await withoutClipboard(async () => {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        const field = await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY }) as HTMLTextAreaElement;
        // jsdom の select() は範囲を動かさないことがあるので、setSelectionRange も呼ばれることを見る（iOS Safari 向け）
        const range = vi.spyOn(field, 'setSelectionRange');
        fireEvent.focus(field);
        expect(range).toHaveBeenCalledWith(0, field.value.length);
        expect(field.selectionStart).toBe(0);
        expect(field.selectionEnd).toBe(field.value.length);
      });
    });

    it('Given 失敗して欄が出ている / When 2 秒以上たつ / Then 選ぶ前に消えない', async () => {
      vi.useFakeTimers();
      try {
        await withoutClipboard(async () => {
          render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
          fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
          await act(async () => { await vi.advanceTimersByTimeAsync(100); });
          expect(screen.getByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY })).toBeTruthy();
          await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
          expect(screen.getByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY })).toBeTruthy();
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('Given 失敗して欄が出ている / When 記録が増える / Then 欄は残り、中身は新しい Markdown になる（読み上げは繰り返さない）', async () => {
      await withoutClipboard(async () => {
        const props = { onSetPoints: vi.fn(), onRenameGroup: vi.fn(), disabled: false };
        const { rerender } = render(<EstimateLog {...props} groups={groups()} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        const before = (await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY })) as HTMLTextAreaElement;
        const oldValue = before.value;
        rerender(<EstimateLog {...props} groups={[...groups(), group(106)]} />);
        const after = screen.getByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY }) as HTMLTextAreaElement;
        expect(after).toBe(before);
        expect(after.value).not.toBe(oldValue);
        expect(after.value.length).toBeGreaterThan(oldValue.length);
        // 目に見える失敗の文は欄と一緒に残り、見出しの status は空になる
        expect(screen.getAllByText(ESTIMATE_LOG_COPY_FAILED, { selector: 'p' })).toHaveLength(1);
        expect(screen.getByRole('status').textContent).toBe('');
      });
    });

    it('Given 欄にフォーカスがある / When 記録が増える / Then フォーカスは欄に残る', async () => {
      await withoutClipboard(async () => {
        const props = { onSetPoints: vi.fn(), onRenameGroup: vi.fn(), disabled: false };
        const { rerender } = render(<EstimateLog {...props} groups={groups()} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        const field = await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY });
        field.focus();
        expect(document.activeElement).toBe(field);
        rerender(<EstimateLog {...props} groups={[...groups(), group(106)]} />);
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY }));
      });
    });

    it('Given 失敗して欄が出ている / When 次の試みが成功する / Then 欄は閉じる', async () => {
      const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      const previousExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
      try {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        const execCommand = vi.fn().mockReturnValue(false);
        Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY });
        execCommand.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPIED));
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByText(ESTIMATE_LOG_COPY_FAILED, { selector: 'p' })).toBeNull();
      } finally {
        if (previous) Object.defineProperty(navigator, 'clipboard', previous);
        else Reflect.deleteProperty(navigator, 'clipboard');
        if (previousExec) Object.defineProperty(document, 'execCommand', previousExec);
        else Reflect.deleteProperty(document, 'execCommand');
      }
    });

    it('Given 失敗の欄 / When 描く / Then 目に見える失敗の文は読み上げから隠す（読み上げは見出しの status が受け持つ）', async () => {
      await withoutClipboard(async () => {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await screen.findByRole('textbox', { name: ESTIMATE_LOG_MANUAL_COPY });
        const notice = screen.getByText(ESTIMATE_LOG_COPY_FAILED, { selector: 'p' });
        expect(notice.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('Given コピーが成功 / When 記録をコピー / Then 欄は出さない', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      try {
        render(<EstimateLog groups={groups()} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: ESTIMATE_LOG_COPY }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe(ESTIMATE_LOG_COPIED));
        expect(screen.queryByRole('textbox')).toBeNull();
        // 成功の知らせは見た目を出す（失敗のときだけ見た目を隠す）
        expect(screen.getByRole('status').className).not.toContain('ui-visually-hidden');
      } finally {
        if (previous) Object.defineProperty(navigator, 'clipboard', previous);
        else Reflect.deleteProperty(navigator, 'clipboard');
      }
    });
  });

  it('Given 束 5 つ・limit 3 / When 描く / Then 新しい 3 束だけ', () => {
    const gs = [1, 2, 3, 4, 5].map((i) => group(i));
    render(<EstimateLog groups={gs} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} limit={3} />);
    const shown = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-group') !== null);
    expect(shown.map((li) => li.getAttribute('data-group'))).toEqual(['5', '4', '3']);
  });

  it('Given 束 3 つ・limit 0 / When 描く / Then 束は出ず、空の文言も出さない（limit は切り出しだけ）', () => {
    render(<EstimateLog groups={[group(1), group(2), group(3)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} limit={0} />);
    expect(screen.queryByText(ESTIMATE_LOG_EMPTY)).toBeNull();
  });

  it('Given 束 / When 描く / Then 束は ol、領域は見出しで名前を持ち、2 つ描いても id が衝突しない', () => {
    render(
      <>
        <EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />
        <EstimateLog groups={[group(1)]} onSetPoints={vi.fn()} onRenameGroup={vi.fn()} disabled={false} />
      </>,
    );
    const regions = screen.getAllByRole('region', { name: ESTIMATE_LOG_HEADING });
    expect(regions).toHaveLength(2);
    expect(regions[0]!.getAttribute('aria-labelledby')).not.toBe(regions[1]!.getAttribute('aria-labelledby'));
    expect(regions[0]!.querySelector('ol')).not.toBeNull();
  });
});

describe('閉じた束の名前の付け直し（#427・設計 E）', () => {
  const noop = vi.fn();
  it('Given 閉じた束 / When 名前を押して打ち Enter / Then onRenameGroup(id, 名前)', () => {
    const onRenameGroup = vi.fn();
    render(<EstimateLog groups={[group(4)]} onSetPoints={noop} onRenameGroup={onRenameGroup} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /ITEM-4/ }));
    const input = screen.getByRole('textbox', { name: RENAME_GROUP });
    fireEvent.change(input, { target: { value: '新しい名前' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledTimes(1);
    expect(onRenameGroup).toHaveBeenCalledWith(4, '新しい名前');
  });

  it('Given open の束 / When 描く / Then 名前は押せない', () => {
    render(<EstimateLog groups={[group(1, { open: true })]} onSetPoints={noop} onRenameGroup={vi.fn()} disabled={false} />);
    expect(screen.queryByRole('button', { name: /ITEM-1/ })).toBeNull();
    expect(screen.getByText('ITEM-1')).toBeTruthy();
  });

  it('Given 打ちかけ / When 他の人の更新で groups が差し替わる / Then 打ちかけが残る', () => {
    const { rerender } = render(<EstimateLog groups={[group(1)]} onSetPoints={noop} onRenameGroup={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /ITEM-1/ }));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: '打ちかけ' } });
    rerender(<EstimateLog groups={[group(1, { item: '他の人の名前' }), group(2)]} onSetPoints={noop} onRenameGroup={vi.fn()} disabled={false} />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('打ちかけ');
  });

  it('Given 閉じた束 / When 描く / Then 見出しにソースの注記が文字として描かれない', () => {
    const { container } = render(<EstimateLog groups={[group(1)]} onSetPoints={noop} onRenameGroup={vi.fn()} disabled={false} />);
    const head = container.querySelector('.estimate-group-head') as HTMLElement;
    expect(head.textContent).not.toContain('//');
    expect(head.textContent).not.toContain('見出しの強い値');
  });

  it('Given 閉じた束 / When 描く / Then 束は .ui-stack--tight（見出しの行と回の記録の間は --space-2）で、見出しの行は .ui-section-head', () => {
    const { container } = render(<EstimateLog groups={[group(1)]} onSetPoints={noop} onRenameGroup={vi.fn()} disabled={false} />);
    const item = container.querySelector('.estimate-group') as HTMLElement;
    expect(item.classList.contains('ui-stack')).toBe(true);
    expect(item.classList.contains('ui-stack--tight')).toBe(true);
    expect(item.querySelector('.estimate-group-head')!.classList.contains('ui-section-head')).toBe(true);
  });
});
