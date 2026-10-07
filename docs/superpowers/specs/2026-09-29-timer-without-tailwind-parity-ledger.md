# timer から Tailwind を外す — 差の台帳（#321）

設計正本 [`2026-09-29-timer-without-tailwind-design.md`](./2026-09-29-timer-without-tailwind-design.md) §5.1 の台帳。
**承認した差・消した死んだクラス・残した検索結果の正本はこの文書。** PR 本文にはここへのリンクだけを書く。
数はここを正本にし、他の文書へ写さない。

- **基準**: `ba9249d`（固定）
- **無害として扱う差**: 設計正本 §5.4 の 2 類だけ（ここに写さない）
- **比較の仕組み**: `e2e/parity/`。流し方は、撤去の直前の SHA（`777df1ab85e4118aa537df60a6860c662ea148de`）の `e2e/parity/README.md` が正本（`git fetch origin pull/346/head` で取る）（ここに写さない）。PR 4 で消すときは、関連する箇所を一覧で持たず `git grep -n parity` で引き直して消す（`e2e/parity/` のほかに自己テスト・tsconfig の include・lint の引数・`.gitignore` に在る）。消した後は、下の各 PR の「比較の仕組みの SHA」で `git checkout <SHA> -- e2e/parity` して再現する。**PR 4 で撤去した**（2026-10-07）。再現の手順は「PR 4」の節
- **配り方**: 正本 §5.1 の「`/var/www/*` の symlink を差し替え、書き出しをオフラインで突き合わせる」ではなく、基準の側のブラウザの文脈で `/timer/` を `context.route` で基準の dist から返し、その場で両側を比べる（計画 P1）。**代償**: 対照実行では両側とも route で配るので、Caddy が付けるヘッダの非対称（基準は route・ブランチは Caddy）は対照実行で確かめていない。非対称が見た目を変えるなら通常の比較が赤に倒れる向き（緑に倒れる向きではない）

## 利用者が個別に承認した差

| 差 | 承認 | PR |
|---|---|---|
| autoprefixer を外すと `-moz-column-gap` 2 件が消える（Firefox は 63 以降、前置詞なしの `gap` で効く） | 2026-09-29 | 4 |
| トークン層に新しく足したトークン `--shadow-panel`・`--shadow-dialog` が `html` のカスタムプロパティとして増える（使う側の `box-shadow` は比べ続ける。除外は `e2e/parity/approved.ts`） | 2026-10-04 | 2 |
| トークン層に新しく足したトークン `--shadow-crown`（王冠の落ち影。`filter` の値）が `html` のカスタムプロパティとして増える（使う側の `filter` は比べ続ける。除外は `e2e/parity/approved.ts`） | 2026-10-05 | 3 |

## 利用者が認めた例外

| 例外 | 認めた日 | 結果 |
|---|---|---|
| 確認ダイアログを開いている間、刻みごとに背後のページがスクロールし直す不具合の修正に限り、別の小さな PR で直してよい。直したあと、基準（`ba9249d`）と並べた比較で差 0 件を確かめ、例外と結果をこの台帳に書いたうえでマージしてよい | 2026-10-01 | `fix/issue-321-focus-trap-rescroll`（`9b5d4d51`）で直した。基準（`ba9249d`）と並べた比較は 28 / 28 緑（差 0・画素一致）、既存の E2E は 98 件緑。直す途中で、隠れていた穴（フォーカスがモーダルの外へ出られる）が比較の Tab の到達の差として表に出たので、同じ PR でモーダル（`aria-modal`）の確認ダイアログだけ外へ出たフォーカスを中へ戻す形に補強した |

## PR 1（見た目を移さない土台）

