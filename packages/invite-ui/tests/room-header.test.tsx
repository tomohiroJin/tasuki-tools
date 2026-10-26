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
/** QR の状態を読み上げる知らせ（`aria-live`。画面の status とは別に持つ）。 */
function qrLive(): HTMLElement {
  const live = document.querySelector<HTMLElement>('.ui-room-header [aria-live="polite"]');
  if (!live) throw new Error('QR の読み上げの知らせが無い');
  return live;
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
  // 画面の幅と位置の spyOn（はみ出しの試験）を元に戻す。
  vi.restoreAllMocks();
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

    // Then: 準備中の字が読み上げとカードの両方に出て、画像はまだ無い。
    await waitFor(() => expect(qrLive().textContent).toBe('QR コードを準備しています…'));
    expect(qrRegion(qrToggle()).textContent).toBe('QR コードを準備しています…');
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
    await waitFor(() => expect(qrLive().textContent).toBe('QR コードを表示できません。URL を選んでコピーしてください。'));
    // カードの中にも同じ字を見える形で出す（読み上げは知らせの側だけが読む）。
    expect(qrRegion(qrToggle()).textContent).toBe('QR コードを表示できません。URL を選んでコピーしてください。');
  });

  it('Given QR が開いている / When ボタンで Esc を押す / Then 閉じて、開いたボタンにとどまる', async () => {
    // Given: QR は画面の上に浮かぶので、キーボードだけでも閉じられる必要がある。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    toggle.focus();
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    fireEvent.keyDown(toggle, { key: 'Escape' });

    // Then
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(toggle).hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('Given QR が開いている / When ボタンで Esc を押して閉じる / Then 同じ Esc を画面の他の処理へ伝えない', async () => {
    // Given: 画面の側にも Esc を聞く処理がある（引き出しを閉じるなど）。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });
    const pageEscape = vi.fn();
    document.addEventListener('keydown', pageEscape);

    // When
    fireEvent.keyDown(toggle, { key: 'Escape' });

    // Then: 1 回の Esc で閉じるのは QR だけ。
    expect(qrRegion(toggle).hidden).toBe(true);
    expect(pageEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', pageEscape);
  });

  it('Given QR が開いている / When 画面の幅が変わる（端末を回す） / Then 測り直して寄せる', async () => {
    // Given: 開いたときは収まっていた（右端 300px・画面 700px）。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    const card = qrRegion(toggle);
    const width = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(700);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 80, right: 300, width: 220 } as DOMRect);
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('0px');

    // When: 画面が 280px に狭まる
    width.mockReturnValue(280);
    fireEvent(window, new Event('resize'));

    // Then: 右端を 264px に収める（300 - 264 = 36px 左へ）。
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('-36px');
    expect(qrRegion(toggle).hidden).toBe(false);
  });

  it('Given 広い幅で QR が開いている / When 狭い幅へ変わり招待の欄がたたまれる / Then QR も閉じる', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    let narrow = false;
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('40rem') && narrow }) as MediaQueryList);
    renderHeader();
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When: 40rem 未満になる（「仲間を招く」は閉じたまま）
    narrow = true;
    fireEvent(window, new Event('resize'));

    // Then: 見えない欄に開いた QR を残さない（後で「仲間を招く」を開いたとき、開いた覚えのない QR が浮かない）。
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(qrToggle()).hidden).toBe(true);
  });

  it('Given 狭い幅で招待の欄と QR を開いている / When 「仲間を招く」で欄を閉じる / Then QR も閉じる', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const share = screen.getByRole('button', { name: '仲間を招く' });
    fireEvent.click(share);
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    fireEvent.click(share);

    // Then
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(qrToggle()).hidden).toBe(true);
  });

  it('Given QR が開いている / When 字を変換している途中の Esc / Then 閉じない', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When: 日本語の変換を取り消す Esc
    fireEvent.keyDown(toggle, { key: 'Escape', isComposing: true });

    // Then
    expect(qrRegion(toggle).hidden).toBe(false);
  });

  it('Given QR が開いている / When 画面の他の欄で Esc を押す / Then QR は Esc を拾わない', async () => {
    // Given: 見出しの外に、自分の Esc を持つ欄がある。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const field = document.body.appendChild(document.createElement('input'));
    fireEvent.click(qrToggle());
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When
    fireEvent.keyDown(field, { key: 'Escape' });

    // Then: 欄の Esc を奪わず、フォーカスを見出しへ引き寄せない。
    expect(qrRegion(qrToggle()).hidden).toBe(false);
    expect(document.activeElement).not.toBe(qrToggle());
    field.remove();
  });

  it('Given QR が開いている / When Tab でボタンから外へ出る / Then 閉じる（浮かぶ QR が次の欄を覆わない）', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When: フォーカスがコピーのボタン（QR の外）へ移る
    fireEvent.blur(toggle, { relatedTarget: screen.getByRole('button', { name: '招待リンクをコピー' }) });

    // Then
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(toggle).hidden).toBe(true);
  });

  it('Given QR が開いている / When QR の外を押す / Then 閉じる。QR の上を押しても閉じない', async () => {
    // Given
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    fireEvent.click(qrToggle());
    const image = await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // When: QR の上を押す（タッチやペンも拾えるよう pointerdown で見る）
    fireEvent.pointerDown(image);

    // Then: 開いたまま
    expect(qrRegion(qrToggle()).hidden).toBe(false);

    // When: 見出しの外（画面の本体）を押す
    fireEvent.pointerDown(document.body);

    // Then
    expect(qrToggle().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion(qrToggle()).hidden).toBe(true);
  });

  it('Given QR を開くとカードが画面の右へはみ出す / When 開く / Then はみ出す分だけ左へ寄せる', async () => {
    // Given: 画面の幅 320px。カードは右端 400px まで伸びる位置に出る。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    const card = qrRegion(toggle);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 180, right: 400, width: 220 } as DOMRect);

    // When
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // Then: 右端を画面の端から 16px 内側（304px）に収める。400 - 304 = 96px 左へ寄せる。
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('-96px');
  });

  it('Given 準備中の字のカードは収まる / When QR の画像が出てカードが広がる / Then 測り直して寄せる', async () => {
    // Given: 準備中は字だけで幅が狭く収まる（右端 300px）。画像が出ると右端 400px まで広がる。
    let resolve: (url: string) => void = () => {};
    toDataURL.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    renderHeader();
    const toggle = qrToggle();
    const card = qrRegion(toggle);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() => (
      card.querySelector('img') ? { left: 180, right: 400, width: 220 } : { left: 180, right: 300, width: 120 }
    ) as DOMRect);
    fireEvent.click(toggle);
    await waitFor(() => expect(qrLive().textContent).toBe('QR コードを準備しています…'));
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('0px');

    // When
    resolve('data:image/png;base64,qr');
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // Then
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('-96px');
  });

  it('Given QR を開くとカードが画面の左へはみ出す / When 開く / Then 左端を画面の内側に収める', async () => {
    // Given: 狭い画面でボタンが左端にあり、カードが左へ 10px はみ出す位置に出る。
    toDataURL.mockResolvedValue('data:image/png;base64,qr');
    renderHeader();
    const toggle = qrToggle();
    const card = qrRegion(toggle);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: -10, right: 210, width: 220 } as DOMRect);

    // When
    fireEvent.click(toggle);
    await screen.findByRole('img', { name: '参加用 URL の QR コード' });

    // Then: 左端を 16px にする（26px 右へ）。
    expect(card.style.getPropertyValue('--ui-room-header-qr-shift')).toBe('26px');
  });

  it('Given QR を開いて準備中 / When 生成が失敗する / Then 同じ知らせの要素の字を差し替える（読み上げに届く）', async () => {
    // Given: 準備中の知らせが出ている。知らせの要素を作り直すと、読み上げは差し込まれた字を読まない。
    let fail: (error: Error) => void = () => {};
    toDataURL.mockReturnValue(new Promise<string>((_, reject) => { fail = reject; }));
    renderHeader();
    const status = qrLive();
    fireEvent.click(qrToggle());
    await waitFor(() => expect(status.textContent).toBe('QR コードを準備しています…'));

    // When
    fail(new Error('QR failed'));

    // Then: 失敗の字は、準備中の字を出していた同じ要素に入る。
    await waitFor(() => expect(status.textContent).toBe('QR コードを表示できません。URL を選んでコピーしてください。'));
    expect(qrLive()).toBe(status);
  });

  it('Given QR を閉じている / When 描く / Then 知らせの要素は隠れる欄の外に先に置いてあり、字は空', () => {
    // Given / When
    renderHeader();

    // Then: 隠れた欄（hidden）の中の知らせは読み上げの木に入らない。開いたときに字だけが変わるよう、欄の外に置く。
    const card = qrRegion(qrToggle());
    const status = qrLive();
    expect(card.hidden).toBe(true);
    expect(card.contains(status)).toBe(false);
    expect(status.closest('[hidden]')).toBeNull();
    expect(status.textContent).toBe('');
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
});
