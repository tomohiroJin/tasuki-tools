import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultCopy } from '../src/components/ResultCopy';
import { RESULT_COPY_BUTTON, RESULT_COPY_DONE, RESULT_COPY_FAILED, RESULT_COPY_MANUAL_FIELD } from '../src/copy';

const MD = '## 進行役ルーレットの結果\n\n- 決め方：1 回で決める\n- 選ばれた人：あや';

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  // 古い経路（execCommand）も使えない環境にして、失敗を確定させる
  document.execCommand = vi.fn(() => false);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const press = async (): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: RESULT_COPY_BUTTON }));
  });
};

/**
 * @requirements #676（コピーの成功と、失敗したときに手で選べる欄）
 */
describe('ResultCopy', () => {
  it('Given 結果の Markdown / When 押す / Then その Markdown をクリップボードへ書き、成功を知らせる', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<ResultCopy markdown={MD} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    await press();
    expect(writeText).toHaveBeenCalledWith(MD);
    expect(screen.getByRole('status')).toHaveTextContent(RESULT_COPY_DONE);
    expect(screen.queryByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeNull();
  });

  it('Given コピーが拒まれる / When 押す / Then 失敗を知らせ、Markdown を手で選べる欄に出す（2 秒で消えない）', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<ResultCopy markdown={MD} />);
    await press();
    expect(screen.getByRole('status')).toHaveTextContent(RESULT_COPY_FAILED);
    expect(screen.getByRole('status')).not.toHaveTextContent(RESULT_COPY_DONE);
    const field = screen.getByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD });
    expect(field).toHaveValue(MD);
    expect(field).toHaveAttribute('readonly');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(RESULT_COPY_FAILED);
  });

  it('Given 失敗して欄が出ている / When 押し直して成功する / Then 欄が閉じる', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error('denied')).mockResolvedValue();
    stubClipboard(writeText);
    render(<ResultCopy markdown={MD} />);
    await press();
    expect(screen.getByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeInTheDocument();
    await press();
    expect(screen.queryByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(RESULT_COPY_DONE);
  });

  it('Given 失敗の欄が出ている / When 結果が変わる（部品を作り直す） / Then 前の失敗の欄が残らない', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const { rerender } = render(<ResultCopy key={1} markdown={MD} />);
    await press();
    expect(screen.getByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeInTheDocument();
    rerender(<ResultCopy key={2} markdown={MD + 'x'} />);
    expect(screen.queryByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
