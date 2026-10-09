/**
 * お題ツールの画面（#91 PR 2・spec §5.4）。WebSocket を差し替え、フックと画面を通しで見る。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from '@tasuki/topic-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { redirectTo } from '../src/router';
import * as copy from '../src/copy';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  // 偽のタイマーを使うテストが途中で落ちても、後続へ漏らさない
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIZZ = { title: 'FizzBuzz', body: '3 のときは Fizz を出す', source: 'manual' as const };

/** 入った状態まで進め、お題の状態を 1 通届ける。 */
function enterWith(state: object = IDLE_STATE): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'topic', state });
  });
}

const lastSent = () => latestSocket().sentJson().at(-1);
const setButton = () => screen.getByRole('button', { name: copy.SET_BUTTON });

/**
 * @requirements #91 E10 spec §5.4
 */
describe('いまのお題', () => {
  it('Given お題なし / When 画面を開く / Then 書く・作るへ誘い、下ろすボタンは無い', () => {
    // Given: お題なし（既定の IDLE_STATE）
    // When: 画面を開く
    enterWith();
    // Then
    expect(screen.getByText(copy.EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.WRITE_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.MAKE_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.CLEAR_BUTTON })).toBeNull();
  });

  it('Given お題がある / When 画面を開く / Then タイトルと説明が出て、下ろすと topic.clear が送られる', () => {
    // Given: お題がある
    // When: 画面を開く
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    const current = screen.getByRole('region', { name: copy.READER_HEADING });
    // Then
    expect(within(current).getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    // 説明は読む面の本文に出る（狭い幅のシートにも同じ全文が入っているので、本文の領域で引く）
    expect(within(within(current).getByRole('region', { name: 'FizzBuzz' })).getByText('3 のときは Fizz を出す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.CLEAR_BUTTON }));
    expect(lastSent()).toEqual({ command: 'topic.clear' });
  });

  it('Given 生成していない / When 画面を見る / Then いまのお題は忙しい印を持たない', () => {
    // Given: 生成していない
    // When: 画面を見る（aria-busy を常に true にする誤りを捕まえる）
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    expect(screen.getByRole('region', { name: copy.READER_HEADING })).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText(copy.GENERATING_TEXT)).toBeNull();
  });

  it('Given お題があって生成中 / When 画面を見る / Then 作っていることが見え、掲げる・下ろす・作り直すはどれも押せる', () => {
    // Given
    enterWith({ ...IDLE_STATE, generating: true, aiUnlocked: true, topic: FIZZ });
    // When
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    fireEvent.click(screen.getByRole('tab', { name: copy.TAB_CURRENT }));
    // Then: 生成中も押せる（押すと進行中の生成をサーバーが中断する・E11 はサーバー側の単体が見る）
    expect(screen.getByRole('region', { name: copy.READER_HEADING })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(copy.GENERATING_TEXT)).toBeInTheDocument();
    expect(setButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.CLEAR_BUTTON })).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.AI_BUTTON })).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.FALLBACK_BUTTON })).toBeEnabled();
  });

  it('Given 生成中 / When 画面を見る / Then 作っています…は aria-busy の要素の外にある', () => {
    // Given
    // When: 画面を見る（`aria-busy` の内容変化は支援技術が busy の間は無視してよい・レビュー指摘）
    enterWith({ ...IDLE_STATE, generating: true, topic: FIZZ });
    // Then
    expect(screen.getByText(copy.GENERATING_TEXT).closest('[aria-busy="true"]')).toBeNull();
  });

  it('Given 定型に落ちた / When 画面を見る / Then 定型にしたと伝える', () => {
    enterWith({ ...IDLE_STATE, degraded: true, topic: { ...FIZZ, source: 'fallback' } });
    expect(screen.getByText(copy.DEGRADED_TEXT)).toBeInTheDocument();
  });

  it.each([
    ['生成中', { generating: true }, copy.GENERATING_TEXT],
    ['定型に落ちた', { degraded: true }, copy.DEGRADED_TEXT],
  ] as const)('Given %s / When 画面を見る / Then 知らせは読む面の外・操作の面の先頭（書く・作るより前）にある', (_, flags, text) => {
    // Given / When: 読む面の札の最大の高さは脇に札しか載らない前提で決めてある（#316 最終レビュー I3）
    enterWith({ ...IDLE_STATE, ...flags, topic: FIZZ });
    // Then
    const notice = screen.getByText(text);
    expect(notice).toHaveAttribute('role', 'status');
    const reader = screen.getByRole('region', { name: copy.READER_HEADING });
    const write = screen.getByRole('region', { name: copy.WRITE_HEADING });
    const make = screen.getByRole('region', { name: copy.MAKE_HEADING });
    expect(reader.contains(notice)).toBe(false);
    expect(reader.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 作る欄は最初たたまれている。たたんだままでも知らせは書くより前に見える（#316 Review Focus 4）
    expect(notice.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(make.querySelector('details')).not.toHaveAttribute('open');
    expect(make.querySelector('details')?.contains(notice)).toBe(false);
  });

  it('Given 説明が Markdown 記法を含む / When 画面を見る / Then 見出し・箇条書きとして出て、記法の文字は出ない', () => {
    // Given: 定型バンクの説明は Markdown で書かれている（見出し・箇条書き）
    const md = { title: 'FizzBuzz', body: '## 背景\n\n- 一\n- 二', source: 'manual' as const };
    // When
    enterWith({ ...IDLE_STATE, topic: md });
    const current = screen.getByRole('region', { name: copy.READER_HEADING });
    // Then
    expect(within(current).getByRole('heading', { name: '背景' })).toBeInTheDocument();
    expect(within(current).getAllByRole('listitem')).toHaveLength(2);
    expect(current.textContent).not.toContain('##');
  });
});

