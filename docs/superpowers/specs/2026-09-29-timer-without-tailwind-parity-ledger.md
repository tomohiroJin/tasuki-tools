# timer から Tailwind を外す — 差の台帳（#321）

設計正本 [`2026-09-29-timer-without-tailwind-design.md`](./2026-09-29-timer-without-tailwind-design.md) §5.1 の台帳。
**承認した差・消した死んだクラス・残した検索結果の正本はこの文書。** PR 本文にはここへのリンクだけを書く。
数はここを正本にし、他の文書へ写さない。

- **基準**: `ba9249d`（固定）
- **無害として扱う差**: 設計正本 §5.4 の 2 類だけ（ここに写さない）
- **比較の仕組み**: `e2e/parity/`。流し方は [`e2e/parity/README.md`](../../../e2e/parity/README.md) が正本（ここに写さない）。PR 4 で消すときは、関連する箇所を一覧で持たず `git grep -n parity` で引き直して消す（`e2e/parity/` のほかに自己テスト・tsconfig の include・lint の引数・`.gitignore` に在る）。消した後は、下の各 PR の「比較の仕組みの SHA」で `git checkout <SHA> -- e2e/parity` して再現する
- **配り方**: 正本 §5.1 の「`/var/www/*` の symlink を差し替え、書き出しをオフラインで突き合わせる」ではなく、基準の側のブラウザの文脈で `/timer/` を `context.route` で基準の dist から返し、その場で両側を比べる（計画 P1）。**代償**: 対照実行では両側とも route で配るので、Caddy が付けるヘッダの非対称（基準は route・ブランチは Caddy）は対照実行で確かめていない。非対称が見た目を変えるなら通常の比較が赤に倒れる向き（緑に倒れる向きではない）

## 利用者が個別に承認した差

| 差 | 承認 | PR |
|---|---|---|
| autoprefixer を外すと `-moz-column-gap` 2 件が消える（Firefox は 63 以降、前置詞なしの `gap` で効く） | 2026-09-29 | 4 |
| トークン層に新しく足したトークン `--shadow-panel`・`--shadow-dialog` が `html` のカスタムプロパティとして増える（使う側の `box-shadow` は比べ続ける。除外は `e2e/parity/approved.ts`） | 2026-10-04 | 2 |

## 利用者が認めた例外

| 例外 | 認めた日 | 結果 |
|---|---|---|
| 確認ダイアログを開いている間、刻みごとに背後のページがスクロールし直す不具合の修正に限り、別の小さな PR で直してよい。直したあと、基準（`ba9249d`）と並べた比較で差 0 件を確かめ、例外と結果をこの台帳に書いたうえでマージしてよい | 2026-10-01 | `fix/issue-321-focus-trap-rescroll`（`9b5d4d51`）で直した。基準（`ba9249d`）と並べた比較は 28 / 28 緑（差 0・画素一致）、既存の E2E は 98 件緑。直す途中で、隠れていた穴（フォーカスがモーダルの外へ出られる）が比較の Tab の到達の差として表に出たので、同じ PR でモーダル（`aria-modal`）の確認ダイアログだけ外へ出たフォーカスを中へ戻す形に補強した |

## PR 1（見た目を移さない土台）

