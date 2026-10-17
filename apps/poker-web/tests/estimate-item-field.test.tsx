/**
 * アイテム名の欄（#93・spec §4.1）。題のボタンを押すと入力に替わり、Enter／フォーカス外れで確定する。
 *
 * @requirements #93
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAX_ESTIMATE_ITEM } from '@tasuki/poker-core';
import { EstimateItemField } from '../src/components/EstimateItemField';
import { ESTIMATE_ITEM_LABEL, ESTIMATE_UNNAMED } from '../src/estimate-copy';

afterEach(cleanup);

function openEditor(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button'));
  return screen.getByRole<HTMLInputElement>('textbox');
}

describe('EstimateItemField', () => {
  it('Given item が空 / When 描く / Then （名前なし）を出し、入力を促す表示は無い', () => {
    render(<EstimateItemField item="" onCommit={vi.fn()} disabled={false} />);
    expect(screen.getByText(ESTIMATE_ITEM_LABEL)).toBeTruthy();
    const trigger = screen.getByRole('button', { name: new RegExp(ESTIMATE_UNNAMED) });
    expect(trigger.getAttribute('aria-invalid')).toBeNull();
    const input = openEditor();
    expect(input.required).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('Given 題のボタン / When 押す / Then 入力になり maxLength は 120', () => {
    render(<EstimateItemField item="" onCommit={vi.fn()} disabled={false} />);
    const input = openEditor();
    expect(input.maxLength).toBe(MAX_ESTIMATE_ITEM);
    expect(input.maxLength).toBe(120);
  });

  it('Given 編集中 / When Enter / Then onCommit が 1 回', () => {
    const onCommit = vi.fn();
    render(<EstimateItemField item="" onCommit={onCommit} disabled={false} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: 'PROJ-1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('PROJ-1');
  });

  it('Given 編集中 / When フォーカスが外れる / Then 確定する', () => {
    const onCommit = vi.fn();
    render(<EstimateItemField item="" onCommit={onCommit} disabled={false} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: 'PROJ-2' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('PROJ-2');
  });

  it('Given 編集中 / When Escape / Then 元に戻り onCommit は呼ばれない', () => {
    const onCommit = vi.fn();
    render(<EstimateItemField item="元" onCommit={onCommit} disabled={false} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: '打ちかけ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /元/ })).toBeTruthy();
  });

  it('Given 値が変わらない / When 確定する / Then 呼ばない', () => {
    const onCommit = vi.fn();
    render(<EstimateItemField item="同じ" onCommit={onCommit} disabled={false} />);
    const input = openEditor();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Given 編集中 / When item の props が変わる / Then 打ちかけの値は消えない', () => {
    const { rerender } = render(<EstimateItemField item="" onCommit={vi.fn()} disabled={false} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: '打ちかけ' } });
    rerender(<EstimateItemField item="他の人の入力" onCommit={vi.fn()} disabled={false} />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('打ちかけ');
  });

  it('Given disabled / When 描く / Then 題のボタンが押せない', () => {
    render(<EstimateItemField item="" onCommit={vi.fn()} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