- ブランチの SHA（比較を流した時点の HEAD）: 最初の通し 3 本（通常・対照・除去）は `969e350a3e3e89c9cc7d2284b738a4c02e604758`（作業ツリーは clean）。QR の直しの後は、通常の比較を `8376947c0d9ce5a8f9b23efd845d27bdfead45b5` に直しを載せた作業ツリー（`e2e/parity` の中身は `50ca65754a0b339dcafbcef7befda8bfb29d64cc` と同じ）で、対照実行と除去検査を `50ca65754a0b339dcafbcef7befda8bfb29d64cc`（作業ツリーは clean）で流した
- 比較の仕組みの SHA: `5c109b7b3741f3c8fa2cd08ac0dab5b8353c1937`（`e2e/parity` の最後の変更。最終レビューの直し（基準の出所の断定・`-u` の停止・基準側の期待値）の後に期待値の JSON を固定したコミット。再現は `git checkout 5c109b7b3741f3c8fa2cd08ac0dab5b8353c1937 -- e2e/parity`）。その前は `50ca65754a0b339dcafbcef7befda8bfb29d64cc`（QR の出現を待つ直し）。直す前の通しは `969e350a3e3e89c9cc7d2284b738a4c02e604758`（`e2e/parity` の最後の変更は `7709fd0f`）。squash マージなので、この SHA は main から辿れない（2026-10-06 に確かめた）。`git fetch origin pull/333/head` で取ってから戻す
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
- 状態ごとの比較要素数・動きの件数・キーフレームの名前・操作の書き出し件数・skipped の名前: **数の正本は 撤去の直前の SHA（`777df1ab85e4118aa537df60a6860c662ea148de`）の `e2e/parity/expected/base-summary.json`（`git fetch origin pull/346/head` で取る）**（基準側の要約。比較は毎回これと突き合わせ、違えば赤。作り直しは README の「期待値を作り直す」の手順だけ）。ここには写さない

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
- 比較の仕組みの SHA: `c121757aa92d38aaad607edaed1af2c0094d387e`（`e2e/parity` の最後の変更も同じ。再現は `git checkout c121757aa92d38aaad607edaed1af2c0094d387e -- e2e/parity`）。squash マージなので、この SHA は main から辿れない（2026-10-06 に確かめた）。`git fetch origin pull/343/head` で取ってから戻す
- 目録: 29 テスト（PR 1 の 28 に `session-memo-markdown` を足した。Markdown の全要素を描く共有メモ）。期待値の JSON は README の手順で作り直した。既存の 28 キーは前の期待値と同一で、増えたのは 1 キーだけ。**数の正本は 撤去の直前の SHA（`777df1ab85e4118aa537df60a6860c662ea148de`）の `e2e/parity/expected/base-summary.json`（`git fetch origin pull/346/head` で取る）**
- 比較の結果（HEAD `c121757`）:

| 設定 | 結果 | 所要 |
|---|---|---|
| 通常の比較 | 29 / 29 緑（差 0・画素一致・期待値と一致） | 27.8 分 |
| 対照実行 | 29 / 29 緑 | 25.5 分 |
| 囲いを外した一時ビルド | 29 / 29 緑（差 0。正本 D3 の既知の偽陽性の型も出なかった） | 26.5 分 |
| 規則の使用状況（E8） | 書き出しは 29 / 29 緑。**照合は赤（当たらなかった規則 9 件・下の表）** | 29.7 分 |

- main（#340 の依存の更新: `lucide-react`・`vite`・`react`・`@playwright/test` ほか）を取り込んだ後の通常の比較: HEAD `722803e0`（作業ツリーは clean）で 29 / 29 緑（差 0・画素一致・期待値と一致。所要 28.4 分）。依存の更新による見た目の差は無かった
- 一時ビルドは、ビルドの CSS に `@layer timer{` の囲いが 0 であること（順序宣言 `@layer timer,components;` だけが残る）を確かめてから流した
- 除去検査: HEAD `0e87abb` で取り直した（26 / 26・34.6 分。既知の答え 5 件 OK・判定の延べは PR 1 と同じ）。途中で出力を消してしまったため、以後は取り直した時点の全件の書き出し（作業ツリーの外の控え）を読んだ
- 利用者が個別に承認した差: `--shadow-panel`・`--shadow-dialog`（上の表）。除外は `e2e/parity/approved.ts`

### E8 で当たらなかった規則（2026-10-04 の利用者の判断で状態を足さずに記録）

2026-10-06 の利用者の判断で、状態を足さずに受け入れた（正本 §7.2）。

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


## PR 3（Session と子の部品）

計画: [`2026-10-05-timer-without-tailwind-pr3-session.md`](../plans/2026-10-05-timer-without-tailwind-pr3-session.md)。検証の範囲は正本 §7.1（PR 3・4 の検証を軽くする・2026-10-04 の利用者の判断）に従った。

- ブランチの SHA（比較を流した時点の HEAD）: `6f9b2e994ff355137d9ef0617448fa1f420f19bd`（作業ツリーは clean）
- 比較の仕組みの SHA: `eb6d3e39202514dd6ce423077be20d30b7562b52`（PR 3 で変えたのは `e2e/parity/approved.ts` の承認 1 項目だけ。再現は `git checkout 6f9b2e994ff355137d9ef0617448fa1f420f19bd -- e2e/parity`）。squash マージなので、この SHA は main から辿れない（2026-10-06 に確かめた）。`git fetch origin pull/345/head` で取ってから戻す
- 目録: PR 2 と同じ（状態を足していない）。**数の正本は 撤去の直前の SHA（`777df1ab85e4118aa537df60a6860c662ea148de`）の `e2e/parity/expected/base-summary.json`（`git fetch origin pull/346/head` で取る）**（作り直していない）
- 比較の結果（HEAD `6f9b2e9`）:

