# @tasuki/ui

Tasuki の共通ビジュアル「**夜のカードテーブル**」。深緑のフェルト、象牙のカード、真鍮のアクセント。

**3 アプリすべて（`apps/timer-web` / `apps/poker-web` / `apps/landing`）が使う。**
ただし読む層が違う（下記）。判断の経緯は [ADR-0001](../../docs/adr/0001-design-system-scope.md)。

> かつては「`apps/timer-web` は使わない（Tailwind ベースの別系統のため）」としていた。
> #19 で 3 アプリが 1 つの玄関 LP の下に並び、timer だけ別世界に見えることが
> 問題になったため、#78 でこの判断を見直した。

## 2 層構造

```
src/
  tokens/    変数と @font-face だけ。**素の要素セレクタを置かない**
  elements/  html / body / h1 / button / input / .card を直接飾る
  fonts/     自己ホストの woff2 と OFL
```

| 利用側 | 読むもの | 理由 |
|---|---|---|
| `apps/poker-web` / `apps/landing` | `@import '@tasuki/ui';`（両層） | 素の CSS で組んでいるので要素層がそのまま効く |
| `apps/timer-web` | `@import '@tasuki/ui/tokens.css';`（トークン層だけ） | Tailwind のユーティリティで全操作要素を組んでいる。要素層を読むと `button { 真鍮のグラデーション }` が下地に敷かれ、両者が部分的に上書きし合う |

**この境界は stylelint が機械的に守る。** `src/tokens/` では `selector-max-type` /
`-class` / `-id` を 0 にしてあるので、うっかり `h2 {}` を足すと lint が落ちる。

## 使い方

利用側の CSS の**先頭**で読み込む。固有のスタイルは後に書く（同じ詳細度なら後勝ち）。

```css
@import '@tasuki/ui';

/* ここから下にアプリ固有のスタイル */
```

必要な部分だけ読むこともできる。

```css
@import '@tasuki/ui/tokens.css';    /* 色・書体・角丸・影の変数と @font-face */
@import '@tasuki/ui/elements.css';  /* 素の要素の見た目だけ */
@import '@tasuki/ui/card.css';      /* カード表現だけ */
```

**Tailwind と併用する場合は `@tailwind` より前に置くこと。**
CSS の `@import` は他の規則より前でないと無効になる。

## 書体

**自己ホストする。外部への取得は行わない。**

| ファイル | いつ落ちるか |
|---|---|
| `fraunces-latin-{normal,italic}.woff2` | 常時（数字と見出し） |
| `zkgn-{400,500,700}-base.woff2` | 常時（ASCII・かな・記号・3 アプリが画面に出す漢字） |
| `zkgn-{400,500}-ext.woff2` | 利用者名に base 層外の漢字が出たときだけ |

- Fraunces / Zen Kaku Gothic New はいずれも **SIL Open Font License 1.1**。
  著作権行に Reserved Font Name の宣言が無いので、サブセット化と再配布ができる。
  OFL 全文は `src/fonts/LICENSE-*.txt` に同梱してある
- Fraunces は実使用が `font-weight: 600` のみなのでウェイトを固定した。
  `opsz 9–80` は残す（9.6px のコーナーピップと 80px のワードマークで字形を変えるため）
- **base 層はアプリの表示文字から自動抽出している。** UI 文言を足すと、
  その文字が base 層に無ければ黙って ext 層（+約 210 KB）を引く。
  資材の作り直しは `#78` の作業メモにある `build-fonts.py` を使う

## トークン

| 変数 | 用途 |
|---|---|
| `--felt-950` 〜 `--felt-700` | 卓のフェルト（濃い順） |
| `--ivory` / `--ivory-dim` / `--ivory-faint` | 文字と札の地 |
| `--coal` / `--coal-soft` | 札や真鍮チップの上に載る濃い文字 |
| `--gold` / `--gold-bright` / `--gold-deep` | 真鍮のアクセント（ボタン・見出し・強調） |
| `--rose` / `--rose-bright` | 警告・エラー（`--rose-bright` は暗い地の上で AA を満たす明色版） |
| `--jade` | 正常・成功 |
| `--pewter` | 目盛り・補助 |
| `--line` / `--line-strong` | 罫・枠 |
| `--font-display` / `--font-body` / `--font-mono` | 数字と見出し / 本文 / 等幅 |
| `--font-size-xs` 〜 `--font-size-xl` | 流動的タイポスケール（`clamp`） |
| `--space-1` 〜 `--space-6` | 8px ベースのスペーシング |
| `--radius-sm/md/lg/full` / `--card-radius` | 角丸 |
| `--shadow-card` / `--shadow-popover` | 影 |

> **`--ink` という名前は使わない。** timer-web が `--ink` を「地（最暗）」の意味で
> 260 箇所参照しており、意味が正反対で衝突する。札の上の文字色は `--coal`。
> 復活させると `tests/tokens.test.mjs` が落ちる。

## 約束事

- **`.card` の中の数字は `.card-face` に入れ、コーナーピップは `data-label` 属性で渡す。**
  `::after` が `attr(data-label)` を出す。**読み上げ名が二重になる**ので、
  利用側は `aria-label` を明示すること（実測で確認済み）
- `.card.small` はめくり演出（`flip-in`）を持つが、**遅延は利用側で指定する**
- 動きを抑える設定（`prefers-reduced-motion`）は `elements/reset.css` が一括で面倒を見る
- **フォーカス可視化は `elements/reset.css` のグローバル `:focus-visible` が担う。**
  トークン層だけを読む timer-web は自前で持つ

## 検査

```bash
pnpm --filter @tasuki/ui lint   # stylelint（層の境界と本物の誤り）
pnpm --filter @tasuki/ui test   # node:test（トークンの契約・書体の実在・層の純度）
```

`build` と `typecheck` は持たない（TS を足すまで不要）。

## ここに**入れていない**もの

- **伏せ札の裏模様**: 現時点で poker の座席インジケータ（`.seat-card.facedown`）でしか
  使っておらず、利用者が 1 つしかないため poker 側に残している