- ブランチの SHA（比較を流した時点の HEAD）: 最初の通し 3 本（通常・対照・除去）は `969e350a3e3e89c9cc7d2284b738a4c02e604758`（作業ツリーは clean）。QR の直しの後は、通常の比較を `8376947c0d9ce5a8f9b23efd845d27bdfead45b5` に直しを載せた作業ツリー（`e2e/parity` の中身は `50ca65754a0b339dcafbcef7befda8bfb29d64cc` と同じ）で、対照実行と除去検査を `50ca65754a0b339dcafbcef7befda8bfb29d64cc`（作業ツリーは clean）で流した
- 比較の仕組みの SHA: `5c109b7b3741f3c8fa2cd08ac0dab5b8353c1937`（`e2e/parity` の最後の変更。最終レビューの直し（基準の出所の断定・`-u` の停止・基準側の期待値）の後に期待値の JSON を固定したコミット。再現は `git checkout 5c109b7b3741f3c8fa2cd08ac0dab5b8353c1937 -- e2e/parity`）。その前は `50ca65754a0b339dcafbcef7befda8bfb29d64cc`（QR の出現を待つ直し）。直す前の通しは `969e350a3e3e89c9cc7d2284b738a4c02e604758`（`e2e/parity` の最後の変更は `7709fd0f`）
- 比較: 状態数・幅・差の件数: 全 26 状態 × 静止 5 幅 ＋ タッチ 2 本 ＝ 28 テスト。通常の比較は初回 27 緑 / 1 赤（`lobby-guest-outside` の動きに 1 件。基準側にだけ `img` の動き（`*`）が 1 件多い。基準 201・ブランチ 200 件）。**原因は招待パネルの QR の `<img>` の出現の遅れ**: QR は `useInviteQr` が `qrcode` を動的に読み込んで非同期に作り、できるまで `<img>` が DOM に無い。目印が見えた直後の最初の読み（動き）で、ブランチの側だけまだ描かれていなかった（後の静止の読みでは両側 207 件で揃っていた）。QR のチャンクを片側だけ 3 秒遅らせると、同じ形の差（動き 1 件・静止の 360 / 640 にも）が毎回出ることを確かめた。**直し方は状態を決定的にする形**（雑音として名指ししない）: 両側とも目印の直後に、描かれた招待パネルの数と読み込み済み（`complete` かつ `naturalWidth > 0`）の QR の数が一致するまで待つ（`e2e/parity/settle.ts` の `waitForInviteQr`。タッチの側と除去検査も同じ）。直した後: 同じ遅延を掛けても緑、`lobby-guest-outside` を `--repeat-each 8` で 8 回とも緑（差 0・動き両側 201）、続けて全 28 テストの通しで 28 緑（25.9 分。差 0・画素一致・notEntered 0・skipped 両側一致。状態ごとの件数は当時の summary.json と全件同じ値。いまの正本は下の期待値の JSON）。直す前に同じ状態だけを `--repeat-each 8` で流したときは自然には再現しなかった（7 回は差 0。1 回は側の後始末での Playwright の trace の書き出しの失敗で、比べる前に落ちた）。目録は 26 状態（輪の外のゲストのロビー・離脱中のセッションのゲスト画面・詳細設定を開いたロビーを含む）。静止は 5 幅（360・640・768・1024・1280）、動きとキーフレームと画素と操作（ホバー・押下・フォーカス・チェック）を比べ、タッチ 2 本（360px）を足す
- main を取り込んだ後の通し（通常の比較）: HEAD `01eaace52539e7b7b3c1f33656b69e42e17a2bd6`（main の #313・#330・#332 を取り込んだマージ。作業ツリーは clean）で既定の設定を流し、28 テスト全 28 緑（所要 27.9 分）。状態ごとの数は直す前の通しと同じ値だった（いまの正本は下の期待値の JSON）。
- 最終レビューの直しの後の通し（3 本と通常の比較の流し直し。順に流した）:
  - 通常の比較（1 回目）: HEAD `dcb9fef065d1686baf669383d642cd1ebeb06760`（作業ツリーは clean。期待値の JSON はまだ無い）。28 テストすべて赤で、**赤の中身は 28 件とも「期待値の JSON が無い」の 1 件だけ**（差 0・画素一致・notEntered 0・skipped 両側一致。所要 28.9 分）。帯のマスクをルームコードだけに狭めた後でも画素の差は 0
  - 期待値の JSON: この 1 回目の基準側の要約から README の「期待値を作り直す」の手順で作った（28 件）。直す前のこの台帳の件数表と全行一致
  - 対照実行: `dcb9fef0` に期待値の JSON と台帳の変更を載せた作業ツリー（`e2e/parity` の中身は `5c109b7b` と同じ）。28 / 28 緑（差 0・画素一致・期待値と一致・全件 `control: true`。所要 28.4 分）
  - 除去検査: 同じ作業ツリーで 26 / 26 緑（所要 28.0 分）。dead 1716・alive 18959・undecided 813・写さない組 164（従前と同じ）。既知の答え 5 件はすべて OK（`removal-summary.ts` の `checkKnownAnswers`・README の手順）。未判定の理由は「いま `:disabled` 等の状態に無い」462・無効 200・覆い 135・組で外すと変わる 16（揺れ 0）
  - 通常の比較（2 回目）: HEAD `0c260748be030a76bab82eb7ed932d7d760a830c`（期待値の JSON と台帳をコミットした後。作業ツリーは clean）。28 / 28 緑（差 0・画素一致・期待値と一致。所要 27.1 分）
  - 断定の破壊検証（コミットしない。戻した後に作業ツリーが clean であることを見た）: ブランチの dist を基準として渡すと読み込みで止まる（git の外へ写したブランチの dist も資産名で止まる）／`-u` を付けると比較と除去検査の各テストの先頭で止まる／期待値の `loading-unreachable` の動きの件数を 1 つ変えると赤（`期待 23・実際 22`）
