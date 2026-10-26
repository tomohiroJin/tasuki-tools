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
function qrToggle(): HTMLElement {
  return screen.getByRole('button', { name: /^QR コードを(表示|閉じる)$/ });
}
function qrRegion(button: HTMLElement): HTMLElement {
  return document.getElementById(button.getAttribute('aria-controls')!)!;
}

/** `import('qrcode')` の連鎖を、マクロタスクまで流しきる。待ちの時間に頼らない。 */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
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

  it('Given 描いた直後 / When 何もしない / Then QR は閉じていて、qrcode を呼ばない', async () => {
    // Given / When: 読み込みが走るなら非同期の連鎖の中で呼ばれるので、先に流しきってから見る。
    renderHeader();
    const toggle = qrToggle();
    await flushAsync();

    // Then
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(toggle).hidden).toBe(true);
    expect(toDataURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
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
    expect(qrRegion(toggle).hidden).toBe(false);
  });

  it('Given QR を開いた / When 生成が終わる前 / Then 準備中の案内を出す', async () => {
    // Given: 生成は解決されないまま。
    toDataURL.mockReturnValue(new Promise<string>(() => {}));
    renderHeader();

    // When
    fireEvent.click(qrToggle());

    // Then: 準備中の字が出て、画像はまだ無い。
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('QR コードを準備しています…');
    expect(document.querySelector('img')).toBeNull();
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
    expect(qrRegion(toggle).hidden).toBe(true);
  });

  it('Given QR の生成が失敗する / When 開く / Then 手で写す案内を出す', async () => {
    // Given
    toDataURL.mockRejectedValue(new Error('QR failed'));
    renderHeader();

    // When
    fireEvent.click(qrToggle());

    // Then: 失敗の字が出るまで待つ（準備中の字と取り違えない）。
    expect(await screen.findByText('QR コードを表示できません。URL を選んでコピーしてください。')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('QR コードを表示できません。URL を選んでコピーしてください。');
  });

  it('Given QR が開いている / When Esc を押す / Then 閉じて、開いたボタンへ戻る', async () => {
    // Given: QR は画面の上に浮かぶので、キーボードだけでも閉じられる必要がある。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    fireEvent.keyDown(document, { key: 'Escape' });

    // Then
    const toggle = qrToggle();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(toggle).hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('Given QR が開いている / When QR の外を押す / Then 閉じる。QR の上を押しても閉じない', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    fireEvent.click(qrToggle());
    const image = await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When: QR の上を押す
    fireEvent.mouseDown(image);

    // Then: 開いたまま
    expect(qrRegion(qrToggle()).hidden).toBe(false);

    // When: 見出しの外（画面の本体）を押す
    fireEvent.mouseDown(document.body);

    // Then
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(qrToggle()).hidden).toBe(true);
  });

  it('Given QR が閉じている / When Esc を押す / Then 何も変わらず、ボタンへ寄せない', () => {
    // Given
    renderHeader();
    const before = document.activeElement;

    // When
    fireEvent.keyDown(document, { key: 'Escape' });

    // Then: 閉じている間はキーを拾わない（画面の他の Esc の操作を奪わない）。
    expect(document.activeElement).toBe(before);
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('Given QR を開いて準備中 / When 生成が失敗する / Then 同じ知らせの要素の字を差し替える（読み上げに届く）', async () => {
    // Given: 準備中の知らせが出ている。知らせの要素を作り直すと、読み上げは差し込まれた字を読まない。
    let fail: (error: Error) => void = () => {};
    toDataURL.mockReturnValue(new Promise<string>((_, reject) => { fail = reject; }));
    renderHeader();
    fireEvent.click(qrToggle());
    const preparing = await screen.findByText('QR コードを準備しています…');

    // When
    fail(new Error('QR failed'));

    // Then: 失敗の字は、準備中の字を出していた同じ要素に入る。
    await screen.findByText('QR コードを表示できません。URL を選んでコピーしてください。');
    expect(screen.getByRole('status')).toBe(preparing);
  });

  it('Given QR を閉じている / When 描く / Then 知らせの要素は先に置いてあり、字は空', () => {
    // Given / When
    renderHeader();

    // Then: 開いたときに中身だけが変わるよう、知らせの要素は閉じている間も QR の欄の中にある。
    const status = qrRegion(qrToggle()).querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.textContent).toBe('');
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

/** 狭い幅でたたむ「仲間を招く」の開閉。aria-controls の指す先は `.ui-room-header-share`。 */
function inviteToggle(): HTMLElement {
  return screen.getByRole('button', { name: '仲間を招く' });
}
function shareRegion(button: HTMLElement): HTMLElement {
  return document.getElementById(button.getAttribute('aria-controls')!)!;
}

describe('狭い幅で招待をたたむ「仲間を招く」', () => {
  it('Given 描いた直後 / When 何もしない / Then 仲間を招くは閉じていて、指す先は招待の行と QR の欄を包む', () => {
    // Given / When
    const { container } = renderHeader();
    const toggle = inviteToggle();
    const region = shareRegion(toggle);

    // Then: 押す前は `data-open` を持たない（常に 'true' を付ける壊し方を、ここで赤くする）
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.classList.contains('ui-room-header-share')).toBe(true);
    expect(region.getAttribute('data-open')).toBe(null);
    expect(region.querySelector('.ui-room-header-invite')).not.toBeNull();
    expect(region.querySelector('.ui-room-header-qr')).not.toBeNull();
    expect(container.querySelectorAll('.ui-room-header-share-toggle').length).toBe(1);
  });

  it('Given 閉じた招待 / When 仲間を招くを押す / Then 開く。もう一度押すと閉じる', () => {
    // Given
    renderHeader();
    const toggle = inviteToggle();

    // When: 1 回目
    fireEvent.click(toggle);

    // Then: 開いた
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(shareRegion(toggle).getAttribute('data-open')).toBe('true');

    // When: 2 回目
    fireEvent.click(toggle);

    // Then: 閉じた（属性は消える。'false' を書く実装とは区別しない・null で見る）
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(shareRegion(toggle).getAttribute('data-open')).toBe(null);
  });

  it('Given 招待を開いた / When QR を開く / Then 2 つの開閉は互いに動かさない', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = inviteToggle();
    fireEvent.click(toggle);

    // When
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // Then: 仲間を招くは開いたまま
    expect(inviteToggle().getAttribute('aria-expanded')).toBe('true');
    expect(shareRegion(inviteToggle()).getAttribute('data-open')).toBe('true');

    // When: QR を閉じる
    fireEvent.click(screen.getByRole('button', { name: 'QR コードを閉じる' }));

    // Then: 仲間を招くは開いたまま、QR だけ閉じる
    expect(inviteToggle().getAttribute('aria-expanded')).toBe('true');
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('Given QR を開いたまま / When 仲間を招くを押して閉じる / Then QR のボタンは開いたままの \'true\' で、欄も見えている', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });
    fireEvent.click(inviteToggle());

    // When: 仲間を招くを閉じる
    fireEvent.click(inviteToggle());

    // Then: 招待は閉じ、QR は開いたまま（逆方向の独立）
    expect(inviteToggle().getAttribute('aria-expanded')).toBe('false');
    expect(shareRegion(inviteToggle()).getAttribute('data-open')).toBe(null);
    expect(qrToggle().getAttribute('aria-expanded')).toBe('true');
    expect(qrRegion(qrToggle()).hidden).toBe(false);
  });
});