/**
 * @requirements #91 spec §5.4
 */
describe('書く', () => {
  it('Given タイトルと説明を書いた / When 場に出す / Then topic.set が送られ、欄が空に戻る', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    fireEvent.change(screen.getByLabelText(copy.BODY_LABEL), { target: { value: '3 のときは Fizz を出す' } });
    // When
    fireEvent.click(setButton());
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '3 のときは Fizz を出す' });
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('');
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveValue('');
  });

  it('Given 前後に空白のあるタイトル / When 場に出す / Then 空白を落として送る', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '  FizzBuzz  ' } });
    // When
    fireEvent.click(setButton());
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '' });
  });

  it('Given タイトルが空白だけ / When 書いた / Then 場に出すは押せない', () => {
    // Given
    enterWith();
    // When
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '   ' } });
    // Then
    expect(setButton()).toBeDisabled();
  });

  it('Given 画面 / When 欄を見る / Then タイトルと説明の欄は topic-core の上限で止まる', () => {
    // Given
    // When: 画面を開く
    enterWith();
    // Then
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveAttribute('maxLength', String(MAX_TOPIC_TITLE));
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveAttribute('maxLength', String(MAX_TOPIC_BODY));
  });

  it('Given 下書きの途中 / When 別の人のお題が届く / Then 下書きは残る', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '書きかけ' } });
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: { ...IDLE_STATE, topic: FIZZ } }));
    // Then
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('書きかけ');
  });

  it('Given いまのお題がある / When 下書きに写す / Then 欄にいまのお題が入り、タイトルの欄にフォーカスが移る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then: 写したのに入力位置が分からない、を防ぐ（Review Focus 2）
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('FizzBuzz');
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveValue('3 のときは Fizz を出す');
    expect(document.activeElement).toBe(screen.getByLabelText(copy.TITLE_LABEL));
  });

  it('Given いまのお題がある / When 下書きに写す / Then 札は下書きのタブへ移り、下書きの印が出る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then: 下書きが空 → 空でないの規則のまま
    expect(screen.getByRole('tab', { name: copy.TAB_DRAFT })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(copy.DRAFT_STAMP)).toBeInTheDocument();
  });

  it('Given 同じお題を 2 度写す / When 書き換えたあとにもう一度写す / Then 2 度目も欄が写したお題に戻る', () => {
    // Given: 1 度目の写しのあとで欄を書き換えた
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '別のお題' } });
    // 下書きのタブにいるので、いまのお題のタブへ戻す
    fireEvent.click(screen.getByRole('tab', { name: copy.TAB_CURRENT }));
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then: 要求が前と同じ中身でも効く（押すたびに新しい要求になる）
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('FizzBuzz');
  });

  it('Given お題がある / When 位置を見る / Then 下書きに写すは札の側にだけあり、書く側の操作は場に出すだけ', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    const reader = screen.getByRole('region', { name: copy.READER_HEADING });
    const write = screen.getByRole('region', { name: copy.WRITE_HEADING });
    // Then
    expect(within(reader).getByRole('button', { name: copy.REWRITE_BUTTON })).toBeInTheDocument();
    expect(within(write).queryByRole('button', { name: copy.REWRITE_BUTTON })).toBeNull();
    expect(within(write).getAllByRole('button').filter((b) => !b.closest('.topic-compose-toggle'))).toEqual([setButton()]);
  });

  it('Given お題がある / When いまのお題のタブを見る / Then 下端に 下書きに写す（左）と 場から下げる（右）が並ぶ', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    const reader = screen.getByRole('region', { name: copy.READER_HEADING });
    const foot = within(reader).getByRole('button', { name: copy.REWRITE_BUTTON }).parentElement;
    // Then: DOM の順が左から右の順
    expect(foot).toBe(within(reader).getByRole('button', { name: copy.CLEAR_BUTTON }).parentElement);
    const buttons = within(foot as HTMLElement).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([copy.REWRITE_BUTTON, copy.CLEAR_BUTTON]);
  });

  it('Given 下書きのタブ / When 下端を見る / Then 添え書きだけが出て、下書きに写すも場から下げるも無い', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    fireEvent.click(screen.getByRole('tab', { name: copy.TAB_DRAFT }));
    // Then
    const reader = screen.getByRole('region', { name: copy.READER_HEADING });
    expect(within(reader).getByText(copy.DRAFT_FOOT_NOTE)).toBeVisible();
    expect(within(reader).queryByRole('button', { name: copy.REWRITE_BUTTON })).toBeNull();
    expect(within(reader).queryByRole('button', { name: copy.CLEAR_BUTTON })).toBeNull();
  });
});

