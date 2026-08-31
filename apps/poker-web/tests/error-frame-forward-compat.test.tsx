/**
 * 契約に合わない `error` を捨てなくなったことで、**元の用が果たされる**ことを固定する（#214）。
 *
 * `docs/poker/adr/0002` は「捨てたことを伝える」までしか解いておらず、
 * 消えたルームの案内（#76 J-1）も入室の自動再試行（#147）も起きないままだった。
 * `docs/poker/adr/0003` で `error` フレームだけを前方互換にし、この 2 つを復活させる。
 *
 * **`App` を通して実経路で見る。** フェイクの `sync` を `RoomPage` に渡すだけでは、
 * 受信の境界（`useSync`）が切れていても緑になる。
 *
 * @requirements #214
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { App } from '../src/App';
import { usePokerSync } from '../src/hooks/useSync';
import { FakeListenerSocket } from './support/fakes';
import { saveIdentity } from '../src/storage';
import { RETRY_WAITING_TEXT } from '../src/join-retry-plan';
import { DEFAULT_ERROR_MESSAGE } from '@tasuki/poker-core';

const ROOM_ID = 'ABCD1234';
const PARTICIPANT_NAME = 'はなこ';

function deliver(frame: unknown): void {
  act(() => {
    FakeListenerSocket.latest().fire('message', { data: JSON.stringify(frame) });
  });
}

function open(): void {
  act(() => {
    FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
    FakeListenerSocket.latest().fire('open');
  });
}

/** 招待リンクでルーム画面を開き、保存済みの識別情報で自動復帰させる。 */
function openRoomWithStoredIdentity(): void {
  saveIdentity(ROOM_ID, { token: 'tok-1', name: PARTICIPANT_NAME });
  window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
  render(<App />);
  open();
}

