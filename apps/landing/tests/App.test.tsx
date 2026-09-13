/**
 * ハブの 3 状態（#95 S5a・設計正本 §5.7）。
 *
 * **同期そのものはここで見ない。** WS の配線は `apps/tasuki-sync` の実 WS テストが
 * 受け持ち、ここが見るのは「どの画面が出るか」と「札の意匠を変えていないこと」である。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';
import { TOOLS } from '../src/tools.js';
import { RoomChoice } from '../src/screens/RoomChoice.js';
import type { RosterRoom } from '@tasuki/room-core';

/**
 * WebSocket を差し替える。**実物は jsdom に無い**うえ、ここで見たいのは画面だけである。
 * 接続は開いたことにせず、送ったコマンドも捨てる（フックは送信をキューへ積むだけになる）。
 */
class SilentWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(): void {}
  close(): void {}
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', SilentWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('玄関（ハブ）', () => {
  it('Given ルームコードの無い URL / When 開く / Then ルームを作る画面が出る', () => {
    // Given（準備）: 素の入口（beforeEach が `/` に戻している）

    // When（操作）
    render(<App />);

    // Then
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tasuki');
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeInTheDocument();
  });

  it('Given 参加用 URL / When 開く / Then 名乗る画面が出る', () => {
    // Given（準備）: 配られた参加用 URL
    window.history.replaceState(null, '', '/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2');

    // When（操作）
    render(<App />);

    // Then: ルームコードを見せたうえで名乗りを求める
    expect(screen.getByRole('button', { name: '参加する' })).toBeInTheDocument();
    expect(screen.getByText('朝会モブ-a1b2')).toBeInTheDocument();
  });

  it('Given 前に名乗った名前 / When 参加画面を開く / Then 初期値に入る', () => {
    // Given（準備）: ルーム非依存の既定表示名（D12 の後半）
    localStorage.setItem('tasuki:display-name', 'あや');
    window.history.replaceState(null, '', '/?room=R1');

    // When（操作）
    render(<App />);

    // Then
    expect(screen.getByLabelText('あなたの名前')).toHaveValue('あや');
  });
});

describe('選択画面', () => {
  const roster: RosterRoom = {
    code: '朝会モブ-a1b2',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['timer'] },
      { participantId: 'p2', displayName: 'いずみ', presence: 'online', tools: [] },
      { participantId: 'p3', displayName: 'かえで', presence: 'offline', tools: [] },
    ],
  };

  it('Given 参加済み / When 選択画面を見る / Then ルーム名・参加者・参加用 URL が揃う', () => {
    // Given（準備）: 名簿が届いている
    render(<RoomChoice code="朝会モブ-a1b2" roster={roster} connection="online" />);

    // When（操作）: 配る URL を読む
    const invite = screen.getByLabelText('参加用 URL');

    // Then: **ルート直下の ?room=** である（ツールの配下ではない・D11）
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('あや');
    expect((invite as HTMLInputElement).value).toContain(`/?room=${encodeURIComponent('朝会モブ-a1b2')}`);
  });

  it('Given 参加済み / When 札を見る / Then ルームコードつきの遷移先になる', () => {
    // Given（準備）: 名簿が届いている

    // When（操作）
    render(<RoomChoice code="朝会モブ-a1b2" roster={roster} connection="online" />);

    // Then: 意匠（手札）は変えず、href にコードを付けるだけ（設計正本 §5.7）
    for (const tool of TOOLS) {
      const link = screen.getByRole('link', { name: new RegExp(tool.name) });
      expect(link).toHaveAttribute(
        'href',
        `${tool.href}?room=${encodeURIComponent('朝会モブ-a1b2')}`,
      );
      expect(link).toHaveAttribute('data-label', tool.pip);
    }
  });

  it('Given ツールに居る人 / When 一覧を見る / Then どこに居るかが分かる', () => {
    // Given（準備）: あやは timer、いずみは選択画面に居る

    // When（操作）
    render(<RoomChoice code="朝会モブ-a1b2" roster={roster} connection="online" />);

    // Then: 選択画面に居る人（tools が空）には出さない
    const items = screen.getByRole('list', { name: '参加者' }).querySelectorAll('li');
    expect(items[0]?.textContent).toContain('に居ます');
    expect(items[1]?.textContent).not.toContain('に居ます');
  });

  it('Given 切断中の人 / When 一覧を見る / Then 名簿には残る（消えない）', () => {
    // Given（準備）: 切断は在室そのものを終わらせない（設計正本 §3.13）

    // When（操作）
    render(<RoomChoice code="朝会モブ-a1b2" roster={roster} connection="online" />);

    // Then
    const items = screen.getByRole('list', { name: '参加者' }).querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[2]?.getAttribute('data-presence')).toBe('offline');
  });

  it('Given 再接続中 / When 選択画面を見る / Then 状態が知らされる', () => {
    render(<RoomChoice code="R1" roster={roster} connection="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('再接続');
  });

  it('Given 同じ見え方の名前が 2 人 / When 一覧を見る / Then 識別子が添えられる', () => {
    // Given（準備）: 見分けのつかない表示名
    const ambiguous: RosterRoom = {
      code: 'R1',
      participants: [
        { participantId: 'pabcd', displayName: 'あや', presence: 'online', tools: [] },
        { participantId: 'pefgh', displayName: 'あや', presence: 'online', tools: [] },
      ],
    };

    // When（操作）
    render(<RoomChoice code="R1" roster={ambiguous} connection="online" />);

    // Then
    expect(screen.getByText('あや（pabc）')).toBeInTheDocument();
    expect(screen.getByText('あや（pefg）')).toBeInTheDocument();
  });
});
