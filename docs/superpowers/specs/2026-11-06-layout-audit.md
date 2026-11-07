# 画面の崩れの洗い出し（#479・2026-11-06）

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

- **ISSUE**: #479（子 ISSUE #553〜#558）。進め方は [`docs/superpowers/plans/2026-11-06-layout-breakage.md`](../plans/2026-11-06-layout-breakage.md)
- 基準: main `a765ecf1`
- 撮影: E2E のハーネス（実ビルド・本番と同じ Caddy・実同期サーバー）で一時の spec を流し、8 本・262 枚を撮った。**画像と一時の spec はコミットしていない**（ファイル名は一覧の「スクリーンショット」の列に残す）
- 幅: 320・390・768・1280・1920px（高さ 900）と、段の境目の 639・640・1023・1024px
- 自動の測定: 同じ親を持つ隣り合うブロックの縦の間（4px 未満）・矩形の重なり・横のはみ出し・`expectTouchTargets`（`e2e/support/a11y.ts`）の失敗文
- 横のはみ出し（`scrollWidth > innerWidth`）は **全画面・全幅で 0 件**
- 各項目の扱い（直した PR・残した理由）は、末尾の補遺に子 ISSUE ごとに足す（この節の表は書き換えない）

## 崩れの一覧

| # | アプリ | 画面 | 状態 | 幅 | 種類 | 何が起きているか（数値） | 該当 | スクリーンショット | 優先度 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | poker | ルーム | 全状態（1 人・8 人・公開後・告知の帯あり） | 全幅（320〜1920・境目 639/640/1023/1024） | 1 | **既知の例を再現**。見出しの行 `.room-participants-head` の下端と札の並び `.participants` の上端の間が **0px**（全 9 幅で gap=0）。「見学する」の下端が札の枠に接する。320 では「見学する」が見出しの下の行へ落ち、そのまま札に接する | `apps/poker-web/src/pages/RoomPage.tsx:183`・`apps/poker-web/src/index.css:210-229`（`.participants { margin: 0 }`） | poker-room-voting8-long-390.png・poker-room-after-next-log-320.png・notice-poker-stale-error-390.png | 高 |
| 2 | agenda | 進行中（手元） | 進行中・2 人目も同じ | 320・390・639・640・768・1023（64rem 未満） | 1 | 下端の固定帯 `.run-controls` の地は上へ透明に溶かすグラデーション（下 72% だけ不透明）。帯の 1 行目「このステップに」がその透明部分に乗り、**後ろの進行表の行（「4 Try の議論 40 分 スキップ」）の字と重なって読める**。重なり 275〜308px × 77px（自動）。ラベルは帯の上端に余白無しで貼りつく | `apps/agenda-web/src/run.css:160-168`（`background: linear-gradient(to top, var(--felt-950) 72%, transparent)`）・`run.css:181-193`・`components/RunControls.tsx:26` | agenda-run-running-390.png（拡大 crops/ag390dock.png）・agenda-run-peer-320.png | 高 |
| 3 | topic（ほか Markdown を出す所すべて） | 読む面（場のお題）・poker の読む面・timer の共有メモ | お題あり（段落 12） | 全幅 | 5 | **段落の間が 3.2px で、行間（折り返し）と区別がつかない**。12 段落が 1 つの塊に見える。`.ui-md > * + * { margin-top: var(--space-2) }` が、後に書かれた同じ詳細度の `.ui-md-p { margin: 0 }` に上書きされて効いていない（測定: p→p の間 3.2px、全 9 幅） | `packages/ui/src/components/markdown.css:15` と `:36` | topic-room-topic-set-1280.png・topic-room-topic-set-390.png | 高 |
| 4 | poker | ルーム | 長い名前（28 字・20 字） | 全幅 | 3 | 札の幅が `6.5rem` 固定のため、28 字の名前が **6 行**に折れて札が 275px（1280）に伸び、同じ行の札もすべて同じ高さに伸びて中が空く（「ホスト」「たかはし」の札の下 2/3 が空）。1920 で余白があっても同じ | `apps/poker-web/src/index.css:231-239`（`.participants li { width: 6.5rem }`） | poker-room-voting8-long-1280.png・-1920.png・-390.png | 高 |
| 5 | 共通の見出し（poker・topic・agenda・roulette・checkin） | ルーム | 初期 | 768（640〜おそらく 900 前後） | 3 | 招待の URL が **2 行に折れる**（`…/?room` / `=PG3UJH`）。URL の箱が 2 行ぶん（約 66px）に伸び、隣のボタンと縦が揃わない | `packages/ui/src/components/room-header.css:65`・`packages/ui/src/components/invite.css:20` | poker-room-voting8-long-768.png・topic-room-topic-set-768.png（crops/tp768.png） | 中 |
| 6 | timer | セッション（脇の名簿）・ロビー | 6 人 | 全幅 | 5 | 「ランダム」ボタンが「参加者」の見出しの行の外（`.session-toolbar`）に単独で置かれ、直前の「あなた: ドライバー」の箱の下に浮く。どこに効く操作か読めない。見出しの行には「代理追加」が別にある（ロビーは見出しの行の中にあり、画面ごとに置き場が違う） | `apps/timer-web/src/ui/Session.tsx:412-417` | timer-session-six-long-1280.png・crops/ts390a.png | 中 |
| 7 | timer | ロビー・セッションの名簿 | 自分の行 | 全幅 | 2 | 自分の行だけ操作が「列から外れる／ルームから抜ける」→「上下の矢印」の 3 段になり、**矢印が左寄せ**（他の行は右寄せ）。行の高さも他の約 1.6 倍 | `apps/timer-web/src/styles/lobby.css:100-109` | timer-lobby-six-long-1280.png・-390.png | 中 |
| 8 | poker | ルーム | お題なし | 1280・1920（64rem 以上） | 2 | 見出し（題・招待の行）の左端は 48px（1920 は 240px）なのに、本体（参加者・カード）は 272px（1920 は 592px）から始まる。本体だけが中央の細い列（約 735px）に寄り、**左端も右端も見出しと揃わない**（「票を公開する」の右端 1007 対「選択画面へ戻る」1222） | `apps/poker-web/src/index.css`（`.ui-workspace` の脇が空のときの段組み） | poker-room-voting8-long-1280.png・-1920.png | 中 |
| 9 | poker | ルーム | 8 人 | 320・390・768・1280 | 2 | 札の並びの右に端数の空き（320: 約 74px・390: 約 33px・768: 約 47px・1280: 約 110px）。固定幅の札を左から詰めるので、行の右端が見出しの行・手札の右端と揃わない | `apps/poker-web/src/index.css:221-239` | poker-room-after-next-log-320.png・poker-room-revealed8-1280.png | 低 |
| 10 | poker | ルーム（見積もりの記録） | 「次のアイテムへ」の後 | 320 | 3 | 記録の欄の「（名前なし）」が **2 行に折れる**（隣の「ポイントなし」の選択に押される）。`expectTouchTargets` の「字が 2 行に折れた部品のボタン」に掛かる | `apps/poker-web/src/index.css:531-600`（`.estimate-log`） | poker-room-after-next-log-320.png | 中 |
| 11 | poker | ルーム | 1 人〜8 人 | 320 | 3 | 見出しが 4 段に積まれる（題／「記録する」／「選択画面へ戻る」／「仲間を招く」）。約 230px を見出しが使い、参加者が 1 画面目の 1/4 から始まる | `packages/ui/src/components/room-header.css`・`page-header.css` | poker-room-after-next-log-320.png | 中 |
| 12 | poker | ルーム | 公開後 | 320・390 | 1 | 公開後の下端の帯が 3 段（ポイントの選択・次のアイテムへ・再投票）で約 200px。390×900 の初期表示で「結果」の数字（平均・最頻値）と「（名前なし）」が帯の下に隠れる（帯は仕様・最下部では出る） | `apps/poker-web/src/index.css`（`.room-main > .ui-actions--dock`） | poker-room-revealed8-390.png | 中 |
| 13 | 共通の見出し（全アプリ） | ルーム | 全状態 | 320・390（40rem 未満で戻るが単独行に落ちるとき） | 2 | 「選択画面へ戻る」が単独の行に落ちると、`.ui-button--quiet` の横の余白で **左端が 9px 字下げ**（x=25）になり、題・「仲間を招く」（x=16）と揃わない | `packages/ui/src/components/page-header.css:21`・`room-header.css:140` | poker-room-voting8-long-390.png・checkin-play-six-two-played-390.png・timer-lobby-six-long-320（crops/tl320.png） | 中 |
| 14 | timer | ロビー・セッション・まとめ（状態の帯） | 全状態 | 320・390 | 3 | 状態の帯の「通知」が 2 行目に単独で落ちる（390）。320 では「接続中」も 2 行目へ。帯の項目が 2 行で左右の揃えがばらばら | `apps/timer-web/src/styles/status-strip.css:6-8` | timer-lobby-six-long-390.png・crops/tl320.png | 低 |
| 15 | timer | セッション（名簿） | 長い名前 | 390・1280 | 3 | 長い名前の行は「番号・在席の点」だけが 1 行目に残り、名前が 2 行目以降・矢印が 3 行目・操作が 4 行目になる（1 行 190px） | `apps/timer-web/src/styles/roster-panel.css` | crops/ts390a.png・timer-session-six-long-1280.png | 低 |
| 16 | timer | セッション（交代順の札） | 長い名前 | 390 | 3 | 次の人の札で「→ 次」が「→」と「次」に割れて 2 行に折れる | `apps/timer-web/src/styles/`（`.rotation-lineup-*`） | crops/ts390b.png | 低 |
| 17 | timer | ロビー | 初期 | 320・390 | 3 | 交代間隔の選択肢「15分」だけ 2 行目に落ちる（390）。320 は 3＋2 | `apps/timer-web/src/styles/`（`.session-config-interval`） | timer-lobby-six-long-390.png・crops/tl320.png | 低 |
| 18 | timer | セッション（共有メモ） | 初期 | 1280・390 | 2 | 「編集」が見出し「共有メモ」の下の行に置かれる。同じ脇の「参加者」は見出しの行の右端に操作を置いており、並べ方が揃わない | `apps/timer-web/src/styles/shared-memo.css` | timer-session-six-long-1280.png | 低 |
| 19 | timer | セッション（計器のカード） | 進行中 | 320・390 | 1 | 40rem 未満の帯（時間リセット・スキップ・一時停止の縦 3 段・約 180px）が、初期表示で盤の下半分と「次:」の行を覆う（帯は仕様。最下部では隠れないことを `buttons.spec.ts` が検査済み） | `apps/timer-web/src/styles/`（`.session-driver-card > .ui-actions--dock`） | crops/ts390b.png | 低 |
| 20 | roulette | ルーム（入る人） | 長い名前 | 320・390・1280・1920 | 2 | 長い名前の行だけ「名前を消す」が 2 段目に落ち、行の高さが倍（44→88px）。他の行は 1 段で右端。一覧の行の高さ・ボタンの位置が揃わない | `apps/roulette-web/src/index.css:537-556`（`.roulette-row` の `flex-wrap`・`.roulette-row-label { flex: 1 0 auto }`） | roulette-room-spun-1280.png・-390.png | 中 |
| 21 | landing | 道具を選ぶ | 初期 | 320・390・639 | 5・2 | 道具の札が 1 列・1 枚約 330px で 6 枚約 2000px。参加者・「仲間を招く」が 4 画面ぶん下に遠のく。札の幅は約 240px で中央寄せのため、左右が下の欄（左右 16px）と揃わない | `apps/landing/src/index.css:446-450`（`.hub-tools .tool-card { width: min(15rem, 68vw) }`） | landing-choice-longname-390.png | 中 |
| 22 | landing | 道具を選ぶ | 初期 | 1024〜1920 | 2 | 「参加者」と「仲間を招く」の 2 つの欄の高さが揃わない（143px 対 239px）。「仲間を招く」の下に約 50px の空き | `apps/landing/src/index.css` | landing-choice-longname-1280.png | 低 |
| 23 | agenda | 組む画面 | サンプルを読み込んだ（5 ステップ） | 320・390 | 4 | 「上へ」「下へ」（`.ui-button--quiet .ui-button--sm`）の当たりが **43×44**（44 未満）。10 個。`buttons.spec.ts` は空の組む画面しか測っていないので拾っていない | `apps/agenda-web/src/components/StepEditorRow.tsx:120-135` | agenda-build-sample-loaded-390.png（crops/agb390a.png） | 中 |
| 24 | agenda | 組む画面 | サンプル読込 | 320・390 | 2 | ステップの 2 段目以降（−／分／＋、待つ／自動の切替）が番号の列の下から始まり、1 段目の名前の欄の左端（x=97）と揃わない（x=53） | `apps/agenda-web/src/`（`StepEditorRow` の CSS） | crops/agb390a.png | 低 |
| 25 | agenda | 進行中 | 全状態 | 全幅 | 5 | 会の名前「KPT のふりかえり」が小さな薄い字で操作（音なし・映す表示）と同じ行に置かれ、画面の見出しより弱く、何の名前か読めない | `apps/agenda-web/src/run.css:57-64`（`.run-bar`・`.run-title`） | agenda-run-running-1280.png・-390.png | 低 |
| 26 | agenda | 盤（手元・映す表示） | 進行中・終了 | 全幅 | 1 | 盤の中央の名前と残り時間の行の箱が 6〜10px 重なる（字形どうしは接していないが余白が無い）。映す表示では大きな数字の左端が内側の円の線から約 7px | `apps/agenda-web/src/dial.css`（`.dial-readout`・`.dial-name`・`.dial-time`） | agenda-run-running-1280.png・agenda-projection-bar-shown-1280.png | 低 |
| 27 | checkin | 札を出す途中 | 6 人 | 320・390 | 2 | 手札 4 枚が 2 列で、右の約 1/3（約 120px）が空く。上の席の並び（3 等分で全幅）・帯と右端が揃わない | `apps/checkin-web/src/table.css:447-452`（`.hand`） | checkin-play-six-two-played-390.png | 低 |
| 28 | checkin | 札を出す途中 | 6 人 | 320・390 | 2 | 「2 / 6 人が出しました」が左寄せで、上の席の並び（中央寄せの 3 等分）と揃わない | `apps/checkin-web/src/table.css:410`（`.seat-count`） | checkin-play-six-two-played-390.png | 低 |
| 29 | checkin | 開いた後 | 6 人 | 1023〜1920 | 1 | 下の帯 `.round-dock`（貼りつく）が 1280×900 の初期表示で席の 2 行目（「（あなた）」・長い名前の 2 行目）に 43px 重なる（自動の重なり x=668・y 方向 43px） | `apps/checkin-web/src/`（`.round-dock`） | checkin-revealed-six-1280.png | 低 |
| 30 | checkin | やり方を選ぶ | 初期 | 1280 ほか | 3 | 説明文の最後の「か？」「すか？」だけが 2 行目に落ちる | `apps/checkin-web/src/`（`.method-option`） | checkin-pick-six-long-1280.png | 低 |
| 31 | topic | 作る欄（定型や AI で作る） | 開いた | 1280 | 2 | 「定型から選ぶ」（高さ 44px）が隣の選択（高さ 52px）より上端が 10px 下・中心が 5px ずれる | `apps/topic-web/src/` | topic-room-topic-set-1280.png | 低 |
| 32 | roulette | ルーム | 初期 | 390 | 3 | 「ルームにいない人も、名前を追加すれば入れられます」の「す」1 字だけが 2 行目に落ちる | `apps/roulette-web/src/components/GuestForm.tsx` | roulette-room-spun-390.png | 低 |
| 33 | timer | ロビー | 6 人 | 320 | 1 | 見出しの行で「参加者 (6人)」と「ランダム」の横の間が 3.1px | `apps/timer-web/src/styles/primitives.css:88-99`（`.section-header`） | timer-lobby-six-long-320.png | 低 |

