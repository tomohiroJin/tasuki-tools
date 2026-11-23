/**
 * 結果の持ち出し（#676）。札が開いた後だけ操作が出て、成功と失敗（手で選べる欄）の経路が働く。
 *
 * @requirements #676（Check-in Cards の結果を Markdown でコピーして持ち出す）
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { MD_COPY_BUTTON, MD_COPY_DONE, MD_COPY_FAILED, MD_COPY_MANUAL_FIELD } from '../src/copy';
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
});
