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
    {
      files: ['src/tokens/fonts.css'],
      rules: {
        // stylelint-config-recommended 18 で新規に入った規則だが、**長大な
        // unicode-range に対して偽陽性を出す**ため、このファイルに限って無効にする。
        // 実測（2026-08-11・stylelint 17.14.1）:
        //   - 短い unicode-range（U+00A0, U+4E01, U+FF61-FF65）→ 通る
        //   - 明らかに不正な値（totally-not-a-range）→ 正しく検出される
        //   - 本ファイルの日本語サブセット（数千レンジ）→ csstree が
        //     `[csstree-match] BREAK after 15000 iterations` で照合を打ち切り、
        //     その結果を「Unknown value」として報告する
        // 値そのものは正当なので、規則ではなく照合器の限界である。
        // 記述名の検査（at-rule-descriptor-no-unknown）は有効なまま残す。
        'at-rule-descriptor-value-no-unknown': null,
      },
    },
  ],
  ignoreFiles: ['**/node_modules/**'],
};
