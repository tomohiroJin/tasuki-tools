# #95 S5b（#248）poker をハブ経由で使えるようにする — 実装計画

> **作業する人へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` でタスク単位に実施すること。手順はチェックボックス（`- [ ]`）で追う。

**目的:** 選択画面（ハブ）から poker のルームへ入れるようにする。あわせて S4a・S5a から
送られた申し送り 3 件（ツール状態の遅延生成・名前の上限の統合・R8 の poker 側）を消化する。

**設計:** 入口ごとの門（`tool-gate.ts`）を廃止し、**ツール状態はそのツールへ初めて入った
ときに作る**（D8）。門が担っていた越境の遮断は、**合言葉の検査をルーム参加の唯一の関門へ
集約する**ことで置き換える（ADR 0011 の S4a 追記が「S5 でそうなる」と予告している形）。
表示名の規約は `@tasuki/room-core` に 1 つだけ置き、poker の入口もそれを通す。

**技術:** TypeScript 6 / React 19 / Vite 8 / Vitest 4 / Bun（sync）/ valibot / Playwright。

**設計正本:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`
（D2・D8・D11・D12・D14・D17・D18・§7 の S5b 行と「なぜ S5b を落とせないのか」）
**要求の正本:** [#248](https://github.com/tomohiroJin/tasuki-tools/issues/248)（EARS: R4・R5・R8）
**決定の正本:** `docs/adr/0011`（脅威モデル・門の廃止をここへ追記する）・`0017`・`0018`

---

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを失敗するテストから始める。判定は純粋関数へ切り出す（`parseRoute` / `initialTimerState` / `discardVote`） |
| II. 技術選定は ADR を通す | 該当なし | ライブラリを足さない |
| III. 揮発インメモリと単純運用 | 通過 | ルームの寿命と回収を変えない。**ツール状態の生成時期だけが変わる**（保管先は同じ `TimerStore` / `RoundStore`） |
| IV. 境界の型安全 | 通過 | poker の受信は `parseClientMessage` のまま。表示名の規約は境界の内側（アプリ層）で課す（timer が S4b で採った形） |
| V. 実画面検証 | 通過 | Task 6 で `http://localhost:5175/` の全遷移を目で通す |
| VI. 依存は内向き | 通過 | `poker-core` は `room-core` を知らないまま（D2）。表示名の規約はアプリ層と web 層が `room-core` から取る |
| VII. 検査は壊して確かめる | 通過 | Task 2 で合言葉の関門を、Task 3 で票の破棄を、対照実行つきで壊して確かめる。変異検査へ 3 件足す |
| VIII. 記録が正本 | 通過 | 門の廃止は ADR 0011 へ追記する。設計正本には S5b 実施時の訂正を入れる |
| IX. 小さく回す | 通過 | PR 1 本。**デプロイは伴わない**（全段完了後に 1 回・利用者の承認を得てから） |
| X. 抽象は実需で | 通過 | `packages/sync-client` の利用者が 3 つになる。端末側の同一性の保存も 3 つ目の写しが出るので、写す前に寄せる（Task 4） |
| XI. 秘密と個人情報を持ち込まない | 通過 | **門を外すぶん、合言葉の関門を poker の入口にも置く**。応答は「存在しないルーム」と同一にし、列挙の手がかりを作らない（ADR 0011 決定 2） |

**逸脱なし。**

---

## 着手前に読むもの

1. `docs/guides/definition-of-done.md`（DoD 8 項目。該当しない項目は「該当なし」と明記する）
2. **`docs/adr/0011` 決定 2 の S4a 追記**（門が何を守っているか。ここを外す段なので必読）
3. `docs/adr/0015`（web 層の 3 責務）・`docs/adr/0017`（文脈とパッケージ）
4. `apps/tasuki-sync/src/application/tool-gate.ts` の docstring（門が「S5b で置き換わる」と書いている）

## この計画が前提を実測した結果（2026-09-13・main `d4d5c3a`）

**Issue 本文にも設計正本にも無かった事実が 3 つある。** どれも実装の形を変える。

| # | 実測した事実 | 帰結 |
|---|---|---|
| 1 | **poker の `handleJoinRoom` は `join-room.ts` を通らず、合言葉の検査を一切持たない。** 越境を止めているのは門（ラウンドの有無）だけである | 門を外すだけでは S4a の欠陥が戻る。**poker の入口にも合言葉の関門を置く**（Task 2）。復帰トークンが名簿の参加者を指す場合は免除する（`join-room.ts` の復帰と同じ規律） |
| 2 | **「復帰トークン持ちだけ遅延生成」では穴が残る。** 一度ラウンドができれば門は開くので、以後は合言葉保護ルームへ poker の旧入口から名前だけで入れる | 関門は「トークンの有無」ではなく**合言葉そのもの**に置く。ラウンドの有無は関門ではなくなる |
| 3 | **`apps/poker-web/src/join-retry.ts` は `packages/sync-client/src/join-retry.ts` の写しで、`e2e/tests/join-retry-policy.test.ts` が両者の一致を見ている** | poker-web を sync-client へ寄せたら、**この検査は「書き換える」のではなく役目を終える**。残すなら対象を変える。取り違えると検査が恒真化する（設計正本 §7 の地雷 5） |

**利用者の裁定（2026-09-13）。** ①**両ツールを遅延生成にし、入口の門を廃止する**（poker の入口にも
合言葉の関門を置く）②**名前の上限は 40 に寄せ、規約ごと `room-core` へ**（poker-core から表示名の
規約を落とす）③**poker-web の同一性の保存先を `tasuki:resume:<ルームコード>` へ寄せる**。

**この計画が置く前提（実装中に覆ったら止めて報告する）。** 端末側の同一性の保存は、いま
`apps/landing/src/hub/storage.ts` と `apps/timer-web/src/sync/resume-identity.ts` の 2 つに同じ綴りで
書かれている。poker-web で 3 つ目を書かず、**`packages/sync-client` へ寄せて 3 つが使う**
（原則 X の下限を満たす。sync-client の docstring「接続だけを持つ」は「端末側の同一性の保存」を
含む形へ改める）。

## 指標の基準値（main `d4d5c3a` で実測。突合は Task 6 でこの値と行う）

```
SC031 | 2      | 未達（既存）
SC032 | 1484/1486（99.9%）
SC036 | 1948
SC039 | 分岐 0 / データ 0 行 / 公開記号 0 件 / 公開契約 0 件
走査対象: src 10 パッケージ / 205 件、test 11 パッケージ / 288 件
pnpm test --force: 12 タスク緑 / Cached 0 / 41.75 秒
```

**SC-032 は合否の無い行なので、放っておくと後退しても CI が緑のまま通る。**

## Global Constraints（全タスクの要求に暗黙に含まれる）

- **日本語**で書く。テストは `Given ... / When ... / Then ...`、本体が 3 行以上なら**前提と操作を空行で区切る**（SC-032）
- **生の色を書かない**（`@tasuki/ui` のトークン）／**`console` を書かない**／**`export *` を書かない**
- **ドメインに `Date.now` / `Math.random` を書かない**
- **新しいライブラリを足さない**
- **1 コミット＝1 つの論理的変更**
- **作業ツリーが汚れていると変異検査は走らない。** コミットしてから `node scripts/mutation-check.mjs`
- **破壊検証に入る前に `git status --porcelain` が空であることを確認する**
- **リンク検査は `git ls-files` を見る。** 新規ファイルは `git add` するまで走査されない

---

## ファイル構成（このタスク列で作る・変える場所）

### 新規

| パス | 責務 |
|---|---|
| `apps/tasuki-sync/src/application/initial-timer-state.ts` | timer の初期状態を組み立てる（`create-room.ts` から切り出し、遅延生成と共用） |
| `apps/tasuki-sync/src/application/room-entry-gate.ts` | ルーム参加の唯一の関門（合言葉と復帰の判定）。timer / ハブ / poker が通る |
| `packages/sync-client/src/resume-identity.ts` | 端末側の同一性の保存（ルーム別の復帰の組＋ルーム非依存の既定表示名） |
| `apps/poker-web/src/room-param.ts` | `?room=` の読み取り（純粋関数） |

### 変更

| パス | 何を |
|---|---|
| `packages/poker-core/src/{name.ts,protocol.ts,error-messages.ts,index.ts}` | 表示名の規約を落とす。`NameSchema` は形だけ見る |
| `packages/room-core/src/{display-name.ts,index.ts}` | 食い違いの注記を解消。不正な表示名の文言を 1 つ公開する |
| `packages/poker-core/src/round.ts` | `discardVote` を戻す（R8） |
| `apps/tasuki-sync/src/application/{join-room.ts,create-room.ts,hub-handlers.ts,poker-handlers.ts}` | 門の廃止・遅延生成・合言葉の関門 |
| `apps/tasuki-sync/src/application/tool-gate.ts` | **削除**（役目を終える） |
| `apps/tasuki-sync/src/application/command-handlers/{room-join.ts,participant-remove.ts}` | 遅延生成した状態の受け取り・退出時の票の破棄（R8） |
| `apps/tasuki-sync/src/create-sync-server.ts` | 門の配線を外す。退出→票の破棄の配線を足す |
| `apps/poker-web/src/{router.ts,App.tsx,storage.ts,join-retry.ts,hooks/useSync.ts,pages/RoomPage.tsx,components/NameForm.tsx}` | `?room=` の解釈・同一性の共通化・sync-client の適用・招待 URL |
| `scripts/audit-dependency-direction.mjs` | `apps/poker-web` に `@tasuki/room-core` と `@tasuki/sync-client` |
| `e2e/tests/join-retry-policy.test.ts` | 写しの一致を見る検査の宛先（役目を終えるなら消す） |
| `e2e/specs/landing.spec.ts` | 選択画面 → poker → 選択画面 → timer の往復 |
| `docs/adr/0011` | 門の廃止と、合言葉への集約を追記（決定として書く。完了形で書かない） |
| 設計正本 | S5b 実施時の訂正（D8 の実現・S5a の裁定③の取り消し） |

---

## Task 1: 表示名の規約を `room-core` に一本化する（上限 40）

**なぜ先にやるか:** ハブで名乗った名前が poker へ届くのは S5b からで、24 を超える名前が
poker の境界で落ちる。**遅延生成より先に直さないと、Task 2 の実画面確認が名前で詰まる。**

- [ ] Step 1: 失敗するテストを書く
  - `apps/tasuki-sync/test/poker/*`: **25〜40 文字の表示名で poker に参加できる**（いまは境界が落とす）
  - `apps/tasuki-sync/test/poker/*`: **空白だけ・正規化で消える名前は拒まれる**（`normalizeDisplayName` の規約）
  - 期待: FAIL
- [ ] Step 2: `packages/poker-core` から表示名の規約を落とす
  - `name.ts`: `NAME_MAX_LENGTH` / `isValidName` / `validateName` / `RoomError` を削除。**ファイルごと消す**
  - `protocol.ts`: `NameSchema` を `v.string()` にする（timer の `schemas.ts` の先例と同じ理由。
    巨大入力はフレーム上限が先に弾く）。**上限を書き戻さない旨を docstring に残す**
  - `error-messages.ts`: `messageForRoomError` を削除
  - `index.ts`: 上記の公開をすべて外す（**`SC-039` が動く。Task 6 で突き合わせる**）
  - `packages/poker-core/tests/name.test.ts` と `error-messages.characterization.test.ts` は
    **規約ごと消える**ので削除する（「書き換える」ではない。規約が poker に無くなったため）
- [ ] Step 3: `packages/room-core` を正本にする
  - `display-name.ts` の「poker の 24 と食い違う」注記を、**統合済みの記述**へ改める
  - 不正な表示名の文言を 1 つだけ公開する（`hub-handlers.ts` が持っている文字列リテラルを寄せる）
- [ ] Step 4: poker の入口で `normalizeDisplayName` を通す
  - `poker-handlers.ts` の `validateName` 2 箇所（create / join）を置き換える
  - **拒否の wire は変えない**（`invalid-message`）。文言だけが room-core の 1 つになる
- [ ] Step 5: 画面の上限を揃える
  - `apps/poker-web/src/components/NameForm.tsx` が `MAX_DISPLAY_NAME`（room-core）を使う
  - `scripts/audit-dependency-direction.mjs` の `apps/poker-web` に `@tasuki/room-core` を足す
- [ ] Step 6: `corepack pnpm test --force` が緑。**`node scripts/audit-dependency-direction.mjs` も回す**
- [ ] Step 7: コミット（`refactor: 表示名の規約を room-core へ一本化する（#248）`）

## Task 2: 入口の門を廃止し、ツール状態を遅延生成にする（D8）

**ここが S5b の芯である。** 門が守っていたものを落とさずに外す。

- [ ] Step 1: 失敗するテストを書く（**4 本。1 本でも欠けると穴が開く**）
  1. ハブで作ったルームへ **poker の入口から入れる**（いまは門が拒む）
  2. poker の旧入口で作ったルームへ **timer の入口から入れる**（いまは門が拒む）
  3. **合言葉つきのルームへ poker の入口から名前だけでは入れない**。応答は「存在しないルーム」と
     コード・文言まで同一（ADR 0011）
  4. **合言葉つきのルームへ、ハブで合言葉を通して得た復帰トークンでなら poker から入れる**
  - 期待: 1・2・4 が FAIL、3 は **PASS のまま**（門が偶然守っている＝対照実行。
    門を外した瞬間に 3 が落ちることを Step 3 で確かめる）
- [ ] Step 2: `initial-timer-state.ts` を切り出す
  - `create-room.ts` の `TimerState` 組み立てを関数化し、**作成時も遅延生成時も同じ 1 箇所**を通す
  - 遅延生成のときの輪は**そのとき入ってきた人 1 席**（`evolve` が `currentIndex` を決められる
    輪を空にしない不変条件のため。作成時に作成者を座らせているのと同じ理由）
- [ ] Step 3: 門を外す（**ここで Step 1 の 3 が落ちることを確認してから次へ進む**）
  - `tool-gate.ts` を削除。`create-sync-server.ts` の配線・`join-room.ts` / `poker-handlers.ts` の参照を外す
  - 落ちない場合は、**テストが門ではないものを見ている**。Step 1 へ戻る
- [ ] Step 4: 関門を合言葉へ集約する（`room-entry-gate.ts`）
  - 判定は 3 つ: ①名簿に無い → `ROOM_NOT_FOUND` ②合言葉があり、復帰トークンが名簿の参加者を
    指さず、合言葉も一致しない → **入口ごとの流儀で拒む**（timer とハブは `PASSPHRASE_REQUIRED` /
    `PASSPHRASE_MISMATCH`、**poker は合言葉を送れないので `room-not-found` と同一応答**）
    ③それ以外 → 入れる
  - `join-room.ts` はこの関門を使う形へ（判定の順序—レート制限が先—は変えない）
  - `poker-handlers.ts` の `handleJoinRoom` / `handleCheckRoom` も同じ関門を通す
  - **写しを書かない。** 2 つ目の判定を書いた瞬間に片方だけが直る（S4a の欠陥と同型）
- [ ] Step 5: 遅延生成をつなぐ
  - timer: `join-room.ts` が `tool === TOOL_TIMER` で状態が無ければ `initialTimerState` で作る。
    `command-handlers/room-join.ts` の「`timer === undefined` なら ROOM_NOT_FOUND」は
    **到達しなくなるので、理由ごと書き換える**（握りつぶしに戻さない）
  - poker: ラウンドが無ければ `createRound()` を保管する（`loadState` の暗黙の合成に頼らず、
    **`commit` で明示的に書く**）
  - ハブ: `hub-handlers.ts` の `room.create` は **timer の状態を作らない**（S5a の裁定③を取り消す）。
    `create-room.ts` の戻り値からも timer を落とすか、ハブが捨てるかは実装時に決める
- [ ] Step 6: 破壊検証（対照実行つき）
  - 合言葉の照合を `true` に固定 → Step 1 の 3 が赤くなること
  - 遅延生成を `undefined` 返しに → 1・2 が赤くなること
  - **壊さない状態で緑になることを先に見る**
- [ ] Step 7: ADR 0011 へ追記する（**決定として書く。完了形で書かない**）
  - 門（`tool-gate.ts`）は廃止し、越境の遮断は「合言葉がルーム参加の唯一の関門である」ことで
    達成する。poker の入口は合言葉を送れないため、**保護ルームへの新規参加はハブ経由のみ**になる
- [ ] Step 8: `corepack pnpm test --force` が緑。コミット

## Task 3: R8 の poker 側（`discardVote`）を戻す

- [ ] Step 1: 失敗するテストを書く
  - `packages/poker-core/tests/round.test.ts`: `discardVote` が票を落とす・居ない人でも壊れない
  - `apps/tasuki-sync/test/`: **退出（`participant.remove`）でその人の票が消え、自動公開が再評価される**
  - 期待: FAIL
- [ ] Step 2: `packages/poker-core/src/round.ts` に `discardVote` を戻す（S4a が残したコメントの位置）
- [ ] Step 3: 呼び出し元をつなぐ
  - 退出は timer 文脈のハンドラ（`command-handlers/participant-remove.ts`）にある。**poker の保管を
    直接触らせない** —— `create-sync-server.ts` が繋ぐ 1 つの関数（「この人がルームから消えた」）を
    受け取り、poker 側でラウンドの更新と配信を行う
  - ルームごと破棄される経路（在室者 0）では**呼ばない**（`destroy-room.ts` が両方消す）
- [ ] Step 4: `index.ts` の「S4a で落とした」注記を現況へ改める（**名指しした文が残ると嘘になる**）
- [ ] Step 5: 破壊検証（票を捨てない変異で赤くなること）。コミット

## Task 4: poker-web をハブ経由に対応させる

- [ ] Step 1: 失敗するテストを書く
  - `apps/poker-web/test/`: `parseRoute` が `/poker/?room=CODE` を room として解する。
    `?room=` が空・欠落なら従来どおり top（**日本語を含むコードで壊れないこと**）
  - `apps/poker-web/test/`: 保存済みの復帰の組（`tasuki:resume:<コード>`）で自動復帰する
  - 期待: FAIL
- [ ] Step 2: `packages/sync-client` に `resume-identity.ts` を足し、landing / timer-web / poker-web の
      3 つが使う形にする（**写しを 3 つ目にしない**）。移設であって規約は変えない
- [ ] Step 3: `router.ts` が `?room=` を解する。**URL は書き換えない**（`/poker/?room=CODE` のまま）
- [ ] Step 4: `useSync` を `SyncConnection`（sync-client）へ載せ替え、自前の再接続ループと
      `join-retry.ts` の写しを捨てる。`e2e/tests/join-retry-policy.test.ts` の宛先を決める
      （**役目を終えるなら消す。恒真化させない**）
- [ ] Step 5: `RoomPage` の自動復帰と保存を共通の鍵へ。招待 URL は **`/?room=CODE`**（D11）にする
- [ ] Step 6: `scripts/audit-dependency-direction.mjs` に `@tasuki/sync-client` を足す
- [ ] Step 7: `corepack pnpm test --force` が緑。コミット

## Task 5: E2E で導線を固定する

- [ ] Step 1: `e2e/specs/landing.spec.ts` に往復を足す
  - 選択画面 → **poker**（ルームへ入れて名乗り直しが要らない）→ 選択画面へ戻る → **timer**
  - **画面に出ている参加用 URL を読む**（`page.url()` で代用しない）
  - 相手側の選択画面に「poker に居ます」が出る（R5）
- [ ] Step 2: 落ちることを確認してから通す（**探索を 1 回走らせてからアサーションを書く**）
- [ ] Step 3: `corepack pnpm e2e` が緑。コミット

## Task 6: 仕上げ（指標・変異・実画面・記録）

- [ ] Step 1: 指標を基準値と突き合わせる（`node scripts/audit-structure.mjs`）。
      **SC-039 は Task 1 で動く見込み**。後退していたら戻す
- [ ] Step 2: 変異検査へ 3 件足す（合言葉の関門・遅延生成・票の破棄）。`node scripts/mutation-check.mjs`
- [ ] Step 3: 検査 8 本と `pnpm audit`・scripts の自己テストを回す（**手元の全緑は CI の緑ではない**）
- [ ] Step 4: 実画面（`http://localhost:5175/`）で全遷移を通す。**ポートの先客を確認してから起動する**
- [ ] Step 5: 設計正本に S5b 実施時の訂正を入れる（D8 の実現・S5a の裁定③の取り消し・
      §3.12 の門の行）。**現況について完了形を書かない**
- [ ] Step 6: `node scripts/check-links.mjs`。PR を作る（DoD 8 項目・該当なしは明記）
- [ ] Step 7: **文脈を共有しない `/code-review` を掛ける**（自前の検証は S5a で 9 件を見落とした）

---

## Self-Review（計画を書いたあとに自分で確かめた）

- **門を外す順序を間違えると穴が開く。** Task 2 は「テスト → 門を外して 3 が落ちるのを見る →
  関門を置く」の順で、**守りが無い瞬間をテストで可視化してから**塞ぐ
- **poker は合言葉を送れない。** したがって保護ルームへの poker からの新規参加は塞がる。
  これは**利用者から見える変化**であり、PR 本文に書く（旧入口は S5c で消える）
- **`check-room` は関門を通さないと神託になる。** 門を外すときに一緒に直す（Task 2 Step 4）
- **`join-retry-policy.test.ts` は「写しの一致」を見ている。** 写しが消えたら検査も役目を終える。
  残したまま対象を失わせると恒真化する（設計正本 §7 の地雷 5）
- **S5a の裁定③を取り消す。** ハブの `room.create` が timer 状態を作らなくなるので、
  それを前提にしたテストが落ちる。**落ちたら前提ごと書き換える**（握りつぶさない）