const titleField = () => screen.getByLabelText(copy.TITLE_LABEL);
const bodyField = () => screen.getByLabelText(copy.BODY_LABEL);

/**
 * 長いタイトル（ユーザーストーリーの形）を全体を見ながら書ける。
 *
 * @requirements #313 正本 D3・D4・D5・FR-001〜FR-006
 */
describe('書く（長いタイトル）', () => {
  it('Given 画面 / When 欄を見る / Then タイトルは複数行の欄で、説明は 8 行の欄である', () => {
    // Given / When
    enterWith();
    // Then
    expect(titleField().tagName).toBe('TEXTAREA');
    expect(titleField()).toHaveAttribute('rows', '2');
    expect(bodyField()).toHaveAttribute('rows', '8');
  });

  it('Given タイトルと説明を書いた / When 欄の下を見る / Then 長さと上限が数字で出て、欄から指されている', () => {
    // Given
    enterWith();
    // When
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: 'fizz' } });
    // Then
    expect(titleField()).toHaveAccessibleDescription(`8 / ${MAX_TOPIC_TITLE}`);
    expect(bodyField()).toHaveAccessibleDescription(`4 / ${MAX_TOPIC_BODY}`);
  });

  it('Given 説明の欄 / When 欄の下を見る / Then Markdown で書けると添えてある', () => {
    // Given / When
    enterWith();
    // Then
    expect(screen.getByText(copy.BODY_HINT)).toBeInTheDocument();
  });

  it('Given 改行を含む文を貼った / When 場に出す / Then 改行は空白になって送られる', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'Fizz\r\nBuzz' } });
    expect(titleField()).toHaveValue('Fizz Buzz');
    // When
    fireEvent.click(setButton());
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'Fizz Buzz', body: '' });
  });

  it('Given タイトルを書いた / When タイトルの欄で Enter / Then 送られる', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    // When
    fireEvent.keyDown(titleField(), { key: 'Enter' });
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '' });
  });

  it.each([
    ['変換中', { isComposing: true }],
    ['Safari の確定', { keyCode: 229 }],
  ])('Given タイトルを書いた / When %s の Enter / Then 送らない', (_label, init) => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    const before = latestSocket().sentJson().length;
    // When
    fireEvent.keyDown(titleField(), { key: 'Enter', ...init });
    // Then
    expect(latestSocket().sentJson()).toHaveLength(before);
  });

  it('Given タイトルを書いた / When Shift+Enter / Then 送らず、既定の改行も止める', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    const before = latestSocket().sentJson().length;
    // When
    const notCancelled = fireEvent.keyDown(titleField(), { key: 'Enter', shiftKey: true });
    // Then
    expect(notCancelled).toBe(false);
    expect(latestSocket().sentJson()).toHaveLength(before);
  });

  it('Given タイトルが空白だけ / When タイトルの欄で Enter / Then 送らない', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: '   ' } });
    const before = latestSocket().sentJson().length;
    // When
    fireEvent.keyDown(titleField(), { key: 'Enter' });
    // Then
    expect(latestSocket().sentJson()).toHaveLength(before);
  });

  it('Given タイトルの途中にカーソル / When 改行を含む文を差し込む / Then 改行は空白になり、カーソルは差し込んだ文の後ろに残る', () => {
    // Given: 「AAA BBB」の AAA の後ろに「x\ny」を差し込んだ直後の欄（カーソルは y の後ろ）
    enterWith();
    const field = titleField() as HTMLTextAreaElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    // When: React の値の追跡を通らない形で DOM の値を変え、カーソルを置いてから input を送る（貼り付けと同じ順）
    act(() => {
      setValue.call(field, 'AAAx\ny BBB');
      field.setSelectionRange(6, 6);
      fireEvent.input(field);
    });
    // Then: 値を書き直しても、カーソルは末尾へ飛ばない（続けて打つ字が差し込んだ位置に入る）
    expect(field).toHaveValue('AAAx y BBB');
    expect(field.selectionStart).toBe(6);
    expect(field.selectionEnd).toBe(6);
  });

  it('Given いまのお題のタイトルが改行を含む / When 下書きに写す / Then 欄には改行を空白にして写す', () => {
    // Given: 境界スキーマは改行を拒まないので、AI や別の接続から改行入りのタイトルが届きうる
    enterWith({ ...IDLE_STATE, topic: { ...FIZZ, title: 'Fizz\nBuzz' } });
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then
    expect(titleField()).toHaveValue('Fizz Buzz');
    fireEvent.click(setButton());
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'Fizz Buzz', body: FIZZ.body });
  });

  it('Given 説明の欄 / When Enter / Then 送らない（説明は改行を書ける）', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    const before = latestSocket().sentJson().length;
    // When
    const notCancelled = fireEvent.keyDown(bodyField(), { key: 'Enter' });
    // Then
    expect(notCancelled).toBe(true);
    expect(latestSocket().sentJson()).toHaveLength(before);
  });
});

