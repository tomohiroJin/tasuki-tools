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
| `apps/timer-web` | `src/index.css` から `@import '@tasuki/ui/tokens.css';` の次に `@import '@tasuki/ui/components.css';`（トークン層と部品層。要素層は読まない） | 要素層を読むと `button { 真鍮のグラデーション }` が下地に敷かれ、見た目を変えないためには timer のボタンや見出しの一つひとつに打ち消す規則が要る。#316 でも読ませないと決めた（ADR 0025 決定 6）。ボタンの見た目は部品層から来る。部品層はクラスを当てたときだけ効くので衝突しない |

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
| `.ui-md` | Markdown の根。各要素に `.ui-md-h`・`.ui-md-p`・`.ui-md-ul`・`.ui-md-ol`・`.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link` を当てる | なし |
| `.ui-page` | 画面の器（`<main>`）。最大幅・中央寄せ・外の余白を持つ。`--prose`（`40rem`）・既定（`72rem`）・`--wide`（`96rem`）の 3 段 | なし |
| `.ui-workspace` | 操作の面と脇を並べる段組みの根。`.ui-workspace-main`（操作の面）・`.ui-workspace-side`（脇）を子に置く。`--side-end`・`--reader` で脇の側と幅を変える。使い方は下の「画面を組む」 | なし |
| `.ui-reader` | 読む面。象牙の札に見出し（固定）と本文 `.ui-reader-body`（札の中でスクロール）を載せる。64rem 未満は本文を 3 行で切り、`.ui-reader-more`（続きを読む）で `.ui-drawer` を開く | なし |
| `.ui-drawer` | 下からせり上がるシート（`<dialog>`）。`.ui-drawer-head`（見出しと閉じる）・`.ui-drawer-body`（スクロールする本文）を持つ。地と字は `.ui-reader` と同じ | なし |

**使い方**

- 読み込み: poker-web / landing / topic-web は `@import '@tasuki/ui';` に含まれます。timer-web は `src/index.css` で
  `@tasuki/ui/tokens.css` の次・画面の CSS の前に `@import '@tasuki/ui/components.css';` を置きます
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
- **Markdown は象牙の札（読む面・シート・お題ツールの `.topic-sheet`）の上に置きます。** コード・引用の枠の色は象牙の上でしか読めません。
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

**画面の CSS の約束**（同じ検査が見る）: アプリの CSS と要素層（`elements/`）にも生の色を書きません。色は
`tokens/` のトークンで書き、語彙（tint / veil / edge など）に近い値は語彙を使います。語彙に相当が無い色は、
役割の名前でトークン層に足します。外すときは規則の直前に `/* ui-exempt: 理由 */` を書きます。

**機械で止めていないもの**: クラス名で書いた写し（例: 入力欄に独自のクラスを当てて同じ見た目を書く）。
新しい画面を作るときは、まずこの表を見てください。

## 画面を組む（#316・ADR 0025）

**新しい画面や機能を足すときは、器の段と区画を選ぶ。** 幅の値と並び替えは書かない。

### 幅の段

| 段 | 幅 | 想定する端末 |
|---|---|---|
| compact | `< 40rem` | スマホの縦持ち |
| medium | `40rem ≤ w < 64rem` | タブレットの縦持ち・小さい窓 |
| wide | `64rem ≤ w < 90rem` | ノート PC |
| ultra | `≥ 90rem` | 大きなモニター |

画面の CSS に `@media` を書くときは、この 3 つの境目だけを範囲構文で書く（`@media (width >= 64rem)`）。
`min-width` / `max-width` / px / em は検査（`scripts/audit-ui-components.mjs`）が落とす。JS で幅を判定するときも
`matchMedia('(width >= 64rem)')` の形で同じ境目を使う。部品の内側の並び替えはコンテナクエリで書いてよい（段の約束の外）。

### 器（`.ui-page`）の選び方

| 画面の用途 | 器 | 最大幅 |
|---|---|---|
| 読む・入力する（名乗る・待つ・見つからない・まとめ） | `.ui-page .ui-page--prose` | `40rem` |
| 選ぶ・一覧する（道具を選ぶ・履歴） | `.ui-page` | `72rem` |
| 道具の部屋（区画を横に並べる） | `.ui-page .ui-page--wide` | `96rem` |

器は `<main>` に当てる。`<main>` を画面ごとに持たない構成では、ページ全体を包む要素に当てる。外の余白も器が持つので、画面の CSS で `<main>` に `padding` や `max-width` を書かない。

### 段組み（`.ui-workspace`）