- 対照実行（基準同士）: 順序は「状態の作り方の揺れを固定 → 雑音の名指しと切り替わらないチェックの skipped 化 → 26 / 26」。
  - 揺れを固定した後・雑音が空の実行: 15 緑 / 11 赤。赤の中身は計測弧の `stroke-dashoffset`（と一部の画素）と、同期を落とした状態（banner-warn-reconnecting）で交代間隔が切り替わらないチェックの例外（時刻の揺れではない）
  - 名指しと skipped 化の後: 26 / 26 緑（差 0・画素一致・notEntered 0・skipped 両側一致）。**ただしこれは計測弧の画素の扱いを撮影時の長さの固定（`SCREENSHOT_STYLE`）へ変える前の実行**。計測弧を `SCREENSHOT_STYLE` で扱う形にした後の対照実行は 28 テスト（26 状態 ＋ タッチ 2 本）が 28 緑（差 0・画素一致・notEntered 0・skipped 両側一致。所要 23.2 分）。**最終のコード（QR の出現を待つ直しの後・`50ca6575`）での対照実行も 28 / 28 緑**（差 0・画素一致・notEntered 0・skipped 両側一致・全件 `control: true`。所要 25.3 分）
  - 以後の対照実行は設定ファイルで選ぶ（`parity.control.config.ts`・README 参照）
- 状態ごとの比較要素数・動きの件数・キーフレームの名前・操作の書き出し件数・skipped の名前: **数の正本は [`e2e/parity/expected/base-summary.json`](../../../e2e/parity/expected/base-summary.json)**（基準側の要約。比較は毎回これと突き合わせ、違えば赤。作り直しは README の「期待値を作り直す」の手順だけ）。ここには写さない

- 雑音として名指ししたもの（`noise.ts`）: 計測弧の円の `stroke-dashoffset` の 1 件だけ（弧の長さは経過率で決まり、両側は別の時刻に撮るので揃わない）。画素は撮影のときだけ弧の長さを固定して比べる（`SCREENSHOT_STYLE`）。**代償**: 弧の長さの画素は見ない（弧の発光・線幅はスタイルの比較で見ている）
- 画素のマスク（`e2e/parity/states.ts` の `roomMask`）。正本 §5.3 が挙げるのはルームコード・QR・招待 URL・経過時間で、それより広く隠しているものも理由と代償を書く:

| 隠す要素 | 理由 | 代償（誰が代わりに見るか） |
|---|---|---|
| QR の画像 | 部屋ごとに中身が変わる（§5.3） | QR の大きさ・地はスタイルの比較が見る |
| 招待パネルのルームコードの行（コードとコピーのボタン） | コードの字は等幅でなく、行の中のボタンの位置が端数だけ動く（コードだけを隠すと縁で 1px の差が出た・実測） | コピーのボタンはスタイルの比較が見る |
| 喪失画面の「ルーム XXXXXX」 | 部屋ごとに変わる（§5.3）。コードの要素の親（行）を隠す（`roomMask` の 2 つ目） | なし（字の色・書体はスタイルの比較が見る） |
| ステータスの帯のルームコード `(XXXXXX)` | 部屋ごとに変わる（§5.3）。帯の残りは隠さない | なし（コードの字の色・書体はスタイルの比較が見る） |
| 招待 URL（`/?room=` を含む文字） | 部屋ごとに変わる（§5.3） | スタイルの比較が見る |
| 経過時間（「経過 0:00」の値・まとめの「所要時間」の値） | 時刻ごとに変わる（§5.3） | スタイルの比較が見る |
| 残り時間（`role="timer"`） | **§5.3 より広い。** 両側は別の時刻に撮るので値が揃わない | 数字の書体・大きさ・色はスタイルの比較が見る。数字の画素は見ない |

  `status-strip-lobby` は、帯の中で画素の比較から外しているのがルームコードだけになった（帯のほかの文字は画素で比べる）。マスクを狭める前（帯全体を隠していた間）は、この状態は帯について画素で何も比べていなかった。計測弧は隠さず撮るときに長さを固定する（上の「雑音として名指ししたもの」）
