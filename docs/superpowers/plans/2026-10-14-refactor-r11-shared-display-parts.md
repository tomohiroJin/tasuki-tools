# R11 表示部品の重複を解く（#371）— 実装計画

- **Issue**: [#371](https://github.com/tomohiroJin/tasuki-tools/issues/371)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)・波 2）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.8（web の共有の層）・§5.9（デザインシステム）
- **日付**: 2026-10-14
- **実測時点**: main `6a1d955`（#369 の PR #386 のマージ後）。#370 の PR #388 は未マージ（触るファイルは重ならない。`CurrentTopic.tsx`（topic）だけは両方が触るので、#388 のマージ後に始める）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 寄せる前に、各アプリの Markdown の描画・お題の札と引き出し・隠し文字の DOM（役割・ラベル・クラス・見出しの段）を固定する（Task 1）。共有する部品は単体テストを先に書く |
| II. 技術選定は ADR を通す | 通過 | 外部の依存は足さない。ただし `docs/adr/0021` 決定 7（描画は各アプリが持つ）を変えるので、ADR に追記する（判断 2） |
| III. 揮発インメモリと単純運用 | 該当なし | 保存に触らない |
| IV. 境界の型安全 | 該当なし | 境界の型に触らない |
| V. 実画面検証 | 通過 | `pnpm e2e`（CI。`timer.spec.ts`・`poker.spec.ts`・`topic.spec.ts`・`*-a11y.spec.ts`・`invite-sheet-md.spec.ts`） |
| VI. 依存は内向き | 通過 | 描画の部品は `@tasuki/web-kit` の新しい入口に置き、`@tasuki/markdown`（React を知らない）を読む。依存の向きは `audit-dependency-direction.mjs` の許可表で固定する |
| VII. 検査は壊して確かめる | 通過 | 足すテスト・検査（部品の使用の数え方）は壊して赤を見る。掛かる変異のパッチを ID と意味を変えずに当て直す |
| VIII. 記録が正本 | 通過 | `docs/adr/0020`（招待の表示の構造は各画面）・`0021`（Markdown）・`0022`（部品層）に従い、変える 0021 には追記する |
| IX. 小さく回す | 通過 | 2 つの PR に分ける（判断 1） |
| X. 抽象は実需で | 通過 | 寄せるのは同じ形が実際に 3 つ以上あるもの（Markdown 3・引き出し 3・隠し文字 3・玄関への道 3）。2 つしか無く形も違うもの（タブ・確認のダイアログ・ルーターの振り分け）は寄せない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | ログに触らない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

| Issue の項目 | 実測（main `6a1d955`） | 確かめた場所 |
|---|---|---|
| `Markdown.tsx` が 3 つ | Issue のとおり。poker と topic はコメント 1 行だけが違う。timer はクラスの表（`MARKDOWN_CLASS`）と見出しの段（`headingBase`、既定 3）を足したもの。**クラスの値は 3 つとも同じ**（`ui-md`・`ui-md-code`・`ui-md-h` …）。違うのは見出しの段（poker・topic は 4 固定、timer はお題が 4・共有メモが 3）と、根のクラス（poker・topic は `ui-md ${className}`、既定で末尾に空白が付く。timer は `ui-md` だけで `className` を持たない） | `diff` |
| お題の札と引き出し | poker `CurrentTopic.tsx`・timer `TopicCard.tsx`・topic `CurrentTopic.tsx` の 3 つが、`dialogRef`・`showModal()`・`close()`・`onClose` で「続きを読む」へフォーカスを戻す、という同じ形を持つ。マークアップは 3 つとも違う（topic はタブを持つ） | 同左 |
| ルーター | topic と roulette の `router.ts` は `BASE` とコメントだけが違う（`parseRoute` 約 10 行・`hubPathFor`・`redirectTo`）。poker は旧リンクの救済を持ち、`hubPathFor` も `encodeURIComponent` で組む別の形。**玄関への道（`?room=` と `?left=`）は timer の `ui/entry.ts` の `hubRoomPath` も同じ形で持つ**（topic・roulette・timer の 3 つ） | `grep` |
| 招待の表示 | `ui-invite` の印は topic・roulette の `InviteLink.tsx`・poker `RoomPage.tsx`・timer `InvitePanel.tsx` の 4 つ。「コピーしました」は 5 つ（玄関・poker・timer 2・topic と roulette は `copy.ts`）。文言は 3 通り（「コピーしました」「コピーしました。」「参加 URL をコピーしました。」） | `grep` |
| 隠し文字の CSS | Issue のとおり 3 つ（timer `.sr-only`・topic `.topic-visually-hidden`・roulette `.roulette-visually-hidden`）。timer は `.tsx` 8 か所で `sr-only` を使う | `grep` |
| タブ | timer `Tabs.tsx`（77 行）と topic `CurrentTopic.tsx` の札の上のタブ。見た目が違う（topic は札の上のタブ） | 同左 |
| 確認のダイアログ | timer の `ConfirmDialog.tsx`（88 行）と `useFocusTrap.ts`（102 行）。使うのは timer の 4 か所だけ | `grep` |
| テスト | Markdown: topic `markdown.test.tsx`・timer `Markdown.test.tsx`。**poker の Markdown の描画のテストは無い**。札: poker `current-topic.test.tsx`・timer `TopicCard.test.tsx`・topic `topic-room.test.tsx`。隠し文字: 専用のテストは無い | `ls` |
| 検査 | `audit-ui-components.mjs` の 3 は「部品の CSS に定義した `.ui-*` を、**2 つ以上のアプリの `src` の `.tsx`** が使う」。**Markdown の描画をパッケージへ移すと、`ui-md-*` を使う `.tsx` がアプリから消え、この検査が落ちる**（判断 3）。`audit-timer-classes.mjs` は timer の `_CLASS` の表を読む | 各スクリプト |

## 2. この Issue でやること・やらないこと

### PR A: 読む面の部品（Markdown の描画・引き出し）と隠し文字

1. **Markdown の描画を 1 つにする。** `@tasuki/web-kit` に新しい入口 `./reader` を作り、`Markdown`（`headingBase: 3 | 4`・`className?`）を置く。3 つのアプリの `Markdown.tsx` を消して置き換える
   - 見出しの段は呼び出し側が渡す（poker・topic は 4、timer のお題は 4・共有メモは 3）。**今と同じ段を出す**
   - クラスは今と同じ値（`ui-md-*`）を部品が持つ。timer のクラスの表（`MARKDOWN_CLASS`）は消える
   - 根のクラスは `ui-md`（`className` があれば後ろに足す）。poker・topic の既定で付いていた末尾の空白は無くなる（`classList` は同じで、見た目も変わらない。Task 1 のテストは `classList` で見る）
   - `@tasuki/markdown` は React を知らないまま残す
2. **引き出しの開閉とフォーカスを戻す処理をフックにする。** 同じ入口に `useReaderDrawer()`（`dialogRef`・`triggerRef`・`open`・`close`・`onClose` を返す）を置き、3 つの札がそれを使う。**マークアップは各画面に残す**（構造が 3 つとも違う。topic はタブを持つ）
3. **隠し文字を部品層に置く。** `packages/ui` の部品層に `.ui-visually-hidden` を足し（宣言は timer の `.sr-only` の和。設計正本 D2「両版で勝っている宣言の和を残す」）、3 つのアプリの写しを消して置き換える
4. 検査と文書: 判断 3 の検査の広げ方・依存の許可表・`packages/ui/README.md`・`packages/web-kit/README.md`・`docs/adr/0021` への追記

### PR B: 玄関への道と、寄せないものの記録

5. **玄関への道（`?room=` と `?left=`）を 1 つにする。** timer の `hubRoomPath` と topic・roulette の `hubPathFor` は同じ文字列を出す。`@tasuki/sync-client` の `invite-url.ts`（参加用 URL の組み立ての正本）の隣に `hubRoomPath` を置き、3 つを置き換える。**poker の `hubPathFor` は置き換えない**（`encodeURIComponent` で組むので、記号を含むコードで出る文字列が違いうる。#360 の「振る舞いを変えない」）
6. **寄せないもの**を計画とガイドに記録する（下の「やらないこと」）

### やらないこと

- **ルーターの振り分け（`parseRoute`）を共有すること。** topic と roulette の写しは約 10 行で、20 行の基準に届かない。poker は旧リンクの救済を持つ別の形
- **招待の表示の構造を `packages/invite-ui` の部品にすること。** `docs/adr/0020` は「表示の構造は各画面が持つ」と決めており、見た目は部品層（`.ui-invite`）が既に持つ。文言も 3 通りあり、そろえると振る舞いが変わる（#369 で決めた「文言は各アプリの `copy.ts`」と同じ扱い）
- **タブを部品層に足すこと。** 2 つしか無く、見た目が違う（topic は札の上のタブ）
- **timer の確認のダイアログを `<dialog>` に替えること。** 使うのは timer だけで、`<dialog>` にするとフォーカスの初期位置と Esc の扱いが変わりうる（Issue の条件「変わるなら替えない」）
- 見た目・文言を変えること

### 判断していただきたいこと

| # | 論点 | 推す案 | 理由 | 退ける案 |
|---|---|---|---|---|
| 1 | PR の分け方 | **2 つ**（PR A: 読む面の部品と隠し文字／PR B: 玄関への道と記録） | PR A は 3 アプリの画面・検査・ADR にまたがる。PR B は小さく、別に戻せる | 1 つの PR |
| 2 | Markdown の描画の置き場 | **`@tasuki/web-kit` の新しい入口 `./reader`**（設計正本 §5.8 の案）。`docs/adr/0021` 決定 7 に追記する | 3 つの写しのうち 2 つは同一で、残る 1 つも見出しの段の引数で同じにできる。0021 が共有を退けた理由（「`packages/ui` は CSS だけで React の基盤が無い」）は、#369 で React の共有パッケージ（web-kit）ができて当たらなくなった | 各アプリに残す（直すたびに 3 か所を直す状態が続く） |
| 3 | 部品の使用の数え方（`audit-ui-components.mjs` の 3） | **共有パッケージの `.tsx` が使う `.ui-*` は、そのパッケージに依存するアプリの数で数える**（依存は `package.json` から引く） | 部品の描画を共有すると、使う字面はパッケージにしか無くなる。「2 つ以上のアプリが使う」の趣旨（死んだ部品・1 アプリだけの部品を見つける）は、依存で数えても保てる | クラスの表をアプリから渡す（字面をアプリに残すためだけの引数になる） |
| 4 | スクリーンショットの比較（Issue の完了条件） | **#369・#370 と同じく、画面のテスト・`pnpm e2e`（a11y を含む）で代える** | 変えるのは描画の部品の置き場とクラス名（隠し文字）で、出す DOM の役割・段・クラスは Task 1 のテストで固定する。比較の仕組みは #372 で用意する | 比較の仕組みをこの Issue で用意する |

## 3. 振る舞いを保つ方法

- **出す DOM を変えない。** 寄せる前に、各アプリの Markdown の描画（見出しの段・クラス・リンクの属性・コードのフォーカス）・札と引き出し（開く・閉じる・Esc・フォーカスが戻る）・隠し文字（画面に出ず、名前に入る）を画面のテストで固定する（Task 1）
- 画面のテストを期待値を変えずに通す。例外は、隠し文字のクラス名を見ているテストがあればその名前だけ（着手時に洗い出す）
- **実経路**: `pnpm e2e`（CI。a11y の E2E を含む）
- **変異**: 掛かるパッチ（着手時に `grep` で洗い出す）を ID と意味を変えずに当て直す。**変異検査を走らせている間は作業ツリーに触らない**

## 4. タスク（PR A）

### Task 1: 特性テストを足す（緑で入れて、壊して赤を見る）

| 振る舞い | poker | timer | topic |
|---|---|---|---|
| Markdown: 見出しの段・各ブロックのクラス・リンクの `target`/`rel`・コードの `tabIndex` | **無い（足す）** | `Markdown.test.tsx`（段 3 と 4 を確かめる） | `markdown.test.tsx` |
| 札: 続きを読むで開く・閉じるボタンと Esc で閉じる・閉じたらフォーカスが戻る | `current-topic.test.tsx` | `TopicCard.test.tsx` | `topic-room.test.tsx` |
| 隠し文字: 画面に出ず、読み上げの名前に入る | 該当なし | 着手時に確かめる | 〃 |

### Task 2: `@tasuki/web-kit/reader` に `Markdown` と `useReaderDrawer` を作る（単体テストを先に）

### Task 3: 3 つのアプリの `Markdown.tsx` と札を置き換える

### Task 4: `audit-ui-components.mjs` の数え方を広げる（判断 3。自己テストを先に書き、壊して赤を見る）・依存の許可表

### Task 5: `.ui-visually-hidden` を部品層に足し、3 つの写しを置き換える

### Task 6: 文書（`docs/adr/0021` の追記・`packages/ui/README.md`・`packages/web-kit/README.md`）と通しの確認

- `pnpm test`・`typecheck`・`lint`・各監査・スクリプトの自己テスト・変異検査・`pnpm e2e`（CI）
- `/code-review`・`/security-review`（Markdown の描画はリンクを出すので、`safeHref` を通ることを見る）

## 5. タスク（PR B）

- Task 7: `@tasuki/sync-client` に `hubRoomPath` を置き（単体テストを先に。timer の今のテストの表を写す）、timer・topic・roulette を置き換える
- Task 8: 寄せないものを `docs/guides/architecture.md` と設計正本 §5.8・§5.9 に追記し、計画の末尾に実施の記録を残す

## 6. 変異の ID

**新しい ID は足さない。** 当て直すパッチは ID・名前・検出を期待するテストを変えない。

## 7. 完了条件（#371 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] 描画された DOM が変更前と同じ（画面のテストを期待値を変えずに通す・`pnpm e2e` と a11y の E2E が緑）。スクリーンショットの比較は判断 4 で代える
- [ ] `audit-ui-components.mjs`（判断 3 で広げた数え方）・`audit-timer-classes.mjs` が緑
- [ ] `packages/ui/README.md` を更新した
- [ ] 変異検査が全件検出。`pnpm test`・`typecheck`・`lint`・構造監査が緑
- [ ] #360 の共通の守りを満たす

## 8. 実施の記録（2026-10-14・PR A）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **§2 の判断 1〜4 は、利用者が推奨を了承した。** #370（PR #388）のマージ前に着手したので、#370 の上のローカルのブランチで進め、#388 のマージ後に main の上へ載せ替えて PR にする
- **3 つのアプリの Markdown の描画は、実測で同じ DOM を出していた。** 同じ原稿を描いて DOM の形（タグ・クラス・リンクの属性・コードのフォーカス・見出しの段）を書き出し、poker と topic と timer（段 4）が一致することを確かめてから寄せた
  - 寄せた後、各アプリの形のテストは同じ部品の写しになったので web-kit の 1 つに集約した
  - 代わりに、各画面が実際に渡す段を画面のテストで見る（poker の札は h4・timer の共有メモは h3。どちらも段を変えて赤を確かめた）
- **構造の監査（`audit-structure.mjs`）は、パッケージの入口を 1 つしか持てなかった。** web-kit に 2 つ目の入口（`./reader`）を足すと、到達性（SC-027）がその入口のファイルを「届かない」と数えた
  - 入口を非空の文字列の配列で宣言できるようにした（`entriesOf`）
  - 空の配列・空文字を含む配列は不正として落とす。公開面の監査も同じ一覧を見る
  - 宣言を壊す配線のテスト（`scan-target-wiring.test.mjs`）は、書き換える行を新しい形に合わせた（壊し方は同じ）
- **公開契約の未使用（SC-039④）は、#369 から web-kit の入口の値を数え損ねていた。** サブパス（`@tasuki/web-kit/sync`）からの取り込みを一律に数えなかったため
  - サブパスの入口（`src/<sub>/index.ts`）は、そのサブパスからの取り込みを根拠に数えるようにした。本体の入口の数え方は変えていない
  - 報告だけの指標で、#369 の後の 4 件 → 2 件
- **部品の使用の数え方（判断 3）は、計画より狭くした**
  - 計画は「共有パッケージに依存するアプリの数で数える」だった。依存で数えると、web-kit を同期のためだけに使う玄関・ルーレットまで Markdown の部品を使っていることになる
  - 実装は「共有の入口から部品そのもの（`Markdown`）を値として取り込むアプリ」で数える（`SHARED_UI_ENTRIES`）。引き出しのフックだけ・型だけを取り込むアプリには数えない（`/code-review` の指摘）
- **隠し文字（`.ui-visually-hidden`）は、宣言の和から 2 つを外した**
  - timer の `clip` は、部品層の lint（`property-no-deprecated`）が禁じる。同じ役目は `clip-path: inset(50%)` が持つ
  - topic の字の色（`--coal-soft`）は、隠れている間は見えず、部品は地の色を知らないので持たない
- **使わなくなった `@tasuki/markdown` の依存と許可を、poker・topic・timer から外した**（`/code-review` の指摘）。アプリが解析を直接読んで描画の写しを作ることを、依存の向きの検査が止める
- **札の行数（前 → 後）**
  - poker `CurrentTopic.tsx` 83 → 80
  - timer `TopicCard.tsx` 78 → 76
  - topic `CurrentTopic.tsx` 250 → 248
  - 消した `Markdown.tsx`: 93・93・170 行。足したもの: `web-kit/src/reader/` の 3 ファイル
- **`/security-review`**: 下の通しの確認で行う
- **`/code-review` の指摘のうち、直さなかったもの**
  - 共有の入口の取り込みを `.tsx` だけで見る。アプリの部品の使用を `.tsx` の字面で数えるのと同じ範囲にそろえた
  - サブパスの入口を位置（`src/<sub>/index.ts`）で推すこと。今のパッケージはすべてこの形で、外れても報告だけの指標が増えて見えるだけ。前提を注釈に書いた
