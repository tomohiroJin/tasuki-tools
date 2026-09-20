/**
 * 端末に残っていた表示名を、既定として提示してよいか（#284・FR-053 / FR-054 の EARS 3）。
 *
 * **ここは純粋判断だけを見る。** 保管庫の読み書きと画面への現れ方は
 * `tests/default-display-name.test.tsx` が画面ごしに見る。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_DISPLAY_NAME, MAX_NFKC_EXPANSION, normalizeDisplayName } from '@tasuki/room-core';
import { usableDefaultDisplayName } from '../../src/hub/default-display-name.js';

/**
 * 正規化そのものは本物を使い、**呼ばれたかどうかだけ**を見えるようにする。
 *
 * 前段の緩い上限（{@link MAX_DISPLAY_NAME} × {@link MAX_NFKC_EXPANSION}）の狙いは
 * 「巨大な保存値で正規化を走らせない」ことであり、**戻り値では確かめられない**
 * （段が有っても無くても空文字になる）。差が出るのは「走ったかどうか」だけである。
 */
vi.mock('@tasuki/room-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tasuki/room-core')>();
  return { ...actual, normalizeDisplayName: vi.fn(actual.normalizeDisplayName) };
});

beforeEach(() => {
  vi.mocked(normalizeDisplayName).mockClear();
});

describe('既定として提示してよい表示名', () => {
  it('Given 前に名乗った名前 / When 検める / Then そのまま提示してよい', () => {
    // Given / When / Then: 自分が書いた値は、そのまま次の初期値になる
    expect(usableDefaultDisplayName('あや')).toBe('あや');
  });

  it('Given 未保存（空文字） / When 検める / Then 空のまま', () => {
    // Given（準備）: `loadDefaultDisplayName` は未保存を空文字で返す
    expect(usableDefaultDisplayName('')).toBe('');
  });

  it('Given 空白だけの値 / When 検める / Then 空にする（押しても何も起きない欄を出さない）', () => {
    // Given（準備）: 手で書き込まれた値。`required` は素通りするが、画面の
    // 送信判定（`displayName.trim() === ''`）が黙って弾くので、**ボタンが死ぬ**
    expect(usableDefaultDisplayName('   ')).toBe('');
  });

  it('Given 幅を持たない文字だけの値 / When 検める / Then 空にする', () => {
    // Given（準備）: U+200B は `trim()` では落ちず、画面には何も見えないまま
    // サーバーへ飛んで `EmptyAfterNormalize` で弾かれる
    expect(usableDefaultDisplayName('\u200b')).toBe('');
  });

  it('Given 上限ちょうどの値 / When 検める / Then そのまま提示してよい', () => {
    // Given（準備）: 境界の内側。**ここを落とすと正当な名前が消える**
    const name = 'あ'.repeat(MAX_DISPLAY_NAME);

    // When / Then
    expect(usableDefaultDisplayName(name)).toBe(name);
  });

  it('Given 上限を 1 文字超える値 / When 検める / Then 空にする（弾かれる値を提示しない）', () => {
    // Given（準備）: `maxLength` は**打ち込みしか止めない**。初期値として入れた値は
    // そのまま送信でき、サーバーは理由を伏せた文言で弾く
    // （`apps/tasuki-sync/src/application/display-name-rule.ts`）
    expect(usableDefaultDisplayName('あ'.repeat(MAX_DISPLAY_NAME + 1))).toBe('');
  });

  it('Given 正規化で縮む値 / When 検める / Then 正規形を提示する（名前ごと捨てない）', () => {
    // Given（準備）: 前後の空白・畳める空白は直せる。直せるものまで空にすると、
    // 利用者は理由も分からず名前を失う
    expect(usableDefaultDisplayName('  あや  さん ')).toBe('あや さん');
  });

  it('Given 正規化してから上限を超える値 / When 検める / Then 空にする', () => {
    // Given（準備）: NFKC は 1 文字を最大 `MAX_NFKC_EXPANSION` 文字へ広げる。
    // **上限は正規化の後に効かなければ意味がない**（`display-name.ts` の正本と同じ理由）
    expect(usableDefaultDisplayName('ﷺ'.repeat(MAX_DISPLAY_NAME))).toBe('');
  });

  /**
   * 前段の緩い上限（#284・レビュー所見 3）。正本 `applyDisplayNameRule` と揃える。
   *
   * ここは**描画フェーズ**で走る。保管庫は誰でも書き換えられるので上限いっぱい
   * （5M 文字）の値を置け、実測で 292ms かかった（入れ子ラベル 20 段 × 5M 文字）。
   * 固まりはしないが、玄関を開くたびに払う必要のない代金である。
   */
  describe('前段の緩い上限', () => {
    /** 前段を素通りする長さの値（後段で落ちる）。 */
    const underCap = 'a'.repeat(MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION);
    /** 前段で落ちる長さの値。 */
    const overCap = 'a'.repeat(MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION + 1);

    it('Given 前段を超える値 / When 検める / Then 正規化を走らせずに空にする', () => {
      // When（操作）
      expect(usableDefaultDisplayName(overCap)).toBe('');

      // Then: **戻り値では差が出ない**ので、走ったかどうかを見る
      expect(vi.mocked(normalizeDisplayName)).not.toHaveBeenCalled();
    });

    it('Given 前段ちょうどの値 / When 検める / Then 正規化は走る（境界の内側）', () => {
      // Given（対照）: 段を「常に落とす」に壊すと、ここが赤くなる
      expect(usableDefaultDisplayName(underCap)).toBe('');

      // Then
      expect(vi.mocked(normalizeDisplayName)).toHaveBeenCalledTimes(1);
    });
  });
});
