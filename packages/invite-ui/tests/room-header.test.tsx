import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoomHeader, type RoomHeaderProps } from '../src/index.js';

const { toDataURL } = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock('qrcode', () => ({ toDataURL }));

/**
 * `execCommand` は jsdom に無いことがあるので、元の状態を覚えておき、後の試験へ漏らさない。
 * `Object.defineProperty` で入れた値は `vi.unstubAllGlobals()` では戻らない。
 */
const execCommandBefore = Object.getOwnPropertyDescriptor(document, 'execCommand');
function restoreExecCommand(): void {
  if (execCommandBefore) Object.defineProperty(document, 'execCommand', execCommandBefore);
  else Reflect.deleteProperty(document, 'execCommand');
}

const INVITE_URL = 'https://example.test/?room=ABC123';
const BACK_HREF = '/hub/ABC123';

function renderHeader(overrides: Partial<RoomHeaderProps> = {}) {
  const props: RoomHeaderProps = {
    title: 'お題',
    backHref: BACK_HREF,
    roomCode: 'ABC123',
    inviteUrl: INVITE_URL,
    ...overrides,
  };
  const view = render(<RoomHeader {...props} />);
  return { ...view, props };
}

/** QR の開け閉めボタンと、それが指す QR の欄を引く。 */
function qrToggle(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^QR コードを(表示|閉じる)$/ }) as HTMLButtonElement;
}
function qrRegion(button: HTMLElement): HTMLElement {
  return document.getElementById(button.getAttribute('aria-controls')!)!;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  restoreExecCommand();
});

describe('ルーム画面の共通の見出し', () => {
  it('Given 道具名・戻り先・ルームコード・URL / When 描く / Then 見出し・戻るリンク・ルームコード・URL・コピーのボタンが出る', () => {
    // Given / When
    renderHeader();

    // Then
    expect(screen.getByRole('heading', { level: 1, name: 'お題' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '選択画面へ戻る' }).getAttribute('href')).toBe(BACK_HREF);
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.getByText(INVITE_URL)).toBeTruthy();
    expect(screen.getByRole('button', { name: '招待リンクをコピー' })).toBeTruthy();
  });

  it('Given 描いた直後 / When 何もしない / Then QR は閉じていて、qrcode を呼ばない', () => {
    // Given / When
    renderHeader();
    const toggle = qrToggle();

    // Then
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((qrRegion(toggle) as HTMLElement).hidden).toBe(true);
    expect(toDataURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('Given 閉じた QR / When 開くボタンを押す / Then その URL の QR が出て、ボタンが閉じるに変わる', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();

    // When
    fireEvent.click(qrToggle());

    // Then
    expect(await screen.findByRole('img', { name: '参加用 URL の QR コード' })).toBeTruthy();
    expect(toDataURL).toHaveBeenCalledWith(INVITE_URL, { width: 200 });
    const toggle = screen.getByRole('button', { name: 'QR コードを閉じる' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect((qrRegion(toggle) as HTMLElement).hidden).toBe(false);
  });

  it('Given QR が開いている / When 閉じるボタンを押す / Then 欄が隠れ、ボタンが表示に戻る', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    fireEvent.click(screen.getByRole('button', { name: 'QR コードを閉じる' }));

    // Then
    const toggle = qrToggle();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((qrRegion(toggle) as HTMLElement).hidden).toBe(true);
  });

  it('Given QR の生成が失敗する / When 開く / Then 手で写す案内を出す', async () => {
    // Given
    toDataURL.mockRejectedValue(new Error('QR failed'));
    renderHeader();

    // When
    fireEvent.click(qrToggle());

    // Then
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('QR コードを表示できません。URL を選んでコピーしてください。');
  });

  it('Given QR を開いている / When URL が変わる / Then 新しい URL で作り直す', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    const { rerender, props } = renderHeader();
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    const nextUrl = 'https://example.test/?room=XYZ789';
    rerender(<RoomHeader {...props} inviteUrl={nextUrl} />);

    // Then
    await waitFor(() => expect(toDataURL.mock.calls.at(-1)?.[0]).toBe(nextUrl));
  });

  it('Given クリップボードが拒む / When コピーを押す / Then ボタンが失敗の字になり、URL は出たまま', async () => {
    // Given: Clipboard API が拒み、従来のコピーも false を返す。
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    renderHeader();

    // When
    fireEvent.click(screen.getByRole('button', { name: '招待リンクをコピー' }));

    // Then
    expect(await screen.findByRole('button', { name: 'コピーできません（URL を選択してください）' })).toBeTruthy();
    expect(screen.getByText(INVITE_URL)).toBeTruthy();
  });

  it('Given クリップボードが使える / When コピーを押す / Then ボタンがコピーしましたになる', async () => {
    // Given
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    renderHeader();

    // When
    fireEvent.click(screen.getByRole('button', { name: '招待リンクをコピー' }));

    // Then
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeTruthy();
  });

  it('Given 道具に固有のボタン / When titleExtras に渡す / Then 見出しの隣に置かれ、戻るリンクは行の 2 つ目の子のまま', () => {
    // Given / When
    const { container } = renderHeader({
      titleExtras: <button type="button">お題を隠す</button>,
    });

    // Then
    const row = container.querySelector('.ui-page-header')!;
    expect(row.children.length).toBe(2);
    expect(row.children[1]!.tagName).toBe('A');
    expect(row.children[1]!.textContent).toBe('選択画面へ戻る');
    const heading = screen.getByRole('heading', { level: 1 });
    const extra = screen.getByRole('button', { name: 'お題を隠す' });
    expect(extra.parentElement).toBe(heading.parentElement);
  });

  it('Given URL の欄 / When 描く / Then aria-label を持たない', () => {
    // Given / When
    const { container } = renderHeader();

    // Then
    expect(container.querySelector('.ui-invite-url')!.hasAttribute('aria-label')).toBe(false);
  });
});
