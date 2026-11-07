# ADR-0035: 縦に並ぶブロックの間は親が持ち、並びの部品を部品層に足す

- **ステータス**: Proposed
- **関連**: [#479](https://github.com/tomohiroJin/tasuki-tools/issues/479)・
  [#553](https://github.com/tomohiroJin/tasuki-tools/issues/553)・
  [洗い出しの一覧](../superpowers/specs/2026-11-06-layout-audit.md)・
  [進め方](../superpowers/plans/2026-11-06-layout-breakage.md)・
  [ADR-0022](./0022-ui-components-layer.md)（部品層）・[ADR-0025](./0025-responsive-layout.md)（幅の段・器・段組み）。
  ADR-0022 の決定 4 の一部を置き換える（採択後）。0022・0025 の本文は書き換えない

## 背景

2026-10-31 の利用者のフィードバックから 5 つの幅 × 主な画面を洗い出した（33 件）。崩れの主な原因は 2 つだった。

- **縦に並ぶブロックの間を誰も持っていない。** poker の参加者の欄は、見出しの行（`.room-participants-head`）と
  札の並び（`.participants`・`margin: 0`）の間が全 9 幅で 0px（一覧 #1）。逆に、子が `margin-top` を持つ所では、
  後に書かれた同じ詳細度の `margin: 0` に負けて間が消える。Markdown は `.ui-md > * + * { margin-top: var(--space-2) }` が
  後ろの `.ui-md-p { margin: 0 }` に負け、段落の間が行間と区別できない（一覧 #3）。
  外側の余白を子が持つと、親の都合（どこに置くか・何の下に来るか）と子の都合が衝突し、片方を直すと他方が壊れる。
- **見出し＋操作の行が画面ごとに 4 通りに書かれている。** poker・roulette・timer（`.section-header`・共有メモ）で
  flex・gap・折り返しの組み合わせが違い、timer は横の間が 3px（一覧 #33）、「ランダム」（#6）と「編集」（#18）は
  見出しの行の外に置かれ、どの見出しに効く操作か読めない。

加えて、崩れを検査で捕まえる方法として、スクリーンショットの比較を入れるかを決める必要がある（原則 II）。

## 決定

**置き換える箇所（採択後）**: [ADR-0022](./0022-ui-components-layer.md) 決定 4「画面は配置を持ち、配置もクラスで書く」のうち、
**縦に並ぶブロックの間と、見出しと操作の行の並びは、部品が持てる**。ADR-0022 の本文は書き換えない（末尾の追記の節から、この ADR を指す）。決定 4 の残りはそのまま有効。

### 1. 縦に並ぶブロックの間は、親が `gap` で持つ

- 縦に並ぶブロックの間は**親が `gap` で持つ**。親が部品なら部品が、画面の容器なら画面のクラスが持つ。
- 子は外側の縦の余白（`margin-block`・`margin-top`・`margin-bottom`）を**持たない**。
- 余白を足したいときは親の `gap` を変える。子へ足さない。
- **勝ち負けの決まり**: `.ui-stack > *` と `.ui-section-head > *` のリセットは詳細度 (0,1,0) で、要素層の margin（`h2` など・(0,0,1)）には勝つが、同じ詳細度で**後に読む部品**の margin には負ける。縦の margin を持つ部品（いまは `.ui-reader-preview`・`.ui-reader-more`・64rem 以上の `.ui-reader-body`）を `.ui-stack` の直下に置かない。`:where()` で詳細度を 0 にしないのは、要素層に負けてリセットの役目を失うため。持つ部品の一覧は `packages/ui/tests/spacing-owner.test.mjs` が固定する。
- **例外（行数で切る面）**: `-webkit-line-clamp` で行数を切る面（`.ui-reader-preview` の中の Markdown）は、
  中身が通常の流れ（block）でないと切れない（flex の `gap` に替えると 3 行で切れず全文が出ることを実測した）。
  この面の中は、親（`.ui-md`）が兄弟セレクタの `margin-top` で間を持つ。子の `margin: 0`（同じ詳細度）に勝つよう、この規則を子のリセットより**後ろに書く**（後勝ち。クラスを重ねて詳細度を上げる回避はしない）。

**検査（ADR-0030 決定 2）**: この規則は、静的な検査（CSS の字面）では守れない。どの要素がどの親の子かは JSX の側にあり、
CSS だけでは「縦に並ぶブロックの子が外側の余白を持っているか」を決められないからである。
そこで**結果（隣り合うブロックの間と重なり）を E2E で測る**。`e2e/specs/spacing.spec.ts` が、この ADR で直した画面
（poker の参加者の欄・記録の束・読む面の段落、timer の参加者と共有メモの見出しの行、roulette のいつものメンツ、agenda の保存した流れ）を測る。主な画面と幅への展開は #557。
部品の CSS の契約（`.ui-stack` が `gap` を持つ等）は `packages/ui/tests/spacing-owner.test.mjs` が字面で固定する（アプリのソースの文字列は固定せず、画面が部品を当てていることは各アプリの vitest が描いた結果から確かめる）。これらは、変異検査の宣言の中の #553 の項目（`git grep -n "#553" scripts/lib/mutation-declarations.mjs`）で壊して確かめる。

**例外（移行の途中・取り除く作業は [#556](https://github.com/tomohiroJin/tasuki-tools/issues/556) のやること）**: timer の
`.section-header`（`apps/timer-web/src/styles/primitives.css`）と `.shared-memo-header`（`shared-memo.css`）は、見出しの行の下の間を
自分の `margin-bottom` で持つ。timer の `Card` が縦の `gap` を持つ形へまだ移っていないため。#556 で `Card` 側の `gap` へ移し、この 2 つの `margin-bottom` を取り除く。
新しい画面はこの例外に倣わない。

### 2. 間の段（トークン）

| 場面 | トークン |
|---|---|
| ブロックの中の要素どうし（見出しと件数、段落どうし） | `--space-2` |
| 区画の中のブロックどうし（見出しの行 → 一覧、一覧 → 操作） | `--space-3` |
| 区画どうし | `--space-5`（段組み `.ui-workspace` の区画の間は既存の `--space-6`） |

値の直書きはしない（トークンと同じ値の直書きは `audit-ui-components` が落とす）。

### 3. 並びの部品を足す

ADR-0022 決定 2（2 画面以上が使うものを部品にする）に沿って、実需のあるものだけを足す。

- **`.ui-stack`**: 縦に積む並び。`display: flex; flex-direction: column` の `gap`（`--space-3`）。
  直下の子の縦の外側の余白は 0 にする（要素層の `h2` などの `margin` が `gap` に足されないため）。
  修飾 `.ui-stack--tight`（`gap: var(--space-2)`・ブロックの中の要素どうし）は、poker の記録の束と agenda の保存した流れの 2 画面が使う。`--loose`（`--space-5`）は使う画面が無いので足さない。
- **`.ui-section-head`**: 区画の見出しと操作を 1 行に並べる行。flex・折り返し可・縦は中央・両端寄せ。横の間 `--space-3`・折り返した行の間 `--space-2`（実装は `gap: var(--space-2) var(--space-3)`）。
  中の見出しの `margin` は 0。狭い幅で操作が下の行へ落ちたときは、見出しの下に `--space-2` の間で置き、左端を見出しに揃える
  （右へ寄せない。操作が見出しに属して読める）。操作が複数あるときは、画面が 1 つの塊（flex・折り返し可）にして渡し、塊の寄せは行の先頭（左）に保つ。
  修飾 `.ui-section-head--beside`（`justify-content: flex-start`）は、操作を行の反対の端へ離さず見出しの隣に寄せる（poker の参加者の欄・timer の名簿の 2 画面が使う）。
  見出し自身の字の大きさ・色は画面が持つ（timer は要素層を読まないので見出しの字は timer が持つ）。

**部品の振る舞いと、画面の上書き**: 部品が持つのは既定の並び（折り返し・両端寄せ）と、2 画面以上が使う修飾（`--beside`・`--tight`）だけである。
使う画面が 1 つの寄せ方は、修飾を足さず**画面のクラスが上書きする**（ADR-0022 決定 2: 2 画面以上が使うものだけを部品にする）。
実装時には、poker の参加者の欄（見出しの隣へ寄せる）と timer の名簿が別々に上書きしていたので、`--beside` に上げた（別の画面が同じ寄せ方を必要としたら修飾へ上げる、の適用）。
使う画面が 1 つの寄せ方は、画面が上書きするのが原則である。例（実装時点）: poker の記録の束の名前の列（`.estimate-group-head > .estimate-group-item` の `flex: 1 1 auto; min-width: 0`。
名前が 1 行に収まるときは同じ行の右にポイントが並び、収まらない長い名前のときだけポイントが名前の下の行の右端に落ちる）と選択欄の右端寄せ（`.estimate-group-points` の `margin-inline-start: auto`）、
roulette のいつものメンツの見出しの基準線揃え（`.roulette-regulars-head { align-items: baseline }`）、timer の共有メモの見出しの縮み方（`.shared-memo-lead`）。
2 画面以上が同じ寄せ方を必要としたら、そのときに修飾へ上げる（`--beside`・`--tight` がその例）。

使わない修飾は足さない（`--loose` は使う画面が無いので足していない）。どのアプリも使わない部品は `audit-ui-components` が死んだ部品として落とす。

### 4. スクリーンショットの比較は入れない

要素の矩形を測る検査（重なりと間）で崩れを捕まえる。理由:

- 書体の描画とアンチエイリアスが CI と手元で違い、基準画像が揺れる。
- 基準画像の更新が、意図した変更のたびに負担になる。
- 赤になっても「どの崩れか」を言わない。矩形の測定は「どの要素の間が何 px 足りないか」を言う。

撮影（原則 V）は引き続き人とエージェントが目で見るために行うが、合否の機構にはしない。

### 5. 新しい画面・部品はこの約束と部品を使う

新しい画面は、縦に並ぶブロックの間を `.ui-stack` か画面の容器の `gap` で持ち、見出し＋操作の行に `.ui-section-head` を使う。
この作法を Definition of Done に入れるのは [#557](https://github.com/tomohiroJin/tasuki-tools/issues/557) で行う。

## 影響

- `packages/ui/src/components/` に `stack.css` と `section-head.css` が増え、`packages/ui/README.md` の部品の表と
  「画面を組む」に余白の持ち主の約束が入る。
- poker の参加者の欄・見積もりの記録・roulette のいつものメンツ・timer の `SectionHeader` と共有メモの見出しが
  `.ui-section-head` に寄る。画面の CSS から並びの写しが消える。
- Markdown の根（`.ui-md`）は、子の間を兄弟セレクタの `margin-top` で持つ（決定 1 の例外）。子の `margin: 0` に負けないよう、この規則を子のリセットより後ろに置いて後勝ちにする。
- スクリーンショットの比較に依存が増えないので、基準画像の置き場・更新手順は要らない。
- 受け入れるトレードオフ: 既存の画面のうち、子が外側の余白を持つ所は順次この約束へ寄せる（この ADR では扱った所だけ直す）。
  全画面での重なりと間の測定は #557。