/**
 * 「書く」が主役なので先に置き、「作る」はその下のたためる欄にする（読み上げと Tab の順も画面の順と同じ）。
 * #313 構成案 1（作るが先）を、利用者が実物を見て #316 PR 1 で逆にした（設計正本 §10.1）。
 *
 * @requirements #316 設計正本 §10.1
 */
describe('書くと作るの順', () => {
  it('Given 画面 / When 並びを見る / Then 書くは作るより前にあり、作るはたたまれている', () => {
    // Given / When
    enterWith();
    const make = screen.getByRole('region', { name: copy.MAKE_HEADING });
    const write = screen.getByRole('region', { name: copy.WRITE_HEADING });
    // Then: 書くが主役（#316 PR 1 の手直し）。作るは `<details>` で最初はたたむ
    expect(write.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const fold = make.querySelector('details');
    expect(fold).not.toBeNull();
    expect(fold).not.toHaveAttribute('open');
    expect(within(make).getByText(copy.MAKE_HEADING).closest('summary')).not.toBeNull();
  });
});

/**
 * @requirements #91 spec §5.4
 */
describe('作る', () => {
  it('Given 未解錠 / When 画面を見る / Then 合言葉の欄があり、AI で作るは出ない', () => {
    // Given
    // When: 画面を見る
    enterWith();
    // Then
    expect(screen.getByLabelText(copy.UNLOCK_LABEL)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.AI_BUTTON })).toBeNull();
  });

  it('Given 未解錠 / When 合言葉を送る / Then ai.unlock が送られ、欄から合言葉が消える', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.UNLOCK_LABEL), { target: { value: 'secret' } });
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.UNLOCK_BUTTON }));
    // Then
    expect(lastSent()).toEqual({ command: 'ai.unlock', key: 'secret' });
    expect(screen.getByLabelText(copy.UNLOCK_LABEL)).toHaveValue('');
  });

  it('Given 解錠済み / When 言語と難易度を選んで AI で作る / Then 選んだ値で topic.generate が送られる', () => {
    // Given
    enterWith({ ...IDLE_STATE, aiUnlocked: true });
    expect(screen.queryByLabelText(copy.UNLOCK_LABEL)).toBeNull();
    // When
    fireEvent.change(screen.getByLabelText(copy.LANGUAGE_LABEL), { target: { value: 'Go' } });
    fireEvent.change(screen.getByLabelText(copy.DIFFICULTY_LABEL), { target: { value: 'hard' } });
    fireEvent.click(screen.getByRole('button', { name: copy.AI_BUTTON }));
    // Then
    expect(lastSent()).toEqual({ command: 'topic.generate', mode: 'ai', language: 'Go', difficulty: 'hard' });
  });

  it('Given 画面 / When 定型から選ぶ / Then 既定の言語と難易度で topic.generate が送られる', () => {
    // Given
    enterWith();
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.FALLBACK_BUTTON }));
    // Then
    expect(lastSent()).toEqual({ command: 'topic.generate', mode: 'fallback', language: 'TypeScript', difficulty: 'easy' });
  });

  it('Given 作り直しが早すぎた / When サーバーが拒む / Then 待ってから作り直すよう伝える', () => {
    // Given
    enterWith();
    // When
    act(() =>
      latestSocket().deliver({ type: 'error', code: 'GENERATION_COOLDOWN', message: 'しばらく待ってから、もう一度作ってください。' }),
    );
    // Then
    expect(screen.getByRole('alert')).toHaveTextContent('しばらく待ってから、もう一度作ってください。');
  });

  it('Given 合言葉が違うと伝えている / When 別の人の解錠でお題の状態が届く / Then 違うという知らせは消える', () => {
    // Given
    enterWith();
    act(() => latestSocket().deliver({ type: 'error', code: 'AI_UNLOCK_FAILED', message: '合言葉が正しくありません。' }));
    expect(screen.getByRole('alert')).toHaveTextContent('合言葉が正しくありません。');
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: { ...IDLE_STATE, aiUnlocked: true } }));
    // Then
    expect(screen.queryByText('合言葉が正しくありません。')).toBeNull();
  });
});

