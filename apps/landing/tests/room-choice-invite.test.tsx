import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useInviteQr } from '@tasuki/invite-ui';
import { RoomChoice } from '../src/screens/RoomChoice.js';

vi.mock('@tasuki/invite-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tasuki/invite-ui')>();
  return { ...actual, useInviteQr: vi.fn(actual.useInviteQr) };
});
const URL = 'https://example.test/?room=%E6%9C%9D%E4%BC%9A-ab12';

/**
 * `Object.defineProperty` で入れた値は `vi.unstubAllGlobals()` では戻らない。
 * 戻さないと、後から足したテストが「使えない `execCommand`」を引き継いで偽の緑になる。
 */
const execCommandBefore = Object.getOwnPropertyDescriptor(document, 'execCommand');
function restoreExecCommand(): void {
  if (execCommandBefore) Object.defineProperty(document, 'execCommand', execCommandBefore);
  else Reflect.deleteProperty(document, 'execCommand');
}

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); restoreExecCommand(); });
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('@tasuki/invite-ui')>('@tasuki/invite-ui');
  vi.mocked(useInviteQr).mockImplementation(actual.useInviteQr);
});

function showChoice() {
  return render(<RoomChoice code="朝会-ab12" inviteUrl={URL} roster={null} connection="online" topicTitle={null} />);
}

describe('選択画面で参加 URL を配る', () => {
  it('Given 選択画面 / When コピーを選ぶ / Then 表示と同じ URL を書き、成功を伝える', async () => {
    // Given: Clipboard API が成功する環境。
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    showChoice();

    // When: 参加用 URL のコピーを選ぶ。
    fireEvent.click(screen.getByRole('button', { name: '参加用 URL をコピー' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByRole('status')).toHaveTextContent('コピーしました');
  });

  it('Given clipboard が無い / When コピーできない / Then URL を手で選べるまま案内する', async () => {
    // Given: どちらの自動コピーも使えない環境。
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });
    showChoice();

    // When: 参加用 URL のコピーを選ぶ。
    fireEvent.click(screen.getByRole('button', { name: '参加用 URL をコピー' }));

    expect(await screen.findByRole('status')).toHaveTextContent('URL を選んでコピーしてください');
    const input = screen.getByRole('textbox', { name: '参加用 URL' });
    expect(input).toHaveValue(URL);
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('readonly');
  });

  it('Given 選択画面 / When QR 表示を選ぶ / Then 参加用 URL の QR が出て閉じられる', async () => {
    // Given: QR が閉じている選択画面。
    showChoice();
    expect(screen.queryByRole('img')).toBeNull();

    // When: QR を開く。
    fireEvent.click(screen.getByRole('button', { name: 'QR コードを表示' }));

    expect(await screen.findByRole('img', { name: '参加用 URL の QR コード' })).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    expect(useInviteQr).toHaveBeenCalledWith(URL, true);
    fireEvent.click(screen.getByRole('button', { name: 'QR コードを閉じる' }));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('Given QR 生成に失敗する / When QR 表示を選ぶ / Then URL の手動共有を案内する', async () => {
    // Given: 共有フックが生成失敗を返す。
    vi.mocked(useInviteQr).mockReturnValue({ dataUrl: null, failed: true });
    showChoice();

    // When: QR を開く。
    fireEvent.click(screen.getByRole('button', { name: 'QR コードを表示' }));

    expect(await screen.findByText('QR コードを表示できません。URL を選んでコピーしてください。')).toBeVisible();
    expect(screen.getByLabelText('参加用 URL')).toHaveValue(URL);
  });
});
