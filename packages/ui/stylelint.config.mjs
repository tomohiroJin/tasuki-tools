/**
 * stylelint の設定。
 *
 * **目的は層の境界の維持**（ADR-0001）であって、書式の統一ではない。
 * `stylelint-config-standard` は色関数の記法や空行まで強制するため、既存 CSS の
 * 全面整形を要求してしまう。#78 の趣旨から外れるので、**本物の誤りだけを見る
 * `recommended`** を土台にする。書式を揃えたくなったら別の Issue で行う。
 */
export default {
  extends: 'stylelint-config-recommended',
  overrides: [
    {
      files: ['src/tokens/**/*.css'],
      rules: {
        // トークン層に要素・クラス・ID を選ばせない。
        // ここが崩れると、トークンだけを読んでいるつもりの timer-web に
        // `button { 真鍮のグラデーション }` のような定義が流れ込み、Tailwind と衝突する。
        'selector-max-type': 0,
        'selector-max-class': 0,
        'selector-max-id': 0,
      },
    },
  ],
  ignoreFiles: ['**/node_modules/**'],
};