| 設定 | 結果 | 所要 |
|---|---|---|
| 対照実行（`approved.ts` を変えたので流した・§7.1） | 全件緑 | 24.4 分 |
| 通常の比較 | 全件緑（差 0・画素一致・期待値と一致） | 24.3 分 |

- **流さなかったもの**（正本 §7.1）: 囲いを外した一時ビルド（PR 4 の通しの比較が担う）・規則の使用状況（E8。PR 4 の前に、PR 2 で当たらなかった規則と下の「比較に掛からない要素」と合わせて扱いを決める）・タスクごとの全件の比較（タスクごとに対象の状態だけを流した）
- 除去検査は取り直していない（基準が固定で、PR 3 のファイルの DOM は基準のまま）。PR 2 の取り直し（HEAD `0e87abb`）の全件の書き出しを読んだ
- 利用者が個別に承認した差: `--shadow-crown`（上の表）
- 破壊検証（どれも赤を見て戻した。コミットしていない）: `RosterPanel.test.tsx` の書き直し（`data-scrollable` を常に付ける／常に付けない → それぞれ反対側の 1 本が赤）・`session.css` に生の色（`audit-ui-components` が赤・E5）・`Session.tsx` に Tailwind のクラス（`audit-timer-classes` が赤・E6）・`session.css` の `@keyframes pulse` を消す（`audit-timer-classes` の借り物のキーフレームの検査が赤）
- 変異: PR 3 で当たらなくなったパッチは無かった（作り直し 0）。`mutation-check` は全件が検出（手元 7.6 分）

### PR 3 で比較に掛からない要素（2026-10-05 の利用者の判断で状態を足さずに写した・計画 Q5）

2026-10-06 の利用者の判断で、状態を足さずに受け入れた（正本 §7.2）。

目録の状態に描かれない要素と、描かれない分岐の組み合わせ。除去検査に行が無いので、元の Tailwind のクラスをそのまま写した（写し方はタスクごとのレビューが元のクラスと 1 つずつ突き合わせた）。PR 4 の前に、PR 2 の「E8 で当たらなかった規則」と合わせて扱いを決める。

