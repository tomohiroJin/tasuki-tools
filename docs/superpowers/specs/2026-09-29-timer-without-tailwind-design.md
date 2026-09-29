# timer から Tailwind を外し、素の CSS と `@tasuki/ui` で組む（#321）— 設計正本

- **Issue**: [#321](https://github.com/tomohiroJin/tasuki-tools/issues/321)
- **日付**: 2026-09-29　**実測時点**: main `ba9249d`
- **関連 Issue**: [#320](https://github.com/tomohiroJin/tasuki-tools/issues/320)（部品層・完了）/
  [#316](https://github.com/tomohiroJin/tasuki-tools/issues/316)（ボタンの形と段組みの段）/
  [#297](https://github.com/tomohiroJin/tasuki-tools/issues/297)（書体の `url()` が解決されなかった件）
- **前提となる ADR**: [`docs/adr/0001`](../../adr/0001-design-system-scope.md)（デザインシステムの層構造）/
  [`docs/adr/0022`](../../adr/0022-ui-components-layer.md)（部品層。決定 5 が ADR 0001 決定 1 を置き換えた）/
  [`docs/adr/0013`](../../adr/0013-pr-granularity.md)（PR の粒度）

**この文書の位置づけ**: 設計の正本はこの文書である。Issue 本文の「決めること」3 点と、対話で出た判断（§1.2）を反映した。

## 1. 目的と方針

### 1.1 目的

`apps/timer-web` だけが Tailwind を使っているため、デザインシステムに次の制約がかかっている（Issue 本文の背景）。

- 要素層を読まない理由が「Tailwind のユーティリティと部分的に上書きし合う」になっている（ADR 0001 決定 1 → ADR 0022 決定 5）
- トークン層を CSS の `@import` で読めず、`main.tsx` から JS で読んでいる（#297）
- 共通の部品を置くたびに、Tailwind のレイヤーとの勝ち負けを考える必要がある

timer を素の CSS と `@tasuki/ui`（トークン層・部品層）で組み直し、Tailwind・PostCSS・`autoprefixer` を依存から外す。

### 1.2 利用者の判断（2026-09-29）

| 論点 | 判断 |
|---|---|
| 見た目を変えないことを完了の条件にするか | **変えない。** main と並べて差分ゼロを目指す。出た差は一覧にして個別に承認を得る。部品層へ寄せて見た目が変わるもの（ボタンの形・段）は #316 に任せる |
| 要素層を timer に読ませるか | **この Issue では読ませない。** 読ませない理由を「Tailwind と衝突する」から「計器の語彙とボタンの形が違う（ADR 0001 決定 5）」に書き換える。読ませるかは #316 で判断し直す |
| 素の CSS の書き方 | **画面・部品ごとに意味のあるクラス名を付け、CSS は画面単位のファイルに分ける**（poker・玄関・お題ツールと同じ書き方）。自前のユーティリティ CSS・CSS Modules は採らない |
| PostCSS と `autoprefixer` | **まとめて外す**（他の 3 アプリと同じ構成にする）。前置詞が要らないことはビルド出力で確かめる |
| 刻み方 | **移行中は新しい CSS を `@layer timer` に入れ、Tailwind のユーティリティより弱く置く。** 土台と primitives → 画面 → Session → 片付けの 4 本に刻む |

### 1.3 範囲に入れないもの

- 見た目の変更（ボタンの形・大きさの段・最大幅・段組みの段は #316）
- 要素層を timer に読ませること（#316 で判断）
- 過去の記録（`docs/plans/`・`docs/superpowers/plans|specs/`・`docs/retrospectives/`）の Tailwind への言及。当時の事実なので書き換えない
- 本番への配布（利用者が決める）

## 2. 実測した事実（main `ba9249d`）

- 依存: `tailwindcss`・`@tailwindcss/postcss`（`^4.3.3`）・`autoprefixer`（`^10.4.20`）・`postcss`（`^8.5.25`）。いずれも `apps/timer-web` の devDependencies
- 使っている量: `apps/timer-web/src` の **29 ファイル**に `className=` の行が **352 行**。任意値 `[var(--…)]` を含む行が **183 行**。`sm:` 15・`md:` 8・`lg:` 8 か所（Issue 本文は `7d4a203` の時点で `md:` 10 と数えた。差の理由は追っていない）
- `primitives.tsx`（`Stage`・`Card`・`PrimaryButton`・`GhostButton`・`IconButton`・`SectionHeader`）を 15 ファイルが使う。**呼び出し側が `className` で上書きしている箇所がある**（同じ行で数えただけで 19。複数行の JSX は含まない）
- `src/index.css`（309 行）は Tailwind の読み込み・計器の語彙の別名・`html` / `body`・`.instrument-stage`・`.instrument-label`・`.tabular`・アニメーションを持つ。すでに素の CSS で書かれた部分がある
- `presence.ts` は在室状況の色を Tailwind のクラス名（`bg-presence-online` など）で返す
- Tailwind に触れているコード・検査・README・ADR: `apps/timer-web` の `package.json`・`postcss.config.js`・`tailwind.config.js`・`src/index.css`・`src/main.tsx`・`src/ui/presence.ts`・`src/ui/use-breakpoint.ts`・`test/ui/design-tokens.test.ts`／`apps/topic-web/src/index.css`／`packages/ui` の `README.md`・`src/elements/index.css`・`src/tokens/index.css`・`src/tokens/palette.css`・`stylelint.config.mjs`・`tests/tokens.test.mjs`／`scripts/audit-ui-components.mjs`／ADR 0001・0022（`git grep -il tailwind` で拾う。ここに書いた一覧は PR 4 の時点で引き直す）
- 変異パッチのうち 27 本が `apps/timer-web/src` を触る。クラス名の行を文脈に持つものは当たらなくなる

## 3. 決定

### D1. CSS の置き場と命名

- `src/index.css` は**入口だけ**にする（読み込み順とレイヤーの宣言）。中身は `src/styles/` に分ける
  - `base.css`: 計器の語彙の別名・`html` / `body`・`:focus-visible`・`.sr-only`・ステージ・計器ラベル・`.tabular`・アニメーション（いまの `index.css` の中身）
  - `primitives.css`: `primitives.tsx` の部品
  - 画面ごと: `lobby.css`・`session.css`・`summary.css`・`history.css`・`loading.css`・`session-lost.css`。Session の子の部品は `session-*.css`（例: `session-roster.css`）。2 画面以上が使う部品（`InvitePanel`・`PassphrasePanel`・`TopicCard`・`NotifySettingsPanel` など）は部品名のファイル
- クラス名は意味で付ける（`.summary-stats`・`.roster-row` など）。接頭辞は付けない。`.ui-`（部品層）と、既存の `.instrument-*`・`.chrono-*`・`.animate-*`・`.boot-reveal`・`.brand-title`・`.driver-name-fluid` と衝突させない
- 修飾は BEM に寄せすぎず、poker の書き方（`.room header h1` のような子孫セレクタ・状態は属性か修飾クラス）に合わせる
- 値の分岐（在室状況・難易度・計測中など）は、クラス名を組み立てずに**字面のクラス名**か `data-*` 属性で書く（#320 の教訓: 組み立てたクラス名は死んだ部品の検査が数えない）

### D2. 値の書き方

- 色・余白・角丸・影・書体・文字の大きさは、トークン（計器の語彙の別名を含む）で書く
- **生の色は書かない。** いまの `.tsx` に書かれた影（`rgba(0,0,0,0.5)` など）は、値を変えずに `packages/ui` の `tokens/shape.css` の `--shadow-*` へ足す
- **Tailwind のユーティリティの値は、main の出力 CSS（`apps/timer-web/dist`）で解決済みの値を見て写す。** 推測で写さない（例: `rounded-lg` は `tailwind.config.js` で `var(--radius-lg)`、`shadow-lg` は `0 10px 15px rgba(0,0,0,0.45)`。余白は Tailwind 4 の `--spacing` の倍数）
- `font-size` の直値は書かない。5 段のトークンに無い大きさは、宣言と同じ行に `/* scale-exempt: 理由 */` を書く（#280 の検査が `packages/ui` にだけ効くことは変わらないが、書き方を揃える）
- レスポンシブは Tailwind の境界値のまま `@media (min-width: 640px | 768px | 1024px)` に書き換える
- `presence.ts` は、在室状況をクラス名ではなく **`data-presence` 属性**で表す形に変える。色は CSS 側で `[data-presence="online"]` などに当てる

### D3. 移行中の勝ち負け（`@layer timer`）

- `src/index.css` の先頭で `@layer theme, base, timer, components, utilities;` を宣言し、移した CSS を `@layer timer { … }` に入れる。**残っている Tailwind のユーティリティが従来どおり勝つ**ので、呼び出し側の `className` の上書きを残したまま primitives を先に移せる
- ⚠ **この宣言が Tailwind の展開後も効くかは推測である。** Tailwind 4 は自前で `@layer theme, base, components, utilities;` を出すので、どちらが先に現れるかでレイヤーの順序が決まる。**PR 1 の最初の作業として、ビルド出力でレイヤーの順序を実測する。** 成り立たなかったら、primitives を呼び出し側の上書きと一緒に移す刻み方（大きな PR 1〜2 本）へ切り替え、利用者に諮る
- すでに素の CSS で書かれている部分（いまの `index.css` の `:root`・`html` / `body`・`.instrument-stage` など）は、**レイヤーに入れずに置いたまま移す**（いまと同じ勝ち負けを保つ）
- PR 4 で Tailwind を外すときに `@layer timer` の囲いを外す。囲いを外すと勝ち負けが変わりうるので、§5 の物差しで確かめる

### D4. preflight の代わり

- Tailwind を外すと preflight（`* { border: 0 solid }`・`button` の背景・`img { display: block }` など）も消え、要素の既定値がすべて変わる
- **Tailwind 4.3.3 の preflight を `src/styles/reset.css` に逐語で写す。** MIT なので出典と許諾の表記を付ける。テーマ変数（`--default-font-family` など）の参照は、main の出力 CSS で解決済みの値に合わせる
- 要らない規則を削るのは、同じ PR で §5 の物差し 1 が差 0 件のまま通る範囲に限る

### D5. 要素層は読まない（理由を差し替える）

- 要素層（`@tasuki/ui/elements.css`）は timer に読ませない。理由は「計器の語彙とボタンの形が違う（ADR 0001 決定 5）」。見た目を変えない条件のもとで要素層を読ませると、timer のボタン・見出しの一つひとつに要素層を打ち消す規則が要る
- 読ませるかは #316（ボタンの形を部品層に足す）で判断し直す

### D6. トークン層を CSS の `@import` で読む

- PR 4 で、`main.tsx` の `import "@tasuki/ui/tokens.css"` と `import "@tasuki/ui/components.css"` を `src/index.css` の `@import` に戻す（#297 の回避を外す）
- 書体の `url()` が解決されることを、ビルド出力の `assets/` に書体が出ることと、E2E の書体のドリフト検査で確かめる

### D7. 依存と構成

- PR 4 で `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を `apps/timer-web/package.json` から外し、`tailwind.config.js`・`postcss.config.js` を消す
- 前置詞が要らないことは、ビルド出力の CSS に前置詞付きの宣言が要る箇所（`-webkit-` など）が残っていないかで確かめる。main の出力で `autoprefixer` が付けていたもの（`postcss.config.js` の注釈の 2 点など）を列挙し、どれも対象ブラウザで不要であることを記録する
- `pnpm audit --audit-level high` と供給網の検証（ADR 0008）を通す。依存を減らすだけで足さない

### D8. ADR と文書

- **技術選定の変更なので、PR 1 で ADR 0022 に追記して決定を記録する**（憲法 原則 II: 既存スタックからの変更は ADR に記録した上で行う）。「決定した。実施は PR 4」と書き、完了形で書かない。数（行数・ファイル数）は ADR へ写さない
  - timer は Tailwind・PostCSS・`autoprefixer` を使わない。素の CSS とトークン層・部品層で組む
  - 要素層を読まない理由を D5 に差し替える（ADR 0022 決定 5 の理由の置き換え）
  - ADR 0022 の「部品層は `@layer` を使わない（Tailwind のレイヤー構造に依存しない）」の理由は、Tailwind が無くなっても「部品は読み込み順と詳細度で決まる」ことに変わりはないので、決定は維持して理由だけ直す
  - ADR 0001 の本文は書き換えず、`@tailwindcss/postcss` の追記と `autoprefixer` の申し送り（#71）に「ADR 0022 の追記で終了」と注記する
- **PR 4 で実施状況を追記する**（ADR 0022）
- PR 4 で、§2 の一覧（`git grep -il tailwind` で引き直す）の注釈・README・検査の理由を書き直す。**「トークン層に要素セレクタを置かない」規則そのものは残す**（理由は「timer が要素層を読まないため」になる）。README の「Tailwind と併用する場合は `@import` しない」の節は消す
- `use-breakpoint.ts` の「Tailwind の lg」は「画面の CSS の 1024px の境界と揃える」に書き換える

## 4. PR の刻み方

ADR 0013 の既定（1 Issue = 1 PR）から分割する理由は、`docs/guides/pr-granularity.md` の**理由 1（独立して revert したい単位が複数ある）**と**理由 3（危険度の異なる変更が混ざっている）**。見た目の後退が見つかったらその画面だけを戻したく、依存と preflight を外す PR 4 は画面の移植と危険度が違う。

| PR | 中身 |
|---|---|
| **1** | 設計正本・ADR 0022 の追記（D8）・`@layer timer` の実測（D3）・`index.css` の分割（D1）・`primitives.tsx`・`presence.ts`（D2）・影のトークン |
| **2** | Lobby・Loading・SessionLost・History・Summary と、その画面だけが使う部品・2 画面以上が使う部品（`InvitePanel`・`PassphrasePanel`・`TopicCard`・`NotifySettingsPanel`・`EmptyHint` など） |
| **3** | Session と、その子の部品。差分が大きくても割らない（差分の大きさは分割の理由にならない・ガイド） |
| **4** | 依存と設定の撤去（D7）・`reset.css`（D4）・`@layer timer` の囲いを外す（D3）・トークン層の `@import`（D6）・注釈・検査・README・ADR の書き直し（D8）・振り返り |

- PR 1〜3 は依存の宣言を変えない。どの時点でも Tailwind が残ったまま動く
- PR ごとに順に進める（変異 ID と CSS のファイルが衝突するので並列にしない）
- PR ごとに `mutation-check` を流し、当たらなくなった変異パッチを作り直す。作り直した変異が弱まっていないかを、元のパッチと並べて確かめる

## 5. 見た目が変わっていないことの合否

main を基準に、2 つの物差しで比べる。どちらも使い捨ての spec で測り、**コミットしない**（`pnpm e2e` の件数に混ざる）。

### 5.1 物差し 1: 計算済みスタイルの比較（主）

- 状態ごとに、画面上の全要素の `getComputedStyle` を書き出す。要素は DOM の道筋で識別し、main とブランチを差分にかける
- ホバー・フォーカスは Playwright で状態を作ってから書き出す（ボタン 3 種・タブ・一覧の行）
- 差は値ごとに 3 つに仕分ける: **無害**（例: 幅 0 の枠の `border-style`。理由を添えて一覧にする）／**直す**／**利用者の承認を得る**
- **合格の条件は「未仕分けの差が 0 件」**

### 5.2 物差し 2: 画素の比較（副）

- Playwright の `toHaveScreenshot` を使う（新しい依存は足さない）。main で基準画像を作り、ブランチで `maxDiffPixels: 0` で比べる
- ルームコード・QR・招待 URL・経過時間はマスクし、`animations: 'disabled'` を付ける
- main と並べる手順: `git status --porcelain` が空であることを確かめ → `git checkout main -- apps packages` → 撮影 → `git checkout HEAD -- apps packages`

### 5.3 撮る状態

| 画面 | 状態 |
|---|---|
| Lobby | 通知設定・合言葉・セッション設定の開閉 |
| Session | 自分がドライバー／そうでない、計測中・一時停止・休憩、交代の知らせ、名簿の代理追加・削除の確認、共有メモ、終了の確認 |
| その他 | Summary（完了・中断）、History（空・記録あり）、Loading、SessionLost |

- 幅は 360・768・1280px（レスポンシブの境界をまたぐ）
- 状態は `e2e/support/timer.ts` と `routeWebSocket` で作る。作れない状態が見つかったら、その時点で利用者に報告する

## 6. 完了条件（EARS）

| ID | 要求 | 確かめる手段 |
|---|---|---|
| E1 | §5.3 のどの状態・幅でも、ブランチの計算済みスタイルは main と一致しなければならない（仕分け済みの差を除く） | §5.1 |
| E2 | §5.3 のどの状態・幅でも、ブランチの画面は main と画素で一致しなければならない（マスクを除く） | §5.2 |
| E3 | PR 4 の後、`apps/timer-web` の依存に `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` があってはならない | `package.json`・`pnpm why` |
| E4 | PR 4 の後、timer の書体はトークン層の `@import` から読まれ、ビルド出力の `assets/` に出なければならない | ビルド出力・E2E の書体のドリフト検査 |
| E5 | timer の画面の CSS（`src/styles/*.css`）と `.tsx` が生の色を書いたとき、検査は失敗しなければならない | `design-tokens.test.ts`・`audit-ui-components`・破壊検証 |
| E6 | PR 4 の後、`apps/timer-web/src` と、現況を述べる注釈・README・検査の理由に Tailwind を前提にした記述があってはならない | `git grep -i tailwind`（§1.3 の過去の記録と ADR の追記の経緯を除く） |
| E7 | 在室状況の色は、クラス名を組み立てずに字面の属性値で当たらなければならない | `presence` のテスト・E2E |

## 7. 各 PR の検証

- 手元で `pnpm test`・`pnpm e2e`・scripts の自己テスト（bash で回す）・`pnpm audit`・`mutation-check` を回す
- §5 の 2 つの物差し
- 生の色の検査が新しい CSS でも赤になることを、破壊検証で 1 回確かめる（入る前に `git status --porcelain` が空であることを見る）
- E2E の a11y 走査（コントラスト・フォーカス可視化・reduced-motion・書体のドリフト）
- 計画には `audit-plan-gate` を当てる
- レビュー: 文脈を共有しない `/code-review` を PR 番号を明示して通す
- 配布: 本番への配布は勝手に行わない

## 8. Constitution Check

| 原則 | 本設計での扱い |
|---|---|
| I. テスト駆動開発 | 移植の合否は main を基準にした比較（§5）が先にあり、それが緑になるまで移す。検査の射程を広げるときは、先に赤を見る |
| II. 技術選定は ADR を通す | Tailwind・PostCSS・`autoprefixer` を外すことを、PR 1 で ADR 0022 の追記に記録してから実施する（D8） |
| III. 揮発インメモリと単純運用 | CSS と依存のみ。配布は利用者が決める |
| IV. 境界の型安全 | 該当なし |
| V. 実画面検証 | §5。実画面の撮影比較と計算済みスタイルの比較 |
| VI. 依存は内向き | 該当なし（ドメインに触れない） |
| VII. 検査は壊して確かめる | 生の色の検査の射程を広げたら、破壊検証で赤を見る。変異パッチを PR ごとに当て直す |
| VIII. 記録が正本 | 本設計正本・ADR 0022 の追記。完了条件は §6 の EARS |
| IX. 小さく回す | 分割の理由（ガイドの理由 1）を §4 に書いた |
| X. 抽象は実需で | 共有の単位は既存の `primitives.tsx` と、2 画面以上が使う部品に限る。新しい部品を部品層に足すのは #316 |
| XI. 秘密と個人情報 | 該当なし |
