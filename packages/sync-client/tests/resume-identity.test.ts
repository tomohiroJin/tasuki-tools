/**
 * 端末に置く同一性（#95 D12）。**#95 S5b で `apps/landing` からここへ移した**
 * （ハブ・timer・poker の 3 つが同じ鍵を読み書きするため）。
 *
 * - **復帰の組**はルームコード別（S4b で timer が採った形と同じ鍵）
 * - **既定の表示名**はルーム非依存（D12 の後半）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadDefaultDisplayName,
  loadResumeIdentity,
  saveDefaultDisplayName,
  saveResumeIdentity,
  clearResumeIdentity,
  clearLegacyPreferences,
} from '../src/resume-identity.js';

beforeEach(() => {
  localStorage.clear();
});

describe('復帰の組', () => {
  it('Given 保存した組 / When 同じルームで読む / Then そのまま返る', () => {
    // Given（準備）
    const identity = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };
    saveResumeIdentity(identity);

    // When / Then（操作）
    expect(loadResumeIdentity('R1')).toEqual(identity);
  });

  it('Given 別のルームの組 / When 読む / Then null（前のルームへ引き戻さない）', () => {
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });
    expect(loadResumeIdentity('R2')).toBeNull();
  });

  it('Given 壊れた保存値 / When 読む / Then null を返し、その鍵を捨てる', () => {
    // Given（準備）: 誰でも書き換えられる場所なので型注釈を信じない（原則 IV）
    localStorage.setItem('tasuki:resume:R1', '{壊れた');

    // When / Then（操作）: 残すと毎回同じ値で参加に失敗し続ける
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
  });

  it('Given 項目の欠けた保存値 / When 読む / Then null', () => {
    localStorage.setItem('tasuki:resume:R1', JSON.stringify({ code: 'R1', participantId: 'p1' }));
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it('Given 保存した組 / When 破棄する / Then 読めなくなる', () => {
    // Given（準備）: 明示的な退出・セッション喪失で捨てる
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });

    // When（操作）
    clearResumeIdentity('R1');

    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it('Given timer が使う鍵 / When 保存する / Then 同じ綴りで書く（同じ端末で共有する）', () => {
    // Given（準備）: timer は `tasuki:resume:<ルームコード>` に置く（S4b）
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });

    // When / Then（操作）: 鍵が食い違うと、ハブで名乗った人が timer で別人になる
    expect(localStorage.getItem('tasuki:resume:R1')).not.toBeNull();
  });
});

describe('既定の表示名', () => {
  it('Given 名乗った名前 / When 別のルームの初期値を読む / Then 前の名前が出る', () => {
    // Given（準備）: ルーム非依存で置く（D12 の後半）
    saveDefaultDisplayName('あや');

    // When / Then（操作）
    expect(loadDefaultDisplayName()).toBe('あや');
  });

  it('Given 未保存 / When 読む / Then 空文字（フォームの初期値として使える）', () => {
    expect(loadDefaultDisplayName()).toBe('');
  });

  it('Given 空白だけの名前 / When 保存する / Then 残さない', () => {
    // Given（準備）: 次のフォームに空白が入るのを避ける
    saveDefaultDisplayName('   ');

    // When / Then（操作）
    expect(loadDefaultDisplayName()).toBe('');
  });

  /**
   * 鍵の綴りを固定する（#284）。**綴りは既に配布済みの端末との契約である。**
   *
   * ここが唯一の写しであり、玄関側のテストは綴りを書かずに
   * `saveDefaultDisplayName` / `loadDefaultDisplayName` を通す。そうしないと、
   * 鍵を変えたとき**書き込みも読み出しも新しい鍵で揃ってしまい、どのテストも緑のまま
   * 既存利用者の名前だけが消える**（読み書きが対で動く値の、いちばん静かな壊れ方）。
   */
  /**
   * 旧鍵の綴りを固定する（#284）。**玄関はこの綴りを持たない。**
   *
   * 読み手も書き手も #272 で消えているので、綴りそのものが古い端末との唯一の接点である。
   * ここが唯一の写しで、玄関のテストは振る舞い（開くと落ちる）だけを見る。
   */
  it('Given timer 時代の設定が残る端末 / When 片付ける / Then tdd-mob:preferences:v1 が消える', () => {
    // Given（準備）: #272 で読み手も書き手も消えたまま残っている値
    localStorage.setItem('tdd-mob:preferences:v1', '{"displayName":"あや"}');

    // When（操作）
    clearLegacyPreferences();

    // Then: 綴りが変わればここが赤くなる（玄関側は振る舞いしか見ていない）
    expect(localStorage.getItem('tdd-mob:preferences:v1')).toBeNull();
  });

  it('Given 保存した既定の表示名 / When 保管庫を直接見る / Then tasuki:display-name にある', () => {
    // Given（準備）
    saveDefaultDisplayName('あや');

    // When / Then（操作）: ルームコードを含まない 1 本の鍵（D12 の後半）
    expect(localStorage.getItem('tasuki:display-name')).toBe('あや');
  });
});