beforeEach(() => {
  FakeListenerSocket.instances = [];
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  window.history.replaceState(null, '', '/poker/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('サーバーが error に足したものを、古いバンドルが捨てない（#214）', () => {
  /**
   * **これが #76 J-1 の復活である。** サーバーが `error` に任意フィールドを 1 つ足すと、
   * `v.strictObject` はフレームごと捨て、消えたルームの案内が出なくなっていた。
   */
  it('room-not-found に余剰キーがあっても、専用画面が出る', () => {
    // Given: 招待リンクを開いた
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    // When: サーバーが error に任意フィールドを足して返した
    deliver({
      type: 'error',
      code: 'room-not-found',
      message: 'ルームが見つかりません',
      retryAfterMs: 1000,
    });
    // Then
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeTruthy();
  });

  /**
   * **これが #147 の復活である。** 混雑で弾かれたことが画面へ届かないと、
   * 接続済み・未入室のまま滞留する。
   */
  it('rate-limited に余剰キーがあっても、入り直しが動く', () => {
    // Given
    vi.useFakeTimers();
    openRoomWithStoredIdentity();
    // When
    deliver({
      type: 'error',
      code: 'rate-limited',
      message: '混み合っています',
      retryAfterMs: 1000,
    });
    // Then: 待っていることが利用者に見える
    expect(screen.getByText(RETRY_WAITING_TEXT)).toBeTruthy();
    // そして実際に送り直す（文言だけ出して送らない、を通さない）
    const socket = FakeListenerSocket.latest();
    const send = vi.spyOn(socket, 'send');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const sent = send.mock.calls.map(([raw]) => JSON.parse(String(raw)) as { type: string });
    expect(sent.some((msg) => msg.type === 'join-room')).toBe(true);
  });

  /**
   * 未知の `code` は**通すが、意味は推測しない**（`docs/poker/adr/0003` 決定 2）。
   * 専用画面や再試行へ入れると、無関係な対処へ利用者を誘導することになる。
   */
  it('未知の code は専用画面にも再試行にも入らない', () => {
    // Given
    vi.useFakeTimers();
    openRoomWithStoredIdentity();
    // When: サーバーが ERROR_CODES を増やし、こちらは古いバンドル
    deliver({ type: 'error', code: 'room-closed', message: 'ルームは終了しました' });
    // Then
    expect(screen.queryByRole('heading', { name: 'ルームが見つかりません' })).toBeNull();
    expect(screen.queryByText(RETRY_WAITING_TEXT)).toBeNull();
  });

  /**
   * **捨てないので、捨てた告知も出ない。** `0002` の `stale` は「契約に合わないフレームを
   * 捨てた」ことの告知であり、通したフレームで出しては嘘になる。
   */
  it('未知の code では「同期できていません」を出さない', () => {
    // Given
    openRoomWithStoredIdentity();
    // When
    deliver({ type: 'error', code: 'room-closed', message: 'ルームは終了しました' });
    // Then
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });
});

/**
 * `room-state` の前方互換（#216・`docs/poker/adr/0004`）。
 *
 * **捨てると画面は生きて見えたまま古い状態で固まる**（`adr/0002` 背景）。
 * `0002` の `stale` 告知は黙って壊れるのを防ぐが、**復旧はしない。**
 * サーバーが `room-state` にフィールドを足しても、古いバンドルが固まらないことを見る。
 */
describe('サーバーが room-state に足したものを、古いバンドルが捨てない（#216）', () => {
  /** 6 つの層すべてに余剰キーを乗せた `room-state`。 */
  function roomStateWithUnknownKeys(participantName: string) {
    return {
      type: 'room-state',
      roomId: ROOM_ID,
      you: 'p1',
      serverTime: 1,
      participants: [
        {
          id: 'p1',
          name: participantName,
          isHost: true,
          connected: true,
          hasVoted: true,
          avatar: 'x',
        },
      ],
      round: {
        status: 'revealed',
        elapsedMs: 1,
        votes: [{ participantId: 'p1', card: { kind: 'number', value: 5 }, at: 1 }],
        stats: { average: 5, modes: [{ kind: 'number', value: 5 }], median: 5 },
      },
      yourVote: { kind: 'number', value: 5 },
    };
  }

  it('余剰キーが乗っていても名簿が更新され、告知も出ない', () => {
    // Given: ルーム画面を開いている
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    // When: サーバーが 6 層すべてにフィールドを足したフレームを送る
    deliver(roomStateWithUnknownKeys('はなこ'));
    // Then: 画面が描かれる（捨てていれば参加フォームのままになる）
    expect(screen.getByRole('heading', { name: '参加者（1人）' })).toBeTruthy();
    // 名前は名簿と結果の両方に出るので、あることだけを見る
    expect(screen.getAllByText(/はなこ/).length).toBeGreaterThan(0);
    // そして捨てていないので、捨てた告知も出ない
    expect(screen.queryByText(/同期できていません/)).toBeNull();
  });

  /**
   * **固まらないことを、実際に動かして確かめる。** 1 通目が描けただけでは、
   * 2 通目以降を捨てて固まる形と区別が付かない（`adr/0002` が実測した症状そのもの）。
   */
  it('余剰キーが乗り続けても、名簿は更新され続ける', () => {
    // Given
    window.history.replaceState(null, '', `/poker/room/${ROOM_ID}`);
    render(<App />);
    open();
    deliver(roomStateWithUnknownKeys('はなこ'));
    // When: 2 通目が届く
    deliver(roomStateWithUnknownKeys('たろう'));
    // Then: 古いままで固まっていない
    expect(screen.getAllByText(/たろう/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/はなこ/)).toHaveLength(0);
  });
});

/**
 * 受信の契約が `string` を通すようになった以上、**画面が知っているコードとの区別は
 * 境界が付ける**（`docs/poker/adr/0003` 決定 2）。
 *
 * これを `as ErrorCode` で通すと型検査は黙るが、未知のコードが
 * `sync.error.code` にそのまま残り、**`ErrorCode` を名乗る嘘の値**が画面へ流れる。
 * 画面の分岐には出ないので、ここで固定しないと誰も気づけない。
 */
describe('未知の code を境界で畳む（#214）', () => {
  it('未知の code は null になり、message はそのまま残る', () => {
    // Given
    const { result } = renderHook(() => usePokerSync());
    open();
    // When
    deliver({ type: 'error', code: 'room-closed', message: 'ルームは終了しました' });
    // Then
    expect(result.current.error).toEqual({ code: null, message: 'ルームは終了しました' });
  });

  it('既知の code はそのまま残る', () => {
    // Given
    const { result } = renderHook(() => usePokerSync());
    open();
    // When
    deliver({ type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' });
    // Then
    expect(result.current.error).toEqual({
      code: 'room-not-found',
      message: 'ルームが見つかりません',
    });
  });

  /**
   * `message` は `v.string()` なので空文字も通る。そのまま描くと
   * **エラー表示が空の箱になる**ので、境界で既定文言へ逃がす。
   */
  it.each([
    ['空文字', ''],
    // **空白だけでも同じ空の箱になる。**`v.string()` は空白のみの文字列も通す
    ['半角空白', '   '],
    ['改行', '\n'],
    ['全角空白', '\u3000'],
  ])('message が %s なら既定文言に置き換える', (_label, message) => {
    // Given
    const { result } = renderHook(() => usePokerSync());
    open();
    // When
    deliver({ type: 'error', code: 'room-closed', message });
    // Then
    expect(result.current.error).toEqual({ code: null, message: DEFAULT_ERROR_MESSAGE });
  });
});
