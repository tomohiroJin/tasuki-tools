/**
 * 玄関の「みんなを呼ぶ」と、呼びかけの知らせ（#677）。同期フックの配線を App 越しに見る。
 *
 * **サーバーは立てない**（WebSocket を差し替える）。実サーバーでの宛先・連打の歯止めは
 * `apps/tasuki-sync` の実 WS テストと E2E が受け持つ。遷移は `navigate.ts` に閉じてあるので差し替えて行き先を見る。
 *
 * @requirements #677
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/App.js';
import { navigateTo } from '../../src/hub/navigate.js';
import { ScriptedWebSocket } from '@tasuki/test-css/scripted-web-socket';

vi.mock('../../src/hub/navigate.js', () => ({ navigateTo: vi.fn() }));

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;
const sentCalls = (): Record<string, unknown>[] =>
  socket().sentJson().filter((c) => c['command'] === 'room.call');

const ROSTER = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: [] },
      { participantId: 'p2', displayName: 'いお', presence: 'online', tools: [] },
    ],
    passphraseProtected: false,
  },
};

const CALL_FRAME = (tool: string, fromName = 'いお') => ({
  type: 'room.call',
  call: { tool, fromParticipantId: 'p2', fromName },
});

function joinedRoom(): void {
  window.history.replaceState(null, '', '/?room=R1');
  localStorage.setItem(
    'tasuki:resume:R1',
    JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
  );
  render(<App />);
  act(() => socket().open());
  act(() => socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't2' }));
  act(() => socket().deliver(ROSTER));
}

function chooseAndCall(tool: string): void {
  fireEvent.change(screen.getByLabelText('呼ぶ道具'), { target: { value: tool } });
  fireEvent.click(screen.getByRole('button', { name: '呼んで移る' }));
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  vi.mocked(navigateTo).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('玄関のみんなを呼ぶ（呼ぶ側）', () => {
  it('Given 選択画面 / When 道具の欄を見る / Then 行き先の表の 7 道具が名前で並び、知らない道具は無い', () => {
    joinedRoom();

    const options = within(screen.getByLabelText('呼ぶ道具')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      '道具を選んでください',
      'TDD Mob Pro Timer',
      'Planning Poker',
      'Facilitator Roulette',
      'Topic Board',
      'Agenda Timer',
      'Check-in Cards',
      'Uchiwake',
    ]);
  });

  it('Given 道具を選んでいない / When 見る / Then 呼んで移るは押せない', () => {
    joinedRoom();

    expect(screen.getByRole('button', { name: '呼んで移る' })).toBeDisabled();
  });

  it('Given 道具を選んだ / When 呼んで移るを押す / Then コードを持たない room.call を 1 通送り、受け付けの前には移らない', () => {
    joinedRoom();

    chooseAndCall('poker');

    expect(sentCalls()).toEqual([{ command: 'room.call', tool: 'poker' }]);
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('Given 呼びかけを送った / When 受け付け room.called が届く / Then その道具の同じルームへ移る', () => {
    joinedRoom();
    chooseAndCall('poker');

    act(() => socket().deliver({ type: 'room.called', tool: 'poker' }));

    expect(navigateTo).toHaveBeenCalledExactlyOnceWith('/poker/?room=R1');
  });

  it('Given ルームコードに記号がある / When 受け付けが届く / Then コードは URL 用に符号化して付ける', () => {
    window.history.replaceState(null, '', '/?room=%E6%9C%9D%E4%BC%9A-ab12');
    localStorage.setItem(
      'tasuki:resume:朝会-ab12',
      JSON.stringify({ code: '朝会-ab12', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );
    render(<App />);
    act(() => socket().open());
    act(() => socket().deliver({ type: 'room.joined', code: '朝会-ab12', participantId: 'p1', resumeToken: 't2' }));
    chooseAndCall('topic');

    act(() => socket().deliver({ type: 'room.called', tool: 'topic' }));

    expect(navigateTo).toHaveBeenCalledExactlyOnceWith(`/topic/?room=${encodeURIComponent('朝会-ab12')}`);
  });

  it('Given 呼びかけを送っていない / When room.called が届く / Then 移らない（頼んでいない受け付けでは動かない）', () => {
    joinedRoom();

    act(() => socket().deliver({ type: 'room.called', tool: 'poker' }));

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('Given 受け付けを待っている / When もう一度押す / Then 押せず、2 通目は送らない', () => {
    joinedRoom();
    chooseAndCall('poker');

    expect(screen.getByRole('button', { name: '呼んで移る' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('呼ぶ道具').closest('form')!);
    expect(sentCalls()).toHaveLength(1);
  });

  it('Given 呼びかけを送った / When CALL_TOO_SOON が返る / Then 呼ぶ操作の近くに出て、移らず、また押せる', () => {
    joinedRoom();
    chooseAndCall('poker');

    act(() => socket().deliver({ type: 'error', code: 'CALL_TOO_SOON', message: '少し待ってから呼んでください。' }));

    expect(screen.getByRole('alert')).toHaveTextContent('少し待ってから呼んでください。');
    expect(screen.getByLabelText('呼ぶ道具').closest('form')).toContainElement(screen.getByRole('alert'));
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '呼んで移る' })).toBeEnabled();
  });

  it('Given 呼びかけの失敗が出ている / When 次の呼びかけを送る / Then 失敗は消える', () => {
    joinedRoom();
    chooseAndCall('poker');
    act(() => socket().deliver({ type: 'error', code: 'CALL_TOO_SOON', message: '少し待ってから呼んでください。' }));

    fireEvent.click(screen.getByRole('button', { name: '呼んで移る' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given 呼びかけの失敗 / When 合言葉の設定の失敗が別に起きる / Then 呼びかけの失敗の欄に出ない（待っていない間のエラーは合言葉のもの）', () => {
    joinedRoom();

    act(() => socket().deliver({ type: 'error', code: 'NOT_IN_ROOM', message: 'ルームに入っていません。' }));

    expect(screen.getByLabelText('呼ぶ道具').closest('form')).not.toHaveTextContent('ルームに入っていません。');
  });

  it('Given 受け付けを待っている / When 接続が切れる / Then 再接続の間は押せない', () => {
    joinedRoom();
    chooseAndCall('poker');

    act(() => socket().drop());

    expect(screen.getByRole('button', { name: '呼んで移る' })).toBeDisabled();
  });

  it('Given 受け付けを待っている / When 接続が切れて繋ぎ直る / Then 待ちは終わり、また押せる（応答は前の接続と一緒に失われた）', () => {
    vi.useFakeTimers();
    try {
      joinedRoom();
      chooseAndCall('poker');

      act(() => socket().drop());
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      act(() => ScriptedWebSocket.instances.at(-1)!.open());

      expect(screen.getByRole('button', { name: '呼んで移る' })).toBeEnabled();
      expect(navigateTo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('呼びかけの知らせ（呼ばれる側）', () => {
  it('Given 選択画面 / When 呼びかけの知らせが届く / Then 呼んだ人の名前と道具の名前と、移る・閉じるが出る', () => {
    joinedRoom();

    act(() => socket().deliver(CALL_FRAME('poker')));

    const notice = screen.getByText('Planning Poker に呼んでいます', { exact: false }).closest('.ui-call') as HTMLElement;
    expect(notice).toHaveTextContent('いおさんが Planning Poker に呼んでいます');
    expect(within(notice).getByRole('link', { name: '移る' })).toHaveAttribute('href', '/poker/?room=R1');
    expect(within(notice).getByRole('button', { name: '閉じる' })).toBeInTheDocument();
  });

  it('Given 知らせが出ている / When 閉じる / Then 知らせは消え、選択画面のままである', () => {
    joinedRoom();
    act(() => socket().deliver(CALL_FRAME('poker')));

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(screen.queryByText('に呼んでいます', { exact: false })).toBeNull();
    expect(screen.getByRole('heading', { name: '参加者' })).toBeInTheDocument();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('Given 知らせが出ている / When 新しい呼びかけが届く / Then 並べず最新の 1 つに置き換わる', () => {
    joinedRoom();
    act(() => socket().deliver(CALL_FRAME('poker')));

    act(() => socket().deliver(CALL_FRAME('topic', 'うみ')));

    expect(screen.getAllByText('に呼んでいます', { exact: false })).toHaveLength(1);
    expect(document.querySelector('.ui-call')).toHaveTextContent('うみさんが Topic Board に呼んでいます');
  });

  it('Given 閉じた後 / When 新しい呼びかけが届く / Then また出る', () => {
    joinedRoom();
    act(() => socket().deliver(CALL_FRAME('poker')));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    act(() => socket().deliver(CALL_FRAME('track')));

    expect(screen.getByText('Uchiwake に呼んでいます', { exact: false })).toBeInTheDocument();
  });

  it('Given 知らない道具の知らせ / When 届く / Then 何も出さない（古い玄関が新しい道具を知らない場合）', () => {
    joinedRoom();

    act(() => socket().deliver(CALL_FRAME('unknown-tool')));

    expect(screen.queryByText('に呼んでいます', { exact: false })).toBeNull();
  });

  it('Given 知らせ / When 届く / Then 受け付けと取り違えず、移らない・エラーも出さない', () => {
    joinedRoom();

    act(() => socket().deliver(CALL_FRAME('poker')));

    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