### 件数

- 種類別: 1（詰まる・重なる）7 件（#1・2・12・19・26・29・33）／2（揃わない）12 件（#7・8・9・13・18・20・21・22・24・27・28・31）／3（はみ出す・折り返し）10 件（#4・5・10・11・14・15・16・17・30・32）／4（押せる領域）1 件（#23）／5（階層）4 件（#3・6・21・25）。#21 は 2 と 5 の両方に数えた（33 件・延べ 34）
- 優先度別: 高 4 件（#1〜4）／中 11 件（#5・6・7・8・10・11・12・13・20・21・23）／低 18 件

## 同じ原因でまとまるもの

- **見出しの行と次のブロックの間を誰も持っていない**: poker の `.room-participants-head` → `.participants`（#1）。同じ型の「見出し＋操作の行」は timer の `.section-header`（#33・横の間 3px）と、操作を見出しの行の外へ出した timer の「ランダム」（#6）・共有メモの「編集」（#18）で、**見出し＋操作の行の組み方が画面ごとに 4 通り**ある。Issue B の「見出し＋操作」の部品の実需はここ
- **貼りつく下端の帯が中身に被る（40rem/64rem 未満）**: agenda（#2・透明のグラデーションに字が乗る）・poker 公開後（#12・3 段）・timer（#19・3 段）・checkin（#29）。帯の高さの上限と、帯の上端に不透明な地と余白を持たせるかの約束が無い。#2 だけは字が字の上に乗るので高
- **固定幅の札を左から詰める並び**: poker の席（#4・#9）・checkin の手札（#27）・landing の道具の札（#21）。行の右端が揃わない・長い名前で札が縦に伸びる。並びを `grid` の `auto-fill` で等分するか、名前の行数に上限を置くかを決める所
- **共通の見出し（`RoomHeader`）**: URL の 2 行折れ（#5）・戻るの字下げ（#13）・狭い幅で 4 段（#11）。部品 1 か所を直せば全アプリに効く
- **長い名前の行で操作が折れて行の高さが揃わない**: timer の名簿（#7・#15）・roulette の入る人（#20）・poker の記録（#10）。名前を 1 行で切る（省略）か、操作の段を常に固定するかが行ごとにばらばら
- **Markdown の段落の間（#3）** は部品のカスケードの誤り 1 か所。poker の読む面・timer の共有メモにも同じく効く