| ファイル | 要素・組み合わせ | 扱い |
|---|---|---|
| `src/ui/components/SelfDriverToggle.tsx` | 62〜71 行の輪の外の加入の盤（根・見出し・説明・操作の並び・加入ボタンと「ルームから抜ける」の並び） | 除去検査に行が無い（比較の状態に描かれない・Q5）。写した |
| `src/ui/components/SelfDriverToggle.tsx` | 輪の外の盤の「ルームから抜ける」ボタン（text-xs）の組み合わせ | 描かれない分岐の組み合わせ（!inRotation かつ onLeaveRoom）。写した |
| `src/ui/components/SelfDriverToggle.tsx` | 輪の外の盤の加入ボタン（PrimaryButton text-sm） | 描かれない（!inRotation）。写した |
| `src/ui/components/SwitchAlert.tsx` | reducedMotion=true の分岐（animate-pop-in・animate-fade-up を外した版） | 比較が描くのは reducedMotion=false の側のみ（除去検査の行は animate-pop-in 付き）。クラス名の組み合わせを字面の条件式で写した |
| `src/ui/components/SharedMemo.tsx` | 編集中のテキストエリア（rows=10・placeholder 付き） | 除去検査に行が無い（編集モードは描かれない・Q5）。写した（ring・focus は box-shadow を合成） |
| `src/ui/components/SharedMemo.tsx` | 編集モードの「プレビューに戻る」ボタン | 描かれない分岐（mode=edit）。プレビューの「編集」と同じ shared-memo-toggle |
| `src/ui/components/RosterPanel.tsx` | 改名中の行の入力欄・保存/取消の並び・専有の div（w-full min-w-0 / flex w-full min-w-0 gap-1 / min-w-0 flex-1 … px-2 py-1 …） | 除去検査に行が無い（改名中は描かれない・Q5）。写した。入力欄の text-[var(--bone)] と outline-none は、代理追加の入力欄の同形が dead だが行が無いので写した（outline-style はレイヤー外の :focus-visible に負けて無害。PR 4 で `layer(timer)` を外すと勝つので消した） |
| `src/ui/components/RosterPanel.tsx` | 改名・代理追加の誤りの理由の行（mt-2 text-sm text-[var(--caution)]） | 除去検査に行が無い（role=alert の行は描かれない・Q5）。写した（roster-panel-error） |
| `src/ui/components/RosterPanel.tsx` | 「代理」のチップ（chip text-xs text-[var(--caution)]） | 除去検査に行が無い（isPlaceholder が描かれない・Q5）。写した。親の [&>span.chip]:whitespace-nowrap は子セレクタで写した |
| `src/ui/components/RosterPanel.tsx` | 「見学」の見出しと見学一覧（mt-3 mb-1 …・listClass） | 除去検査に行が無い（rotation 外の人が描かれない・Q5）。写した（見出しの上の余白 0.75rem は roster-panel-heading-watchers） |
| `src/ui/components/RosterPanel.tsx` | 一覧の scrollable 未指定の側（flex flex-col gap-1.5 のみ） | 除去検査に行が無い（比較が描くのは scrollable の側のみ）。data-scrollable が無いときの roster-panel-list の宣言（flex・gap）で写した（Q3） |
| `src/ui/components/RosterPanel.tsx` | 送信中の MiniButton の disabled の見た目（disabled:opacity-50 disabled:cursor-wait） | 描かれない（押した直後の 450ms）。除去検査は 1280 で alive の行あり。写した |
| `src/ui/Session.tsx` | 274 行の「ナビ:」の表示（session-navigator・inner を含む） | 除去検査に行が無い（比較の状態に描かれない・Q5）。写した |
| `src/ui/Session.tsx` | 403〜460 行付近の「ルーム」タブの中身すべて（縦積み・「ルームから抜ける」の帯とボタン text-xs・ランダムの帯とボタン text-sm） | タブを押す状態が目録に無い（Q5）。写した |
| `src/ui/components/RotationLineup.tsx` | 飛ばされる現ドライバーの行（rotation-lineup-row-current に data-skipped） | 描かれない組み合わせ。opacity-70 の alive 行は自分の行（border-[var(--signal)]）で session-guest-skipping のみ・現ドライバーの形の行は無い。属性セレクタの組み合わせで写した |
| `src/ui/components/RotationLineup.tsx` | 飛ばされる「ほか」の行（rotation-lineup-row-other に data-skipped） | 描かれない組み合わせ。opacity-70 の行は自分の行の形のみ。属性セレクタの組み合わせで写した |
| `src/ui/components/RotationLineup.tsx` | 現ドライバーの行の中の rotation-lineup-skip-reason（現ドライバーが飛ばされる） | 描かれない組み合わせ。skip-reason は自分の行（session-guest-skipping）にしか描かれない |
| `src/ui/components/TeamOrbit.tsx` | 飛ばされる現ドライバーのアバター（team-orbit-avatar-skipped team-orbit-avatar-current・不在の現ドライバー） | 描かれない組み合わせ。opacity-50 のアバターの alive 行は other の形（bg-[var(--panel-2)] text-[var(--bone-subtle)]）で session-guest-skipping のみ |
| `src/ui/components/TeamOrbit.tsx` | 飛ばされる「次」のアバター（team-orbit-avatar-skipped team-orbit-avatar-next） | 描かれない組み合わせ。opacity-50 のアバターの alive 行は other の形のみ |

### 消した効いていない宣言（PR 3・#316 への申し送りの一覧）

基準の除去検査で dead と判定したか、除去検査に行が無いものは基準の dist のカスケードで効いていないと確かめ、写さなかったもの。