/**
 * @requirements #91 spec §5.4（ルームへの入り方・戻り方は timer / poker と同じ）
 */
describe('操作できない間', () => {
  it('Given 参加の応答がまだ / When 画面を開く / Then 参加していると伝える', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    render(<App />);
    act(() => latestSocket().open());
    // Then
    expect(screen.getByRole('heading', { name: copy.JOINING_HEADING })).toBeInTheDocument();
  });

  it('Given 参加の応答がまだ / When 画面を見る / Then 同じルームの選択画面へ戻る導線がある', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    render(<App />);
    act(() => latestSocket().open());
    // Then
    expect(screen.getByRole('heading', { name: copy.JOINING_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.BACK_LINK })).toHaveAttribute('href', '/?room=R1');
  });

  it('Given 解錠済みで下書きがある / When 切れて繋ぎ直し、参加の返事を待つ / Then どの操作も押せず、返事が来たら押せる', () => {
    // Given
    vi.useFakeTimers();
    enterWith({ ...IDLE_STATE, aiUnlocked: true, topic: FIZZ });
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    // 書き始めると読む面は下書きへ移り「お題を下ろす」は隠れる。押せるかを見るので いまのお題 のタブへ戻す
    fireEvent.click(screen.getByRole('tab', { name: copy.TAB_CURRENT }));
    const buttons = () => [
      setButton(),
      screen.getByRole('button', { name: copy.CLEAR_BUTTON }),
      screen.getByRole('button', { name: copy.AI_BUTTON }),
      screen.getByRole('button', { name: copy.FALLBACK_BUTTON }),
    ];
    // When: 切れて、繋ぎ直した（**接続は開いているが、まだ参加していない窓**）
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then その1: 参加の返事が来るまでは押せない（切断中だけを見ると、参加の判定が壊れていても隠れる）
    for (const button of buttons()) expect(button).toBeDisabled();
    // Then その2: 返事が来たら押せる
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    for (const button of buttons()) expect(button).toBeEnabled();
    vi.useRealTimers();
  });

  it('Given 未解錠で合言葉を書いてある / When 切れる / Then 解錠するは押せない', () => {
    // Given（空のままでは誤実装でも押せないので、書いてから見る）
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.UNLOCK_LABEL), { target: { value: 'secret' } });
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeEnabled();
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeDisabled();
  });

  it('Given 未解錠で合言葉を書いてある / When 切れて繋ぎ直し、参加の返事を待つ / Then 解錠するは押せず、返事が来たら押せる', () => {
    // Given
    vi.useFakeTimers();
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.UNLOCK_LABEL), { target: { value: 'secret' } });
    // When: 切れて、繋ぎ直した（接続は開いているが、まだ参加していない窓）
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then その1: 参加の返事が来るまでは押せない
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeDisabled();
    // Then その2: 返事が来たら押せる
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeEnabled();
    vi.useRealTimers();
  });

  it('Given 入れていた / When 切れる / Then 画面を保ったまま再接続中と伝える', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByText(copy.RECONNECTING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
  });

  it('Given 一度も繋がらない / When 失敗する / Then 繋がらないと警告する', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByRole('alert')).toHaveTextContent(copy.UNREACHABLE_TEXT);
  });

  it('Given 繋ぎ直して入り直す途中 / When 混雑で拒まれる / Then お題の画面のまま待っていると伝える', () => {
    // Given
    vi.useFakeTimers();
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // Then
    expect(screen.getByText(copy.RETRY_WAITING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('Given 画面 / When 戻る導線を見る / Then 同じルームの選択画面を指す', () => {
    enterWith();
    expect(screen.getByRole('link', { name: copy.BACK_LINK })).toHaveAttribute('href', '/?room=R1');
  });

  it('Given 画面 / When 招待リンクを見る / Then 玄関のそのルームの参加用 URL を配る', () => {
    // Given
    // When: 画面を開く
    enterWith();
    // Then
    expect(screen.getByText(`${location.origin}/?room=R1`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.INVITE_COPY_BUTTON })).toBeInTheDocument();
  });
});

const preview = () => screen.getByRole('region', { name: copy.PREVIEW_BUTTON });

/**
 * 説明がどう見えるかを、このお題にする前に確かめられる。
 *
 * @requirements #313 正本 D6・FR-007・FR-008・SC-004
 */
describe('プレビュー', () => {
  it('Given 何も書いていない / When プレビューを見る / Then 書くと見え方が出ると伝える', () => {
    // Given / When
    enterWith();
    // Then
    expect(within(preview()).getByText(copy.PREVIEW_EMPTY)).toBeInTheDocument();
  });

  it('Given タイトルと Markdown の説明を書いた / When プレビューを見る / Then 見出しと箇条書きとして出る', () => {
    // Given
    enterWith();
    // When
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: '# Rules\n\n- fizz\n- buzz' } });
    // Then
    expect(within(preview()).getByRole('heading', { level: 3, name: 'FizzBuzz' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { level: 4, name: 'Rules' })).toBeInTheDocument();
    expect(within(preview()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(preview()).queryByText(copy.PREVIEW_EMPTY)).toBeNull();
  });

  it('Given タイトルが空白だけで説明を書いた / When プレビューを見る / Then 空の見出しは描かず、説明だけが出る', () => {
    // Given
    enterWith();
    // When
    fireEvent.change(titleField(), { target: { value: '   ' } });
    fireEvent.change(bodyField(), { target: { value: 'fizz' } });
    // Then
    expect(within(preview()).queryByRole('heading', { level: 3 })).toBeNull();
    expect(within(preview()).getByText('fizz')).toBeInTheDocument();
  });

  it('Given 書いた / When 場に出して、いまのお題に出る / Then プレビューの札と同じ中身で出る', () => {
    // Given
    const body = '# Rules\n\n- **fizz**\n\n> note';
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: body } });
    const previewed = within(preview()).getByRole('article').querySelector('.ui-md')?.outerHTML;
    // When
    fireEvent.click(setButton());
    act(() => latestSocket().deliver({ type: 'topic', state: { ...IDLE_STATE, topic: { title: 'FizzBuzz', body, source: 'manual' } } }));
    // Then
    const current = screen.getByRole('region', { name: copy.READER_HEADING });
    // 札の枠は読む面に替わったので、説明の描画（共有の Markdown）が同じであることを見る
    expect(previewed).toBeTruthy();
    expect(within(current).getByRole('region', { name: 'FizzBuzz' }).querySelector('.ui-md')?.outerHTML).toBe(previewed);
  });

  it('Given プレビュー / When 領域を見る / Then 打つたびに読み上げる印を持たない', () => {
    // Given / When
    enterWith();
    // Then
    expect(preview()).not.toHaveAttribute('aria-live');
  });
});