## 自動測定の偽陽性（一覧に入れなかったもの）

- **貼りつく帯と全ページ撮影**: 全ページの撮影では `position: sticky/fixed` の帯が「スクロール 0 のときの画面下端」の位置に描かれ、ページの途中に浮いて見える（poker・topic・agenda・timer・roulette の 320/390 の画像）。自動の重なり（「票を公開する ⨯ 手札」「場に出す ⨯ 書く／プレビュー」「+5 分 ⨯ スキップ」）と `expectTouchTargets` の「当たりが重なる」はこれ。帯は仕様で、最下部で隠れないことは `buttons.spec.ts` が検査済み。帯が初期表示で何を隠すかの観点だけ #2・#12・#19・#29 に残した
- **省略（`text-overflow: ellipsis`）・`overflow: hidden` の文字**: 測定は文字の Range の矩形を使うので、切られて見えない部分まで矩形に入る。timer ロビーの名前 ⨯ 「ドライバー2」、checkin の席の名前 ⨯「（あなた）」、topic の切った本文の段落 ⨯ 足の操作（390 で 14 件）、timer まとめの名前 ⨯ 棒はこれ（画像では接していない）
- **意図した重ね**: checkin のやり方の札の扇（各 16 件）・ルーレットの札と盤の指し・poker の手札の 2px（浮き上がり）
- **表とリスト**: agenda の進行表 `.step-list-rows` の行と終了後の表 `.summary-table` のセル（各 37 件）は線で区切った表で、間 0 は正しい
- **字の部品**: `.time-digit` どうし（等幅の数字）、`dt`→`dd`（平均 → 6.3・1.3px）、札のラベル → 名前（2.7px）、checkin の札の名前 → 意味（0.5px）は字の行どうしで、行の高さの中に余白がある。目視で詰まって見えない
- **timer の `h1` の切れ（187>1）**: セッション・まとめで見出しを視覚的に隠す（clip）作り。`ui-visually-hidden` 以外の隠し方なので拾った
- **背景の継ぎ目**: 全ページの撮影で y=900（画面の高さ）に背景の継ぎ目が出る（poker・timer・landing ほか）。`background-attachment` か `100vh` の背景で、撮影の作り方による見え方の可能性が高い。実際にスクロールしたときの見え方は**確かめていない**（実機か viewport を動かして撮り直す必要あり）

