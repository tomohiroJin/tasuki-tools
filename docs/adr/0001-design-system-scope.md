# ADR-0001: デザインシステムの適用範囲と層構造

- **ステータス**: Accepted（2026-08-09）
- **関連**: [#78](https://github.com/tomohiroJin/tasuki-tools/issues/78) /
  #19（サブパス移設）/ #67・#68（基盤整備と規範）
- **範囲**: `packages/ui` と `apps/timer-web` / `apps/poker-web` / `apps/landing`

## 背景

#19 で 3 つのアプリが 1 つの玄関 LP の下に並びました。利用者は LP から timer と poker を
行き来しますが、**timer だけ見た目が別世界**で、同じ道具立てに見えません。

計測した現状（2026-08-09・main `e5f446f`）:

| | timer-web | poker-web / landing |
|---|---|---|
| 系統 | Tailwind v3.4.17 + 独自トークン | 素の CSS + `@tasuki/ui` |
| モチーフ | 計器（クロノグラフ）。ほぼ黒の地・朱のシグナル・等幅タビュラー | 夜のカードテーブル。深緑のフェルト・象牙の札・真鍮 |
| 書体 | システムフォントのみ | Fraunces / Zen Kaku Gothic New（Google Fonts） |
| 外部リクエスト | 行わない | `index.html` から Google Fonts を読む |

`packages/ui/README.md:5-6` は **「`apps/timer-web` は使わない」** と明記しています。
本 ADR はこの判断を見直すものです。

### 調査で判明した、判断を左右した事実

1. **timer のライト/ダークテーマは、すでに実質的に死んでいた。**
   `--color-bg` などの chrome トークンを消費するのは `.stage-canvas` だけで、この
   クラスはどの TSX からも使われていませんでした。`data-theme` を**書く**コードも存在せず
   （`index.html` の FOUC スクリプトは読むだけ）、切替 UI もありません。
   全画面が `.instrument-stage`（`--ink` 固定）の上に乗る構成に変わった時点で、
   切替機構は参照を失っていました。
2. **「外部リクエストを行わない」方針に文書上の根拠は無かった。**
   `docs/` 全体を検索してもヒットは 0 件で、根拠は `apps/timer-web/src/index.css` の
   コメント 1 箇所のみ。しかも**そのコメント自身が「システム/自己ホストのスタックに
   退避させる」と書いていて、自己ホストを許容**しています。「secret-zero」は
   ADR-0005（AI 鍵をサーバーに持たせない）の語で、本来フォントの話ではありません。
3. **`@tasuki/ui` の全量読み込みは、timer では技術的に成立しない。**
   `controls.css` は素の `button` / `input[type=text]` / `label` を、`base.css` は
   `html` / `body` / `h1` / `h2` / `a` を直接スタイルします。timer は全ボタンが
   素の `<button>` に Tailwind ユーティリティを載せた構造なので、下地に真鍮のチップが
   敷かれ、その上をユーティリティが部分的に上書きする状態になります。
4. **`--ink` が両系統に存在し、意味が正反対だった。**
   timer は `#0a0b0e`（地）、`@tasuki/ui` は `#26231c`（札の上に載る文字色）。
5. **`@tasuki/ui` にはグローバルな `:focus-visible` が無い。**
   poker のボタンと札はブラウザ既定に委ねられ、landing だけが `.tool-card` に独自の
   リングを補っています。対して timer は一貫した実装を持っています。

## 決定

### 1. `@tasuki/ui` を 3 アプリ共通の土台に作り直し、トークン層と要素層に分ける

```
packages/ui/src/
  tokens/    ← 3 アプリすべてが読む。素の要素セレクタを置かない
  elements/  ← poker-web / landing だけが読む（button / input / .card 等）
```

**timer はトークン層だけを読み、Tailwind のまま維持します。** 要素層に触れないため、
背景 3 の衝突経路が構造的に断たれます。`exports` の公開名は変えないので
poker / landing の読み込みは変更不要です。

### 2. timer のトークンは名前を変えず、値の出所だけ差し替える

timer 側の `[var(--*)]` 参照は 260 箇所あります。**これを 1 つも書き換えず**、
`:root` の定義（約 15 行）だけを `@tasuki/ui` のプリミティブへの参照に置き換えます。

`--ink` の衝突は **`@tasuki/ui` 側を `--coal` / `--coal-soft` へ改名**して解消します。
影響は `packages/ui` 2 ファイル 4 行と `apps/landing/src/index.css` 2 行の**計 8 行**で、
timer 側 260 箇所を守る方が明らかに安いためです。

### 3. 書体は 3 アプリとも自己ホストする

Fraunces と Zen Kaku Gothic New はいずれも **SIL Open Font License 1.1** で、
著作権行に Reserved Font Name の宣言がありません（一次情報で確認）。サブセット化・
再配布が可能で、ファミリー名を改名する義務もありません。OFL 全文をフォントと同じ
ディレクトリに同梱します。

Fraunces は実使用が 6 箇所すべて `font-weight: 600` だったため**ウェイトを 600 に固定**し、
`opsz 9–80` は残します（コーナーピップ 9.6px とワードマーク 80px で字形を変えるため）。
Zen Kaku Gothic New は base 層（常時）と ext 層（漢字の名前が出たときだけ）に分けます。

初回表示で落ちる量は **930,596 B → 247,229 B（−73%）**、第三者への接続は 2 ドメインから
**ゼロ**になります。

### 4. ライト/ダークの切替機構は撤去する

背景 1 のとおり、これは仕様変更ではなく**死んだ機構の撤去**です。
「夜のカードテーブル」は本質的にダークであり、ライト版は作りません。

### 5. 「計器」の語彙は骨格を残し、色・書体・質感を翻訳する

巨大なカウントダウン・`CircularProgress` の円弧・`TeamOrbit` の周回表示・
`StatusStrip`・等幅タビュラーは、いずれも「計測の道具」として意味を持つため残します。
変えるのは朱→真鍮、ほぼ黒→フェルト緑、等幅→Fraunces の数字です。

## 影響

### 利点

- LP → timer → poker が同じ道具立てに見える（#78 の完了条件）
- **第三者への接続が 3 アプリすべてから消える。** 将来 CSP を入れるなら `font-src 'self'` で足りる
- 初回表示のフォント取得量が 73% 減る
- **timer の `:focus-visible` の規約を `@tasuki/ui` に持ち込むことで、poker と landing の
  フォーカス可視化も改善する**（現状はブラウザ既定に委ねられている）
- 死んだトークンと分岐が消え、`index.css` が読めるようになる

### 代償

- `packages/ui` にフォントの実体（woff2 7 本・約 688 KB）が入る。これまで
  「CSS だけのパッケージ」だったものが資材を持つ
- **base 層のサブセットはアプリの表示文字から自動抽出するため、UI 文言を足すと
  黙って ext 層（+469 KB）を引く。** ドリフトを検知する E2E を入れて塞ぐ
- LP と poker と timer で配信 URL が別になり、フォントのキャッシュを共有しない
  （それでも合計は現状より大幅に小さい）
- `packages/ui` は「検査対象が無いのでタスクを持たない」と宣言していたが、層の境界という
  検査対象が生まれるため、この宣言を更新して lint / test を持たせる

### この ADR で決めないこと

- ADR のテンプレートと採番規約の統一（#68）
- timer-sync と poker-sync の構造の非対称をどちらへ寄せるか（#68 → #72）

## 追記（2026-08-11・#113 PR-5）

### Tailwind 4 への更新にあたり `@tailwindcss/postcss` を足したことの位置づけ

**憲法 原則 II が ADR を要求する「新しい技術・ライブラリの追加」には当たらないと判断した。**

Tailwind 4 は、それまで `tailwindcss` 本体に同梱していた PostCSS プラグインの入口を
`@tailwindcss/postcss` へ分離した。両者は同じ版番号（4.3.3）で同じ配布元から出ており、
**`postcss.config.js` の 1 行が指す先が変わっただけで、技術選定は Tailwind のまま**である。
これで新しくできるようになったことは無い。逆に、この分離を拒むと Tailwind 4 自体を採れない。

同じ理由で、本追記は「デザインシステムの適用範囲」を変えない。決定 1〜5 はいずれも有効なまま。

### 既存の JS 設定は `@config` で読み込み続ける（CSS-first へは移行しない）

Tailwind 4 は `@theme` による CSS-first の設定を推すが、**`tailwind.config.js` を
`@config` ディレクティブで読み込む方式を採った。** 決定 2「timer のトークンは名前を変えず、
値の出所だけ差し替える」を守るためで、CSS-first への全面移行は本 ADR のトークン設計に
踏み込むため別途とする。

`@config` が 4.3.3 で実際に機能することは実測で確認した（生成 CSS に
`.text-presence-*` / `.bg-presence-*` / `.rounded-*` / `.shadow-lg` / `.font-mono` の
11 規則が更新前と同じ形で出ること、および **`@config` を外すと在室状況の 3 色が死に、
影が Tailwind 既定へ退行すること**の両方）。

### この追記で決めないこと

- `autoprefixer` の要否（#71 へ申し送り）。**「Tailwind 4 が自前で prefix を付けるので
  不要」は実測で成り立たなかった** —— 外すと CSS がかえって増え、`-moz-column-gap` が
  消える。詳細は `apps/timer-web/postcss.config.js` のコメント
- CSS-first（`@theme`）へ移行するかどうか