- 状態の作り方で決定的にしたもの: 知らせの帯が 4 秒で消える揺れ（summary 系は時計を止めて留める）、履歴の日時（記録の `completedAt` と所要時間を固定）
- 破壊検証（壊し方 7 つ。すべて赤を確かめて戻した）:

| # | 壊し方 | 赤になった物差し |
|---|---|---|
| 1 | `.instrument-label` の `letter-spacing` 0.18em → 0.19em | 静止（5 幅）と画素 |
| 2 | `.instrument-stage::before` の `background-size` 40px → 41px | 静止の擬似要素（画素は赤にならない。静止が担う） |
| 3 | `.boot-reveal` の時間 0.5s → 0.6s | 動き |
| 4 | `@keyframes fade-up` の移動量 20px → 21px | キーフレーム（静止・動きは 0） |
| 5 | 状態の作り方からルーム作成を外す | 目印 |
| 6 | `PrimaryButton` の `hover:bg-[var(--signal-hover)]` → `hover:bg-[var(--signal)]` | 操作（静止・動きは 0） |
| 7 | 計器の目盛り長 11 → 12 | 画素のみ（静止は 0。計測弧の上書きが目盛りを隠していない） |

  壊し方 7 の最初の試行は空振りで緑になった（対照として「変更なしで緑」）。内容指定でやり直して赤を得た。

- 状態に入れなかった要素と、対象から外した理由（`skipped`。両側で件数ごと一致しなければ赤）:

| 理由 | 要素 | 扱い |
|---|---|---|
| 覆われている | 全画面の交代の知らせ・確認ダイアログの覆いの下の要素 | 利用者もホバーできない。ホバーと押下は外す。フォーカスは Tab で届くので書き出す |
| 押すと値が変わるか一覧が開く | 通知音の `select`・音量／予告秒数の `range` | 押下だけ外す。ホバーとフォーカスは書き出す |
| 無効 | 合言葉が空の「設定」・順番の端の「前へ／後へ」・一時停止中の「スキップ」・「列から外れる」ほか | 押下の書き出しは対象に残す（Chromium では無効のボタンも `:active` に入る。実測）。Tab で届かないものは skipped |
| Tab の順に入らない／フォーカストラップの外 | 選ばれていないタブ・ポップオーバーや確認ダイアログの外の要素 | 理由つきで skipped |
| 押しても切り替わらない | 同期を落とした状態（banner-warn-reconnecting）の交代間隔 5 件 | 切り替えは同期サーバーの往復を要する。両側一致で外す（片側だけなら赤） |

  「交代を音で知らせる」は通知の許可を両側の文脈へ与えて対象に戻した（除外なし）。

- 状態に入れなかった要素の注意: `loading-unreachable` は操作できる要素が 0。`lobby-notify-open` の `focus-visible` が少ないのは、ポップオーバーのフォーカストラップで Tab が巡回するため（確認済み）
- 除去検査: **正本は `loadRemovalProbe`（`e2e/parity/removal-summary.ts`）の出力**（状態ごとの `out/removal/<状態>.json` を束ねる。目録の状態が欠けていれば止まる）。PR 2・3 の着手時に取り直す（約 26 分。直す前の `969e350a` で 22.8 分、QR の直しの後の `50ca6575` で 24.9 分。どちらも 26 状態すべて通った）。「写さない」組の定義は README が正本。出力（`out/removal/`）は無視していて PR 4 の撤去で消える。PR 2・3 で消した分はこの文書に書く
  - 全 26 状態の延べ: dead 1716・alive 18959・undecided 813（束ねた「写さない」組は 164）。揺れによる未判定は 0。QR の直しの後（`50ca6575`）に取り直しても全く同じ数
  - 既知の答え 5 つとの突き合わせはすべて一致（直す前と直した後の両方。`loadRemovalProbe` で束ねて照合）: `instrument-label` と同じ要素の `text-[var(--signal)]`・`PrimaryButton`（`px-6`）への `px-3`・`py-1.5` は dead、`Card`（`p-6`）への `sm:p-4`（640px で変わる）と `instrument-label` 自身は alive
  - 組で外すと変わるもの: QR の `h-52` + `w-52`（単独では dead に見えるが、組では効いている）。写す側へ倒した
  - 動きの判定でだけ生きているもの: `duration-1000`・`duration-700`・`animate-pop-in`・`animate-fade-up`
  - 限界: カスタムプロパティは比べない・状態の変種は 1280px だけで判定する・`group-` / `peer-` の変種は判定しない（いずれも基準では当たらない）。**dead は目録の状態の中での判定**で、目録に無い文脈（状態）で効いている宣言は捕まえない。dead の中には「計算済みスタイルが変わらないだけで意味のあるもの」（`lucide-*`・`absolute` の `inset-0`・`transition-all` など）が混じるので、PR 2・3 で 1 つずつ見る