## 見た範囲

- 自動の測定は 262 枚すべて
- 画像を目で見たもの: poker（投票中 390・768・1280・1920、公開後 390・1280、記録の後 320、告知の帯 390）、timer（ロビー 390・1280・320、セッション 390・1280、まとめ 390）、topic（お題あり 390・768・1280）、roulette（回した後 390・1280）、landing（道具を選ぶ 390・1280）、agenda（進行中 390・1280、組む 390、映す表示 1280）、checkin（やり方 1280、出す途中 390、開いた後 1280）
- 目で見ていないもの: 1920 は poker だけ。境目（639・640・1023・1024）は数値だけ。landing の名乗る・参加、agenda の終了・映す表示の 768、topic の下書きのタブ、timer のルームのタブと詳細設定、checkin の選ぶ（320・390）
- 撮れなかった状態: 「繋がらない」帯（poker・topic は「同期できていません」とエラーの一言で代えた）。roulette・agenda・checkin・timer の告知の帯
- 背景の継ぎ目（全ページの撮影で y=900 に出る）は、撮影の作り方による見え方と推測している。実際にスクロールしたときの見え方は確かめていない

## 補遺

### #553 で扱ったもの（2026-11-06）

表の本体は書き換えない。決定は [ADR 0035](../../adr/0035-spacing-owner-and-stack-components.md)（Proposed）。