describe('復帰の組（ルームをまたぐ扱い・#95 S5b で timer から移設）', () => {
  const alice = {
    code: 'ABC123',
    participantId: 'p-1',
    resumeToken: 'resume-token-xyz',
    displayName: 'Alice',
  };

  it('Given 2 つのルームに入った端末 / When それぞれの鍵で読む / Then 2 つのルームの復帰の組を同時に保てる', () => {
    // Given: 2 つのルームに入ったことがある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: 'SECOND', participantId: 'p-2' });

    // When / Then: どちらもそれぞれの鍵で引ける
    expect(loadResumeIdentity('ABC123')?.participantId).toBe('p-1');
    expect(loadResumeIdentity('SECOND')?.participantId).toBe('p-2');
  });

  it('Given 鍵と中身のルームコードが食い違う値 / When 読む / Then 捨てる', () => {
    // Given: 鍵は ABC123 なのに中身は別のルーム（書き換え・実装の取り違え）
    localStorage.setItem('tasuki:resume:ABC123', JSON.stringify({ ...alice, code: 'OTHER1' }));

    // When / Then
    expect(loadResumeIdentity('ABC123')).toBeNull();
  });

  it('Given 2 つのルームの組 / When 片方を破棄する / Then もう片方は残る', () => {
    // Given: 2 つのルームの復帰の組がある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: 'SECOND', participantId: 'p-2' });

    // When
    clearResumeIdentity('ABC123');

    // Then: 消えるのは指定したルームだけである
    expect(loadResumeIdentity('ABC123')).toBeNull();
    expect(loadResumeIdentity('SECOND')?.participantId).toBe('p-2');
  });

  // **FR-006 の撤廃**（#95 D12）。旧実装は sessionStorage に 1 組だけ持っていた。
  it('Given 何も保存されていない端末 / When 保存する / Then localStorage にだけ書く', () => {
    // Given: 何も保存されていない状態（beforeEach で両方 clear 済み）
    // When
    saveResumeIdentity(alice);

    // Then
    expect(localStorage.getItem('tasuki:resume:ABC123')).not.toBeNull();
    expect(sessionStorage.getItem('tasuki:resume:ABC123')).toBeNull();
    // 旧実装の鍵も残さない（移行はしない。トークンは短命で移す価値が無い）
    expect(sessionStorage.getItem('tdd-mob:resume-identity')).toBeNull();
  });
});

/**
 * 保管庫そのものが使えない端末（#284）。
 *
 * **`localStorage` は「必ずある」ものではない。** cookie を全面禁止した Chrome では
 * **読むだけで** `SecurityError` が飛び、容量超過では書き込みが投げる。投げたまま
 * 外へ出すと、呼び手（玄関の描画の初期化子）がそれを踏んで画面ごと落ちる。
 *
 * **使えない保管庫は「何も保存されていない」と同じに扱う。** 端末に覚えられない
 * だけで、名乗って参加すること自体はできる。
 */