- 比較の限界: 操作の状態（ホバー・押下・フォーカス・チェック）は 1280px とタッチの 360px だけで比べる（ほかの幅の操作の状態は比べない）
- E8（規則の使用状況）: PR 1 は対象外（足した規則が無い。計画 P5 で PR 2 へ。破壊検証の 5 つ目（E8 の検査を壊す）も同じく PR 2）
- 消した死んだ規則: `.animate-confetti`・`.animate-shake`・`.animate-pulse-fast` とそのキーフレーム（使い手 0 件を確かめて削除）
- #316 への申し送り: 2026-10-02 に利用者の承認を得て投稿した（https://github.com/tomohiroJin/tasuki-tools/issues/316#issuecomment-5954420246）

## PR 2（primitives と呼び出し側・5 画面と共有部品）

- ブランチの SHA（比較を流した時点の HEAD）: `c121757aa92d38aaad607edaed1af2c0094d387e`（4 設定とも作業ツリーは clean）
- 比較の仕組みの SHA: `c121757aa92d38aaad607edaed1af2c0094d387e`（`e2e/parity` の最後の変更も同じ。再現は `git checkout c121757aa92d38aaad607edaed1af2c0094d387e -- e2e/parity`）
- 目録: 29 テスト（PR 1 の 28 に `session-memo-markdown` を足した。Markdown の全要素を描く共有メモ）。期待値の JSON は README の手順で作り直した。既存の 28 キーは前の期待値と同一で、増えたのは 1 キーだけ。**数の正本は [`e2e/parity/expected/base-summary.json`](../../../e2e/parity/expected/base-summary.json)**
- 比較の結果（HEAD `c121757`）:

| 設定 | 結果 | 所要 |
|---|---|---|
| 通常の比較 | 29 / 29 緑（差 0・画素一致・期待値と一致） | 27.8 分 |
| 対照実行 | 29 / 29 緑 | 25.5 分 |
| 囲いを外した一時ビルド | 29 / 29 緑（差 0。正本 D3 の既知の偽陽性の型も出なかった） | 26.5 分 |
| 規則の使用状況（E8） | 書き出しは 29 / 29 緑。**照合は赤（当たらなかった規則 9 件・下の表）** | 29.7 分 |

- 一時ビルドは、ビルドの CSS に `@layer timer{` の囲いが 0 であること（順序宣言 `@layer timer,components;` だけが残る）を確かめてから流した
- 除去検査: HEAD `0e87abb` で取り直した（26 / 26・34.6 分。既知の答え 5 件 OK・判定の延べは PR 1 と同じ）。途中で出力を消してしまったため、以後は取り直した時点の全件の書き出し（作業ツリーの外の控え）を読んだ
- 利用者が個別に承認した差: `--shadow-panel`・`--shadow-dialog`（上の表）。除外は `e2e/parity/approved.ts`

### E8 で当たらなかった規則（2026-10-04 の利用者の判断で状態を足さずに記録）

E8 は網羅の確認で、効いているかは比較が見る（正本 §5.5）。目録に状態を足すと、期待値の作り直しと 4 設定の比較のやり直しが要り、時間に見合わないため、PR 2 では状態を足さない。PR 4 の通しの比較の前に扱いを決める。

