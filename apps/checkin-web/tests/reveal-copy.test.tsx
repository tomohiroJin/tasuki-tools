/**
 * 結果の持ち出し（#676）。札が開いた後だけ操作が出て、成功と失敗（手で選べる欄）の経路が働く。
 *
 * @requirements #676（Check-in Cards の結果を Markdown でコピーして持ち出す）
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealMarkdown } from '../src/reveal-markdown';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { BACK_LABEL, CHANGE_METHOD, MD_COPY_BUTTON, MD_COPY_DONE, MD_COPY_FAILED, MD_COPY_MANUAL_FIELD } from '../src/copy';
import { RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  saveResumeIdentity(RESUME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const seats = [
  { id: 'p1', name: 'あや', played: true },
  { id: 'p2', name: 'ゆう', played: true },
];
const namedPiles = [
  { card: 'sunny', count: 2, names: ['あや', 'ゆう'] },
  { card: 'cloudy', count: 0, names: [] },
  { card: 'rain', count: 0, names: [] },
  { card: 'thunder', count: 0, names: [] },
];
const anonymousPiles = namedPiles.map(({ card, count }) => ({ card, count }));

function enter(round: 'open' | { visibility: 'named' | 'anonymous'; seq: number }) {
  render(<CheckinRoom roomCode="R1" />);
  const s = openCheckin();
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER_FRAME);
  });
  if (round === 'open') {
    act(() => latestSocket().deliver({ type: 'checkin', state: s }));
  } else {
    reveal(round.visibility, round.seq);
  }
}

function reveal(visibility: 'named' | 'anonymous', seq: number) {
  const s = openCheckin();
  const piles = visibility === 'named' ? namedPiles : anonymousPiles;
  act(() => latestSocket().deliver({ type: 'checkin', state: { ...s, round: { ...s.round, visibility, status: 'revealed', seq, seats, piles } } }));
}

async function pressCopy() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: MD_COPY_BUTTON }));
  });
}

describe('結果の Markdown のコピー', () => {
  it('Given 札がまだ開いていない回 / Then コピーの操作は出ない（開く前の中身を持ち出させない）', () => {
    enter('open');
    expect(screen.queryByRole('button', { name: MD_COPY_BUTTON })).toBeNull();
  });

  it('Given 名前つきで開いた / When コピーを押す / Then 名前と答えの Markdown を書き込み、できたと伝える', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    enter({ visibility: 'named', seq: 3 });
    await pressCopy();
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain('### チェックイン: 今日の天気');
    expect(text).toContain('- 晴れ: 2 人\n  - あや\n  - ゆう');
    expect(screen.getByRole('status')).toHaveTextContent(MD_COPY_DONE);
    expect(screen.queryByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeNull();
  });

  it('Given 匿名で開いた / When コピーを押す / Then 書き込む文に参加者の名前が 1 文字も無い', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    enter({ visibility: 'anonymous', seq: 3 });
    await pressCopy();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain('公開の仕方: 匿名');
    expect(text).toContain('- 晴れ: 2 人');
    for (const name of ['あや', 'ゆう']) expect(text).not.toContain(name);
  });

  it('Given クリップボードへ書けない / When コピーを押す / Then 同じ文を手で選べる欄に出し、失敗を伝える', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    enter({ visibility: 'named', seq: 3 });
    await pressCopy();
    expect(screen.getByRole('status')).toHaveTextContent(MD_COPY_FAILED);
    const manual = screen.getByRole('textbox', { name: MD_COPY_MANUAL_FIELD });
    expect(manual).toHaveAttribute('readonly');
    expect((manual as HTMLTextAreaElement).value).toContain('- 晴れ: 2 人');
  });

  it('Given 失敗の欄が出ている / When 次の回（もう一回）で開き直す / Then 前の回の失敗の欄は残らない', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    enter({ visibility: 'named', seq: 3 });
    await pressCopy();
    expect(screen.getByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeInTheDocument();
    // 次の回が始まる（開く前）→ 操作も欄も無い
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    expect(screen.queryByRole('button', { name: MD_COPY_BUTTON })).toBeNull();
    expect(screen.queryByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeNull();
    // 新しい回が開いても、前の失敗は引き継がない
    reveal('named', 4);
    expect(screen.queryByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
  it('Given 失敗の欄が出ている / When 開く前を挟まず別の回が開いたと届く / Then 前の回の失敗の欄は残らない', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    enter({ visibility: 'named', seq: 3 });
    await pressCopy();
    expect(screen.getByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeInTheDocument();
    reveal('named', 4);
    expect(screen.queryByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
  it('Given 名前つきで開いて失敗した / When 別のやり方を開いていまの回に戻る / Then 見出しの日時も失敗の欄も変わらない（時刻は回ごとに 1 度）', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 23, 10, 0));
    enter({ visibility: 'named', seq: 3 });
    await pressCopy();
    const manual = () => screen.getByRole('textbox', { name: MD_COPY_MANUAL_FIELD }) as HTMLTextAreaElement;
    const heading = manual().value.split('\n')[0];
    clock.mockReturnValue(Date.UTC(2026, 10, 23, 10, 30));
    // 卓ごと外れて、戻る
    fireEvent.click(screen.getByRole('button', { name: CHANGE_METHOD }));
    expect(screen.queryByRole('button', { name: MD_COPY_BUTTON })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: BACK_LABEL }));
    expect(manual().value.split('\n')[0]).toBe(heading);
    // 戻った後に押し直しても、見出しの日時は最初のまま
    await pressCopy();
    expect(manual().value.split('\n')[0]).toBe(heading);
    // 次の回では取り直し、欄は閉じる
    reveal('named', 4);
    expect(screen.queryByRole('textbox', { name: MD_COPY_MANUAL_FIELD })).toBeNull();
    await pressCopy();
    expect(manual().value.split('\n')[0]).not.toBe(heading);
    clock.mockRestore();
  });

  it('Given やり方を選ぶ画面を開いている間に回が開いた / When 戻って初めてコピーする / Then 見出しの日時は、回が開いたのを受け取った時刻（戻った時刻ではない）', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const received = Date.UTC(2026, 10, 23, 14, 0);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 23, 13, 50));
    enter('open');
    fireEvent.click(screen.getByRole('button', { name: CHANGE_METHOD }));
    // 選ぶ画面を開いたまま、同じ回が開く（卓は描かれていないが、開いたのは受け取る）
    clock.mockReturnValue(received);
    reveal('named', 1);
    expect(screen.queryByRole('button', { name: MD_COPY_BUTTON })).toBeNull();
    // 7 分後に戻って、初めて結果を見てコピーする
    clock.mockReturnValue(received + 7 * 60_000);
    fireEvent.click(screen.getByRole('button', { name: BACK_LABEL }));
    await pressCopy();
    const heading = (screen.getByRole('textbox', { name: MD_COPY_MANUAL_FIELD }) as HTMLTextAreaElement).value.split('\n')[0];
    const at = (ms: number) => revealMarkdown({ method: 'weather', visibility: 'named', piles: namedPiles, nowMs: ms, tzOffsetMin: -new Date(ms).getTimezoneOffset() }).split('\n')[0];
    expect(heading).toBe(at(received));
    expect(heading).not.toBe(at(received + 7 * 60_000));
    clock.mockRestore();
  });
});