const modeGroup = () => screen.getByRole('group', { name: copy.COMPOSE_MODE_LABEL });
const modeButton = (name: string) => within(modeGroup()).getByRole('button', { name });
/** 並べるか切り替えるかは CSS（容器クエリと `data-mode`）が決める。jsdom は CSS を読まないので、ここでは印までを見る。 */
const compose = () => bodyField().closest('.topic-compose');

/**
 * 狭い「書く」では、説明の欄とプレビューを切り替える（並ぶことは E2E が見る）。
 *
 * @requirements #313 正本 D7・D8・D9・FR-011〜FR-013・NFR-003
 */
describe('説明の出し方の切り替え', () => {
  it('Given 画面 / When 切り替えを見る / Then 書くが押されている', () => {
    // Given / When
    enterWith();
    // Then
    expect(modeButton(copy.WRITE_MODE_BUTTON)).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton(copy.PREVIEW_BUTTON)).toHaveAttribute('aria-pressed', 'false');
    expect(compose()).toHaveAttribute('data-mode', 'write');
  });

  it('Given 書く / When プレビューを押す / Then プレビューが押され、出し方がプレビューになる', () => {
    // Given
    enterWith();
    // When
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    // Then
    expect(modeButton(copy.PREVIEW_BUTTON)).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton(copy.WRITE_MODE_BUTTON)).toHaveAttribute('aria-pressed', 'false');
    expect(compose()).toHaveAttribute('data-mode', 'preview');
  });

  it('Given プレビューを出している / When 書くを押す / Then 書くへ戻る', () => {
    // Given
    enterWith();
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    // When
    fireEvent.click(modeButton(copy.WRITE_MODE_BUTTON));
    // Then
    expect(compose()).toHaveAttribute('data-mode', 'write');
  });

  it('Given プレビューを出している / When 場に出す / Then 書くへ戻る', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    // When
    fireEvent.click(setButton());
    // Then
    expect(compose()).toHaveAttribute('data-mode', 'write');
  });

  it('Given プレビューを出している / When 下書きに写す / Then プレビューのまま、いまのお題が出る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then
    expect(compose()).toHaveAttribute('data-mode', 'preview');
    expect(within(preview()).getByRole('heading', { level: 3, name: 'FizzBuzz' })).toBeInTheDocument();
  });

  it('Given タイトルを書いた / When 切り替えのボタンを押す / Then フォームを送らない', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    const before = latestSocket().sentJson().length;
    // When
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    fireEvent.click(modeButton(copy.WRITE_MODE_BUTTON));
    // Then
    expect(latestSocket().sentJson()).toHaveLength(before);
  });
});