| 規則 | 描かれる条件 |
|---|---|
| `invite-panel.css` `.invite-panel-icon-done` | 招待のルームコードの「コピー」を押した直後 |
| `loading.css` `.loading-connection-urgent` | 読み込み画面で接続状態が `lost` |
| `status-strip.css` `.status-strip-connection-urgent` | ステータスの帯で接続状態が `lost` |
| `notify-settings.css` `.notify-settings-warning` | 通知設定を開いたとき、OS の通知が拒否されている |
| `notify-settings.css` `.notify-settings-voice`・`.notify-settings-voice-select` | 通知設定で予告の方式に「声」を選んだとき |
| `topic-card.css` `.topic-card-title`・`.topic-card-body` | お題が設定されたルームのロビー |
| `presence-dot.css` `.presence-dot[data-presence='idle']` | **作れない**（離席を代入する経路が無い・正本 §2 の 13）。色の対応は `e2e/specs/timer.spec.ts` の在室の点の E2E が属性の書き換えで測る（E7） |

### 消した効いていない宣言（#316 への申し送りの一覧）

基準の除去検査で dead と判定し、写さず、呼び出し側からも消したもの。

| ファイル | 要素 | 呼び出し側の className（消す前） | 消した token |
|---|---|---|---|
| `src/ui/History.tsx` | Card | `p-4` | `p-4` |
| `src/ui/Summary.tsx` | Card | `p-3 sm:p-4` | `p-3` |
| `src/ui/Summary.tsx` | Card | `w-full p-4 text-left` | `p-4` |
| `src/ui/Lobby.tsx` | GhostButton | `text-xs px-3 py-1.5` | `px-3` |
| `src/ui/Lobby.tsx` | GhostButton | `text-xs px-3 py-1.5` | `py-1.5` |
| `src/ui/Lobby.tsx` | PrimaryButton | `text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0` | `px-3` |
| `src/ui/Lobby.tsx` | PrimaryButton | `text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0` | `py-1.5` |
| `src/ui/Session.tsx` | GhostButton | `text-xs px-3 py-1.5` | `px-3` |
| `src/ui/Session.tsx` | GhostButton | `text-xs px-3 py-1.5` | `py-1.5` |
| `src/ui/components/PassphrasePanel.tsx` | PrimaryButton | `px-4 py-2 text-sm` | `px-4` |
| `src/ui/components/PassphrasePanel.tsx` | PrimaryButton | `px-4 py-2 text-sm` | `py-2` |
| `src/ui/components/RosterPanel.tsx` | PrimaryButton | `px-4 py-2 text-sm` | `px-4` |
| `src/ui/components/RosterPanel.tsx` | PrimaryButton | `px-4 py-2 text-sm` | `py-2` |
| `src/ui/components/SelfDriverToggle.tsx` | GhostButton | `text-xs px-3 py-1.5` | `px-3` |
| `src/ui/components/SelfDriverToggle.tsx` | GhostButton | `text-xs px-3 py-1.5` | `py-1.5` |
| `src/ui/components/SelfDriverToggle.tsx` | PrimaryButton | `text-sm px-4 py-2` | `px-4` |
| `src/ui/components/SelfDriverToggle.tsx` | PrimaryButton | `text-sm px-4 py-2` | `py-2` |
| `src/ui/components/NotifySettings.tsx` | トリガーのボタン | `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--bone-muted)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]` | `text-xs` |
| `src/ui/components/NotifySettings.tsx` | トリガーのボタン | `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--bone-muted)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]` | `focus-visible:outline-none` |
| `src/ui/components/StatusStrip.tsx` | 選択画面へ戻るリンク | `text-[var(--bone-subtle)] underline hover:text-[var(--bone)]` | `text-[var(--bone-subtle)]` |
| `src/ui/components/NotifySettingsPanel.tsx` | パネルの根 | `text-sm text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Loading.tsx` | p（instrument-label） | `instrument-label mb-2 text-[var(--caution)]` | `text-[var(--caution)]` |
| `src/ui/Loading.tsx` | h1（brand-title） | `brand-title font-black text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/SessionLost.tsx` | p（instrument-label） | `instrument-label mb-2 text-[var(--urgent)]` | `text-[var(--urgent)]` |
| `src/ui/SessionLost.tsx` | h1（brand-title） | `brand-title font-black text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/History.tsx` | p（記録のタイトル） | `truncate font-bold text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/History.tsx` | dd（tabular） | `tabular text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Summary.tsx` | h2（セッション完了） | `text-3xl font-black text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Summary.tsx` | p（instrument-label） | `instrument-label text-[var(--signal)]` | `text-[var(--signal)]` |
| `src/ui/Summary.tsx` | p（統計値） | `whitespace-nowrap text-lg sm:text-xl font-bold tabular text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Summary.tsx` | Card（ドライバー別） | `w-full p-4 text-left` | `p-4` |
| `src/ui/components/InvitePanel.tsx` | span（ルームコード） | `tabular text-4xl md:text-5xl font-black tracking-wider break-all text-[var(--signal)]` | `tracking-wider` |
| `src/ui/components/PassphrasePanel.tsx` | div（根） | `w-full` | `w-full` |
| `src/ui/components/PassphrasePanel.tsx` | input | `flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]` | `text-[var(--bone)] outline-none` |
| `src/ui/components/TopicCard.tsx` | h3（タイトル） | `text-lg font-bold text-[var(--bone)] [overflow-wrap:anywhere]` | `text-[var(--bone)]` |
| `src/ui/components/ConfirmDialog.tsx` | div（ダイアログ） | `relative w-full max-w-sm rounded-lg … text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/ConfirmDialog.tsx` | h2（タイトル） | `text-lg font-bold text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/ConfirmDialog.tsx` | button（取消） | `px-4 py-2 rounded-md font-medium text-[var(--bone)] … focus-visible:outline-none …` | `text-[var(--bone)] focus-visible:outline-none` |
| `src/ui/components/ConfirmDialog.tsx` | button（確認） | `px-5 py-2 rounded-md font-bold … focus-visible:outline-none …` | `focus-visible:outline-none` |
| `src/ui/components/SessionConfigPanel.tsx` | summary | `flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/SessionConfigPanel.tsx` | span（トグルのラベル） | `block text-sm font-medium text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/SessionConfigPanel.tsx` | input（チェックボックス） | `mt-1 h-5 w-5 shrink-0 accent-[var(--signal)]` | `accent-[var(--signal)]` |
| `src/ui/Lobby.tsx` | div（通知の見出し） | `mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Lobby.tsx` | li（参加者の行） | `flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Lobby.tsx` | RowIconButton | `grid h-11 w-11 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-md bg-[var(--panel)] hover:bg-[var(--panel-hover)] disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--hairline)] text-[var(--bone-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]` | `focus-visible:outline-none` |

