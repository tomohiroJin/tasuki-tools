/**
 * 玄関へ送り返している間の画面（#95 S5c 追補・利用者の実画面フィードバック）。
 *
 * **timer と同じ穴が poker にもあった。** `App` は `route.name === 'room'` 以外で
 * `null` を返しており、「送り返している間に出す画面は無い」と書いてあった。
 * 実ブラウザでは `location.replace` が効くまでの間、白い画面だけが残る。
 *
 * ⚠ **「空でないこと」を見るテストにしない。** 読み込み中だと**名指しで**分かる
 * 要素を見る（そうしないと何を出しても通る）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { FakeListenerSocket } from './support/fakes';

vi.mock('../src/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/router')>();
  return { ...actual, redirectTo: vi.fn() };
});

beforeEach(() => {
  FakeListenerSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('ルームの画面が決まるまでの表示', () => {
  it('Given 行き先の無い URL / When 玄関へ送り返している間 / Then 読み込み中だと分かる表示が出る', () => {
    // Given: `/poker/` を素で開いた（旧入口の TopPage はもう無い）
    window.history.replaceState(null, '', '/poker/');

    // When: 玄関へ送るのを待っている
    render(<App />);

    // Then: 遷移が終わるまでの間も白いままにしない
    expect(screen.getByRole('status').textContent).toContain('読み込んでいます');
  });

  it('対照: Given ルームコードつきの URL / When ルーム画面へ入る / Then 読み込み中の表示は出ない', () => {
    // Given: 招待リンクと同じ形（同一性が無いので RoomPage は玄関へ送り返すが、
    // 「送り返している間の画面」とは別の画面に入っていることが見たい）
    window.history.replaceState(null, '', '/poker/?room=ABCD1234');

    // When
    render(<App />);

    // Then: 同じ仕込みで、ルームの経路には読み込み中の表示が出ない
    expect(screen.queryByText(/読み込んでいます/)).toBeNull();
  });
});
