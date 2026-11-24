/**
 * 選択画面の並び（#684 の札・#673 の札の下）。
 *
 * - 札: 段の割り方（`hand-rows.ts`）を、札ごとの置き場所として DOM に渡す（CSS は受け取って並べるだけ）
 * - 合言葉: 設定する人は少なく説明が長いので、ふだんは 1 行にたたむ。押すと設定の口が開く
 *
 * 見た目（矩形・段の揃い）は E2E（`e2e/specs/landing-arrangement.spec.ts`）が測る。
 *
 * @requirements #684 #673
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { outsideBase } from '@tasuki/test-css/font-base';
import { RoomChoice } from '../src/screens/RoomChoice.js';
import { handPlacements } from '../src/hand-rows.js';
import { TOOLS } from '../src/tools.js';

afterEach(cleanup);

function showChoice(overrides: { protectedNow?: boolean | null; error?: string | null } = {}) {
  return render(
    <RoomChoice
      code="朝会-ab12"
      inviteUrl="https://example.test/?room=ab12"
      roster={null}
      connection="online"
      topicTitle={null}
      passphraseProtected={overrides.protectedNow === undefined ? false : overrides.protectedNow}
      passphraseError={overrides.error ?? null}
      onSetPassphrase={() => undefined}
    />,
  );
}

describe('札の置き場所を CSS へ渡す', () => {
  it('Given 選択画面 / When 札を描く / Then 札ごとに、段の割り方から出した置き場所（始まりの列・段の端・配る順）が付く', () => {
    showChoice();
    const items = within(screen.getByRole('list', { name: 'ツール' })).getAllByRole('listitem');
    const expected = handPlacements(TOOLS.length);
    expect(items).toHaveLength(TOOLS.length);
    items.forEach((li, i) => {
      const want = expected[i]!;
      const where = `${String(i + 1)} 枚目`;
      expect(li.style.getPropertyValue('--hand-start-2'), where).toBe(want.start2 === null ? '' : String(want.start2));
      expect(li.style.getPropertyValue('--hand-start-3'), where).toBe(want.start3 === null ? '' : String(want.start3));
      expect(li.style.getPropertyValue('--hand-start-4'), where).toBe(want.start4 === null ? '' : String(want.start4));
      expect(li.getAttribute('data-row-edge'), where).toBe(want.edge4);
      expect(li.style.getPropertyValue('--hand-index'), where).toBe(String(i));
    });
    // 空振りの歯止め: 段の頭と端が 1 つ以上ある
    expect(items.some((li) => li.style.getPropertyValue('--hand-start-4') !== '')).toBe(true);
    expect(items.some((li) => li.getAttribute('data-row-edge') === 'end')).toBe(true);
  });
});

describe('合言葉はふだんたたんでおく', () => {
  const panel = () => within(screen.getByRole('region', { name: '合言葉' }));

  it('Given 合言葉が付いていないルーム / When 選択画面を開く / Then 状態の一言と「設定する」だけが見え、設定の口は閉じている', () => {
    showChoice();
    expect(panel().getByText('合言葉は付いていません。', { exact: false })).toBeVisible();
    const toggle = panel().getByRole('button', { name: '設定する' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel().getByLabelText('新しい合言葉', { selector: 'input' })).not.toBeVisible();
    expect(panel().getByText('ルームに参加している人なら', { exact: false })).not.toBeVisible();
  });

  it('Given たたんだ状態 / When 「設定する」を押す / Then 設定の口が開き、ボタンは「閉じる」になる。もう一度押すと閉じる', () => {
    showChoice();
    fireEvent.click(panel().getByRole('button', { name: '設定する' }));
    const input = panel().getByLabelText('新しい合言葉', { selector: 'input' });
    expect(input).toBeVisible();
    const close = panel().getByRole('button', { name: '閉じる' });
    expect(close).toHaveAttribute('aria-expanded', 'true');
    // ボタンが指す先が、開いた口そのものである
    expect(document.getElementById(close.getAttribute('aria-controls') ?? '')?.contains(input)).toBe(true);
    fireEvent.click(close);
    expect(input).not.toBeVisible();
    expect(panel().getByRole('button', { name: '設定する' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('Given 開いた口に合言葉を入れかけた / When 送らずに閉じて、開き直す / Then 入れかけた値は残っていない（見えない欄に平文を残さない）', () => {
    showChoice();
    fireEvent.click(panel().getByRole('button', { name: '設定する' }));
    const input = panel().getByLabelText('新しい合言葉', { selector: 'input' });
    fireEvent.change(input, { target: { value: 'ひみつ' } });
    expect(input).toHaveValue('ひみつ');
    fireEvent.click(panel().getByRole('button', { name: '閉じる' }));
    // 閉じた時点で、隠れた欄にも残っていない
    expect(input).toHaveValue('');
    fireEvent.click(panel().getByRole('button', { name: '設定する' }));
    expect(panel().getByLabelText('新しい合言葉', { selector: 'input' })).toHaveValue('');
  });

  it('Given 合言葉が付いているルーム / When 選択画面を開く / Then たたんだ行のボタンは「変更・解除」になる', () => {
    showChoice({ protectedNow: true });
    expect(panel().getByText('合言葉を設定中です。', { exact: false })).toBeVisible();
    expect(panel().getByRole('button', { name: '変更・解除' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('Given たたんだ状態 / When 設定が失敗した / Then 失敗の文言はたたんだままでも見える', () => {
    showChoice({ error: '合言葉を設定できませんでした。' });
    expect(panel().getByRole('alert')).toBeVisible();
    expect(panel().getByRole('alert')).toHaveTextContent('合言葉を設定できませんでした。');
  });

  it('Given たたんだ行・開いた行の文言 / When 書体の常用の層に当てる / Then 外れる字は無い', () => {
    expect(outsideBase(['設定する', '変更・解除', '閉じる'])).toEqual([]);
  });
});

describe('「記録を見る」は作業領域の中に置く', () => {
  it('Given 選択画面 / When 開く / Then 「記録を見る」は札・参加者・招待と同じ作業領域の末尾にある（画面の外に浮かせない）', () => {
    const { container } = showChoice();
    const workspace = container.querySelector('.hub-workspace');
    const link = screen.getByRole('link', { name: '記録を見る' });
    expect(workspace?.contains(link)).toBe(true);
    expect(workspace?.lastElementChild?.contains(link)).toBe(true);
  });
});
