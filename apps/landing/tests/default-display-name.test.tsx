/**
 * 前回の名乗りを既定として自動提示する（#284・FR-053 / FR-054 の移管先）。
 *
 * **保管庫を覗いて満足しない。** 「`localStorage` を触った」だけを見る検査は、
 * 正しい実装と誤った実装で同じ値を返す（保存はできているのに画面へ出ない、という
 * いちばん起きやすい壊れ方を通してしまう）。ここでは**名乗る → 玄関を開き直す**の
 * 往復を通し、**次の描画で欄に現れるところまで**を見る。
 *
 * ## 「空欄になる」だけを期待値にしない
 *
 * 壊れた保存値の検査は、期待値が「空欄」なので**「保存が無い端末」の検査と見分けが
 * 付かない**。鍵の綴りが変われば書き込みは誰も読まない鍵へ行き、読み出しは元から
 * `null` を返すので、**提示の経路が丸ごと壊れていても緑になる**。そこで 2 つを課している:
 *
 * 1. **鍵の綴りを写さない。** 置くのも確かめるのも `@tasuki/sync-client` の
 *    `saveDefaultDisplayName` / `loadDefaultDisplayName`（製品コードと同じ入口）を通す。
 *    綴りそのものは `packages/sync-client/tests/resume-identity.test.ts` が固定している
 * 2. **同じ経路に正当な値を置いた対照を先に置く。** 提示が生きていることを見せてから
 *    壊れた値を置く。経路が死んでいれば対照が赤くなる
 *
 * **旧鍵の綴りは {@link LEGACY_KEY} の 1 箇所だけに置く。** 4 箇所へ写していたのを
 * 畳んだ（3 巡目のレビュー）。この値だけは製品コードの入口を通して置けない ——
 * 読み手も書き手も #272 で消えており、綴りそのものが古い端末との唯一の接点である。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { loadDefaultDisplayName, saveDefaultDisplayName } from '@tasuki/sync-client';
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

/**
 * timer 時代の設定の鍵。
 *
 * **綴りの正本と、それを固定する検査は `@tasuki/sync-client` にある**
 * （`clearLegacyPreferences` と `tests/resume-identity.test.ts`）。ここに写しが 1 つだけ
 * 要るのは、**この値には書き手が存在せず、製品コードの入口を通して置けない**ためである。
 */
