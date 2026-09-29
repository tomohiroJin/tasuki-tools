# @tasuki/ui

Tasuki の共通ビジュアル「**夜のカードテーブル**」。深緑のフェルト、象牙のカード、真鍮のアクセント。

**4 アプリすべて（`apps/timer-web` / `apps/poker-web` / `apps/landing` / `apps/topic-web`）が使う。**
ただし読む層が違う（下記）。判断の経緯は [ADR-0001](../../docs/adr/0001-design-system-scope.md)。

> かつては「`apps/timer-web` は使わない（Tailwind ベースの別系統のため）」としていた。
> #19 で 3 アプリが 1 つの玄関 LP の下に並び、timer だけ別世界に見えることが
> 問題になったため、#78 でこの判断を見直した。

## 3 層構造

```
src/
  tokens/     変数と @font-face だけ。**素の要素セレクタを置かない**
  elements/   html / body / h1 / button / label / .card を直接飾る
  components/ `.ui-` で始まるクラスだけを定義する部品（下記「部品層」）
  fonts/      自己ホストの woff2 と OFL
```

| 利用側 | 読むもの | 理由 |
|---|---|---|
| `apps/poker-web` / `apps/landing` / `apps/topic-web` | `@import '@tasuki/ui';`（3 層とも） | 素の CSS で組んでいるので要素層がそのまま効く |
| `apps/timer-web` | `import '@tasuki/ui/tokens.css';` の次に `import '@tasuki/ui/components.css';`（トークン層と部品層・`main.tsx` から。要素層は読まない） | Tailwind のユーティリティで全操作要素を組んでいる。要素層を読むと `button { 真鍮のグラデーション }` が下地に敷かれ、両者が部分的に上書きし合う。部品層はクラスを当てたときだけ効くので衝突しない |

**この境界は stylelint が機械的に守る。** `src/tokens/` では `selector-max-type` /
`-class` / `-id` を 0 にしてあるので、うっかり `h2 {}` を足すと lint が落ちる。

### 部品層（`components/`・ADR 0022）

`.ui-` で始まるクラスだけを定義する層です。**クラスを当てたときだけ効く**ので、timer-web を含む全アプリが読めます。

| 部品 | 当てる要素 | つまみ |
|---|---|---|
| `.ui-input` | `<input>`・`<textarea>`（1 行・複数行の欄） | `--ui-field-bg` |
| `.ui-select` | `<select>`（一覧は `base-select` でページの中に描く） | `--ui-field-bg`・`--ui-field-hover` |
| `.ui-banner` | 接続の告知の帯の `<p>`。繋がらないときは `.ui-banner--unreachable` を重ねる | なし |
| `.ui-note` | 待ち・知らせ・エラーの一言の `<p>`。エラーは `.ui-note--error` を重ねる | なし |
| `.ui-panel` | 見出しを持つまとまりの面（`<section>`・`<form>`）。地・枠・角丸・内側の余白を持つ | なし |
| `.ui-page-header` | 画面の見出し（h1）と戻る導線を 1 行の両端に組む容器。戻る導線の `<a>` に `.ui-page-header-back` を当てる | なし |
| `.ui-invite` | 参加用 URL とコピーのボタンを 1 行に組む容器。URL の `<span>` に `.ui-invite-url` を当てる | なし |
| `.ui-sheet` | お題の本文を載せる象牙の札。札の上の字の色（`--coal`）まで持つ | なし |
| `.ui-md` | Markdown の根。各要素に `.ui-md-h`・`.ui-md-p`・`.ui-md-ul`・`.ui-md-ol`・`.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link` を当てる | なし |

**使い方**

- 読み込み: poker-web / landing / topic-web は `@import '@tasuki/ui';` に含まれます。timer-web は `main.tsx` で
  `@tasuki/ui/tokens.css` の次・`./index.css` の前に `import '@tasuki/ui/components.css';` を置きます
- 画面が持つのは配置（幅の割り付け・並び・外側の余白）と画面固有の上書きです。**配置もクラスで書きます**
  （画面の CSS で `select` / `input` / `textarea` / `option` の型を含むセレクタを書くと、検査が落とします）
