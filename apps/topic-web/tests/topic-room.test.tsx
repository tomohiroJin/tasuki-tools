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
    const current = screen.getByRole('region', { name: copy.CURRENT_HEADING });
    // Then
    expect(within(current).getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    expect(within(current).getByText('3 のときは Fizz を出す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.CLEAR_BUTTON }));
    expect(lastSent()).toEqual({ command: 'topic.clear' });
  });

  it('Given 生成していない / When 画面を見る / Then いまのお題は忙しい印を持たない', () => {
    // Given: 生成していない
    // When: 画面を見る（aria-busy を常に true にする誤りを捕まえる）
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    expect(screen.getByRole('region', { name: copy.CURRENT_HEADING })).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText(copy.GENERATING_TEXT)).toBeNull();
  });

  it('Given お題があって生成中 / When 画面を見る / Then 作っていることが見え、掲げる・下ろす・作り直すはどれも押せる', () => {
    // Given
    enterWith({ ...IDLE_STATE, generating: true, aiUnlocked: true, topic: FIZZ });
    // When
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    // Then: 生成中も押せる（押すと進行中の生成をサーバーが中断する・E11 はサーバー側の単体が見る）
    expect(screen.getByRole('region', { name: copy.CURRENT_HEADING })).toHaveAttribute('aria-busy', 'true');
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

  it('Given 説明が Markdown 記法を含む / When 画面を見る / Then 見出し・箇条書きとして出て、記法の文字は出ない', () => {
    // Given: 定型バンクの説明は Markdown で書かれている（見出し・箇条書き）
    const md = { title: 'FizzBuzz', body: '## 背景\n\n- 一\n- 二', source: 'manual' as const };
    // When
    enterWith({ ...IDLE_STATE, topic: md });
    const current = screen.getByRole('region', { name: copy.CURRENT_HEADING });
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
  it('Given タイトルと説明を書いた / When このお題にする / Then topic.set が送られ、欄が空に戻る', () => {
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

  it('Given 前後に空白のあるタイトル / When このお題にする / Then 空白を落として送る', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '  FizzBuzz  ' } });
    // When
    fireEvent.click(setButton());
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '' });
  });

  it('Given タイトルが空白だけ / When 書いた / Then このお題にするは押せない', () => {
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

  it('Given いまのお題がある / When 書き直す / Then 欄にいまのお題が入る', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    // Then
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('FizzBuzz');
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveValue('3 のときは Fizz を出す');
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

  it('Given 改行を含む文を貼った / When このお題にする / Then 改行は空白になって送られる', () => {
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

  it('Given 書いた / When このお題にして、いまのお題に出る / Then プレビューの札と同じ中身で出る', () => {
    // Given
    const body = '# Rules\n\n- **fizz**\n\n> note';
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: body } });
    const previewed = within(preview()).getByRole('article').outerHTML;
    // When
    fireEvent.click(setButton());
    act(() => latestSocket().deliver({ type: 'topic', state: { ...IDLE_STATE, topic: { title: 'FizzBuzz', body, source: 'manual' } } }));
    // Then
    const current = screen.getByRole('region', { name: copy.CURRENT_HEADING });
    expect(within(current).getByRole('article').outerHTML).toBe(previewed);
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

  it('Given プレビューを出している / When このお題にする / Then 書くへ戻る', () => {
    // Given
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
    // When
    fireEvent.click(setButton());
    // Then
    expect(compose()).toHaveAttribute('data-mode', 'write');
  });

  it('Given プレビューを出している / When 書き直す / Then プレビューのまま、いまのお題が出る', () => {
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