| # | 直し方 | 確かめ方 |
|---|---|---|
| 1 | poker の参加者の区画を `.ui-stack`、見出しの行を `.ui-section-head` にした。画面の `.room-participants-head` は消した。見出しの行と札の並びの間は `--space-3`（12px） | `e2e/specs/spacing.spec.ts`（320・390・768・1280・1920 で 12px 以上）。変異 1200・1204・1205 |
| 3 | `.ui-md > * + *` の規則を、子のリセット（`.ui-md-p { margin: 0 }` ほか）より後ろへ移して後勝ちにした（クラスを重ねる回避はしない）。`gap` の flex にすると 64rem 未満の 3 行の写し（`-webkit-line-clamp`）が行数で切れなくなる（実測）ので、ADR 0035 決定 1 の例外にした | `spacing.spec.ts`（段落の間 8px ±1）。3 行で切る検査（`layout.spec.ts`）は、字の行数の数え上げに加えて箱の高さの上限（行の高さ × 3.5（timer は × 3 ＋ 1）に、トークン `--space-2` の値 8px の 2 つぶんを足した値）を戻した（弱めない）。変異 1203 |
| 6 | 「ランダム」を `RosterPanel` の見出しの行（「代理追加」の隣）へ移した。セッション・ルームのタブの両方 | `spacing.spec.ts`（見出しの行の中にある）。`RosterPanel.shuffle-in-header.test.tsx`。変異 1207 |
| 18 | 共有メモの見出しの行を `.ui-section-head` にし、題と印のまとまりが縮んで「編集」が見出しの右に残るようにした（以前は 22rem の脇で下の行へ落ちた） | `spacing.spec.ts`（1280・1920 で「編集」が見出しと同じ行が必須）。`.shared-memo-lead` を main の形に戻す変異 1273 で、E2E が赤になることを確認（5 回目のレビューで、1 回目は 1280 の判定が緩く、戻しても緑だったことを直した） |
| 33 | timer の `SectionHeader` を `.ui-section-head` にした（横の間 `--space-3`） | `spacing.spec.ts`（同じ行のときの横の間を 11〜24px の両側で測る。上限だけだと `.section-header { column-gap: 3px }` を足しても緑だった）。変異 1206・1284 |