- つまみは画面の `:root` か容器で宣言します。**欄の地を変える画面は、ホバーの地も変えます**（同じ色だと選択の目印が消えます）
- 部品の入力欄の字の大きさは上書きしません（16px の下限）。**部品（`.ui-input` / `.ui-select`）を名指しして字の大きさを書くと検査が落とします。
  画面のクラスで書いた上書きは検査に掛からず、計算後の値を E2E（`expectFieldsAtLeast16px`）が測ります** —— 入力欄を置く画面は E2E で
  `expectFieldsAtLeast16px` を呼んでください
- **帯は上端に貼りつく位置まで部品が持ちます**（配置は画面が持つ、の例外）。地を不透明にする理由が
  「貼りついた帯の下を内容が通る」ことなので、位置と地を分けると片方だけ直ったときに透けます。
  帯は `<p>` に当てます（`<div>` は E2E の文字の走査に入りません）
- **一言は色だけを持ちます。** 字の大きさ・余白・中央寄せなどは画面のクラスで書き、**画面のクラスに色を書きません**
  （画面の CSS は部品より後に読まれるので、同じ詳細度で部品の色に勝ちます）
- **パネルは面だけを持ちます。** 中の並び（grid / flex・間隔）は画面のクラスで書き、**画面のクラスに面の値
  （地・枠・角丸）を書きません**（後に読まれる画面の CSS が勝つので、部品を直しても片側だけ古く残ります）。
  内側の余白は画面のクラスで上書きしてかまいません。地を持たない h2 の金は羅紗の明るいところで AA を割るので、
  見出しを持つまとまりはパネルに載せます
- **見出しの行は、行の中の並びまで部品が持ちます**（配置は画面が持つ、の例外）。見出し自身の大きさ・余白は画面が持ちます
- **招待リンクは、行の並びと字の大きさまで部品が持ちます。** コピーのボタンの見た目は画面が持ちます
- **Markdown は象牙の札（`.ui-sheet`）の上に置きます。** コード・引用の枠の色は象牙の上でしか読めません。
  リンクは札の字の色を継ぐので、画面のクラスで色を書きません。描画（React）は各アプリの `Markdown.tsx` が持ち、
  クラス名は字面で書きます（組み立てた名前は検査が数えられず、死んだ部品として落ちます）

**部品を足す条件**（ADR 0022 決定 2）: 同じ見た目の知識を持つこと・2 画面以上が使うこと。
20 行に満たない重複でも足します。どのアプリも使わない部品は検査が落とします。

**共有部品を使わないとき**（ADR 0022 決定 3）: その規則の直前に `/* ui-exempt: 理由 */` と書きます。
理由の中身は問いません。理由が空の申告と、何も免除していない申告は検査が落とします。
外している箇所の一覧は `git grep ui-exempt` で引けます。

**部品の CSS の約束**（`scripts/audit-ui-components.mjs` が見る）: セレクタは `.ui-` のクラスから始める・
入れ子と `@scope` / `@layer` を使わない・`::picker(select)` を一覧に同居させない・`outline` を書かない
（例外は選択肢の `outline: none`）・つまみを宣言しない（既定値は `var()` の第 2 引数）・生の色を書かない。
字の大きさは同じ行の `/* scale-exempt: 理由 */` つきで書きます。

**機械で止めていないもの**: クラス名で書いた写し（例: 入力欄に独自のクラスを当てて同じ見た目を書く）。
新しい画面を作るときは、まずこの表を見てください。

## 使い方

利用側の CSS の**先頭**で読み込む。固有のスタイルは後に書く（同じ詳細度なら後勝ち）。

```css
@import '@tasuki/ui';

/* ここから下にアプリ固有のスタイル */
```

必要な部分だけ読むこともできる。

```css
@import '@tasuki/ui/tokens.css';      /* 色・書体・角丸・影の変数と @font-face */
@import '@tasuki/ui/elements.css';    /* 素の要素の見た目だけ */
@import '@tasuki/ui/card.css';        /* カード表現だけ */
@import '@tasuki/ui/components.css';  /* `.ui-` の部品だけ */
```

