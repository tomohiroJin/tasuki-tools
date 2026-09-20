/**
 * 前回の名乗りを既定として自動提示する（#284・FR-053 / FR-054 の移管先）。
 *
 * **保管庫を覗いて満足しない。** 「`localStorage` を触った」だけを見る検査は、
 * 正しい実装と誤った実装で同じ値を返す（保存はできているのに画面へ出ない、という
 * いちばん起きやすい壊れ方を通してしまう）。ここでは**名乗る → 玄関を開き直す**の
 * 往復を通し、**次の描画で欄に現れるところまで**を見る。
 *
 * 鍵の綴りは `packages/sync-client/tests/resume-identity.test.ts` が固定している。
 * こちらはそれを写さず、振る舞いだけで書く。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { App } from '../src/App.js';

/** 開いたことにはせず、届いたメッセージだけを差し込める WebSocket（`App.test.tsx` と同じ作法）。 */
class SilentWebSocket {
  static readonly OPEN = 1;
  static instances: SilentWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    SilentWebSocket.instances.push(this);
  }

  send(): void {}
  close(): void {}
}

/** いちばん新しい接続（玄関を開き直すと 2 本目が生まれる）。 */
const socket = (): SilentWebSocket =>
  SilentWebSocket.instances[SilentWebSocket.instances.length - 1]!;

/** サーバーからの 1 通を届ける。 */
const deliver = (msg: unknown): void => {
  act(() => {
    socket().onmessage?.({ data: JSON.stringify(msg) });
  });
};

/** 名乗りの欄。 */
const nameField = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('あなたの名前');