同じ部品へ寄せたもの: poker の見積もりの記録の束（`.ui-stack`・`.ui-section-head`）、roulette のいつものメンツ（`.ui-stack`・`.ui-section-head`）、agenda の保存した流れ（`.ui-stack`）。
当てなかったもの: timer の `Card` の中の縦の並び（`SectionHeader` の `margin-bottom` と共有メモの見出しの `margin-bottom` を移行の途中の例外として残した。親が `gap` を持つ形への移行は #556）、他の `ui-panel` の中の並び（画面ごとの grid / flex が既に `gap` を持っている）。

#### #553 のレビューで変えたこと（2026-11-06）

- ADR の番号を 0034 から 0035 へ振り直した（別の PR が 0034 を使うため）。
- ADR 0035 決定 1 に、検査（E2E で結果を測る理由）・置き換える箇所（ADR 0022 決定 4）・例外（timer の `.section-header` と `.shared-memo-header` の `margin-bottom`・#556 で取り除く）を書いた。ADR 0022 決定 4 の末尾に「現行の正本」の 1 行を足した。 → 例外の取り除き・検査は、後の節（4 回目・5 回目・6 回目・7 回目）で改めた（例外の置き方は ADR 0035 の本文が正本）。
- README の「画面が持つのは配置」「パネルは面だけ」に並びの部品の例外を書き足し、`.ui-section-head` の間（横 `--space-3`・折り返した行 `--space-2`）を ADR と README に揃えた。
- roulette の `.roulette-regulars-notice:empty` の負の余白（親の gap を子が打ち消していた）をやめ、隠し文字と同じ作り（絶対配置・1px・切り抜き）にした。`display: none` はライブリージョン（`role="status"`）が読み上げの木から外れて、あとから入る知らせが届かないことがあるので使わなかった。
- #6 の続き: timer の参加者の見出しの行は、64rem 以上の脇（294px）で見出しと「ランダム」「代理追加」が 2 行に割れ、操作が右寄せで離れて見えた。操作の塊の右寄せを外し、折り返したときは見出しの下 8px・左端そろいに置くようにした。E2E は「同じ行」か「見出しの下 8px・左端そろい」のどちらかを測る（ロビー・セッション・共有メモ）。

#### #553 の `/code-review` と再レビューで変えたこと（2026-11-06）

