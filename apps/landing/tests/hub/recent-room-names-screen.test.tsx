/**
 * 前に作ったルーム名を覚えて入れ直す（#633）。玄関を通して、端末の保存と画面の振る舞いを見る。
 *
 * サーバーは立てない（`use-hub-sync.test.tsx` と同じく WebSocket を差し替える）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/App.js';
import { RECENT_ROOM_NAMES_KEY } from '../../src/hub/recent-room-names-store.js';
import { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

const storeNames = (names: unknown): void => {
  localStorage.setItem(RECENT_ROOM_NAMES_KEY, JSON.stringify(names));
};
const storedNames = (): unknown => JSON.parse(localStorage.getItem(RECENT_ROOM_NAMES_KEY) ?? 'null');

const roomNameInput = (): HTMLInputElement => screen.getByLabelText('ルーム名');
const candidates = (): HTMLElement => screen.getByRole('list', { name: '前に作ったルーム' });

/** 名前を入れて作り、サーバーが作成を返すところまで進める。 */
const createRoom = (roomName: string): void => {
  fireEvent.change(roomNameInput(), { target: { value: roomName } });
  fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
  fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
  act(() => {
    socket().deliver({ type: 'room.created', code: 'room-a1b2c3d4', participantId: 'p1', resumeToken: 't1' });
  });
};

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ルームの作成に成功したとき、ルーム名を端末に保存する', () => {
  it('Given 何も覚えていない / When ルームを作る / Then その名前を覚える', () => {
    render(<App />);
    act(() => socket().open());

    createRoom('朝会モブ');

    expect(storedNames()).toEqual(['朝会モブ']);
  });

  it('Given 作成を送っただけ / When サーバーの返事がまだ / Then 覚えない（成功してから覚える）', () => {
    render(<App />);
    act(() => socket().open());

    fireEvent.change(roomNameInput(), { target: { value: '朝会モブ' } });
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));

    expect(localStorage.getItem(RECENT_ROOM_NAMES_KEY)).toBeNull();
  });

  it('Given 作成がエラーで返る / When その後に何も届かない / Then 覚えない', () => {
    render(<App />);
    act(() => socket().open());

    fireEvent.change(roomNameInput(), { target: { value: '朝会モブ' } });
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
    act(() => {
      socket().deliver({ type: 'error', code: 'INVALID_COMMAND', message: '送れませんでした' });
    });

    expect(localStorage.getItem(RECENT_ROOM_NAMES_KEY)).toBeNull();
  });

  it('Given 覚えている名前がある / When 別の名前で作る / Then 新しい名前を先頭に足す', () => {
    storeNames(['定例']);
    render(<App />);
    act(() => socket().open());

    createRoom('朝会モブ');

    expect(storedNames()).toEqual(['朝会モブ', '定例']);
  });

  it('Given 同じ名前を覚えている / When その名前で作る / Then 1 つにまとめて先頭へ移す', () => {
    storeNames(['定例', '朝会モブ']);
    render(<App />);
    act(() => socket().open());

    createRoom('朝会モブ');

    expect(storedNames()).toEqual(['朝会モブ', '定例']);
  });

  it('Given 名前を空にして作る / When 作成に成功する / Then 覚えている候補は変わらない', () => {
    storeNames(['定例']);
    render(<App />);
    act(() => socket().open());

    createRoom('');

    expect(storedNames()).toEqual(['定例']);
  });

  it('Given 作成の応答待ち / When 別の名前で送り直そうとする / Then 送らず、成功した最初の名前を覚える（#642 のレビュー）', () => {
    render(<App />);
    act(() => socket().open());

    // 1 つ目を送る（応答はまだ）
    fireEvent.change(roomNameInput(), { target: { value: 'first-room' } });
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
    // 応答待ちの間に名前を変えて送り直す（ボタンを押す・フォームを送る）
    fireEvent.change(roomNameInput(), { target: { value: 'second-room' } });
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'ルームを作る' }).closest('form')!);

    expect(socket().sentJson().filter((c) => c['command'] === 'room.create')).toEqual([
      { command: 'room.create', roomName: 'first-room', displayName: 'あや' },
    ]);
    act(() => {
      socket().deliver({ type: 'room.created', code: 'first-room-a1b2c3d4', participantId: 'p1', resumeToken: 't1' });
    });
    expect(storedNames()).toEqual(['first-room']);
  });

  it('Given 作成がエラーで返った / When 名前を直して送り直す / Then 送れて、成功した名前を覚える', () => {
    render(<App />);
    act(() => socket().open());

    fireEvent.change(roomNameInput(), { target: { value: 'first-room' } });
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
    act(() => {
      socket().deliver({ type: 'error', code: 'INVALID_COMMAND', message: '送れませんでした' });
    });

    createRoom('second-room');

    expect(socket().sentJson().filter((c) => c['command'] === 'room.create')).toHaveLength(2);
    expect(storedNames()).toEqual(['second-room']);
  });

  it('Given 作成の応答待ちで接続が切れた / When 繋ぎ直す / Then 作るボタンが戻り、送り直せる', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      act(() => socket().open());
      fireEvent.change(roomNameInput(), { target: { value: 'first-room' } });
      fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
      fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
      expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeDisabled();

      // 応答が来ないまま切れて、繋ぎ直す（応答は前の接続と一緒に失われた）
      act(() => socket().drop());
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      act(() => latestSocket().open());

      expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
      expect(latestSocket().sentJson()).toContainEqual({ command: 'room.create', roomName: 'first-room', displayName: 'あや' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given 参加（作成ではない） / When room.joined が届く / Then ルーム名は覚えない', () => {
    window.history.replaceState(null, '', '/?room=room-a1b2c3d4');
    render(<App />);
    act(() => socket().open());

    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: '参加する' }));
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'room-a1b2c3d4', participantId: 'p2', resumeToken: 't2' });
    });

    expect(localStorage.getItem(RECENT_ROOM_NAMES_KEY)).toBeNull();
  });
});