beforeEach(() => {
  SilentWebSocket.instances = [];
  vi.stubGlobal('WebSocket', SilentWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('前回の名乗りを既定として提示する', () => {
  it('Given 名乗って部屋を作った / When 玄関を開き直す / Then 名乗りの欄に前回の名前が入っている', () => {
    // Given（準備）: 玄関で名乗って部屋を作る（EARS 1）
    const first = render(<App />);
    fireEvent.change(screen.getByLabelText('ルーム名'), { target: { value: '朝会モブ' } });
    fireEvent.change(nameField(), { target: { value: 'あや' } });
    fireEvent.submit(screen.getByRole('button', { name: 'ルームを作る' }).closest('form')!);
    deliver({ type: 'room.created', code: '朝会モブ-a1b2', participantId: 'p1', resumeToken: 't1' });
    first.unmount();

    // When（操作）: 日を改めて素の入口を開く（EARS 2）。
    // **作成は URL に `?room=` を書き足している**ので、素の入口へ戻してから開く
    window.history.replaceState(null, '', '/');
    render(<App />);

    // Then: 保存された値が**次の描画で既定として現れる**。
    // 保存だけして読まない実装・読むだけで保存しない実装は、どちらもここで赤くなる
    expect(nameField()).toHaveValue('あや');
  });

  it('Given 名乗って部屋に入った / When 別のルームの参加用 URL を開く / Then 前回の名前が入っている', () => {
    // Given（準備）: 配られた参加用 URL で名乗る（EARS 1 の「部屋に入った」側）
    window.history.replaceState(null, '', '/?room=ABC123');
    const first = render(<App />);
    fireEvent.change(nameField(), { target: { value: 'いずみ' } });
    fireEvent.submit(screen.getByRole('button', { name: '参加する' }).closest('form')!);
    deliver({ type: 'room.joined', code: 'ABC123', participantId: 'p2', resumeToken: 't2' });
    first.unmount();

    // When（操作）: **別の**ルームへ招かれる。既定の表示名はルームに紐づかない（D12 の後半）
    window.history.replaceState(null, '', '/?room=ZZZ999');
    render(<App />);

    // Then: ルームが違っても名乗りは引き継がれる
    expect(nameField()).toHaveValue('いずみ');
  });

  it('Given 保存が無い端末 / When 玄関を開く / Then 空の欄が出て、エラーは出ない', () => {
    // Given（準備）: `beforeEach` が保管庫を空にしている（EARS 3 の「無い」側）

    // When（操作）
    render(<App />);

    // Then: 空欄で、告知も出ない
    expect(nameField()).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given 上限を超える保存値 / When 玄関を開く / Then 空の欄になり、その値は残らない', () => {
    // Given（準備）: 手で書き換えられた保管庫（原則 IV）。`maxLength` は**打ち込みしか
    // 止めない**ので、初期値として入れるとそのまま送信でき、サーバーは理由を伏せた
    // 文言で弾く —— 利用者には直しようが無い
    const tooLong = 'あ'.repeat(MAX_DISPLAY_NAME + 10);
    localStorage.setItem('tasuki:display-name', tooLong);

    // When（操作）
    render(<App />);

    // Then: 空欄で、エラーも出ない（EARS 3）
    expect(nameField()).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();

    // Then: **残さない。** 残すと玄関を開くたびに同じ値で弾かれ続ける
    // （`resume-identity.ts` の壊れた組と同じ扱い）
    expect(localStorage.getItem('tasuki:display-name')).toBeNull();
  });

  it('Given 空白だけの保存値 / When 玄関を開く / Then 空の欄になる（押しても何も起きない欄を出さない）', () => {
    // Given（準備）: 空白は `required` を素通りするのに、画面の送信判定が黙って弾く
    localStorage.setItem('tasuki:display-name', '   ');

    // When（操作）
    render(<App />);

    // Then
    expect(nameField()).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given localStorage が使えない端末 / When 玄関を開く / Then 空の欄が出て、玄関は描ける', () => {
    // Given（準備）: cookie を全面禁止した Chrome では**読むだけで** SecurityError が
    // 飛び、容量超過では書き込みが投げる。**保管庫が使えないのは「保存が無い」と同じ**
    const saved = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem,
    };
    const deny = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;

    try {
      // When（操作）: 参加用 URL からも開く（復帰の組を読む経路もここを通る）
      window.history.replaceState(null, '', '/?room=ABC123');
      render(<App />);

      // Then: **真っ白にならない。** 投げたまま外へ出すと描画の初期化子で踏み、
      // 玄関ごと落ちる（EARS 3「エラーを見せてはならない」の最悪の形）
      expect(screen.getByRole('button', { name: '参加する' })).toBeInTheDocument();
      expect(nameField()).toHaveValue('');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      Storage.prototype.getItem = saved.getItem;
      Storage.prototype.setItem = saved.setItem;
      Storage.prototype.removeItem = saved.removeItem;
    }
  });

  it('Given timer 時代の設定が残る端末 / When 玄関を開く / Then その値は落ちる', () => {
    // Given（準備）: #272 で読み手も書き手も消えたまま端末に残り続けている値。
    // 中身の `displayName` は `docs/adr/0011` の「個人に紐づく情報」であり、
    // 読む者が居ないなら端末に置き続ける理由が無い
    localStorage.setItem(
      'tdd-mob:preferences:v1',
      JSON.stringify({ displayName: 'あや', language: 'ja', difficulty: 'normal', members: [], intervalMinutes: 10 }),
    );

    // When（操作）: 玄関を開く（新しい既定を読むついでに落とす。片付け専用の経路は作らない）
    render(<App />);

    // Then
    expect(localStorage.getItem('tdd-mob:preferences:v1')).toBeNull();
  });

  it('Given timer 時代の設定が残る端末 / When 玄関を開く / Then その表示名は引き継がない', () => {
    // Given（準備）: 移行はしないと決めた（#284）。読み手も書き手も既に無く、
    // 個人に紐づく値を新しい鍵へ移してまで生かす理由が無い
    localStorage.setItem('tdd-mob:preferences:v1', JSON.stringify({ displayName: 'あや' }));

    // When（操作）
    render(<App />);

    // Then: 空欄から始まる（**消すことと移すことを取り違えていない**）
    expect(nameField()).toHaveValue('');
    expect(localStorage.getItem('tasuki:display-name')).toBeNull();
  });
});