- poker の記録の束の見出しの行: 部品の折り返しを画面が止め（`flex-wrap: nowrap`）、長い項目名の側が縮んで「左に名前・右にポイント」を保つ。空白の無い 40 字の名前で 320 と脇（1280）を測る。
- poker の参加者の見出しの行: 「見学する」を見出しの隣へ寄せた（画面が `justify-content: flex-start` で上書き）。1280・1920 で見出しから反対の端まで離れていた。折り返したら部品どおり見出しの下に左端そろいで落ちる。この 2 つの寄せ方は使う画面が 1 つなので部品に修飾を足さず、画面が上書きする（ADR 0035 決定 3）。 → 「4 回目の敵対的レビューと /code-review で変えたこと」で改めた（寄せ方は部品 `.ui-section-head--beside` へ上げ、画面の上書きは消した）。
- roulette のいつものメンツの見出しの行: 基準線で揃える（部品の既定の中央揃えだと字の大きさの違う見出しと「この端末だけ」の基準線が約 2px ずれた）。
- 3 行の写しの検査: 高さの上限を緩めず、字の行数（見えている行は 3 以下で、切られた行がある）で測る形に替えた。`line-clamp` を 4 にすると赤になる。
- timer の「ランダム」: `ShuffleButton` にまとめ、ロビーと名簿が使う。`lobby-shuffle-*`・`session-shuffle-label` を消し、`.session-toolbar` のコメントを今の使い手に合わせた。
- roulette の空の知らせ: 部品 `.ui-visually-hidden` の宣言を全部写した規則にし、写しであることを契約テストで固定した。読み上げの木に残ることは `getByRole('status')` の数で測る（`visibility: hidden`・`aria-hidden`・`hidden` で赤になる）。
- 契約テストのクラス一致を完全一致にし、`expectActionsBelongToHeading` は見出しの行を先に決め、見出しを完全一致で引く。
- ADR 0022 への書き足しを追記の節にし、ADR 0035 の言葉（決定 4 の一部を置き換える・採択後）を揃えた。timer の `margin-bottom` の例外を取り除く作業は #556 のやること。

#### #553 の 3 回目の敵対的レビューで変えたこと（2026-11-07）

- 変異 1211 を元の形（隠す塊をまるごと負の余白 `margin-block-start: calc(-1 * var(--space-3))` に置き換える）に戻した。契約テストと変異検査で検出される。空の知らせの規則のコメントに、写しの `margin: -1px` は `.ui-visually-hidden` の宣言の写しで、絶対配置（流れの外）なので gap には効かないと補った。
- origin/main（#565）を取り込み、`layout.spec.ts` の 390 の比較は #565 の `dockClearance`＋`expect.poll` と、この PR の `previewLines`（字の行数）の両方を残した。
- timer の名簿の見出しの行（ロビー・セッション・ルームのタブ）は、操作を見出しの隣へ寄せた（`SectionHeader` の `beside`・`.section-header--beside`）。ルームのタブ 1024px で 577px、ロビー 768px で 396px 離れていた。E2E はルームのタブ（390・768・1024・1280）とロビー 768 を足し、横の間の上限 24px を測る。折り返したときの左端は、見出しを持つ要素（アイコンの左端）に揃える。名簿の中身（「ドライバー」の小見出しや行）の左端と同じ線になり、アイコンの左から読み始められるため。h2 の字の左端には揃えない。
- poker の記録の束のポイントの選択は、行の 45% までに縮め（`max-inline-size`・`min-width: 0`・字は 16px のまま、はみ出す分は省略記号）、名前の列を主にした。320px で名前が 9 行になっていたのが 4 行に収まる。E2E は名前の列が選択欄より広いことと、選択欄の字が 16px 以上であることを測る。

#### #553 のレビューの続き（2026-11-07・選択欄の字を切らない）

- poker の記録の束の見出しの行は、選択欄の字を切らない形に直した。直前の直し（行の 45%・省略記号）は 320px で「ポイントなし」が「ポイン」になり、選んだ選択肢が読めなかった。
- いまの形: 行は折り返してよく、名前の列は `flex: 1 1 12rem; min-width: 0`、選択欄は `flex: 0 0 auto; margin-inline-start: auto`。広い幅は「左に名前・右にポイント」の 1 行、名前の列が 12rem を取れない幅は、選択欄が名前の下の行の右端に落ちる（左端には落とさない）。
- E2E は 320・390・768・1280 で、選択欄の字が切れていないこと（`scrollWidth <= clientWidth`）、同じ行なら名前の列が選択欄より広いこと、落ちたなら右端が行の右端と 1px 以内で揃うこと、名前が 4 行以下であることを測る。直前の形に戻すと 320 で赤になり、右寄せを外すと右端のずれ（97px）で赤になる。

#### #553 の 4 回目の敵対的レビューと /code-review で変えたこと（2026-11-07）