const LEGACY_KEY = 'tdd-mob:preferences:v1';

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
    // Given（対照）: **同じ鍵・同じ入口**に正当な値を置くと提示される。
    // これが赤なら、以下の「空欄」は経路が死んでいるだけかもしれない
    saveDefaultDisplayName('あや');
    const control = render(<App />);
    expect(nameField(), '対照: 正当な保存値は提示される').toHaveValue('あや');
    control.unmount();

    // Given（準備）: 同じ入口に上限超えの値を置く。`maxLength` は**打ち込みしか
    // 止めない**ので、初期値として入るとそのまま送信でき、サーバーは理由を伏せた
    // 文言で弾く —— 利用者には直しようが無い
    saveDefaultDisplayName('あ'.repeat(MAX_DISPLAY_NAME + 10));

    // When（操作）
    render(<App />);

    // Then: 空欄で、エラーも出ない（EARS 3）
    expect(nameField()).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();

    // Then: **残さない。** 残すと玄関を開くたびに同じ値で弾かれ続ける
    // （`resume-identity.ts` の壊れた組と同じ扱い）
    expect(loadDefaultDisplayName()).toBe('');
  });

  it('Given 幅を持たない文字だけの保存値 / When 玄関を開く / Then 空の欄になり、その値は残らない', () => {
    // Given（対照）: 提示の経路が生きていることを先に見せる
    saveDefaultDisplayName('あや');
    const control = render(<App />);
    expect(nameField(), '対照: 正当な保存値は提示される').toHaveValue('あや');
    control.unmount();

    // Given（準備）: U+200B は `trim()` では落ちないので**保存の入口も通る**。
    // 画面には何も見えないままサーバーへ飛び、`EmptyAfterNormalize` で弾かれる
    saveDefaultDisplayName('\u200b');
    expect(loadDefaultDisplayName(), '保存の入口を通ること').toBe('\u200b');

    // When（操作）
    render(<App />);

    // Then
    expect(nameField()).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(loadDefaultDisplayName()).toBe('');
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
      LEGACY_KEY,
      JSON.stringify({ displayName: 'あや', language: 'ja', difficulty: 'normal', members: [], intervalMinutes: 10 }),
    );

    // When（操作）: 玄関を開く（新しい既定を読むついでに落とす。片付け専用の経路は作らない）
    render(<App />);

    // Then
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('Given timer 時代の設定が残る端末 / When 玄関を開く / Then その表示名は引き継がない', () => {
    // Given（準備）: 移行はしないと決めた（#284）。読み手も書き手も既に無く、
    // 個人に紐づく値を新しい鍵へ移してまで生かす理由が無い
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ displayName: 'あや' }));

    // When（操作）
    render(<App />);

    // Then: 空欄から始まる（**消すことと移すことを取り違えていない**）
    expect(nameField()).toHaveValue('');
    expect(loadDefaultDisplayName()).toBe('');
  });

  /**
   * 提示できる値は書き潰さない（#284・レビュー所見 3）。
   *
   * EARS 3 が求めているのは「**提示できない値を捨てる**」ことだけである。提示できる値まで
   * 正規形で上書きすると、利用者の保存値が玄関を開いた瞬間に**不可逆に**置き換わる。
   * `"会社 (ID: 部署)"` は `display-name.ts` の `LABEL_MARKER` が**既知の巻き添え**として
   * 挙げている形で、正規化すると `"会社"` になる —— 書き戻すと、欄に元の値を出して
   * 手で直してもらう道が消える。
   */
  it('Given 正規化で縮む保存値 / When 玄関を開く / Then 欄は正規形だが、保管庫は書き潰さない', () => {
    // Given（準備）: 正規化で切り落とされるが、提示はできる値
    const original = '会社 (ID: 部署)';
    saveDefaultDisplayName(original);

    // When（操作）
    render(<App />);

    // Then: 欄には送って通る形が出る
    expect(nameField(), '欄').toHaveValue('会社');
    // Then: **保管庫はそのまま**（次に開いたときも手で直せる）
    expect(loadDefaultDisplayName(), '保管庫').toBe(original);
  });

  /**
   * 描画フェーズでは保管庫へ書かない（#284・レビュー所見 2）。
   *
   * `renderToStaticMarkup` は**描画フェーズだけ**を走らせ、effect を走らせない。
   * ここで書き込みが起きていれば、それは初期化子（`useMemo` / `useState`）の中で
   * 書いているということである —— `App.tsx` が「初期化子に副作用を混ぜない」と
   * 明記している規範に反し、`StrictMode` が初期化子を 2 度走らせるテストと、
   * `StrictMode` を持たない本番（`src/main.tsx`）とで**読む対象が変わりうる**。
   */
  it('Given 提示できない保存値 / When 描画フェーズだけ走らせる / Then 保管庫は書き換わらない', () => {
    // Given（準備）: 片付け（鍵の削除）と書き直しの両方が起きうる状態にする
    saveDefaultDisplayName('\u200b');
    localStorage.setItem(LEGACY_KEY, '{}');

    // When（操作）: effect を走らせずに描画する
    const markup = renderToStaticMarkup(<App />);

    // Then（対照）: 描画そのものは成立している（空振りで緑になっていない）
    expect(markup).toContain('Tasuki');
    // Then: 保管庫はどちらも触られていない。片付けるのは effect の仕事である
    expect(loadDefaultDisplayName(), '既定の表示名').toBe('\u200b');
    expect(localStorage.getItem(LEGACY_KEY), '旧鍵').toBe('{}');
  });

  /**
   * `StrictMode` と本番で結果が割れないこと（#284・レビュー所見 2）。
   *
   * `StrictMode` は初期化子と effect を 2 度走らせる。**本番（`src/main.tsx`）には
   * `StrictMode` が無い**ので、初期化子の中で保管庫を書き換えていると
   * 「2 度目が書き換え後を読む」テストと「1 度しか読まない本番」で**欄の値が割れる**。
   * 実際、正規化が冪等でなかった頃は割れていた（ラベルを復活させる値で、
   * テストは `Bob`・本番は `Bob(ID: rqdK)` になる）。
   */
  it.each([
    ['正当な名前', 'あや'],
    // 制御文字でラベルの見出しを割る値。#284 で正規化の順序を直すまで冪等でなかった
    ['ラベルを復活させかけた値', 'Bob（I\u0008D: rqdK）'],
    ['前後に空白のある値', '  あや さん  '],
  ])('Given %s / When StrictMode の有無で開く / Then 欄の値も保管庫も一致する', (_name, stored) => {
    // Given（準備）: 同じ保存値から始める
    saveDefaultDisplayName(stored);
    const plain = render(<App />);
    const plainValue = nameField().value;
    const plainStored = loadDefaultDisplayName();
    plain.unmount();

    // When（操作）: 同じ保存値を置き直して `StrictMode` で開く
    localStorage.clear();
    saveDefaultDisplayName(stored);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Then: 見えるものも残るものも同じ
    expect(nameField().value, '欄の値').toBe(plainValue);
    expect(loadDefaultDisplayName(), '保管庫に残る値').toBe(plainStored);
  });
});