### dead だが写したもの

- `ConfirmDialog` の `w-full`・`Markdown` の根の `space-y-2`: 目録の状態では dead だが、本文の長さやブロックの数しだいで効く（除去検査の dead は目録の状態の中の判定に限られる）
- `Lobby` の開始ボタンの `w-full`: 除去検査の読み違いで一度消し、比較で幅が変わって alive と分かったので写し直した

### その他の記録

- **行の高さの写し方**: 割り切れない比率（`text-xs`・`text-sm`・`text-lg`・`text-2xl` など）は `var(--timer-never-defined, calc(…))` で書く。直書きの calc は最小化で 5 桁に畳まれ、16px が 15.984px になる。`--timer-never-defined` を宣言すると検査（`audit-timer-classes.mjs`）が落とす。理由の注釈は `apps/timer-web/src/styles/status-strip.css` の冒頭
- **借り物のキーフレーム**: `loading.css` の `pulse` は、まだ Tailwind のままの `Session.tsx` の `animate-pulse` が出す `@keyframes pulse` を使う。出どころが消えたら検査が落とす（PR 3 で `Session.tsx` を移すとき、timer の CSS に `@keyframes pulse` を置く）
- `SessionConfigPanel` の親の余白は、Task の途中で任意値の変種を挟んだが、最終形は `:where(.session-config-panel > :not(:last-child))`
- `RosterPanel.test.tsx` のクラス名で書いたアサーションの書き直しは PR 3 へ送った（計画 P6）
- E8 の測り方は正本 §5.5（dev ＋ ソースマップ）から変え、最小化しないビルドと「`@layer` を除いた at-rule の並び＋セレクタ」の鍵で突き合わせた（計画 P4・利用者承認 2026-10-03）
- 変異: 当たらなくなった m63・m102・m118 を作り直した（壊し方は元と同じ）。`mutation-check` 全 106 件が検出


## PR 3（記入は PR 3 で）

PR 2・3 で消した「効いていない宣言」は、ここに書く。