- 記録の束の見出しの行の形を決め直した: 名前の列は `flex: 1 1 auto; min-width: 0`（基準幅 12rem をやめた）。名前が 1 行に収まるときは同じ行の右にポイントが並び、収まらない長い名前のときだけ選択欄が下の行の右端に落ちる。以前は「A」でも 320・390・1024 の脇で選択欄が落ち、1 行の束と 2 行の束が混ざっていた。画面の `flex-wrap` の写しと、どこにも当たらない子の規則は消した。
- 部品に `.ui-section-head--beside`（poker の参加者・timer の名簿）と `.ui-stack--tight`（poker の束・agenda の保存した流れ）を上げ、画面の上書きを消した。束の見出しの行と回の記録の間は 8px に戻した。
- E2E: 選択欄の字が切れていないことを、選んだ選択肢の自然な幅（制約なしの複製で測る）以上かで見る（「ポイントなし」と「13」。`max-inline-size: 3rem` で赤）。短い名前の束は 6 つの幅で同じ行（名前の列を `flex: 1 1 100%` にすると赤）。長い名前は同じ行か、選択欄が下の行の右端。以前の `sameLine: true` の判定は、この 2 つで置き換えた。束の見出しの行と回の記録の間 8px。
- 3 行の写しの検査は、箱に掛かる行（半分覗く 4 行目も）を数える（`.ui-reader-preview` の縦の余白を padding に戻すと赤）。
- timer: 「ランダム」の導き方を 1 度にし（Session）、Lobby と条件をそろえた。`ShuffleButton` のスタイルは `shuffle-button.css` へ移した。
- 変異を新しい形に合わせて作り直し（1213・1214・1250・1252・1255・1256）、1257〜1259・1270〜1272 を足した。1213 は E2E では等価で、字面の契約でだけ捕まる。

#### #553 の 5 回目の指摘で変えたこと（2026-11-07）

- 記録の閉じた束で名前の変更を始める（ボタンが入力に替わる）と、入力の固有幅（size=20・約 180px）が名前の列の基準になり、選択欄が次の行へ落ちた。入力の基準幅を 0 にし、変更の前後で選択欄が同じ行に残ることを E2E で測る（変異 1277）。
- 共有メモの「編集」は、1280・1920 で見出しと同じ行を必須にし、`.shared-memo-lead` を戻す変異 1273 を足した。
- 3 行の写しは、行数の数え上げに加えて箱の高さの上限も戻した（変異 1274）。`expectActionsBelongToHeading` は、前方一致・同じ行の必須を引数にして、poker の「見学する」もこれで測る。
- 「ランダム」を出す条件（2 人以上）は `ShuffleButton` の 1 か所へ寄せ、ロビーと名簿が使う。振る舞いは timer-web の vitest（ロビー・セッション・ルームのタブ）で確かめる。
- アプリのソースの文字列を固定していた契約テストは、各アプリの vitest（描いた結果）へ移し、変異は移った先の試験で検出されるように作り直した。roulette の空の知らせは、JSX が空のあいだだけ部品 `ui-visually-hidden` を足す形にし、`:empty` の写しと同期の試験を消した。
- Markdown の段落の間は、クラスを重ねる回避（`.ui-md.ui-md`）をやめ、規則を子のリセットより後ろへ移した。
- agenda の保存した流れに 40 字の名前を保存しても、320〜1280 で横に溢れない E2E を足した（main では溢れていた。変異 1275）。

#### #553 の 8 回目の指摘で変えたこと（2026-11-08）

- 開いた束の「見積もり中」は、長い名前で次の行の左端へ落ちたので、点数の選択欄と同じく右端へ寄せた（変異 1285）。
- 編集中の入力は 1 行の高さ（`--tap-target`）で包みの上端にそろえた。見えない複製が折れても伸びない（変異 1286）。複製は `.estimate-item-title` のクラスを持たない（変異 1287）。
- `stack.css` と `section-head.css` を部品層の最後に読むようにし、リセットが後に読む部品の margin にも必ず勝つ形にした（変異 1283）。
- 部品のテスト（`packages/ui`）がアプリを読んでいた契約を、各アプリの vitest（`spacing-css.test.ts`）へ移した。部品の CSS の契約だけを `packages/ui` に残した。`packages/ui/package.json` に postcss を足した。
- 変異 1213 を、名前の列が縮まない方向（`min-width: 12rem`）の、E2E で赤になる形に作り直した。
- 同じ行のときの見出しと操作の横の間を、下限（`--space-3` に対して −1px）も測る（変異 1284）。
