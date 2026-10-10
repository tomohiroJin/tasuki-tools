# ADR-0023: timer は Tailwind を使わず、素の CSS とトークン層・部品層で組む

- **ステータス**: Accepted（2026-10-02）
- **関連**: [#321](https://github.com/tomohiroJin/tasuki-tools/issues/321) /
  設計正本 [`docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`](../superpowers/specs/2026-09-29-timer-without-tailwind-design.md)
- **置き換えるもの**: [ADR-0001](./0001-design-system-scope.md) 決定 1 の「Tailwind のまま維持します」と
  2026-08-11 の追記・2026-09-27 の追記の「要素層を読まない理由は変わらない」 / [ADR-0022](./0022-ui-components-layer.md) 決定 1 の理由・決定 5 の理由・実施状況の #321 の行き先

## 背景

Tailwind を使っているのは timer だけで、poker・玄関・お題ツールは素の CSS と `@tasuki/ui` で組んでいる。
Tailwind が残っていることで、要素層を読まない理由が「ユーティリティと部分的に上書きし合う」になり、
トークン層を CSS の `@import` で読めず（#297）、共通の部品を置くたびに Tailwind のレイヤーとの勝ち負けを考える必要がある。

## 決定

### 1. timer は Tailwind・PostCSS・autoprefixer を使わない

timer の見た目を、素の CSS とトークン層・部品層で組み直し、`tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を
timer の直接の依存から外す。前置詞は、必要な分を Vite（lightningcss）が build の対象に従って付ける。
**決定した。実施は #321 の PR 4。**

### 2. 見た目を変えずに移す

移行の完了条件は、基準（`ba9249d`）と並べて見た目が変わらないこと。出た差は台帳に書いて個別に承認を得る（設計正本 §5.4 の無害の類を除く）。
部品層へ寄せて見た目が変わるもの（ボタンの形・段、入力欄・パネル・招待・Markdown の写し）は #316 へ送る。

### 3. 移行中は画面の CSS を `@layer timer` に入れ、Tailwind のユーティリティより弱く置く

移行の途中に Tailwind と素の CSS が並ぶ間の勝ち負けを、いまと同じに保つため。**PR 4 で外す。**

### 4. 要素層は読まない（理由を差し替える）

見た目を変えない条件のもとで要素層を読ませると、timer のボタンや見出しの一つひとつに、要素層を打ち消す規則が要る。
読ませるかは、ボタンの形を部品層に足すときに決める（#316）。ADR-0022 決定 5 の「要素層を読まない理由」をこれで置き換える。

### 5. 部品層が `@layer` を使わない理由を差し替える

ADR-0022 決定 1 の「部品層は `@layer` を使わない」は維持する。理由を「Tailwind のレイヤー構造に依存しない」から
「部品の勝ち負けは読み込み順と詳細度で決まる」に置き換える。

### 6. 検査の依存の例外

`scripts/audit-timer-classes.mjs` は、ルートの devDependencies の `typescript` で `.tsx` / `.ts` を読む
（`scripts/` の「追加依存は禁止」の慣行の例外。ADR-0022 決定 7 と同じ扱い）。
移行中は、Tailwind のユーティリティ名の判定に `apps/timer-web` の `tailwindcss` を、`tailwind.config.js` を `@config` で
読ませた形で解決して使う。**この判定は PR 4 で Tailwind と一緒に消す。**

## 影響

- timer の CSS は画面単位のファイルに分かれる（`apps/timer-web/src/styles/`）。クラス名は字面で書く
- 移行の間は、基準と並べる比較の仕組み（`e2e/parity/`。除去検査と対照実行の設定を含む）を置く。PR 4 の通しの比較の後で消す
- #321 の間は、timer に触れる他の Issue を main へマージしない（基準が固定なので差が混ざる）
  ただし 2026-10-01 に利用者が認めた例外として、確認ダイアログの再スクロール不具合（`useFocusTrap` の依存の `onClose` が毎回新しく、
  ダイアログを開いている間の再描画のたびに押したボタンへフォーカスが戻って背後がスクロールする）の修正は、#321 とは別の小さな PR で直し、
  比較の仕組みで差 0 件を確かめ、例外と結果を台帳に記録したうえで main へマージしてよい

## この ADR で決めないこと

- 要素層を timer に読ませるか・ボタンの形と段（#316）

## 実施状況（追記・2026-10-07）

#321 は 4 本の PR で実施した。PR 1 = #333（土台）・確認ダイアログの例外 = #336・PR 2 = #343（primitives と 5 画面）・PR 3 = #345（Session）・PR 4 = #346（片付け）。

- 決定 1（Tailwind・PostCSS・autoprefixer を使わない）: PR 4 で依存と設定を外した
- 決定 2（見た目を変えずに移す）: 基準 `ba9249d` と並べる比較で確かめた。承認した差と通しの比較の結果は台帳（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）が正本
- 決定 3（移行中の `@layer timer`）: PR 1〜3 で使い、PR 4 で外した
- 決定 4・5（理由の差し替え）: PR 1 で記録した。現況の記述（`packages/ui` の注釈と README）は PR 4 で揃えた
- 決定 6（検査の依存の例外）: `tailwindcss` を使う判定は PR 4 で外した。`typescript` で `.tsx` / `.ts` を読む例外は残る
- 網羅の確認（設計正本 E8）は、状態を足さずに台帳の記録で受け入れた（設計正本 §7.2・2026-10-06 の利用者の判断）
- 比較の仕組み（`e2e/parity/`）は PR 4 の最後に撤去した。再現の手順は台帳の「PR 4」の節
- 決定 4 の「読ませるかは #316 で決める」: #316 で読ませないと決めた（[ADR 0025](./0025-responsive-layout.md) 決定 6）。本文は書き換えない