| ファイル | 要素 | 元の className | 写さなかった token |
|---|---|---|---|
| `src/ui/components/NotifyHint.tsx` | 根 | `mb-3 flex … text-sm text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/Tabs.tsx` | タブ | `px-4 py-2 min-h-[44px] … focus-visible:outline-none …` | `focus-visible:outline-none` |
| `src/ui/components/Tabs.tsx` | 選択タブ | `px-4 py-2 min-h-[44px] … border-[var(--signal)] text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/CircularProgress.tsx` | 目盛り盤 | `absolute inset-0` | `inset-0` |
| `src/ui/components/CircularProgress.tsx` | 計測弧の層・運針の層 | `absolute inset-0 -rotate-90` | `inset-0` |
| `src/ui/components/CircularProgress.tsx` | 計測弧 | `transition-all duration-1000 ease-linear` | `transition-all` |
| `src/ui/components/TeamOrbit.tsx` | 次のアバター | `… bg-[var(--panel-2)] text-[var(--bone)] border-2 …` | `text-[var(--bone)]` |
| `src/ui/components/RotationLineup.tsx` | サマリ | `mb-2 text-center text-lg font-bold text-[var(--signal)]` | `text-center` |
| `src/ui/components/RotationLineup.tsx` | 現ドライバー・自分の行 | `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm … text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/SwitchAlert.tsx` | ラベル（instrument-label） | `instrument-label mb-3 text-[var(--signal)]` | `text-[var(--signal)]` |
| `src/ui/components/SwitchAlert.tsx` | ドライバー名 | `flex items-center gap-4 text-5xl md:text-7xl font-black text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/SharedMemo.tsx` | 見出し | `flex items-center gap-2 text-sm font-semibold text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/components/SharedMemo.tsx` | 編集中のテキストエリア（文字色は preflight の textarea{color:inherit} で親の Card から継ぐ。同じ Card の子の見出しの text-[var(--bone)] が除去検査で dead） | `w-full min-h-[200px] … text-[var(--bone)] outline-none …` | `text-[var(--bone)]` |
| `src/ui/components/SharedMemo.tsx` | 編集中のテキストエリア（レイヤー外の :focus-visible{outline:…} が utilities の outline-none に常に勝つ） | `… outline-none …` | `outline-none` |
| `src/ui/components/SharedMemo.tsx` | 切替ボタン segClass(true) の枝 | `bg-[var(--signal)] text-[var(--on-signal)] font-semibold` | （呼び出しの無い枝を関数ごと消した） |
| `src/ui/components/EndSessionZone.tsx` | 完成ボタン（除去検査で dead・グローバルな :focus-visible に負ける） | `px-5 py-2 … focus-visible:outline-none …` | `focus-visible:outline-none` |
| `src/ui/components/EndSessionZone.tsx` | 最初から（リセット）ボタン（除去検査で dead・グローバルな :focus-visible に負ける） | `px-4 py-2 … focus-visible:outline-none …` | `focus-visible:outline-none` |
| `src/ui/components/RosterPanel.tsx` | 名前 | `min-w-0 font-medium text-base text-[var(--bone)] break-words` | `text-[var(--bone)]` |
| `src/ui/components/RosterPanel.tsx` | 代理追加の入力欄 | `flex-1 rounded-md … text-sm text-[var(--bone)] outline-none …` | `text-[var(--bone)]` |
| `src/ui/components/RosterPanel.tsx` | 代理追加の入力欄 | `flex-1 rounded-md … text-sm text-[var(--bone)] outline-none …` | `outline-none` |
| `src/ui/components/RosterPanel.tsx` | ルートの div | `w-full` | `w-full` |
| `src/ui/components/RosterPanel.tsx` | 行の操作ボタン（MiniButton） | `… focus-visible:outline-none …` | `focus-visible:outline-none` |
| `src/ui/Session.tsx` | ドライバーの名前 | `driver-name-fluid font-black mb-5 text-[var(--bone)] animate-fade-up …` | `text-[var(--bone)]` |
| `src/ui/Session.tsx` | タイマーの数字（通常・一時停止） | `text-6xl lg:text-7xl font-black tabular tracking-tight text-[var(--bone)]` | `text-[var(--bone)]` |
| `src/ui/Session.tsx` | タイマーの数字 | `text-6xl lg:text-7xl font-black tabular tracking-tight …` | `tracking-tight` |
| `src/ui/Session.tsx` | Paused のラベル | `instrument-label mt-1 text-[10px]` | `text-[10px]` |
| `src/ui/Session.tsx` | 次の名前 | `text-[var(--bone)] font-bold text-lg` | `text-lg` |
| `src/ui/Session.tsx` | 駆動パネル（Card） | `relative overflow-hidden transition-all` | `relative`（`.meter-panel` の `position: relative` と同じ値） |
| `src/ui/components/TeamOrbit.tsx` | 王冠（lucide-crown・除去検査で session-driver など 10 状態すべて dead） | `lucide lucide-crown w-3.5 h-3.5 absolute -top-2 -right-1 text-[var(--on-signal)] drop-shadow rotate-12` | `text-[var(--on-signal)]` |

### dead だが写したもの

- `RosterPanel` の改名中の入力欄の `text-[var(--bone)]`・`outline-none`: 除去検査に行が無いので写した（計画 Q5）。代理追加の入力欄の同形は dead で、写しても見た目は変わらない。`SharedMemo` の編集中のテキストエリアの同形は、カスケードの根拠（上の表）で写さなかった。どちらも見た目は同じなので揃えていない

### その他の記録

