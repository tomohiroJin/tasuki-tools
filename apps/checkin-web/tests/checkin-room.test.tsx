/**
 * Check-in Cards の卓の画面（#406・設計 §4・§5）。サーバーは立てず、台本の WebSocket に差し込む。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { IDLE_CHECKIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function enter(state: unknown) {
  saveResumeIdentity(RESUME);
  render(<CheckinRoom roomCode="R1" />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver({ type: 'checkin', state });
  });
}

/** 部屋に入った後に送ったコマンドだけ（room.join を除く） */
const commands = () => latestSocket().sentJson().filter((m) => m.command !== 'room.join');

describe('回が無いとき', () => {
  it('Given 回が無い / When やり方を押す / Then choose が 1 通', () => {
    enter(IDLE_CHECKIN);
    fireEvent.click(screen.getByRole('button', { name: /今日の天気/ }));
    expect(commands()).toEqual([{ command: 'checkin.method.choose', seq: 0, method: 'weather' }]);
  });

  it('Given 回が無い / When ランダムを押す / Then draw に側を載せる', () => {
    enter(IDLE_CHECKIN);
    fireEvent.click(screen.getByRole('button', { name: 'ランダム' }));
    expect(commands()).toEqual([{ command: 'checkin.method.draw', seq: 0, side: 'checkin' }]);
  });
});

