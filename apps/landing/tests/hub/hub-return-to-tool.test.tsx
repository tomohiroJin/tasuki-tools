/**
 * 道具の入口から送り返された人は、玄関で名乗りと合言葉を通ったあと、元の道具へ戻る（#638）。
 *
 * 道具は `?from=<道具の ID>` を運んで玄関へ送る。玄関の参加画面は合言葉を求め、`room.joined` が届いたら
 * 選択画面へ進まず、元の道具の同じルームへ置き換えて移る。遷移は `departure.ts` に閉じてあるので、
 * そこを差し替えて行き先を見る。実サーバーとの配線は `apps/tasuki-sync` の実 WS テストと E2E が受け持つ。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App.js';
import { ScriptedWebSocket } from '@tasuki/test-css/scripted-web-socket';
import { redirectTo } from '../../src/hub/departure.js';

vi.mock('../../src/hub/departure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/hub/departure.js')>();
  return { ...actual, redirectTo: vi.fn() };
});

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;
const sentCommands = (): Record<string, unknown>[] => socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);

function openFrom(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
  render(<App />);
  act(() => socket().open());
}

function submitName(name: string): void {
  fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: '参加する' }));
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('玄関で通ったあと、元の道具へ戻る', () => {
  it('Given 道具から送り返された / When 名乗って入れた / Then 選択画面へ進まず、元の道具の同じルームへ移る', () => {
    openFrom('?room=R1&from=topic');
    submitName('あや');

    act(() => socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));

    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith('/topic/?room=R1');
    expect(screen.queryByRole('list', { name: 'ツール' })).toBeNull();
    // 戻った先の道具が復帰できるよう、復帰の組は端末に置いてある
    expect(localStorage.getItem('tasuki:resume:R1')).not.toBeNull();
  });

  it('Given 合言葉つきのルームへ道具から送り返された / When 合言葉を求められて通った / Then 合言葉を送って元の道具へ戻る', () => {
    openFrom('?room=R1&from=poker');
    submitName('あや');
    act(() => socket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: '合言葉が要ります' }));
    // 求められるまでは戻らない
    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('合言葉'), { target: { value: 'ひみつ' } });
    fireEvent.click(screen.getByRole('button', { name: '参加する' }));
    act(() => socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));

    const joins = sentCommands().filter((c) => c['command'] === 'room.join');
    expect(joins.at(-1)).toMatchObject({ code: 'R1', passphrase: 'ひみつ' });
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith('/poker/?room=R1');
  });

  it('Given 合言葉が違った / When PASSPHRASE_MISMATCH が返る / Then 戻らず、入れるまで玄関に留まる', () => {
    openFrom('?room=R1&from=timer');
    submitName('あや');
    act(() => socket().deliver({ type: 'error', code: 'PASSPHRASE_MISMATCH', message: '合言葉が違います' }));

    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(screen.getByText('合言葉が違います')).toBeInTheDocument();
  });

  it('Given 道具の印が無い参加用 URL / When 名乗って入れた / Then 選択画面へ進む（従来どおり）', () => {
    openFrom('?room=R1');
    submitName('あや');

    act(() => socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));

    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
  });

  it('Given 知らない道具の印 / When 入れた / Then 戻さず選択画面へ進む', () => {
    openFrom('?room=R1&from=https://evil.example/');
    submitName('あや');

    act(() => socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));

    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
  });

  it('Given ルームを作った / When room.created が届く / Then 戻さない（作成は道具へ戻る理由を持たない）', () => {
    window.history.replaceState(null, '', '/?from=timer');
    render(<App />);
    act(() => socket().open());

    act(() => socket().deliver({ type: 'room.created', code: 'A-1', participantId: 'p1', resumeToken: 't1' }));

    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
  });
});