- **借り物のキーフレームの解消**: `@keyframes pulse` は `session.css` が唯一の定義になった（`loading.css` も同じ名前を使う）。**`animation` の一括指定で書かない**: Tailwind 4.3.3 は CSS の `animation` の値にテーマのキーフレーム名（`pulse`）を見つけると同じ `@keyframes` を出し、定義が 2 つ連なって比較が差を出す（実測。Tailwind の実装・最小のビルド・dist の 3 通りで確かめた）。`session.css` と `loading.css` は `animation-name` などの個別のプロパティで書いた。**PR 4 で Tailwind を外したら、`session.css` の「一括指定で書かない」の注釈を消すか書き換える**（一括指定に戻されても `audit-timer-classes` は捕まえない。Tailwind が無くなれば罠ごと消える）
- `NotifyHint` の根の余白は、親 `Session.tsx` の `space-y-6` に詳細度で勝っていたので、親の縦積み（`.session-panel`）を子と同じタスクで移した（計画 Q1）
- `RosterPanel.test.tsx` のクラス名で書いたアサーションは、`data-scrollable` 属性を見る形に書き直した（計画 Q3・正本 D10）。見学一覧の側は元のテストと同じく見ていない
- `scripts/audit-timer-classes.mjs` の `UNMIGRATED` は PR 3 で空になった。一覧ごと消すのは PR 4
- PR 2 で残した E8 の道具の Minor 3 件（`usage.ts` の `cdp.detach()`・`timer.parity.ts` の `writeUsage` の到達しない `return`・`usage-summary.ts` の `startsNestedDeclarations`）は、PR 4 の前の E8 の決め直しへ送った（計画 Q4・利用者の判断 2026-10-05）。計画の検証で分かったこと: `startsNestedDeclarations` の直しのテストは、本体の無い at-rule を規則の中に置かないと直す前から緑になる／前提の Chromium の挙動は実測していない／`finally` の `detach` は元の例外を隠しうる／`writeUsage` を `throw` にすると失敗の出力から `Expected` / `Received` の行が消える
- 手元の `pnpm audit` は `braces`（GHSA-vfj7-8cjw-p6xm・直る版なし）で赤。ADR 0024 により PR の合否に使わない
- **見積もりと実際**（計画の「検証の時間の見積もり」）: 機械の待ちは見積もり 3〜5 時間に対し約 2.4 時間（タスクごとの比較 約 1.4 時間・対照と通常の全件 約 49 分・手元の検査 約 4 分・`mutation-check` 約 8 分）。タスクごとの比較は Task 1・2・5 が 2 回（Task 2 の 2 回目は修正の後の 1 状態だけ）、Task 6 が 4 回で、ほかは 1 回。実時間は 2026-10-05 08:01〜10-06 09:00 で、そのうち何も動いていない時間が 3 回・合わせて約 20 時間あった（原因は分かっていない）。それを除くと約 5 時間

## PR 4（片付け）

計画: [`2026-10-06-timer-without-tailwind-pr4-cleanup.md`](../plans/2026-10-06-timer-without-tailwind-pr4-cleanup.md)（文脈を共有しない 3 人の敵対的検証を反映した 2 版）。PR: #346。検証の範囲は正本 §7.1・§7.2 に従った。

- **通しの比較**（基準 `ba9249d`）: ブランチの HEAD `0538924f`（Tailwind を外したコミット・作業ツリーは clean）で、通常の比較の全件が緑（差 0・画素一致・期待値と一致。27.1 分。1 回目で緑）。期待値の JSON は変えていない。**これが #321 の完了条件の通しの比較**（正本 §1.2）
- その後のコミット（注釈・文書・テスト・比較の仕組みの撤去）では、timer の dist が `0538924f` の dist と `diff -r` で同一であることを確かめた（最後は比較の仕組みを撤去した `07efc39d` の後）。製品の CSS の宣言を変えたコミットは無い
- 対照実行: 比較用のビルドの切り替えを外した後（`befd41af`）に `lobby` と `session-driver` に絞って流し、緑（8.5 分）
- **Tailwind を外して直した 2 件**（計画の検証で見つけた。見た目は変わらない）:
  - `roster-panel.css` の改名欄の `outline-style: none` を消した（`layer(timer)` を外すと同じ詳細度の後勝ちで `:focus-visible` に勝ち、フォーカスの輪郭が消える。改名中は比較に描かれない）
  - `base.css` の `.sr-only` に `clip-path: inset(50%)` を足した（Tailwind 版の `.sr-only` が足していた宣言。正本 D2）