describe('開いている回', () => {
  it('Given 開いている回 / When 札を押す / Then いまの seq を載せた play が送られる', () => {
    enter(openCheckin(null));
    fireEvent.click(screen.getByRole('button', { name: '雨' }));
    expect(commands()).toEqual([{ command: 'checkin.card.play', seq: 1, card: 'rain' }]);
  });

  it('Given seq が進んだ / When 札を押す / Then 古い seq を送らない', () => {
    enter(openCheckin(null));
    const next = openCheckin(null);
    act(() => latestSocket().deliver({ type: 'checkin', state: { ...next, round: { ...next.round, seq: 4 } } }));
    fireEvent.click(screen.getByRole('button', { name: '晴れ' }));
    expect(commands()).toEqual([{ command: 'checkin.card.play', seq: 4, card: 'sunny' }]);
  });

  it('Given 見学中 / When 描く / Then 手札のボタンは 0 個（E9・m513）', () => {
    enter({ ...openCheckin(null), spectating: true });
    expect(screen.queryAllByRole('button', { name: /晴れ|くもり|雨|雷/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: '投票に加わる' })).toBeInTheDocument();
  });

  it('Given 見学中 / When 待たずに開くを押す / Then 送れる（参加者は対等）', () => {
    enter({ ...openCheckin(null), spectating: true });
    fireEvent.click(screen.getByRole('button', { name: '待たずに開く' }));
    expect(commands()).toEqual([{ command: 'checkin.reveal', seq: 1 }]);
  });

  it('Given 誰かが出した / When 描く / Then 公開の仕方は disabled（m515）', () => {
    const s = openCheckin(null);
    enter({ ...s, round: { ...s.round, locked: true } });
    expect(screen.getByRole('button', { name: '匿名' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '名前つき' })).toBeDisabled();
  });

  it('Given 開いた回 / When 描く / Then 別のやり方は下の帯の 1 つだけ', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, status: 'revealed', seq: 3, piles: [] } });
    expect(screen.getAllByRole('button', { name: '別のやり方' })).toHaveLength(1);
  });

  it('Given 別のやり方を押す / Then 何も送らず、やり方の選択が出る', () => {
    enter(openCheckin(null));
    fireEvent.click(screen.getAllByRole('button', { name: '別のやり方' })[0]!);
    expect(commands()).toEqual([]);
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
  });

  it('Given 自分が出した / When 開く前に席を見る / Then 自分以外の席に札の名前も絵も無い', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, seats: [{ id: 'p1', name: 'あや', played: true }, { id: 'p2', name: 'ゆう', played: true }], playedCount: 2 } });
    const seats = screen.getByRole('list', { name: '席' });
    expect(within(seats).getByText(/ゆう/)).toBeInTheDocument();
    expect(seats.querySelector('svg')).toBeNull();
    expect(seats.textContent).not.toMatch(/晴れ|くもり|雨|雷/);
    expect(screen.getByText('2 / 2 人が出しました')).toBeInTheDocument();
  });

  it('Given 自分が出した / When 描く / Then 手札の自分の札が選ばれている', () => {
    enter(openCheckin('sunny'));
    expect(screen.getByRole('button', { name: '晴れ' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('開いた後', () => {
  it('Given 開いた / When もう一回を押す / Then seq を載せた again が送られる', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, status: 'revealed', seq: 3, piles: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'もう一回' }));
    expect(commands()).toEqual([{ command: 'checkin.again', seq: 3 }]);
  });
});

describe('開いた後の席', () => {
  it('Given 開いた後に 1 人が退出した（席 2・山の合計 3）/ When 描く / Then 「n / m 人が出しました」の行を出さない（山と食い違わない）', () => {
    const s = revealedCheckin();
    enter({ ...s, round: { ...s.round, seats: [{ id: 'p1', name: 'あや', played: true }, { id: 'p2', name: 'ゆう', played: true }] } });
    expect(screen.getByRole('list', { name: '席' })).toBeInTheDocument();
    expect(screen.queryByText(/人が出しました/)).toBeNull();
  });
});

/** 開いた回（weather・名前つき）。晴れ 2・雨 1 */
function revealedCheckin(seq = 1) {
  const s = openCheckin('sunny');
  const { yourCard: _y, playedCount: _p, playerCount: _c, ...head } = s.round;
  return {
    ...s,
    round: {
      ...head,
      seq,
      locked: true,
      status: 'revealed',
      piles: [
        { card: 'sunny', count: 2, names: ['あや', 'ゆう'] },
        { card: 'cloudy', count: 0, names: [] },
        { card: 'rain', count: 1, names: ['けい'] },
        { card: 'thunder', count: 0, names: [] },
      ],
    },
  };
}

const deliver = (state: unknown) => act(() => latestSocket().deliver({ type: 'checkin', state }));
const liveRegion = () => document.querySelector('.checkin-live');
const promptHeading = () => screen.getByRole('heading', { level: 2, name: '今日のあなたの空模様は？' });

describe('切断中（B1・B2）', () => {
  it('Given 開いている回で切断 / When 描く / Then 札・待たずに開く・別のやり方・公開の仕方・見学は押せず、接続の告知が出る', () => {
    enter(openCheckin(null));
    act(() => latestSocket().drop());
    for (const name of ['晴れ', '待たずに開く', '名前つき', '匿名', '見学する']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    for (const b of screen.getAllByRole('button', { name: '別のやり方' })) expect(b).toBeDisabled();
    expect(screen.getByText('接続中です…（切断された場合は自動で再接続します）')).toHaveAttribute('role', 'status');
  });

  it('Given 開いた回で切断 / When 描く / Then もう一回・別のやり方は押せない', () => {
    enter(revealedCheckin());
    act(() => latestSocket().drop());
    expect(screen.getByRole('button', { name: 'もう一回' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '別のやり方' })).toBeDisabled();
  });

  it('Given 回が無いときに切断 / When 描く / Then やり方・ランダム・見学は押せない', () => {
    enter(IDLE_CHECKIN);
    act(() => latestSocket().drop());
    expect(screen.getByRole('button', { name: /今日の天気/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '見学する' })).toBeDisabled();
  });

  it('Given 接続中 / When 描く / Then 告知は出ない', () => {
    enter(openCheckin(null));
    expect(screen.queryByText(/接続中です/)).toBeNull();
    expect(screen.getByRole('button', { name: '晴れ' })).toBeEnabled();
  });
});

describe('開いたことの読み上げ（B3）', () => {
  it('Given 開く前は空 / When 開く / Then 要約の文が流れ、次の回で空に戻る', () => {
    enter(openCheckin('sunny'));
    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion()).toHaveTextContent(/^$/);
    deliver(revealedCheckin());
    expect(liveRegion()).toHaveTextContent('晴れが 2 人');
    deliver({ ...openCheckin(null), round: { ...openCheckin(null).round, seq: 2 } });
    expect(liveRegion()).toHaveTextContent(/^$/);
  });
});

describe('画面が替わったときのフォーカス（B4）', () => {
  it('Given 待たずに開くを押す / When 開いたフレームが届く / Then お題の見出しへ移る', () => {
    enter(openCheckin('sunny'));
    const button = screen.getByRole('button', { name: '待たずに開く' });
    button.focus();
    fireEvent.click(button);
    deliver(revealedCheckin());
    expect(promptHeading()).toHaveFocus();
  });

  it('Given 開いた / When もう一回を押して新しい回が届く / Then お題の見出しへ移る', () => {
    enter(revealedCheckin());
    const button = screen.getByRole('button', { name: 'もう一回' });
    button.focus();
    fireEvent.click(button);
    deliver({ ...openCheckin(null), round: { ...openCheckin(null).round, seq: 2 } });
    expect(promptHeading()).toHaveFocus();
  });

  it('Given 手札にフォーカス / When 他の人の操作で開く / Then お題の見出しへ移る（body に落とさない）', () => {
    enter(openCheckin('sunny'));
    screen.getByRole('button', { name: '晴れ' }).focus();
    deliver(revealedCheckin());
    expect(document.activeElement).not.toBe(document.body);
    expect(promptHeading()).toHaveFocus();
  });

  it('Given 別のやり方を押す / Then やり方の選択の見出しへ移り、戻るでお題の見出しへ戻る', () => {
    enter(revealedCheckin());
    const button = screen.getByRole('button', { name: '別のやり方' });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('heading', { name: 'やり方を選んでください' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(promptHeading()).toHaveFocus();
  });

  it('Given やり方を選ぶ / When 新しい回が届く / Then お題の見出しへ移る', () => {
    enter(IDLE_CHECKIN);
    const button = screen.getByRole('button', { name: /今日の天気/ });
    button.focus();
    fireEvent.click(button);
    deliver(openCheckin(null));
    expect(promptHeading()).toHaveFocus();
  });
});

describe('やり方の選択の初期の側と閉じ方（B5・B6）', () => {
  it('Given チェックアウトの回 / When 別のやり方を押す / Then チェックアウトの側で開く', () => {
    const s = revealedCheckin();
    enter({ ...s, round: { ...s.round, method: 'roti', visibility: 'anonymous', piles: [] } });
    fireEvent.click(screen.getByRole('button', { name: '別のやり方' }));
    expect(screen.getByRole('button', { name: 'チェックアウト' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Given 開いた回 3 の上で選択画面を開いた / When やり方・ランダムを押す / Then 置き換える回として seq 3 を載せる', () => {
    const s = revealedCheckin(3);
    enter(s);
    fireEvent.click(screen.getByRole('button', { name: '別のやり方' }));
    fireEvent.click(screen.getByRole('button', { name: /今日の天気/ }));
    fireEvent.click(screen.getByRole('button', { name: '別のやり方' }));
    fireEvent.click(screen.getByRole('button', { name: 'ランダム' }));
    expect(commands()).toEqual([
      { command: 'checkin.method.choose', seq: 3, method: 'weather' },
      { command: 'checkin.method.draw', seq: 3, side: 'checkin' },
    ]);
  });

  it('Given 選択画面を開いている / When 他の人の操作で回が替わる / Then 選択画面を閉じる', () => {
    enter(revealedCheckin());
    fireEvent.click(screen.getByRole('button', { name: '別のやり方' }));
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
    deliver({ ...openCheckin(null), round: { ...openCheckin(null).round, seq: 2 } });
    expect(screen.queryByRole('button', { name: 'ランダム' })).toBeNull();
    expect(promptHeading()).toBeInTheDocument();
  });

  it('Given 選択画面を開いている / When 同じ回の札が増えただけ / Then 閉じない', () => {
    enter(openCheckin(null));
    fireEvent.click(screen.getAllByRole('button', { name: '別のやり方' })[0]!);
    const s = openCheckin(null);
    deliver({ ...s, round: { ...s.round, playedCount: 1, locked: true } });
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
  });
});

describe('理由の添え書き（B7・B8）', () => {
  it('Given 誰かが出した / When 描く / Then 公開の仕方に押せない理由が添えられ、画面にも出る', () => {
    const s = openCheckin(null);
    enter({ ...s, round: { ...s.round, locked: true } });
    expect(screen.getByRole('button', { name: '匿名' })).toHaveAccessibleDescription('札が出たあとは公開の仕方を変えられません');
    expect(screen.getByText('札が出たあとは公開の仕方を変えられません')).toBeVisible();
  });

  it('Given 誰も出していない / When 描く / Then 理由は出ない', () => {
    enter(openCheckin(null));
    expect(screen.queryByText('札が出たあとは公開の仕方を変えられません')).toBeNull();
  });

  it('Given 回が無い / When 描く / Then ランダムの箱に「引いて決める」が添えられる', () => {
    enter(IDLE_CHECKIN);
    expect(screen.getByRole('button', { name: 'ランダム' })).toHaveAccessibleDescription('引いて決める');
  });
});
