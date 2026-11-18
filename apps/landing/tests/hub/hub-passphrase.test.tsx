/**
 * 玄関のルームの画面で合言葉を設定・変更・解除する（#638）。同期フックの配線を App 越しに見る。
 *
 * **サーバーは立てない**（WebSocket を差し替える）。実サーバーでの設定・関門の効き方は
 * `apps/tasuki-sync/test/live-ws.hub-passphrase.test.ts` と E2E（`e2e/specs/landing-passphrase.spec.ts`）が受け持つ。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App.js';
import { ScriptedWebSocket } from '@tasuki/test-css/scripted-web-socket';

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;
const sentCommands = (): Record<string, unknown>[] => socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);

const ROSTER = (passphraseProtected?: boolean) => ({
  type: 'roster',
  room: {
    code: 'R1',
    participants: [{ participantId: 'p1', displayName: 'あや', presence: 'online', tools: [] }],
    ...(passphraseProtected === undefined ? {} : { passphraseProtected }),
  },
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
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('玄関の合言葉', () => {
  it('Given 参加済み / When 合言葉を入れて設定する / Then コードを持たない room.passphrase.set が 1 通だけ送られる', () => {
    joinedRoom();

    fireEvent.change(screen.getByLabelText('新しい合言葉', { selector: 'input' }), { target: { value: 'ひみつ' } });
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    expect(sentCommands().filter((c) => c['command'] === 'room.passphrase.set')).toEqual([
      { command: 'room.passphrase.set', passphrase: 'ひみつ' },
    ]);
  });

  it('Given 印の付いていない名簿 / When 名簿に設定中の印が届く / Then 状態が「設定中」に変わり、変更・解除が出る', () => {
    joinedRoom();
    act(() => socket().deliver(ROSTER(false)));
    expect(screen.getByRole('button', { name: '設定' })).toBeInTheDocument();

    act(() => socket().deliver(ROSTER(true)));

    expect(screen.getByText('合言葉を設定中です。', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '変更' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解除' })).toBeInTheDocument();
  });

  it('Given 設定中 / When 解除する / Then 空文字の room.passphrase.set が送られ、印が外れた名簿で「付いていない」に戻る', () => {
    joinedRoom();
    act(() => socket().deliver(ROSTER(true)));

    fireEvent.click(screen.getByRole('button', { name: '解除' }));
    act(() => socket().deliver(ROSTER(false)));

    expect(sentCommands().filter((c) => c['command'] === 'room.passphrase.set')).toEqual([
      { command: 'room.passphrase.set', passphrase: '' },
    ]);
    expect(screen.getByText('合言葉は付いていません。', { exact: false })).toBeInTheDocument();
  });

  it('Given 設定中 / When 別の合言葉で変更する / Then 新しい値で設定し直す（変更も同じコマンド）', () => {
    joinedRoom();
    act(() => socket().deliver(ROSTER(true)));

    fireEvent.change(screen.getByLabelText('新しい合言葉', { selector: 'input' }), { target: { value: 'べつ' } });
    fireEvent.click(screen.getByRole('button', { name: '変更' }));

    expect(sentCommands().filter((c) => c['command'] === 'room.passphrase.set')).toEqual([
      { command: 'room.passphrase.set', passphrase: 'べつ' },
    ]);
  });

  it('Given 印の無い名簿（古いサーバー） / When 選択画面を見る / Then 「付いていない」として映す', () => {
    joinedRoom();
    act(() => socket().deliver(ROSTER()));

    expect(screen.getByText('合言葉は付いていません。', { exact: false })).toBeInTheDocument();
  });
});