- **勝ち負けの点検**（`layer(timer)` を外した影響・正本 §7.2 の代わりの突き合わせ）: `base.css` の全セレクタ・部品層（`.ui-*`）と、画面の CSS の同じ要素の同じプロパティを突き合わせた。重なりは `.stage` / `.instrument-stage` の `color`（どちらも `var(--bone)`）だけ。「E8 で当たらなかった規則」と「PR 3 で比較に掛からない要素」の表の各行も見た（上の改名欄の 1 件のほかは無し）。タスクのレビューと `/code-review` も独立に同じ結論
- **ビルド出力**（Tailwind を外す直前の dist と比べた）: `@font-face` は同じ 7 本・重複なし・`url()` はすべて `/timer/assets/`（E4）。前置詞は `-webkit-text-decoration`・`-webkit-text-decoration-color` の回数が減るだけ（`-moz-column-gap` は PR 2・3 の時点で既に消えていた）
- **利用者が承認した差**（2026-10-06・U3）: `color-mix()` の `@supports` の逃げ道が 1 本に畳まれる・`not all and (…)` が範囲構文のまま出る。どちらも Safari 16.4 未満だけに効き、Chromium の物差しには映らない
- **無害として扱った差**（正本 §5.4 の類 1）: Tailwind の `@layer properties`（古い Safari / Firefox 向けに `--tw-*` の初期値を置く `@supports (((-webkit-hyphens:none))…)`）が消えた。timer の CSS は `--tw-*` を `var()` で参照していない
- 破壊検証（どれも赤を見て Edit で戻した。コミットしていない）: `session.css` に生の色（`audit-ui-components`・E5）・`Session.tsx` に `px-4`（`audit-timer-classes` の「定義されていません」・E6）・`.tsx` に `#ff0000`（`design-tokens.test.ts`・E5）・`@keyframes pulse` を消す（借り物のキーフレーム）・トークン層の `@import` を消す（`@font-face` 7 本が差に出る・E4）・キーフレームのテストの件数の断定（違反を 2 回出すと赤）
- 変異: m116（古い一覧）・m117（Tailwind との衝突）は、守っていた判定と一緒に引退させた（ID は再利用しない）。m118 は文脈の行が変わったので作り直した（変異の行は同じ）。`mutation-check` は全件検出（`7ed1acb` の後・手元）
- 依存: `apps/timer-web` から `tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss`、`e2e` から `postcss` を外した（E3）。lockfile に新しいパッケージ・版は無い
- 手元の `pnpm audit --audit-level high` は `braces`（GHSA-vfj7-8cjw-p6xm）と `source-map-js`（GHSA-68fv-2mgg-jv7q）で赤。どちらも main の lockfile に同じ版があり、この PR が持ち込んだものではない。ADR 0024 により PR の合否に使わない
- 手元の `install-with-supply-chain-check` は、検証キャッシュによる短絡で「検証が走っていません」になった（`--config.optimistic-repeat-install=false` でも同じ）。合否は新しい環境で走る CI に任せた
- **流さなかったもの**: E8 の規則の使用状況（正本 §7.2 で記録として受け入れた）・囲いを外した一時ビルド（PR 4 で囲いそのものを外し、通常の比較がそれを測った）

### 比較の仕組みの再現の手順

撤去の直前の SHA は `777df1ab85e4118aa537df60a6860c662ea148de`（PR #346 の枝。squash マージなので main からは辿れない）。

```bash
git fetch origin pull/346/head
git restore --source=777df1ab85e4118aa537df60a6860c662ea148de --worktree -- e2e/parity
# 流し方は戻した e2e/parity/README.md。戻したものはコミットしない。終わったら rm -rf e2e/parity
```

`e2e/tests` の自己テストと、`e2e/tsconfig.json` の `include`・`e2e/package.json` の `lint` の `parity` は戻さなくても流せる（型検査と lint を通したいときだけ戻す）。比較用のビルドの切り替え（囲いを外した一時ビルド・最小化しない CSS）は `befd41af` で外したので、その SHA より前（`5aced845`）からでないと戻らない。

### 現況の記述の仕分け（E9・2026-10-06 の利用者の判断でファイル単位の表）

正本 D8 の検索（`git grep -inE 'tailwind|postcss|autoprefixer|ユーティリティ|任意値|preflight|\[var\(--|[a-z]-\['`。`pnpm-lock.yaml` と過去の記録を除く）を 1 件ずつ仕分けた。

