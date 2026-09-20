# `@tasuki/ui` の要素層を自分の書体スケールへ寄せる（#280）— 設計正本

- **Issue**: [#280](https://github.com/tomohiroJin/tasuki-tools/issues/280)
- **出どころ**: [#270](https://github.com/tomohiroJin/tasuki-tools/issues/270)（PR [#278](https://github.com/tomohiroJin/tasuki-tools/pull/278)）の敵対的レビュー
- **関連**: [`docs/adr/0001`](../../adr/0001-design-system-scope.md)（デザインシステムの層構造） /
  [`docs/guides/definition-of-done.md`](../../guides/definition-of-done.md)

## 1. 範囲

`packages/ui/src/elements/` が書体の大きさを直値で書いているのを、`tokens/typography.css` の
5 段（`--font-size-xs` / `-sm` / `-base` / `-lg` / `-xl`）へ寄せる。寄せられないものは
**同じ場所に理由を書いて残す**。そのうえで「5 段か、理由が書かれた例外か」を機械で検査する。

検査の射程は **`packages/ui/src/**` に限る**（D2）。

### 本 Issue で扱わないもの

- **5 段の値そのものの見直し**（`clamp()` の係数）。いま合っているかは別の問いである
- **`apps/` 側の直値**。`apps/poker-web` に 12 件・`apps/landing` に 2 件・`apps/timer-web` に
  3 件あるが、本 Issue の完了条件は要素層だけを対象にしている（D2・§8）
- **`apps/timer-web` の Tailwind 側のタイポグラフィ**（Issue 本文でスコープ外）
- **`line-height`**（`--line-tight` / `--line-normal`）の適用

## 2. Issue #280 本文との差異

**本文の事実主張はすべて実測と一致した**（§3.1）。着手した Issue で本文が正しかったのは
これが初めてである。補足は 2 点のみ。

### 2.1 「段の外」が 2 件ではなく 3 件ある

本文は例として `apps/landing` のワードマークを挙げるが、要素層で 5 段のどこにも
当たらないのは **3 件**である（`.card::after` 9.6px / `.badge` 10.6px / `.card.small` 17.6px）。
`.card.small` は「小さすぎる」のではなく **base の上限と lg の下限の谷間**に落ちる（§3.2）。

### 2.2 `input[type='text']` は寄せると退行しうる

本文は要素層の 9 件を一律に「寄せる」対象として並べるが、`input[type='text']` の `1rem` は
**ちょうど 16.0px** であり、base へ寄せると狭い画面で 15.5px になる。16px 未満の入力欄は
iOS Safari がフォーカス時に自動で拡大する（D4）。

> **追記（§12）: この指摘の前提も消えた。** `input[type='text']` がどの画面にも一致しない
> （§11）以上、「寄せると退行しうる」という比較そのものが成立しない。規則自体を
> 削除したので、寄せる／据え置くの選択は問いとして残らない。

## 3. 実測した事実（2026-09-20・main `2301d65`）

### 3.1 Issue 本文の数字の照合

| 確認項目 | 本文 | 実測 |
|---|---|---|
| `elements/` の `font-size` 直値 | 9 件 | 9 件（行番号も一致） |
| `packages/ui/src` の `var(--font-size-*)` 参照 | 0 件 | 0 件 |
| `apps/landing` の参照 | 「参照を持つ」 | 13 件（直値 2 件） |
| `apps/timer-web` の参照 | 「ごく少数」 | 1 件（直値 3 件） |
| `apps/poker-web` の参照 | 0 件 | 0 件（直値 12 件） |
| 要素層を読むのは landing と poker-web だけ | そのとおり | `apps/timer-web/src/index.css` は `@tasuki/ui/tokens.css` のみを読む |

### 3.2 5 段を実 px へ展開すると、直値 9 件のうち 3 件が段の外に落ちる

`clamp()` を実効値へ展開した（`1rem = 16px`）。

| 段 | 360px | 768px | 1280px | 1440px |
|---|---|---|---|---|
| xs | 12.1 | 12.7 | 13.1 | 13.1 |
| sm | 13.4 | 14.3 | 15.2 | 15.2 |
| base | 15.5 | 16.7 | 16.8 | 16.8 |
| lg | 18.6 | 20.6 | 22.4 | 22.4 |
| xl | 22.4 | 26.1 | 30.4 | 30.4 |

| 直値 | px | 当たる段 |
|---|---|---|
| `reset.css:44` `h1` 1.5rem | 24.0 | xl |
| `reset.css:51` `h2` 0.8rem | 12.8 | xs |
| `controls.css:10` `label` 0.85rem | 13.6 | sm |
| `controls.css:17` `input[type='text']` 1rem | 16.0 | base |
| `controls.css:39` `button` 0.95rem | 15.2 | sm（上限に一致） |
| `controls.css:78` `.badge` 0.66rem | 10.6 | **段の外**（xs の下限より小さい） |
| `card.css:39` `.card::after` 0.6rem | 9.6 | **段の外**（xs の下限より小さい） |
| `card.css:45` `.card-face` 1.5rem | 24.0 | xl |
| `card.css:78` `.card.small` 1.1rem | 17.6 | **段の外**（base 上限 16.8 と lg 下限 18.6 の谷間） |

### 3.3 CSS の書き方は素直で、走査の穴になる形は無い

`packages/ui/src` に **`font` ショートハンド（`font: bold 1rem/1.2 …`）は 0 件**、
**`em` 単位の `font-size` も 0 件**。すべて `font-size: <数値>rem;` の形である。
検査はむしろ **`font-size` という綴りに依存する**——`font: 700 0.6rem/1 …` のような
一括指定はその綴りを含まないため、検査 2〜4 を素通りしてしまう。だからこそ一括指定は
「拾う」のではなく**禁じる**形にする（§5 の検査 1）。

### 3.4 ADR-0001 がコーナーピップの寸法を名指ししている

ADR-0001 は Fraunces の `opsz 9–80` を残す理由として
**「コーナーピップ 9.6px とワードマーク 80px で字形を変えるため」**と書いている。
`.card::after` の `0.6rem` を動かすと、この記述と現物が食い違う。

### 3.5 検査の置き場は既にある

`packages/ui/package.json` の `test` は `node --test tests/*.test.mjs` で、
**新しいテストファイルを置けば自動で射程に入る**。`scripts/list-scan-targets.mjs` の
`script-tests` は `scripts/` 配下のみを列挙するため、`packages/ui/tests/` へ足しても
導出テストは反応しない。

## 4. 決定

### D1. 要素層の 9 件のうち 7 件を 5 段へ寄せ、2 件を理由つきの例外として残す

**段の外に落ちる 3 件（§3.2）と、例外として残す 2 件は一致しない。** `.badge` と
`.card.small` は段の外にあるが寄せる（D3・D5）。逆に `input[type='text']` は
base のレンジ内にありながら例外にする（D4）。

| 箇所 | いま | 後 | 根拠 |
|---|---|---|---|
| `reset.css:44` `h1` | 1.5rem | `var(--font-size-xl)` | 24.0px は xl のレンジ内 |
| `reset.css:51` `h2` | 0.8rem | `var(--font-size-xs)` | 12.8px は xs のレンジ内 |
| `controls.css:10` `label` | 0.85rem | `var(--font-size-sm)` | 13.6px は sm のレンジ内 |
| `controls.css:17` `input[type='text']` | 1rem | **削除**（§12） | D4 は撤回 |
| `controls.css:39` `button` | 0.95rem | `var(--font-size-sm)` | 15.2px は sm の上限に一致 |
| `controls.css:78` `.badge` | 0.66rem | `var(--font-size-xs)` | D3 |
| `card.css:39` `.card::after` | 0.6rem | **据え置き（例外）** | §3.4 |
| `card.css:45` `.card-face` | 1.5rem | `var(--font-size-xl)` | 24.0px は xl のレンジ内 |
| `card.css:78` `.card.small` | 1.1rem | `var(--font-size-lg)` | D5 |

### D2. 検査の射程は `packages/ui/src/**` に限る

`apps/` まで広げると `apps/poker-web` の 12 件（`0.72 / 0.78 / 0.8 / 0.85 / 1.6 / 1.9 / 2.3rem`
と `0.8em`）を寄せる作業が乗り、見た目が動く範囲と作業量がおよそ倍になる。
これは Issue #280 の完了条件に書かれていない。**別 Issue へ切り出す**（§8）。

### D3. `.badge` は xs へ寄せる（10.6px → 12.1〜13.1px）

段の外に置く意匠上の理由が見当たらない。小さすぎる側なので可読性はむしろ上がる。

### D4. `input[type='text']` は `1rem` のまま例外にする

base の下限は 15.2px で、**16px を下回る**。16px 未満の入力欄は iOS Safari が
フォーカス時に画面を自動で拡大する。

> ⚠ **この挙動はこの環境では実機検証できていない。** 一般に知られた挙動として
> 扱っているが、一次情報で裏を取っていない。合言葉とお名前の入力欄は玄関の主経路なので、
> **当たれば実害が出る側**に倒して据え置く。5 段の下限を上げる解は本 Issue のスコープ外。

> **追記（§12）: この決定は覆った。** `input[type='text']` はどの画面にも一度も
> 一致しないことが分かり（§11）、さらに検証した結果、据え置く（例外にする）のではなく
> **規則自体を削除した**。当時の判断（16px を下回らせない・iOS Safari の自動拡大）は
> 誤りではなく、前提（この規則が実際に入力欄に当たる）が崩れたために別の結論になった。
> 経緯は §12 を見よ。

### D5. `.card.small` は lg へ寄せる

base（15.5〜16.8px）と lg（18.6〜22.4px）の谷間に落ちる。同じ札の数字である
`.card-face` が xl（22.4〜30.4px）なので、小カードを lg にすると「同じ札の大小」が
段 1 つぶんの差になる。base だと大カードとの差が開きすぎる。

**狭い画面で +6%、広い画面で +27%** 大きくなる。poker の一覧に並ぶ札なので、
折り返しが変わりうる。§7 の実画面検証で確かめる。

### D6. 例外は宣言と同じ行の `scale-exempt:` コメントで印を付ける

```css
  font-size: 0.6rem; /* scale-exempt: 札のコーナーピップ。ADR-0001 が 9.6px を名指ししている */
```

**同じ行に置く**のは、宣言と理由が離れると片方だけが動くためである。
理由が空、あるいは印だけで理由が無い場合は検査が落とす。

## 5. 検査の設計

置き場は **`packages/ui/tests/typography-scale.test.mjs`**（§3.5 により自動で射程に入る）。

`packages/ui/src/**/*.css` を走査し、`font-size` の宣言ごとに次を見る。

| # | 見るもの | 落とすもの |
|---|---|---|
| 1 | `font` の一括指定（shorthand）が無いこと | `font: 700 0.6rem/1 var(--font-body);` のような一括指定（`font-size` という綴りを含まないため、検査 2〜4 を素通りする） |
| 2 | `font-size` の宣言が同じ行で `;` まで終端していること（複数行にまたがっていないこと） | 値が次の行へ続く宣言（例外の印を同じ行に置く規約 D6 が成立しなくなる） |
| 3 | 値が `var(--font-size-…)` であること。でなければ同じ行に `scale-exempt:` と**空でない理由**があること | 理由の無い直値／印だけで理由が空の直値 |
| 4 | 参照している段の名前が `typography.css` に**実在すること** | `var(--font-size-md)` のような打ち間違い |
| 5 | `--font-size-*` の定義が **5 件**であること | 段が黙って増減すること |
| 6 | 走査したファイル数と宣言数が **0 でないこと** | 走査が空振りして緑になること |

**許可リストを持たない。** 段の名前は `typography.css` の定義から導出し、対象は
`src/**/*.css` の全件である。要素層に新しいセレクタが増えても検査は自動で射程に入るので、
#270 が避けた「許可リストが列挙に化ける」形にならない。

**トークン定義そのものを宣言と誤認しない。** `--font-size-xs: clamp(…)` は
カスタムプロパティの定義であって `font-size` の宣言ではない。プロパティ名の直前が
`-` である場合を除外する。

## 6. 破壊検証と対照実行

対照実行（壊さずに緑になること）を先に見てから、次の 6 通りで赤くなることを確かめる
（憲法 原則 VII）。**破壊検証へ入る前に `git status --porcelain` が空であることを見る**
（`git checkout --` で未コミットの実装を巻き込む事故を防ぐため）。

1. `font` の一括指定を書く（例: `font: 700 0.6rem/1 var(--font-body);`）→ 検査 1 が落とす
2. `font-size` の値を次の行へ折る（複数行にまたがらせる）→ 検査 2 が落とす
3. 寄せた 1 件を直値へ戻す → 検査 3 が落とす
4. 例外の理由を空にする（`/* scale-exempt: */`）→ 検査 3 が落とす
5. 存在しない段を書く（`var(--font-size-md)`）→ 検査 4 が落とす
6. 走査対象を空にする → 検査 6 が落とす

## 7. 実画面検証とスクリーンショット比較

要素層を読むのは **`apps/landing` と `apps/poker-web`** の 2 つ（§3.1）。
`pnpm dev` の入口 <http://localhost:5175/> から両方を開く。

**幅は 360px と 1280px の両端で見る。** `clamp()` は両端で効き方が逆になるためで、
たとえば `h1` は狭い画面で 24 → 22.4px と**縮み**、広い画面で 24 → 30.4px と**伸びる**。
片端だけ見ると退行の半分を見逃す。

スクリーンショットは `e2e/specs/` に使い捨ての spec を置き、`TASUKI_SHOTS_DIR` で出力先を
切り替える（turbo の strict env に阻まれるので `cd e2e && playwright test` を直接叩く）。
`mask` でルームコード・QR・招待 URL・お題・経過時間を潰し、`animations: 'disabled'` を付ける。
**この spec はコミットしない。**

## 8. 切り出し

`apps/poker-web` の 12 件は #270 が `apps/landing` で見つけた「リズムの無い自前スケール」と
同じ形をしている（`0.72 / 0.78 / 0.8 / 0.85 / 1.6 / 1.9 / 2.3rem` と `0.8em`）。
**本 Issue では触らず、別 Issue として起票する**（D2）。検査の射程を `apps/` へ広げる判断も
そちらへ預ける。

## 9. 文書への反映

`packages/ui/README.md` の**末尾へ**、書体の大きさは 5 段のトークンを使い、外れるなら
`scale-exempt` で理由を書くことを追記する（**途中へ節を差すと直後の小節が親を変える**ので、
追記は末尾へ回す）。

**ADR-0001 は改版しない。** 本 Issue はトークンの適用であって、層の境界という決定を
変えていない。ADR-0001 が名指しする 9.6px は D1 で据え置くので食い違いも生じない。

## 10. Constitution Check

| 原則 | 本設計での扱い |
|---|---|
| I. テスト駆動開発 | 検査を先に書き、要素層の 9 件が違反する赤を見てから書き換える |
| II. 技術選定は ADR を通す | 新しい依存を足さない。`node:test` と既存の stylelint のみ |
| III. 揮発インメモリと単純運用 | 該当なし（CSS と検査のみ） |
| IV. 境界の型安全 | 該当なし |
| V. 実画面検証 | §7。2 アプリ × 2 幅で確かめ、スクリーンショットを並べる |
| VI. 依存は内向き | 該当なし |
| VII. 検査は壊して確かめる | §6。対照実行と 6 通りの破壊検証 |
| VIII. 記録が正本 | 本設計正本と `packages/ui/README.md` への追記（§9） |
| IX. 小さく回す | 射程を `packages/ui/src` に絞り、`apps/` は切り出す（D2・§8） |
| X. 抽象は実需で | 許可リストを作らず、段の名前をトークン定義から導出する（§5） |
| XI. 秘密と個人情報 | 該当なし |

## 11. 追記（2026-09-20・最終レビュー Important 4）

**D4・§2.2 の前提が実測で覆った。** どちらも「`input[type='text']` は玄関の主経路（合言葉・お名前欄）
に当たる」ことを根拠にしているが、`apps/landing` と `apps/poker-web` を実測すると
**`input[type='text']` はどちらの画面にも一度も一致しない**。

- `apps/landing`（`CreateRoom.tsx` / `JoinRoom.tsx`）の `<input>` はすべて
  `className="hub-input"` のみで、`type` 属性を持たない（合言葉欄だけ `type="password"`）
- `apps/poker-web` には `<input>` が **0 件**
- `type="text"` を書いているのは `apps/timer-web` のみだが、README の表のとおり
  `apps/timer-web` は `@tasuki/ui/tokens.css` しか読まず、要素層（`elements/`）の
  この規則は効かない

CSS の属性セレクタは解決後の型ではなく**属性の有無**を見るため、`type` を書かない
`<input>` には `input[type='text']` が当たらない。**したがって現時点では、この例外は
どの画面の見た目も動かしていない。**

**据え置きの判断（D4）自体は変えない。** 共有ライブラリの規則としては、将来どこかの
利用側が `type="text"` を明示すれば効く形が正しく、`1rem` を base へ寄せて 16px を
割らせる理由も無い。変わるのは前提の記述だけである。

**別 Issue へ切り出す。** `apps/landing` / `apps/poker-web` の `<input>` に
`type="text"` を明示すべきか（アクセシビリティ・オートフィル挙動の観点）は、
本 Issue のスコープ外の論点なので改めて起票する。

> **追記（§12）: 切り出さず、この PR で解決した。** 上の「別 Issue へ切り出す」という
> 予定は変更した。`type="text"` を明示すべきかという論点を残すのではなく、
> **誰にも当たっていない `input[type='text']` の規則そのものを削除する**ことで
> 決着させた。経緯は §12。

## 12. 追記（2026-09-20・`input[type='text']` の削除）

**D4 の決定を覆す。** §11 の実測で `input[type='text']` がどの画面の入力欄にも一致しない
ことは分かっていたが、その時点では「据え置いて例外として残す」（D4）という判断自体は
変えなかった。今回、削除するかどうかを判断するために改めて確かめたところ、
次が裏付けられた。

- `apps/landing`（`CreateRoom.tsx` / `JoinRoom.tsx`）の `<input>` はすべて
  `className="hub-input"` のみで `type` 属性を持たない（合言葉欄だけ `type="password"`）。
  玄関の入力欄の書体は `apps/landing/src/index.css` の `.hub-input`
  （`font: inherit` で 16px）が面倒を見ており、要素層の `input[type='text']` には
  依存していない
- `apps/poker-web` には `<input>` が **0 件**
- `type="text"` を書いているのは `apps/timer-web` のみだが、`apps/timer-web` は
  `@tasuki/ui/tokens.css` しか読まず、要素層（`elements/`）のこの規則は届かない

つまり `input[type='text']` の規則群は、要素層を読む唯一の 2 アプリ（landing・poker-web）
のどちらの画面にも**一度も適用されたことがない**。据え置いて例外にする（D4）だけでは
「使われない抽象を残す」ことになり、憲法 原則 X「抽象は実需で」に反する。
**規則自体を `packages/ui/src/elements/controls.css` から削除した**
（`input[type='text']` / `::placeholder` / `:focus` の 3 規則）。

**選択子を広げて効かせる案は採らない。** `input:not([type])` は詳細度 (0,1,1) が
`.hub-input` の (0,1,0) より高く、ライブラリ側が勝って玄関の入力欄の見た目が変わって
しまう（退行）。したがって「削除」以外の選択肢（据え置き／選択子を広げる）はどちらも
採らない。

これにより「理由つきの例外」は 2 件（`input[type='text']` と `.card::after`）から
**1 件（`.card::after` のみ）**になる（D1 の表・README）。§2.2 が挙げていた
「寄せると退行しうる」という懸念も、そもそも `input[type='text']` が画面に当たらない
以上、寄せる／据え置くの選択自体が意味を持たない。§11 が予定していた「別 Issue への
切り出し」（`apps/landing` / `apps/poker-web` の `<input>` に `type="text"` を
明示すべきか）は行わない。**この PR で規則自体を削除するため、切り出す対象が無くなった。**

**将来、利用側が `type="text"` を明示すれば、そのとき実需として改めて規則を置けばよい。**
それまでは共有ライブラリに使われない抽象を残さない。

削除前後でスクリーンショットを比較し、玄関（`apps/landing`）の入力欄を含む画面が
360px・1280px のどちらでも 1 ピクセルも変わらないことを確認した
（`corepack pnpm --filter @tasuki/ui test` などの実施記録は該当タスクの完了報告を参照）。
