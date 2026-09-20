/**
 * ハブの 3 状態（#95 S5a・設計正本 §5.7）。
 *
 * **同期そのものはここで見ない。** WS の配線は `apps/tasuki-sync` の実 WS テストが
 * 受け持ち、ここが見るのは「どの画面が出るか」と「札の意匠を変えていないこと」である。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { App } from '../src/App.js';
import { TOOLS } from '../src/tools.js';
import { RoomChoice } from '../src/screens/RoomChoice.js';
import { SyncConnection, saveDefaultDisplayName } from '@tasuki/sync-client';
import { MAX_DISPLAY_NAME, type RosterRoom } from '@tasuki/room-core';

/**
 * WebSocket を差し替える。**実物は jsdom に無い**うえ、ここで見たいのは画面だけである。
 * 接続は開いたことにせず、送ったコマンドも捨てる（フックは送信をキューへ積むだけになる）。
 *
 * `instances` は接続の切断を試すテスト（#249）が、生成された 1 本を掴んで
 * `onclose` を発火させるために持つ（`tests/hub/use-hub-sync.test.tsx` の
 * `ScriptedWebSocket` と同じ作法）。
 */
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

/** 生成された（唯一の）接続。 */
const socket = (): SilentWebSocket => SilentWebSocket.instances[0]!;