**Tailwind 4（`@tailwindcss/postcss`）と併用する場合は、CSS から `@import` しない。**
JS の入口（`main.tsx` など）で、アプリの CSS より先に `import '@tasuki/ui/tokens.css'` と読む。
Tailwind が `@import` を展開すると、入れ子の `fonts.css` の `url('../fonts/…')` の基準が
付け替えられず、Vite は解決できないまま素通しする（ビルドに `didn't resolve at build time`
の警告が出る）。timer-web はこれで**書体が 1 本も読めていなかった**（#297）。

## 書体

**自己ホストする。外部への取得は行わない。**

| ファイル | いつ落ちるか |
|---|---|
| `fraunces-latin-{normal,italic}.woff2` | 常時（数字と見出し） |
| `zkgn-{400,500,700}-base.woff2` | 常時（ASCII・かな・記号・4 アプリが画面に出す漢字） |
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

### アクセントの派生

**α の数値をコンポーネントに直書きさせないための語彙。** 同じ「薄い敷き」を
`0.10` / `0.12` / `0.14` / `0.15` と書き分けても意味は無く、パレットを入れ替えたときに
一斉に追従できなくなるだけだった（#78 で実際に 62 箇所が旧パレットのまま取り残された）。

| 接尾辞 | 役割 | 例 |
|---|---|---|
| `-tint` | 下地の淡い敷き | `--gold-tint` / `--jade-tint` / `--rose-tint` |
| `-veil` | 中間の膜 | `--gold-veil` / `--jade-veil` / `--rose-veil` |
| `-edge` | 縁取り・リング | `--gold-edge` / `--jade-edge` / `--rose-edge` |
| `-lift` | ホバーで一段持ち上げる実色 | `--gold-lift` / `--jade-lift` / `--rose-lift` |
| `on-` | その実色の上に載せる文字 | `--on-gold` / `--on-jade` / `--on-rose` |
| `-pale` | tint の上に載せる、色味を保った明るい文字 | `--rose-pale` |
| `-glow` | 発光（`drop-shadow` 用） | `--rose-glow` |

面の派生は `--felt-lift`（ホバー面）/ `--felt-scrim`（全画面の暗幕）/
`--felt-shade`（背後を残す幕）/ `--ivory-inset`（最も淡い象牙）。

**新しい α を足す前に、既存の 3 段（tint / veil / edge）で表せないかを疑うこと。**

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
  要素層を読まない timer-web は自前で持つ（部品層もリングを持たない・ADR 0022 決定 4）

## 検査

```bash
pnpm --filter @tasuki/ui lint       # stylelint（層の境界と本物の誤り）
pnpm --filter @tasuki/ui test       # node:test（トークンの契約・書体の実在・層の純度）
node scripts/audit-ui-components.mjs  # 部品層の写しと規則（リポジトリのルートから実行）
```

`build` と `typecheck` は持たない（TS を足すまで不要）。

## ここに**入れていない**もの

- **伏せ札の裏模様**: 現時点で poker の座席インジケータ（`.seat-card.facedown`）でしか
  使っておらず、利用者が 1 つしかないため poker 側に残している

## 書体の大きさ

**`font-size` は 5 段のトークン（`--font-size-xs` 〜 `-xl`）を使う。**
直値を書くと `tests/typography-scale.test.mjs` が落ちる。

5 段のどれにも当てはまらない大きさが要るときは、**同じ行に理由を書いて例外にする**。

```css
  font-size: 0.6rem; /* scale-exempt: 札のコーナーピップ。ADR-0001 が 9.6px を名指ししている */
```

- **印だけでは通らない。** `scale-exempt:` の後ろに理由が要る
- **理由は宣言と同じ行に置く。** 離すと片方だけが動く
- **1 行に複数の宣言を書く場合、免除のコメントは免除したい宣言の直後・次の宣言の
  手前に置く。** 判定は宣言ごとに行うため、置き場所を誤ると別の宣言への免除と
  誤認される
- 「直すのが面倒」を例外の理由にしない
- 現在の例外は `grep -rn 'scale-exempt' packages/ui/src` で数える（件数をここに書かない。
  例外が増減してもこの文書が黙って古くなる）

判断の経緯は
[設計正本](../../docs/superpowers/specs/2026-09-20-ui-typography-scale-design.md)。