| ファイル | 扱い | 理由 |
|---|---|---|
| `README.md`（技術一覧） | 書き直した | 「Tailwind CSS（timer）」を消した |
| `apps/timer-web/src/ui/use-breakpoint.ts` | 書き直した | 「Tailwind の lg」→ 画面の CSS の `64rem` の境界と揃える |
| `packages/ui/README.md` | 書き直した | timer の行と使い方を `src/index.css` の `@import` に。「Tailwind と併用する場合は `@import` しない」の節を消した（正本 D8） |
| `packages/ui/src/elements/index.css`・`src/tokens/index.css`・`src/tokens/palette.css`・`stylelint.config.mjs`・`tests/tokens.test.mjs` | 書き直した | 理由を「timer が要素層を読まないため」（ADR-0023 決定 4）にした。規則そのものは残す |
| `scripts/audit-ui-components.mjs`（「何を見ていないか」） | 書き直した | 「Tailwind のクラス」の穴を消した（Tailwind が無い） |
| `e2e/support/contrast.ts` | 書き直した | 照明の例を Tailwind のクラスから CSS の宣言にした |
| `apps/timer-web/src/styles/base.css:16` | 書き直した | 「任意値記法 `[var(--*)]` で参照」→「画面の CSS が `var(--*)` で参照」 |
| `apps/timer-web/src/index.css`・`main.tsx`・`styles/*.css` の勝ち負けの注釈 | 書き直した（Task 4・6） | 現況の構成（レイヤー外・`reset` レイヤー）と時点の明示 |
| `apps/timer-web/src/styles/*.css` の見出し「Tailwind のユーティリティの写し」・`scale-exempt:`・写さなかった宣言の記録・`box-shadow` の並び・`.sr-only` の出どころ | 残す | 写しの出どころの記録で、#316 で段へ寄せる手がかり（正本 D2） |
| `apps/timer-web/src/styles/reset.css` | 残す | preflight の逐語と出典・許諾（正本 D4） |
| `packages/ui/src/tokens/shape.css`（`--shadow-crown`） | 残す | 値の出どころ |
| `apps/topic-web/src/index.css`（「Tailwind と併用しない（#297）」） | 残す | 規範として今も正しい |
| `docs/adr/*`（0001・0008・0022・0023 ほか） | 残す | ADR の本文と日付つきの追記は書き換えない（ADR 0002）。0023 には実施状況を追記した |
| ルートの `package.json`・`pnpm-workspace.yaml`・`.github/workflows/ci.yml`・`scripts/audit-*.mjs` の `postcss`・`docs/guides/development.md` の `postcss` の実測・`scripts/audit-supply-chain-config.test.mjs` | 残す | ルートの `postcss`（ADR 0022 決定 7）と日付つきの実測の記録 |
| `scripts/audit-timer-classes(.test).mjs`・`scripts/mutation-check.mjs`・`scripts/mutations/m119-*.patch` | 残す | Tailwind のクラスを書き戻したときに「定義が無い」で落ちる網の説明 |
| `scripts/check-links.mjs` | 残す | 消したパスの例外の理由 |
| e2e のハーネス・`e2e/README.md`・`.vscode/settings.json`・`turbo.json`・`deploy/firewall/connlimit.sh` の `preflight` | 残す | 起動前の検査という別の意味 |
| `format-time.ts`・`format-time.test.ts`・`docs/guides/architecture.md`・`scripts/audit-domain-side-effects.mjs`・`scripts/audit-structure.mjs` の「ユーティリティ」 | 残す | 関数・モジュールの意味 |
| `apps/tasuki-sync`（3 ファイル）・`deploy/README.md`・`deploy/deploy.sh`・`packages/ui/tests/typography-scale.test.mjs`・`scripts/audit-ui-components(.test).mjs` の正規表現・拡張子 | 残す | 検索の `[a-z]-\[` と `postcss` の拡張子の偶然の一致 |
| `e2e/parity/`・`e2e/tests/parity-*`・`*-summary.test.ts`・`e2e/package.json` の `postcss` | 消した（Task 9） | 比較の仕組みの撤去 |

### #316 への申し送り（PR 4 で増えたもの）

- `data-*` の値の不揃い（`data-skipped="true"` と他は `""`）・`TeamOrbit` の「飛ばされる」をクラスで表す 6 枝の三項（`data-skipped` にすれば 3 枝）。PR 4 では直さない（利用者の判断・2026-10-06・U4）
- 大きさで付けた名前（`session-button-sm` / `-xs` など）は、段へ寄せるときに消える
- `transition-property` に写した `--tw-gradient-from` / `-via` / `-to`（`notify-settings.css`・`roster-panel.css`・`shared-memo.css`）。Tailwind の `transition` の値の逐語で、今はどこにも無い名前。消すと計算済みの `transition-property` が基準と変わるので PR 4 では残した
- `use-breakpoint.ts` の `useIsWide` は `innerWidth >= 1024`（px）、画面の CSS は `64rem`。既定の文字の大きさを変えた利用者では食い違う（基準の時点から同じ。`matchMedia('(width >= 64rem)')` で揃えられる）

### 見積もりと実際

- 機械の待ち: 見積もり 2.5〜4 時間に対し約 1 時間（対照実行の一部 8.5 分・通常の比較 27.1 分・手元の CI 一式 約 10 分・`mutation-check` 約 14 分ほか）。比較が 1 回目で緑だった（計画の検証が `.sr-only` と改名欄を先に見つけていた）
- 実時間: 2026-10-06 22:54 開始。**何も動かない空白がまた出た**（比較の仕組みを撤去する実装役が、作業は数分なのに約 5.8 時間戻らなかった）