describe('作成画面を開いたとき、最後に作ったルーム名を欄に入れて見せる', () => {
  it('Given 覚えている名前がある / When 玄関を開く / Then 最も新しい名前が欄に入っている', () => {
    storeNames(['朝会モブ', '定例']);
    render(<App />);

    expect(roomNameInput()).toHaveValue('朝会モブ');
  });

  it('Given 何も覚えていない / When 玄関を開く / Then 欄は空で、候補も出ない', () => {
    render(<App />);

    expect(roomNameInput()).toHaveValue('');
    expect(screen.queryByRole('list', { name: '前に作ったルーム' })).not.toBeInTheDocument();
  });

  it('Given 入れ直した名前 / When そのまま作る / Then その名前で room.create を送る', () => {
    storeNames(['朝会モブ']);
    render(<App />);
    act(() => socket().open());

    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));

    expect(socket().sentJson()).toContainEqual({ command: 'room.create', roomName: '朝会モブ', displayName: 'あや' });
  });
});

describe('覚えている名前を新しい順に候補として見せ、選ぶと欄に入る', () => {
  it('Given 3 つ覚えている / When 玄関を開く / Then 新しい順に札が並ぶ', () => {
    storeNames(['朝会モブ', '定例', '振り返り']);
    render(<App />);

    const picks = within(candidates())
      .getAllByRole('button')
      .filter((b) => !b.getAttribute('aria-label')?.includes('消す'));
    expect(picks.map((b) => b.textContent)).toEqual(['朝会モブ', '定例', '振り返り']);
  });

  it('Given 候補の札 / When 2 つ目を選ぶ / Then その名前が欄に入る', () => {
    storeNames(['朝会モブ', '定例']);
    render(<App />);

    fireEvent.click(within(candidates()).getByRole('button', { name: '定例' }));

    expect(roomNameInput()).toHaveValue('定例');
  });

  it('Given 候補の札 / When 選ぶ / Then 送信はされない（選ぶだけで作らない）', () => {
    storeNames(['朝会モブ', '定例']);
    render(<App />);
    act(() => socket().open());

    fireEvent.click(within(candidates()).getByRole('button', { name: '定例' }));

    expect(socket().sentJson().filter((c) => c['command'] === 'room.create')).toEqual([]);
  });
});

describe('候補の 1 つを消すと、端末から消して候補から外す', () => {
  it('Given 2 つ覚えている / When 1 つを消す / Then 端末からも札からも外れる', () => {
    storeNames(['朝会モブ', '定例']);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '「定例」を候補から消す' }));

    expect(storedNames()).toEqual(['朝会モブ']);
    expect(within(candidates()).queryByRole('button', { name: '定例' })).not.toBeInTheDocument();
  });

  it('Given 最後の 1 つ / When 消す / Then 候補の並びが消え、端末にも残らない', () => {
    storeNames(['朝会モブ']);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '「朝会モブ」を候補から消す' }));

    expect(screen.queryByRole('list', { name: '前に作ったルーム' })).not.toBeInTheDocument();
    expect(storedNames()).toEqual([]);
  });

  it('Given 消すボタン / When 押す / Then 入力の手が止まらないよう、欄へ戻る', () => {
    storeNames(['朝会モブ', '定例']);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '「定例」を候補から消す' }));

    expect(document.activeElement).toBe(roomNameInput());
  });

  it('Given 欄に入っている名前 / When その候補を消す / Then 欄の中身は利用者のものなので触らない', () => {
    storeNames(['朝会モブ']);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '「朝会モブ」を候補から消す' }));

    expect(roomNameInput()).toHaveValue('朝会モブ');
  });
});

describe('端末の保存が読めない・壊れているときは空の欄で見せる', () => {
  it.each([
    ['壊れた JSON', '{'],
    ['形の違う値', JSON.stringify({ names: ['朝会モブ'] })],
    ['文字列でない要素', JSON.stringify([1, 2])],
  ])('Given %s / When 玄関を開く / Then 空の欄で、作成はできる', (_label, raw) => {
    localStorage.setItem(RECENT_ROOM_NAMES_KEY, raw);
    render(<App />);
    act(() => socket().open());

    expect(roomNameInput()).toHaveValue('');
    expect(screen.queryByRole('list', { name: '前に作ったルーム' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeEnabled();
  });

  it('Given 保管庫を読むと投げる環境 / When 玄関を開いて作る / Then 画面は出て、作成も送れる', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    render(<App />);
    act(() => socket().open());

    expect(roomNameInput()).toHaveValue('');
    createRoom('朝会モブ');

    expect(socket().sentJson()).toContainEqual({ command: 'room.create', roomName: '朝会モブ', displayName: 'あや' });
  });
});
