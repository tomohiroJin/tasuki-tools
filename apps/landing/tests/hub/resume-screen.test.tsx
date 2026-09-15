/**
 * ツールから選択画面へ戻るときの表示（#95 S5c 追補・利用者の実画面フィードバック）。
 *
 * timer の「選択画面へ戻る」は `/?room=CODE` で玄関を開く。玄関は**接続して復帰が
 * 済むまで `joined` が false** なので、素直に読むと「◯◯ に参加します／あなたの名前」
 * という名乗る画面が一瞬出る —— 既に参加している人に名乗らせる画面なので誤りである。
 *
 * ⚠ **「名乗らせない」だけを見るテストにしない。** `?room=` で来た人のうち、
 * **端末に同一性が無い人には参加画面を出さなければならない**。3 つの状態を
 * 区別して確かめる（(a) 復帰を試している間 / (b) 復帰できた / (c) 同一性が無い）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../../src/App.js';

/** サーバーからの応答を差し込める WebSocket（`use-hub-sync.test.tsx` と同じ作法）。 */
class ScriptedWebSocket {
  static instances: ScriptedWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    ScriptedWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.();
  }

  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

const CODE = '朝会モブ-a1b2';

/** ツールから戻ってきた人の URL（`?room=` つき）。 */
function openFromTool(): void {
  window.history.replaceState(null, '', `/?room=${encodeURIComponent(CODE)}`);
}

/** 端末に同一性がある状態（選択画面で名乗り、ツールへ行って戻ってきた人）。 */
function haveIdentity(): void {
  saveResumeIdentity({
    code: CODE,
    participantId: 'p1',
    resumeToken: 'rt_1',
    displayName: 'あや',
  });
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('ツールから選択画面へ戻ったとき', () => {
  it('(a) Given 同一性のある端末 / When 復帰の返事を待っている / Then 名乗る画面を出さない', () => {
    // Given
    haveIdentity();
    openFromTool();

    // When: 接続は開いたが、まだ `room.joined` は届いていない
    render(<App />);
    act(() => socket().open());

    // Then: 名乗らせず、読み込み中であることを伝える
    expect(screen.queryByRole('button', { name: '参加する' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('あなたの名前')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('読み込んでいます');
  });

  it('(b) Given 復帰を試している / When room.joined が届く / Then 選択画面になる', () => {
    // Given
    haveIdentity();
    openFromTool();
    render(<App />);
    act(() => socket().open());

    // When
    act(() => {
      socket().deliver({
        type: 'room.joined',
        code: CODE,
        participantId: 'p1',
        resumeToken: 'rt_1',
      });
    });

    // Then: ツールの札が並ぶ選択画面
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
    expect(screen.queryByText(/読み込んでいます/)).not.toBeInTheDocument();
  });

  it('(c) Given 端末に同一性が無い / When 同じ URL を開く / Then 名乗る画面を出す', () => {
    // Given: 招待リンクを受け取っただけの人（`haveIdentity()` を呼ばない）
    openFromTool();

    // When
    render(<App />);
    act(() => socket().open());

    // Then: ⚠ ここが無いと「常に名乗らせない」実装でも通ってしまう
    expect(screen.getByRole('button', { name: '参加する' })).toBeInTheDocument();
    expect(screen.getByLabelText('あなたの名前')).toBeInTheDocument();
  });

  it('(d) Given 同一性はあるが復帰に失敗した / When ルームが見つからない / Then 名乗る画面へ落ちる', () => {
    // Given: ルームが消えた後に戻ってきた（保存だけが残っている）
    haveIdentity();
    openFromTool();
    render(<App />);
    act(() => socket().open());

    // When: 復帰の返事が「見つからない」だった
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'ルームが見つかりません',
      });
    });

    // Then: 待ち続けない。名乗り直す道を出す
    expect(screen.getByRole('button', { name: '参加する' })).toBeInTheDocument();
    expect(screen.queryByText(/読み込んでいます/)).not.toBeInTheDocument();
  });
});