区画は 2 つ。**操作の面（`.ui-workspace-main`）が画面の主役**で、**脇（`.ui-workspace-side`）が参照するもの**を載せる。
**DOM は狭い幅で見せたい順に書く**（狭い幅ではその順に縦へ積まれ、読み上げの順とも揃う）。64rem 以上で横に並ぶ。

| クラス | 効くこと |
|---|---|
| `.ui-workspace-main` | 操作の面。残りの幅をすべて取る |
| `.ui-workspace-side` | 脇。既定は左・`22rem` |
| `.ui-workspace--side-end` | 脇を右へ置く |
| `.ui-workspace--reader` | 脇を読む面にする。幅を操作の面と釣り合う比（読む面が約 45%）にし、脇を画面に留める（`position: sticky`） |

**選び方（性質で決める）**

- 画面の主役が「読む物（お題の説明など）」と「操作」の両方なら、`--reader` で脇を読む面（`.ui-reader`）にする。既定の `22rem` では 1 行が短すぎる（`--reader` の読む面は最も広い段で 1 行 35 字前後・64rem では約 22 字）
- 脇が参加者の一覧のような細いものなら、既定（`22rem`）のままにする
- 脇を左に置くか右に置くかは**読む順**で決める。読んでから操作するなら左（既定）、操作の合間に横目で見るなら右（`--side-end`）
- 脇が無ければ、操作の面だけが器いっぱいの 1 列になる（空の列は残らない）

**守ること**

- **区画は `.ui-workspace` の直下に置く**（区画を `<form>` などで包むと、並び替えも脇の有無の判定も効かない）
- 脇が既定の `22rem` なら、既定の器（`72rem`）でも 64rem 以上で主は `32rem` 以上残る（器と段の境目の計算で保たれる）
- `--reader` は `--wide` の器で使う。比で分けるので、主は 64rem の画面で約 `30rem` まで縮む（`32rem` は保たれない）
- どの画面がどの器・区画を使っているかは `git grep -n "ui-page\|ui-workspace" apps` で引ける

### 読む面（`.ui-reader`）とシート（`.ui-drawer`）

長さの決まらない文章（お題の説明など）を、操作の面を押し出さずに見せる部品。

```html
<div class="ui-workspace ui-workspace--reader">
  <div class="ui-workspace-side">
    <section class="ui-reader" aria-labelledby="topic-heading">
      <!-- 見出しの容器は画面のクラス（例: poker の .topic-head）。余白・下の区切り線・h2 の margin: 0 と色（--coal-soft）を画面の CSS が持つ -->
      <div class="topic-head">
        <h2 id="topic-heading">お題</h2>
        <h3 id="topic-title">タイトル</h3>
      </div>
      <!-- 本文は名前つきの region にし、tabindex="0" でキーボードから届かせる（64rem 以上で本文が札の中でスクロールするため） -->
      <div class="ui-reader-body" role="region" aria-labelledby="topic-title" tabindex="0">本文</div>
      <!-- 札の上のボタンは --coal 系の色にする（既定の金の字は象牙の地で AA を割る。PR 2 で .ui-button の役割に移す） -->
      <button type="button" class="ui-reader-more">続きを読む</button>
    </section>
  </div>
  <div class="ui-workspace-main">操作の面</div>
</div>
```

（実際の作りは `apps/poker-web/src/components/CurrentTopic.tsx` が正。区画は `<aside>` ではなく `<div>` にする。読む面の `<section>` が名前つきの region になるので、区画で目印を重ねない）

- **64rem 以上**: 読む面は画面の高さに収まり、本文だけが札の中でスクロールする。**ページを伸ばさない**のは、説明が長いと操作が下へ押し出されるため。続きがあることはスクロールバーが知らせる。`.ui-reader-more` は出ない
- **64rem 未満**: 本文を 3 行で切り、`.ui-reader-more` で `<dialog class="ui-drawer">` を `showModal()` で開いて全文を出す。閉じるボタンと Esc で閉じ、開いたボタンへフォーカスを戻すのは画面の側の仕事
- 読む面の見出し行やタブは画面が `.ui-reader` の中に置く（部品は札・本文・続きを読むだけを持つ）
- 札の上の字とボタンは象牙の地で AA を満たす色にする（金は札の上で AA を割る）。フォーカスの輪の色は要素層が持つので、画面で `outline` を書かない
- 画面の文言は書体の base 層に収める（`apps/*/tests/*fits-font-base*` が測る）

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
| `--shadow-card` / `--shadow-popover` / `--shadow-panel` / `--shadow-dialog` / `--shadow-crown` | 影（`--shadow-crown` は `filter` の値） |

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
node scripts/audit-ui-components.mjs  # 部品層の写しと規則・画面の CSS の生の色（リポジトリのルートから実行）
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
