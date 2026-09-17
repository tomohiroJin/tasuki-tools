/**
 * ハブの同期フック（#95 S5a）。
 *
 * **サーバーは立てない。** WebSocket を差し替えて、届いたメッセージに画面の状態が
 * どう追随するかだけを見る。実サーバーとの配線は `apps/tasuki-sync` の実 WS テストが
 * 受け持つ（あちらは本番と同じ `createSyncServer()` を通る）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../../src/App.js';

/** 送った中身を覚え、サーバーからの応答を差し込める WebSocket。 */
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

  /** サーバーからの 1 通を届ける。 */
  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ハブの同期', () => {
  it('Given 作成画面 / When ルームを作る / Then room.create が送られる', () => {
    // Given（準備）
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      screen.getByLabelText('ルーム名').setAttribute('value', '朝会モブ');
    });
    // フォームの送信だけを見る（入力は React の state 経由なので下の submit で拾う）
    const form = screen.getByRole('button', { name: 'ルームを作る' });
    expect(form).toBeInTheDocument();

    // Then: 繋いだ先はハブの入口である
    expect(socket().url).toMatch(/\/ws$/);
  });

  it('Given 作成の応答 / When room.created が届く / Then 選択画面へ進む', () => {
    // Given（準備）: URL にはまだ room が無い（作成はサーバーがコードを決める）
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが作成を返す
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: '朝会モブ-a1b2',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **URL を書き換えるだけでは進まない。** 画面の側も追随すること
    expect(screen.getByRole('list', { name: 'ツール' })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('room')).toBe('朝会モブ-a1b2');
  });

  it('Given 作成の応答 / When 選択画面を見る / Then 配る URL はルート直下の ?room= である', () => {
    // Given: ルームができた（コードはサーバーが決める）
    render(<App />);
    act(() => socket().open());

    // When
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: '朝会モブ-a1b2',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **組み立ては同期フックの責務**（画面は受け取って描くだけ）。
    //       ツールの配下ではなくルート直下であること（D11・`docs/adr/0018` 決定 2）
    const invite = screen.getByLabelText('参加用 URL') as HTMLInputElement;
    expect(new URL(invite.value).pathname).toBe('/');
    expect(new URL(invite.value).searchParams.get('room')).toBe('朝会モブ-a1b2');
  });

  it('Given ルームを作った直後 / When room.created が届く / Then 接続は張り直されない', () => {
    // Given（準備）: 作成の時点では URL に room が無い
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが作成を返す（画面は選択画面へ進む）
    act(() => {
      socket().deliver({
        type: 'room.created',
        code: 'R1',
        participantId: 'p1',
        resumeToken: 't1',
      });
    });

    // Then: **接続は 1 本のまま。** ここが 2 本になると、いま使ったばかりの WS を捨てて
    //       張り直し、保存したての復帰の組で room.join を送り直す（無駄な再接続と、
    //       切断と再参加が競合して名簿がちらつく）
    expect(ScriptedWebSocket.instances).toHaveLength(1);
    const commands = socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(commands.filter((c) => c['command'] === 'room.join')).toHaveLength(0);
  });

  it('Given 参加の応答 / When roster が届く / Then 参加者一覧に出る', () => {
    // Given（準備）: 参加用 URL から開く
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({
        type: 'roster',
        room: {
          code: 'R1',
          participants: [
            { participantId: 'p1', displayName: 'あや', presence: 'online', tools: [] },
          ],
        },
      });
    });

    // Then
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('あや');
  });

  it('Given 合言葉つきのルーム / When 求められる / Then 入力欄が出る', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）: サーバーが合言葉を要求する
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'PASSPHRASE_REQUIRED',
        message: 'このルームは合言葉で保護されています',
      });
    });

    // Then: 名簿は見えないまま、合言葉を尋ねる
    expect(screen.getByLabelText('合言葉')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '参加者' })).toBeNull();
  });

  it('Given 保存済みの復帰の組 / When 参加用 URL を開く / Then 名乗らずに入り直す', () => {
    // Given（準備）: 同じ端末・同じルーム（R16）
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );

    // When（操作）
    render(<App />);
    act(() => socket().open());

    // Then: 保存済みのトークンで room.join を送っている
    const sent = socket().sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(sent[0]).toMatchObject({ command: 'room.join', code: 'R1', resumeToken: 't1' });
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 保存済みの組を捨てる', () => {
    // Given（準備）: 残すと、消えたルームへ毎回入り直そうとして参加画面に戻れない
    window.history.replaceState(null, '', '/?room=R1');
    localStorage.setItem(
      'tasuki:resume:R1',
      JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
    );
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      });
    });

    // Then
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
  });
});

/**
 * 名乗る前にルームの不在を知る（#274・#76 J-1）。
 */
describe('ルームの生死の照会', () => {
  /** `?room=` 付きで玄関を開いた状態にする。 */
  const openWithRoom = (code: string): void => {
    window.history.replaceState(null, '', `/?room=${encodeURIComponent(code)}`);
  };

  /** 送られた `room.check` の件数。 */
  const checksSent = (): number =>
    socket().sent.filter((raw) => JSON.parse(raw).command === 'room.check').length;

  it('Given 復帰の組が無い参加用 URL / When 玄関を開く / Then 生死の照会が送られる', () => {
    openWithRoom('朝会モブ-a1b2');

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(1);
  });

  it('Given 復帰の組がある参加用 URL / When 玄関を開く / Then 照会は送られない', () => {
    // **送るとバケツを二重に使うだけ**。この人には room.join が同じ答えを返す
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });

    render(<App />);
    act(() => socket().open());

    expect(checksSent()).toBe(0);
  });

  it('Given 照会を送った / When 見つからないと返る / Then 名乗りフォームを出さない（経路1）', () => {
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 復帰の組で入り直した / When 見つからないと返る / Then 名乗りフォームを出さない（経路2）', () => {
    // **Issue 本文が触れていない経路。** 症状は経路1 と同じである
    openWithRoom('朝会モブ-a1b2');
    saveResumeIdentity({
      code: '朝会モブ-a1b2',
      participantId: 'p1',
      resumeToken: 't1',
      displayName: 'あや',
    });
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: '指定されたルームコードが見つかりません',
      }),
    );

    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
    expect(screen.queryByLabelText('あなたの名前')).toBeNull();
  });

  it('Given 照会を送った / When 混雑で弾かれる / Then 不在とは言わない', () => {
    // 無音の意味は「生きている、または拒否された」。**断定しない側にしか外れない**
    openWithRoom('朝会モブ-a1b2');
    render(<App />);
    act(() => socket().open());

    act(() =>
      socket().deliver({
        type: 'error',
        code: 'JOIN_RATE_LIMITED',
        message: '試行が多すぎます。しばらくしてからお試しください',
      }),
    );

    expect(screen.queryByRole('heading', { name: 'ルームが見つかりません' })).toBeNull();
  });
});