describe('保管庫が使えない端末', () => {
  const saved = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
  };

  /** 保管庫へのあらゆる出入りを拒む。 */
  const denyStorage = (): void => {
    const deny = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  };

  afterEach(() => {
    Storage.prototype.getItem = saved.getItem;
    Storage.prototype.setItem = saved.setItem;
    Storage.prototype.removeItem = saved.removeItem;
  });

  it('Given 読めない保管庫 / When 既定の表示名を読む / Then 空文字（投げない）', () => {
    // Given（準備）: 保管庫への出入りが拒まれる端末
    denyStorage();

    // When / Then（操作）: 未保存と同じ扱いにする（玄関の欄はそのまま空で出る）
    expect(loadDefaultDisplayName()).toBe('');
  });

  it('Given 書けない保管庫 / When 既定の表示名を保存する / Then 投げない', () => {
    // Given（準備）
    denyStorage();

    // When / Then（操作）: 覚えられないだけで、名乗って参加すること自体はできる
    expect(() => saveDefaultDisplayName('あや')).not.toThrow();
  });

  it('Given 読めない保管庫 / When 復帰の組を読む / Then null（投げない）', () => {
    // Given（準備）
    denyStorage();

    // When / Then（操作）: 玄関は描画の初期化子でこれを読む。投げると画面が真っ白になる
    expect(loadResumeIdentity('ABC123')).toBeNull();
  });

  it('Given 書けない保管庫 / When 復帰の組を保存する / Then 投げない', () => {
    // Given（準備）
    denyStorage();

    // When / Then（操作）: 入室の応答を受けた瞬間に投げると、選択画面へ進めなくなる
    expect(() =>
      saveResumeIdentity({
        code: 'ABC123',
        participantId: 'p1',
        resumeToken: 't1',
        displayName: 'あや',
      }),
    ).not.toThrow();
  });

  it('Given 消せない保管庫 / When 復帰の組を破棄する / Then 投げない', () => {
    // Given（準備）
    denyStorage();

    // When / Then（操作）: ルーム消滅の知らせを描く途中で投げると、不在の画面が出ない
    expect(() => clearResumeIdentity('ABC123')).not.toThrow();
  });

  it('Given 消せない保管庫 / When timer 時代の設定を落とす / Then 投げない', () => {
    // Given（準備）
    denyStorage();

    // When / Then（操作）: 片付けの失敗は利用者に見せる話ではない
    expect(() => clearLegacyPreferences()).not.toThrow();
  });

  /**
   * **`localStorage` の取得そのものが投げる経路**（#284 の 3 巡目）。
   *
   * 実装の注釈は「参照ごと try の中へ入れる」と宣言しているのに、検査は
   * `Storage.prototype` のメソッドを差し替えているだけで**その経路を再現していなかった**。
   * 誰かが `const ls = localStorage;` を try の外へ括り出しても緑のままになる。
   * cookie を全面禁止した Chrome で実際に起きるのはこちらである。
   */
  it('Given localStorage の取得そのものが投げる端末 / When 読み書きする / Then 投げない', () => {
    // Given（準備）: プロパティの取得で SecurityError が飛ぶ
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });

    try {
      // When / Then（操作）: どの入口も外へ投げない
      expect(loadDefaultDisplayName(), '既定の表示名の読み').toBe('');
      expect(() => saveDefaultDisplayName('あや'), '既定の表示名の書き').not.toThrow();
      expect(loadResumeIdentity('ABC123'), '復帰の組の読み').toBeNull();
      expect(() => clearResumeIdentity('ABC123'), '復帰の組の破棄').not.toThrow();
      expect(() => clearLegacyPreferences(), '旧鍵の片付け').not.toThrow();
    } finally {
      if (original !== undefined) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
