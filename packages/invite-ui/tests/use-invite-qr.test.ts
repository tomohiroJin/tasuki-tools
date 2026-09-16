import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useInviteQr } from '../src/index.js';

const { toDataURL } = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock('qrcode', () => ({ toDataURL }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('共有 QR 生成', () => {
  it('Given QR を閉じている / When 表示を選ぶ / Then その時に参加 URL の QR を生成する', async () => {
    // Given: 閉じた状態で、生成はまだ要求していない。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    const { result, rerender } = renderHook(({ visible }) => useInviteQr('参加 URL', visible), { initialProps: { visible: false } });
    expect(toDataURL).not.toHaveBeenCalled();

    // When: QR を開く。
    rerender({ visible: true });

    await waitFor(() => expect(result.current.dataUrl).toBe('data:image/png;base64,qr'));
    expect(toDataURL).toHaveBeenCalledWith('参加 URL', { width: 200 });
  });

  it('Given QR 生成に失敗する / When 表示を選ぶ / Then 手動共有を案内するための失敗状態を返す', async () => {
    // Given: ライブラリが生成を拒否する。
    toDataURL.mockRejectedValue(new Error('QR failed'));

    // When: QR を開く。
    const { result } = renderHook(() => useInviteQr('URL', true));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.dataUrl).toBeNull();
  });

  it('Given 古い QR の生成が遅れている / When URL が変わる / Then 古い生成結果で上書きしない', async () => {
    // Given: 最初の生成は未完了のまま。
    let finish!: (value: string) => void;
    toDataURL.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ url }) => useInviteQr(url, true), { initialProps: { url: 'old' } });
    await waitFor(() => expect(toDataURL).toHaveBeenCalledOnce());
    toDataURL.mockResolvedValue('new QR');

    // When: 新しい URL を生成した後に、古い生成が完了する。
    rerender({ url: 'new' });
    await waitFor(() => expect(result.current.dataUrl).toBe('new QR'));
    await act(async () => { finish('old QR'); });

    expect(result.current.dataUrl).toBe('new QR');
  });
});
