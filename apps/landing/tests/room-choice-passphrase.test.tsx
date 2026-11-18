/**
 * 選択画面（`RoomChoice`）の合言葉の設定の口（#638）。
 *
 * 合言葉が守るのはルーム全体（すべての道具）で、設定の口だけが timer に在った。timer から外し、
 * ルームの入口である玄関に置く。設定・変更・解除ができ、合言葉そのものは画面に残さない。
 * 状態（付いているか）は名簿の印から映す（`passphraseProtected`）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAX_PASSPHRASE } from '@tasuki/room-core';
import { RoomChoice } from '../src/screens/RoomChoice.js';
import { outsideBase } from '@tasuki/test-css/font-base';

afterEach(cleanup);

function showChoice(overrides: { protectedNow?: boolean; connection?: 'online' | 'reconnecting' } = {}) {
  const onSetPassphrase = vi.fn();
  render(
    <RoomChoice
      code="朝会-ab12"
      inviteUrl="https://example.test/?room=ab12"
      roster={null}
      connection={overrides.connection ?? 'online'}
      topicTitle={null}
      passphraseProtected={overrides.protectedNow ?? false}
      onSetPassphrase={onSetPassphrase}
    />,
  );
  return { onSetPassphrase };
}

const input = () => screen.getByLabelText('新しい合言葉', { selector: 'input' }) as HTMLInputElement;

describe('選択画面の合言葉', () => {
  it('Given 合言葉が付いていないルーム / When 選択画面を見る / Then 見出しと「付いていない」状態と入力欄が出る', () => {
    showChoice();

    expect(screen.getByRole('heading', { name: '合言葉' })).toBeInTheDocument();
    expect(screen.getByText('合言葉は付いていません。', { exact: false })).toBeInTheDocument();
    expect(input()).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', { name: '解除' })).toBeNull();
  });

  it('Given 未設定 / When 合言葉を入れて設定する / Then その値で設定し、入力欄は空に戻る（平文を画面に残さない）', () => {
    const { onSetPassphrase } = showChoice();

    fireEvent.change(input(), { target: { value: 'ひみつ' } });
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    expect(onSetPassphrase).toHaveBeenCalledExactlyOnceWith('ひみつ');
    expect(input()).toHaveValue('');
  });

  it('Given 入力欄 / When Enter で送る / Then 設定される', () => {
    const { onSetPassphrase } = showChoice();

    fireEvent.change(input(), { target: { value: 'ひみつ' } });
    fireEvent.submit(input().closest('form')!);

    expect(onSetPassphrase).toHaveBeenCalledExactlyOnceWith('ひみつ');
  });

  it.each([['空', ''], ['空白だけ', '   ']])('Given %s の入力 / When 見る / Then 設定ボタンは押せず、送っても何も送らない', (_label, value) => {
    const { onSetPassphrase } = showChoice();

    fireEvent.change(input(), { target: { value } });

    expect(screen.getByRole('button', { name: '設定' })).toBeDisabled();
    fireEvent.submit(input().closest('form')!);
    expect(onSetPassphrase).not.toHaveBeenCalled();
  });

  it('Given 入力欄 / When 属性を見る / Then 上限は room-core の MAX_PASSPHRASE で、補完を切ってある', () => {
    showChoice();

    expect(input()).toHaveAttribute('maxlength', String(MAX_PASSPHRASE));
    expect(input()).toHaveAttribute('autocomplete', 'off');
  });

  it('Given 合言葉が付いているルーム / When 選択画面を見る / Then 「設定中」の状態と、変更・解除の口が出る', () => {
    showChoice({ protectedNow: true });

    expect(screen.getByText('合言葉を設定中です。', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '変更' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '設定' })).toBeNull();
  });

  it('Given 設定中 / When 新しい合言葉で変更する / Then その値で設定し直す', () => {
    const { onSetPassphrase } = showChoice({ protectedNow: true });

    fireEvent.change(input(), { target: { value: 'べつ' } });
    fireEvent.click(screen.getByRole('button', { name: '変更' }));

    expect(onSetPassphrase).toHaveBeenCalledExactlyOnceWith('べつ');
  });

  it('Given 設定中 / When 解除する / Then 空文字を送る', () => {
    const { onSetPassphrase } = showChoice({ protectedNow: true });

    fireEvent.click(screen.getByRole('button', { name: '解除' }));

    expect(onSetPassphrase).toHaveBeenCalledExactlyOnceWith('');
  });

  it('Given 同期サーバーに繋がっていない / When 見る / Then 設定も解除も押せない（送っても黙って積まれるだけ）', () => {
    const { onSetPassphrase } = showChoice({ protectedNow: true, connection: 'reconnecting' });

    expect(screen.getByRole('button', { name: '解除' })).toBeDisabled();
    fireEvent.change(input(), { target: { value: 'べつ' } });
    expect(screen.getByRole('button', { name: '変更' })).toBeDisabled();
    fireEvent.submit(input().closest('form')!);
    expect(onSetPassphrase).not.toHaveBeenCalled();
  });
});

// 文言の字は書体の常用の層（base）に収める（`packages/ui/README.md`）。外れると拡張の層を取りに行き、代替字形が一瞬見える。
describe('合言葉の文言は書体の常用の層に収まる', () => {
  it('Given 設定中・未設定の両方の画面 / When 描かれた文字を base 層に当てる / Then 外れる字は無い', () => {
    const texts: string[] = [];
    for (const protectedNow of [false, true]) {
      const { container, unmount } = render(
        <RoomChoice
          code="朝会-ab12"
          inviteUrl="https://example.test/?room=ab12"
          roster={null}
          connection="online"
          topicTitle={null}
          passphraseProtected={protectedNow}
          onSetPassphrase={() => undefined}
        />,
      );
      const panel = container.querySelector('.hub-passphrase-form')?.closest('section');
      texts.push(panel?.textContent ?? '');
      unmount();
    }
    expect(texts.every((t) => t.length > 20)).toBe(true);
    expect(outsideBase(texts)).toEqual([]);
  });
});
