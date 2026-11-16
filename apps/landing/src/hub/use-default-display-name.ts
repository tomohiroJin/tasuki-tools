/**
 * 名乗りの欄の既定と、端末の片付け（#284・#595 で `use-hub-sync.ts` から分けた）。
 *
 * 接続とは関わらない責務なので、同期フックから離してある。
 */
import { useEffect, useMemo } from 'react';
import { clearLegacyPreferences, loadDefaultDisplayName, saveDefaultDisplayName } from '@tasuki/sync-client';
import { usableDefaultDisplayName } from './default-display-name.js';

/**
 * 名乗るフォームの初期値（前に名乗った名前）を返し、玄関を開いたときに端末を片付ける。
 *
 * **読むのは読み込みの 1 度だけ。** 以後の書き換えは画面側の `useState` が持つ（EARS 4）。
 * 描画のたびに読み直すと、入力中の値を保存値で上書きしてしまう。
 */
export function useDefaultDisplayName(): string {
  /**
   * 読み込みの時点で端末に入っていた表示名（FR-053 / FR-054・#284）。
   *
   * **読むだけで、書かない。** 保管庫への書き込みは下の `useEffect` が受け持つ
   * （**初期化子に副作用を混ぜない**）。ここに `removeItem` / `setItem` を混ぜると、
   * `StrictMode` が初期化子を 2 度走らせるテストと、持たない本番（`main.tsx`）とで
   * **読む対象が変わりうる**。
   */
  const storedDisplayName = useMemo(() => loadDefaultDisplayName(), []);
  const defaultDisplayName = useMemo(
    () => usableDefaultDisplayName(storedDisplayName),
    [storedDisplayName],
  );

  /**
   * 端末の片付け（#284）。**片付け専用の経路は作らない**（憲法 原則 X）ので、
   * 玄関を開くたびに通るここへ 2 つを相乗りさせている:
   *
   * 1. **提示できない保存値を、その鍵ごと捨てる。** 残すと玄関を開くたびに同じ値で
   *    弾かれ続ける（`resume-identity.ts` の壊れた組と同じ扱い）
   * 2. timer 時代の設定を落とす（`clearLegacyPreferences`。鍵の綴りと、保管庫が
   *    使えない端末での握り潰しは `@tasuki/sync-client` に 1 箇所だけ置いてある）
   *
   * **捨てる以外の書き込みはしない**（#284 のレビュー所見 3）。提示できる値まで
   * 正規形で上書きすると、**利用者の保存値を黙って書き潰す**。`normalizeDisplayName` の
   * 巻き添え（`display-name.ts` の `LABEL_MARKER` が既知として挙げる
   * `"会社 (ID: 部署)"` → `"会社"`）を覚えている端末では、玄関を開いた瞬間に
   * 元の値が失われ、手で直す手掛かりごと消える。EARS 3 が求めているのは
   * 「**提示できない値を捨てる**」ことだけである。
   *
   * **何度走っても同じ結果になる。** することは「消す」だけで、消去は冪等である
   * （`StrictMode` は effect を 2 度走らせる）。
   */
  useEffect(() => {
    clearLegacyPreferences();
    // 空文字を渡すと鍵ごと消える（`saveDefaultDisplayName` の約束）。
    if (defaultDisplayName === '' && storedDisplayName !== '') saveDefaultDisplayName('');
  }, [storedDisplayName, defaultDisplayName]);

  return defaultDisplayName;
}