beforeEach(() => {
  SilentWebSocket.instances = [];
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
    // Given（準備）: ルーム非依存の既定表示名（D12 の後半）。
    // **鍵の綴りは写さない** —— 綴りの正本と、それを固定する検査は
    // `packages/sync-client` にある（#284 のレビュー所見 4）
    saveDefaultDisplayName('あや');
    window.history.replaceState(null, '', '/?room=R1');

    // When（操作）
    render(<App />);

    // Then
    expect(screen.getByLabelText('あなたの名前')).toHaveValue('あや');
  });

  /**
   * 名前の文字数の上限（#95 S5c・C-I1）。
   *
   * **玄関が唯一の名乗り場になった。** 撤去した poker の `NameForm.tsx` は
   * `maxLength={MAX_DISPLAY_NAME}` を持っており、40 字より先は打てなかった。
   * 上限が無いと超過した名前を送れてしまい、サーバー
   * （`apps/tasuki-sync/src/application/display-name-rule.ts`）は弾くものの、
   * 返す文言は**探りを防ぐため理由を伏せた**「表示名の形式が正しくありません」なので、
   * 利用者は長すぎることを知る手段が無い。
   *
   * **期待値に 40 を書かない。** 写経すると上限を動かしたときに画面とテストが
   * 揃って古いまま緑になる（正本は `@tasuki/room-core` の `MAX_DISPLAY_NAME`）。
   */
  it('Given ルームを作る画面 / When 名前の入力を見る / Then 表示名の上限で打ち切られる', () => {
    // Given（準備）: 素の入口

    // When（操作）
    render(<App />);

    // Then
    expect(screen.getByLabelText<HTMLInputElement>('あなたの名前').maxLength).toBe(
      MAX_DISPLAY_NAME,
    );
  });

  it('Given 参加用 URL から来た名乗りの画面 / When 名前の入力を見る / Then 表示名の上限で打ち切られる', () => {
    // Given（準備）: 配られた参加用 URL
    window.history.replaceState(null, '', '/?room=ABC123');

    // When（操作）
    render(<App />);

    // Then
    expect(screen.getByLabelText<HTMLInputElement>('あなたの名前').maxLength).toBe(
      MAX_DISPLAY_NAME,
    );
  });

  it('Given 同期サーバーへ繋がっていない / When 玄関を開く / Then 繋がらないことと押せない理由が読み上げに乗る', () => {
    // Given（準備）: 玄関を開く
    render(<App />);

    // When（操作）: 同期サーバーとの接続が切れ、再接続待ちになる（#76 の回帰防止）
    act(() => socket().onclose?.());

    // Then: 告知が role="alert" で出ており、いま何ができないかまで書いてある
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('同期サーバーに接続できません');
    expect(notice).toHaveTextContent('ルームの作成と参加はできません');

    // Then: 実際に押せない（告知と画面の状態が食い違わない）
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeDisabled();
  });

  it('Given 未接続 / When disabled を無視してフォームを直接送信する / Then room.create は送られない', () => {
    // Given（準備）: 玄関を開き、名前を埋める（`displayName` の必須チェックだけでは
    // 通ってしまわないようにする）
    const sendSpy = vi.spyOn(SyncConnection.prototype, 'send');
    render(<App />);
    fireEvent.change(screen.getByLabelText('あなたの名前'), { target: { value: 'あや' } });

    // When（操作）: 接続が切れた状態で、ボタンの disabled を経由せずフォームを直接
    // 送信する（`form.requestSubmit()` や支援技術による送信の代わり）
    act(() => socket().onclose?.());
    const form = screen.getByRole('button', { name: 'ルームを作る' }).closest('form')!;
    fireEvent.submit(form);

    // Then: 押せないはずの操作が、実は効いていない（#76 の回帰防止）。
    // `SyncConnection.send` は未接続でもコマンドを捨てず `pending` へ積んで
    // 復旧後に送るので、ここを直接見ないと「積まれて後で発火する」不具合を見逃す
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('Given error が立っている / When 接続が切れる / Then role="alert" は接続の告知 1 つだけになる', () => {
    // Given（準備）: サーバーからのエラーで error が立っている
    render(<App />);
    act(() => {
      socket().onmessage?.({
        data: JSON.stringify({
          type: 'error',
          code: 'SOMETHING_WRONG',
          message: '予期しないエラーが起きました',
        }),
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('予期しないエラーが起きました');

    // When（操作）: 同期サーバーとの接続が切れる
    act(() => socket().onclose?.());

    // Then: 二重表示にならない（poker の RoomPage.tsx から移した扱い）。
    // 切れている間、error は古い情報なので接続の告知だけが残る
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('同期サーバーに接続できません');
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

  /**
   * 画面へ渡す参加用 URL。**組み立ては画面の責務ではない**（#95 S5b で同期フックへ移した）。
   * 形そのもの（ルート直下の `?room=`）は `@tasuki/sync-client` の単体テストと
   * `tests/hub/use-hub-sync.test.tsx` が見る。ここが見るのは「渡されたものを描くか」である。
   */
  const INVITE_URL = `https://tasuki.example/?room=${encodeURIComponent('朝会モブ-a1b2')}`;

  it('Given 参加済み / When 選択画面を見る / Then ルーム名・参加者・受け取った参加用 URL が出る', () => {
    // Given（準備）: 名簿が届いている
    render(<RoomChoice
        code="朝会モブ-a1b2"
        inviteUrl={INVITE_URL}
        roster={roster}
        connection="online"
      />);

    // When（操作）: 配る URL を読む
    const invite = screen.getByLabelText('参加用 URL');

    // Then: 受け取った URL をそのまま出す（形の正しさは組み立て側の検査が見る）
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('あや');
    expect((invite as HTMLInputElement).value).toBe(INVITE_URL);
  });

  it('Given 参加済み / When 札を見る / Then ルームコードつきの遷移先になる', () => {
    // Given（準備）: 名簿が届いている

    // When（操作）
    render(<RoomChoice
        code="朝会モブ-a1b2"
        inviteUrl={INVITE_URL}
        roster={roster}
        connection="online"
      />);

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
    render(<RoomChoice
        code="朝会モブ-a1b2"
        inviteUrl={INVITE_URL}
        roster={roster}
        connection="online"
      />);

    // Then: 選択画面に居る人（tools が空）には出さない
    const items = screen.getByRole('list', { name: '参加者' }).querySelectorAll('li');
    expect(items[0]?.textContent).toContain('にいます');
    expect(items[1]?.textContent).not.toContain('にいます');
  });

  it('Given 切断中の人 / When 一覧を見る / Then 名簿には残る（消えない）', () => {
    // Given（準備）: 切断は在室そのものを終わらせない（設計正本 §3.13）

    // When（操作）
    render(<RoomChoice
        code="朝会モブ-a1b2"
        inviteUrl={INVITE_URL}
        roster={roster}
        connection="online"
      />);

    // Then
    const items = screen.getByRole('list', { name: '参加者' }).querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[2]?.getAttribute('data-presence')).toBe('offline');
  });

  it('Given 再接続中 / When 選択画面を見る / Then 状態が知らされる', () => {
    // Given（準備）: 接続が切れている状態を渡す
    const props = { code: 'R1', inviteUrl: INVITE_URL, roster, connection: 'reconnecting' } as const;

    // When（操作）/ Then: 選択画面を映すと、状態が読み上げ可能な形で出る
    render(<RoomChoice {...props} />);
    expect(screen.getByText('接続が切れました。再接続しています…')).toHaveAttribute('role', 'status');
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
    render(
      <RoomChoice code="R1" inviteUrl={INVITE_URL} roster={ambiguous} connection="online" />,
    );

    // Then
    expect(screen.getByText('あや（pabc）')).toBeInTheDocument();
    expect(screen.getByText('あや（pefg）')).toBeInTheDocument();
  });
});

/**
 * 退出したことの告知（#95 S5c・I-1）。
 *
 * ツールから退出して戻された人は、**告知が無いと自分が外されたと分からず再参加し、
 * また外される**（Issue #32 が塞いだ問題の再発）。バナーは遷移で失われるので、
 * 理由を URL で運んで玄関が出す。
 */
describe('ツールから退出して戻されたとき', () => {
  it('Given 外された印つきで開いた / When 名乗りの画面が出る / Then 理由が告知される', () => {
    // Given
    window.history.replaceState(null, '', '/?room=ABC123&left=removed');

    // When
    render(<App />);

    // Then: 名乗りの画面に、外されたことと再参加の手立てが出ている
    expect(
      screen.getByText('ルームから退出しました。再参加するには名前を入力してください。'),
    ).toBeInTheDocument();
  });

  it('Given 告知を読んだ / When URL を見る / Then 印は落ちている（再読込で再び出さない）', () => {
    // Given
    window.history.replaceState(null, '', '/?room=ABC123&left=removed');

    // When
    render(<App />);

    // Then: ルームコードは残し、印だけを落とす
    expect(new URL(window.location.href).searchParams.get('left')).toBeNull();
    expect(new URL(window.location.href).searchParams.get('room')).toBe('ABC123');
  });

  it('Given 自分で抜けた印つきで開いた / When ルームを作る画面が出る / Then 抜けたことが告知される', () => {
    // Given: 自分で抜けた人はルームコードを持ち越さない
    window.history.replaceState(null, '', '/?left=self');

    // When
    render(<App />);

    // Then
    expect(screen.getByText('ルームから抜けました。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ルームを作る' })).toBeInTheDocument();
  });

  /**
   * ⚠ **この 1 本は「壊れても赤くならない」ことを実測済みである**（#95 S5c・レビュー ⑤）。
   * この環境の React は初期化子を確かに 2 度走らせる（実測: 初期化子=2・本体=2）が、
   * **採るのは 1 度目の戻り値**なので、印を落とす副作用を初期化子へ戻しても告知は残る。
   * 副作用を effect へ出したのは「純粋な読みに副作用を混ぜない」ためであって、
   * 再現する不具合を塞いだのではない。**その形が守られていることは
   * `tests/hub/departure.test.ts` の「読みは副作用を持たない」が見る。**
   * ここは `StrictMode` の下でも画面が壊れないことの確認に留まる。
   */
  it('Given StrictMode の下で開いた / When 初期化が 2 度走る / Then 告知は消えない', () => {
    // Given
    window.history.replaceState(null, '', '/?room=ABC123&left=removed');

    // When
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Then: 2 度走っても告知は出たままで、印は落ちている
    expect(
      screen.getByText('ルームから退出しました。再参加するには名前を入力してください。'),
    ).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('left')).toBeNull();
  });

  it('対照: Given 印の無い URL / When 開く / Then 告知は出ない', () => {
    // Given（beforeEach が `/` に戻している）

    // When
    render(<App />);

    // Then: 同じ仕込みで、印が無ければ何も出ない
    expect(screen.queryByText(/ルームから/)).not.toBeInTheDocument();
  });
});