const tab = (name: string) => screen.getByRole('tab', { name });
const panel = () => screen.getByRole('tabpanel');

/**
 * 読む面（右）のタブ。書き始めると下書きの見え方へ切り替わり、利用者の選択は毎打鍵で上書きしない（#316）。
 *
 * @requirements #316 PR 1（D3''）
 */
describe('読む面のタブ', () => {
  it('Given いまのお題がある / When 画面を開く / Then 場のお題のタブが選ばれ、お題が出る', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'false');
    expect(within(panel()).getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    expect(panel()).toHaveAttribute('aria-labelledby', tab(copy.TAB_CURRENT).id);
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-controls', panel().id);
  });

  it('Given いまのお題のタブ / When タイトルに打つ / Then 下書きの見え方へ切り替わり、印と打った文が出る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    fireEvent.change(titleField(), { target: { value: '書きかけ' } });
    // Then
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByText(copy.DRAFT_STAMP)).toBeInTheDocument();
    expect(within(panel()).getByRole('heading', { name: '書きかけ' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('heading', { name: 'FizzBuzz' })).toBeNull();
  });

  it('Given 下書きを見ている / When 手でいまのお題を選んで続けて打つ / Then いまのお題のまま', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.change(titleField(), { target: { value: '書' } });
    // When
    fireEvent.click(tab(copy.TAB_CURRENT));
    fireEvent.change(titleField(), { target: { value: '書き' } });
    fireEvent.change(bodyField(), { target: { value: '説明' } });
    // Then: 毎打鍵で上書きしない
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
  });

  it('Given 手でいまのお題を選んだ / When 下書きを空にしてまた打ち始める / Then 自動で下書きへ切り替わる', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.change(titleField(), { target: { value: '書' } });
    fireEvent.click(tab(copy.TAB_CURRENT));
    // When: 空にする（いまのお題へ戻る）→ 打ち始める
    fireEvent.change(titleField(), { target: { value: '' } });
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(titleField(), { target: { value: '新' } });
    // Then
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'true');
  });

  it('Given 下書きを見ている / When 場に出す / Then いまのお題へ戻る', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'true');
    // When
    fireEvent.click(setButton());
    // Then
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
  });

  it('Given お題がある / When タブを切り替える / Then 場から下げるは 場のお題 のタブにだけある', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    expect(screen.getByRole('button', { name: copy.CLEAR_BUTTON })).toBeInTheDocument();
    // When: 下書きのタブへ（下書きの本文の真下に出ると「下書きを捨てる」と読み違えて全員のお題が消える）
    fireEvent.click(tab(copy.TAB_DRAFT));
    // Then
    expect(screen.queryByRole('button', { name: copy.CLEAR_BUTTON })).toBeNull();
    fireEvent.click(tab(copy.TAB_CURRENT));
    expect(screen.getByRole('button', { name: copy.CLEAR_BUTTON })).toBeInTheDocument();
  });

  it('Given 画面 / When パネルを見る / Then 選ばれていない方は hidden で DOM に残り、aria-controls の宛先が実在する', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    for (const name of [copy.TAB_CURRENT, copy.TAB_DRAFT]) {
      const target = document.getElementById(tab(name).getAttribute('aria-controls') ?? '');
      expect(target, `${name} の aria-controls の宛先`).not.toBeNull();
      expect(target).toHaveAttribute('role', 'tabpanel');
    }
    const hidden = document.getElementById(tab(copy.TAB_DRAFT).getAttribute('aria-controls') ?? '');
    expect(hidden).toHaveAttribute('hidden');
    expect(document.getElementById(tab(copy.TAB_CURRENT).getAttribute('aria-controls') ?? '')).not.toHaveAttribute('hidden');
  });

  it('Given 止まり先の無いパネル / When 見る / Then パネル自身が tabindex 0。本文があるときは付けない', () => {
    // Given: お題なし（現在のパネルに本文の領域が無い）
    enterWith();
    // Then
    expect(panel()).toHaveAttribute('tabindex', '0');
    // When: 下書きのタブ（空）→ 同じく止まり先が無い
    fireEvent.click(tab(copy.TAB_DRAFT));
    expect(panel()).toHaveAttribute('tabindex', '0');
    // When: 書くと本文の領域ができ、パネルには付けない
    fireEvent.change(bodyField(), { target: { value: '説明' } });
    expect(panel()).not.toHaveAttribute('tabindex');
  });

  it('Given 下書きにタイトルがある / When 下書きのタブを見る / Then 本文の領域はタイトルで名付けられる', () => {
    // Given / When
    enterWith();
    fireEvent.change(titleField(), { target: { value: '書きかけ' } });
    fireEvent.change(bodyField(), { target: { value: '説明' } });
    // Then
    expect(within(panel()).getByRole('region', { name: '書きかけ' })).toBeInTheDocument();
  });

  it('Given 下書きが空 / When 下書きの見え方を選ぶ / Then 書くと見え方が出ると伝える', () => {
    // Given
    enterWith();
    // When
    fireEvent.click(tab(copy.TAB_DRAFT));
    // Then
    expect(within(panel()).getByText(copy.PREVIEW_EMPTY)).toBeInTheDocument();
  });

  it('Given 下書きが空白だけ / When 画面を見る / Then 切り替えない', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.change(titleField(), { target: { value: '   ' } });
    // Then
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
  });

  it('Given タブ / When 左右の矢印を押す / Then 隣へ移り、フォーカスも付いてくる。選んだタブだけが tabindex 0', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('tabindex', '0');
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('tabindex', '-1');
    // When
    tab(copy.TAB_CURRENT).focus();
    fireEvent.keyDown(tab(copy.TAB_CURRENT), { key: 'ArrowRight' });
    // Then
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'true');
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(tab(copy.TAB_DRAFT));
    // When: 端からの左右は反対側へ回る
    fireEvent.keyDown(tab(copy.TAB_DRAFT), { key: 'ArrowRight' });
    expect(tab(copy.TAB_CURRENT)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(copy.TAB_CURRENT), { key: 'ArrowLeft' });
    expect(tab(copy.TAB_DRAFT)).toHaveAttribute('aria-selected', 'true');
  });
});

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };

/**
 * 狭い幅では説明を 3 行で切り、「続きを読む」から下からのシートに全文を出す（poker と同じ作り）。
 * jsdom は `showModal` / `close` を持たないので差し替える。
 *
 * @requirements #316 PR 1（D3''）
 */
describe('続きを読む（シート）', () => {
  beforeEach(() => {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });
  afterEach(() => {
    proto.showModal = original.showModal;
    proto.close = original.close;
  });

  it('Given 説明のあるお題 / When 続きを読む / Then シートが開いて全文が出る。閉じるとフォーカスが戻る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    const more = screen.getByRole('button', { name: copy.READ_MORE });
    const dialog = document.querySelector('dialog.ui-drawer') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(false);
    // When
    fireEvent.click(more);
    // Then
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('.ui-drawer-body')?.textContent).toContain('3 のときは Fizz を出す');
    // When: Esc は close イベントだけが届く
    document.body.focus();
    dialog.dispatchEvent(new Event('close'));
    // Then
    expect(document.activeElement).toBe(more);
  });

  it('Given 説明が空のお題 / When 画面を見る / Then 続きを読むもシートも出ない', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: { ...FIZZ, body: '' } });
    // Then
    expect(screen.queryByRole('button', { name: copy.READ_MORE })).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('Given 画面 / When 並びを見る / Then いまのお題は作る・書くより先にある（狭い幅の順）', () => {
    // Given / When
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    const current = screen.getByRole('region', { name: copy.READER_HEADING });
    const make = screen.getByRole('region', { name: copy.MAKE_HEADING });
    expect(current.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
