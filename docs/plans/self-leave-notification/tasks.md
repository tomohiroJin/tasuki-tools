# タスク: 自己退出した本人に退出を伝え、入口へ戻す

**Issue:** [#32](https://github.com/tomohiroJin/tasuki-tools/issues/32) ・ **仕様:** [`spec.md`](./spec.md) ・ **設計:** [`plan.md`](./plan.md)

各タスクは Red → Green → Refactor の順に並べてある。
`[P]` は依存の無い別ファイルを触るため並列実行が安全なタスク。

> **ゲート**: 各タスクの完了時に `pnpm test` の該当パッケージ・`pnpm typecheck`・`pnpm lint` が緑であること。
> web のテストは jsdom で 14 分前後かかるため、web を触るタスクではバックグラウンド実行を用いる。

> **★ 実施中に判明した段階分けの訂正（2026-07-30）**
> **G1 単独では緑にできない。** T006（`SYNC_ERROR_CODES` への `LEFT_ROOM` 追加）と
> T009（`handlers.ts` からの送出）は、`apps/sync/test/error-code-coverage.test.ts` の
> 「列挙されたコードはすべてソースに実在する」という双方向照合があるため**同時に landing しなければならない**。
> 語彙だけ増やして送出しないと検査が落ちる（＝検査が意図どおり「使わないコードを増やすな」を強制している）。
> したがって **G1 と G2 は 1 つの原子的な増分**として扱い、1 コミットにまとめた。

---

## G0 — 現状を失敗するテストで固定する

- [x] **T001** `apps/sync/test/self-leave-notification.test.ts` を新規作成し、
  「自分自身を対象に `participant.remove` を送って受理されたとき、**本人の接続へ**
  `type: "error"` / `code: "LEFT_ROOM"` のメッセージが届く」ことを検証する**失敗するテスト**を書く。
  既存の `apps/sync/test/notice-signal.test.ts` のハンドラ組み立てとフェイク broadcaster の作り方に倣う。
  この時点では実装が無いので red であることを確認する。
  _要件: FR-124, US1-1_

## G1 — core: 語彙・文言・規則

- [x] **T002** `[P]` `packages/core/test/participants.removal-notification.test.ts` を新規作成し、
  `removalNotificationFor(actor, target)` の**失敗するテスト**を書く。
  検証: 実行者と対象が同一なら `"LEFT_ROOM"`、異なれば `"REMOVED_FROM_ROOM"` を返す。
  _要件: FR-125, US1-3_

- [x] **T003** `packages/core/src/participants.ts` に `RemovalNotification` 型と
  `removalNotificationFor()` を実装し、T002 を green にする。
  `canRemoveParticipant` / `canDemote` と同じ節に置き、docstring に
  「なぜ種類を分けるか（自分の操作を他者の操作として伝えない）」を日本語で書く。
  _要件: FR-125_

- [x] **T004** `packages/core/src/index.ts` に `removalNotificationFor` と
  `RemovalNotification` の再エクスポートを追加する。`pnpm typecheck` が緑であること。
  _要件: FR-125_

- [x] **T005** `packages/core/test/error-messages.test.ts`（無ければ新規作成）に、
  `displayMessageFor("LEFT_ROOM")` が `DEFAULT_ERROR_MESSAGE` と**異なる**ことと、
  その文言に「させられ」という他者の操作を示す表現が**含まれない**ことを検証する
  **失敗するテスト**を書く。
  _要件: FR-126, SC-041_

- [x] **T006** `packages/core/src/errors.ts` の `SYNC_ERROR_CODES` の
  「ルームの入退室」節に `"LEFT_ROOM"` を追加する。
  _要件: FR-130_

- [x] **T007** `packages/core/src/error-messages.ts` の `ERROR_MESSAGES` に
  `LEFT_ROOM: "ルームから抜けました。"` を追加し、T005 を green にする。
  なぜ 1 文に留めるか（遷移先の入口画面が既に次の導線を示している）をコメントに残す。
  _要件: FR-126_

- [x] **T008** `packages/core/src/error-messages.ts` の `ERROR_MESSAGES` へ
  `REMOVED_FROM_ROOM` / `REMOVED_BY_HOST` の**現在 `App.tsx` に直書きされている文言**
  （「ルームから退出しました。再参加するには名前を入力してください。」）を
  **1 文字も変えずに**移す。`SERVER_ONLY_ERROR_MESSAGES` ではなく `ERROR_MESSAGES` 側である。
  _要件: FR-105（文言の定義箇所は 1 つ）_

## G2 — sync: 本人への通知

- [x] **T009** `apps/sync/src/application/handlers.ts` の `participant.remove` の本人向け通知を、
  `removalNotificationFor()` の結果で分岐する形へ書き換え、T001 を green にする。
  対象が接続を持つ場合は**必ず**送る。代理（`connId` が無い）には送らない。
  既存の動的文言（`◯◯ さんにより退出させられました。招待から再参加できます。`）は 1 文字も変えない。
  _要件: FR-124, FR-125, US1-1_

- [x] **T010** `apps/sync/test/self-leave-notification.test.ts` に検証を追加する。
  (a) 他者を退出させた場合は対象へ `REMOVED_FROM_ROOM` が届き `LEFT_ROOM` は届かない、
  (b) 代理を対象にした場合は何も送られない、
  (c) **退出が拒否された場合（進行できる人が残らない）には退出通知が届かない**。
  _要件: FR-124, FR-129, US1-4_

- [x] **T011** `apps/sync/test/error-code-coverage.test.ts` の `INTENTIONALLY_NOT_SHOWN` から
  `REMOVED_FROM_ROOM` を外す（T008 で表へ文言が入るため）。
  コメントの「13 件」という件数と、`Issue #29 が扱う`という記述を実態に合わせて更新する。
  `LEFT_ROOM` は表に載るので追記は不要であることをテストの green で確認する。
  _要件: FR-130, FR-105_

- [x] **T012** 既存の `apps/sync/test/notice-signal.test.ts` が緑のままであることを確認する。
  自己退出時に残る在室者へ「◯◯さんがルームから退出しました。」が届く挙動が変わっていないこと。
  失敗する場合は本タスクで原因を修正する。
  _要件: US3-1（退行させない）_

## G3 — web: 画面の次の動作

- [x] **T013** `[P]` `apps/web/test/ui/error-action.test.ts` を新規作成し、
  `errorAction(code)` の**失敗するテスト**を書く。検証する写像:
  `ROOM_NOT_FOUND` → `session-lost` /
  `LEFT_ROOM` → `leave-room` かつ `destination === "setup"` /
  `REMOVED_FROM_ROOM` と `REMOVED_BY_HOST` → `leave-room` かつ `destination === "join"` /
  未知のコード（例 `"WHATEVER"`）と `LAST_MANAGER` → `transient`。
  _要件: FR-127, FR-129, US1-4, US2-1, US2-2_

- [x] **T014** `apps/web/src/ui/error-action.ts` を新規作成し `ErrorAction` 型と
  `errorAction()` を実装して T013 を green にする。
  **既定は `transient`** とし、画面を移すコードだけを明示的に列挙する理由を docstring に書く。
  _要件: FR-127, FR-129_

- [x] **T015** `apps/web/src/App.tsx` の `onError` を `errorAction(code)` による分岐へ書き換える。
  `leave-room` の後始末（`dispose` / `setRoom(null)` / `setClient(null)` / `setParticipantId("")` /
  `isCreatorRef` / `problemRequestedRef` / `recordSavedRef` / `setSessionLost(false)` / `setRecord(null)`）
  を**行き先によらない 1 箇所**に集約する。
  バナー文言は `friendlyError(code)` から引く（直書きリテラルを廃止する）。
  `destination === "join"` のときのみ直前のルームコードを `setJoinCode` へ保持し、
  `"setup"` のときは保持せず `setMode("setup")` とする。
  _要件: FR-127, FR-128, US2-1, US2-2, US2-3_

- [x] **T016** `pnpm --filter @tdd-mob/web test` を実行し、既存の web テストが全て緑であることを
  確認する（バックグラウンド実行）。落ちたテストがあれば本タスクで修正する。
  _要件: 非機能（後方互換）_

## G4 — 抽象化と原則の適用

- [x] **T017** `apps/sync/src/application/handlers.ts` の本人向け通知の文言組み立てを
  小さな関数（例 `messageForRemoval`）へ切り出し、`if` の中に文言リテラルと分岐が
  同居している状態を解消する。`removalNotificationFor` の戻り値で分岐すること。
  _要件: DRY, SRP_

- [x] **T023**（敵対的レビューの指摘で追加）**メタテストの検出力の回復。**
  T017 のリファクタで `sendError(connId, removalCode, …)` が**変数経由**になり、
  `apps/sync/test/error-code-coverage.test.ts` の走査正規表現
  （`code: "X"` / `err("X")` のリテラルのみ）が `LEFT_ROOM` と `REMOVED_FROM_ROOM` を
  **拾えなくなった**（テストは緑のまま検出力だけが失われた）。
  `EMITTED_VIA_VARIABLE` 集合を導入して走査結果へ合流させ、さらに
  (a) 集合の各コードがソースにリテラルとして実在すること、
  (b) 各コードが正規表現走査には含まれないこと、の両方を検証して集合の乖離を検出可能にした。
  `errors.ts` の docstring に既に記録されていた同種の盲点（`PASSPHRASE_REQUIRED` /
  `PASSPHRASE_MISMATCH`）も同時に塞いだ（2 件 → 4 件）。
  **検出力は変異で実証済み**（`ERROR_MESSAGES` から `LEFT_ROOM` を削除すると
  `すべてのコードについて、画面に出す文言が決まっている` が落ちる）。
  _要件: FR-130, SC-041_

- [x] **T025**（PR #34 のレビュー指摘で追加）**網羅検査を手作りの集合から列挙起点へ移す。**
  T023 で導入した `EMITTED_VIA_VARIABLE` は手で保守する集合なので、
  **新しいコードが変数経由で送られ始めたのに追記を忘れた場合**を検出できない
  （走査にも掛からず集合にも無いため、文言が未決定でもテストは緑）。
  塞ぎ方は運用注記ではなく**既にある構造への載せ替え**にした。
  `SYNC_ERROR_CODES` は保守済みの権威リストであり、同ファイルの既存テストが
  ソースと**双方向**に照合している（列挙 → ソース実在は部分文字列検索なので変数経由でも拾える）。
  そこで「`SYNC_ERROR_CODES` の全コードについて文言が決まっているか」を検査する
  テストを追加し、網羅性が手動集合に依存しない形にした。
  `EMITTED_VIA_VARIABLE` は残すが役割を書き換えた（文言検査の要ではなく、
  盲点の文書化とリテラル消失の検出）。
  **実証（親側で独立に再現）**: `SYNC_ERROR_CODES` に未登録コードを足して
  変数経由でだけ登場させると、**古い検査は素通りし新しい検査だけが落ちる**。
  限界: ドメインエラー（`decide()` が返す `DomainError["type"]`）は値としての列挙が無いため対象外。
  _要件: FR-130, SC-041_

- [x] **T018** `apps/web/src/App.tsx` の `onError` を読み返し、
  `errorAction` の判別可能合併に対する分岐が**網羅的**であること（`kind` の取り得る値をすべて扱う）を
  型で保証する形にする。必要なら `never` による網羅チェックを添える。
  _要件: DbC（契約の明示）_

- [x] **T019** 追加・変更した全テストのテスト名と GWT の区切りが ADR 0009
  （`docs/adr/0009-test-conventions.md`）の規約に従っているか照合する。
  仕様 ID をテスト名に含めない・呼び出し語を使わない・`// Given` `// When` `// Then` の区切りを持つ。
  _要件: ADR 0009_

- [x] **T020** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を通す（バックグラウンド実行）。
  core カバレッジ閾値 90% を下回らないこと。
  _要件: 全要件（統合ゲート）_

## G5 — 検証

- [x] **T021** 追加した通知経路に対して、`scripts/mutation-check.mjs` の考え方で
  「`removalNotificationFor` の条件を反転させたらテストが落ちるか」を手で確認する。
  落ちないなら検出力が無いのでテストを補強する。
  _要件: SC-040, SC-041_

- [x] **T022** 実機統合検証。sync と web を起動し（**起動前に `lsof -ti tcp:5173 tcp:8787` で
  古いプロセスを掃除し、dev ログの `Local:` URL を確認する**）、Playwright で 2 タブを開く。
  検証: (1) 参加者が「ルームから抜ける」→ **入口画面へ移りバナーが出る**、
  (2) 入口画面に直前のルームへ戻る手がかりが無い、
  (3) ホスト側の一覧から退出者が消えている、
  (4) **他に在室者がいるが他に編集者がいない**場合はボタンが押せない（画面が移らない）。
  _要件: SC-040, SC-041, SC-042, SC-043_

  **実施結果（2026-07-30）:** 全項目 PASS。ただし (2) で欠陥を検出し T024 で修正した。
  (4) の条件は当初「単独の編集者の場合」と書いていたが**誤り**だった。
  `canRemoveParticipant` は**残る在室者が 0 名なら退出を許可する**設計
  （空になる部屋は誰も困らない・`participants.ts` の docstring に根拠あり）なので、
  単独在室者は有効が正しい。無効化されるのは「他に在室者がいるが他に編集者がいない」場合で、
  実機でも viewer を 1 人残した状態で無効化を確認した。
  あわせて確認した項目: 退出バナーが 5.5 秒後も消えない（T023 の副次確認）／
  他者に外された場合は URL を保持して参加画面へ戻り、**表から引いた文言が
  旧リテラルと 1 文字も違わない**（T008・T015 の回帰）／アプリのコンソールエラーなし。

  ★**環境の罠を踏んだ:** 修正後に実機で確認しても URL が消えず、実装が誤っているように見えた。
  真因は **Vite が古い `App.tsx` を配信していた**こと（`curl http://localhost:5173/src/App.tsx |
  grep -c stripRoomParam` が **0** を返して判明）。vite を kill し
  `apps/web/node_modules/.vite` を削除して再起動すると解決した。
  **画面を見るだけでは「修正が違う」と誤診する。配信されているコードを確かめること。**

- [x] **T024**（実機検証で発見した欠陥の修正）**URL に残る `?room=` を除去する。**
  自己退出で入口画面へ遷移したあとも**アドレスバーに `?room=<コード>` が残っており**、
  リロードすると自分で抜けたルームの参加画面へ戻ってしまう（FR-127 / US2-2 違反）。
  画面上の `joinCode` state をクリアしても、URL 自体が「復帰の手がかり」になっていた。
  純粋関数 `stripRoomParam(href)` を `apps/web/src/ui/room-param.ts` に新設し
  （テスト `apps/web/test/ui/room-param.test.ts` で 5 ケース検証）、
  `destination === "setup"` のときだけ `window.history.replaceState` で除去する。
  `pushState` ではなく `replaceState` を使い、戻るボタンの履歴に退出前の URL を積まない。
  **`destination === "join"` 側は変更しない**（再参加しやすくするのが意図なので URL を残す）。
  実機で href が `http://localhost:5173/` になり、リロード後も入口画面のままであることを確認した。
  _要件: FR-127, SC-042, US2-2_

## 依存関係

```
T001 ─────────────────────────────┐
T002 → T003 → T004 ───────────────┤
T005 ─┐                           │
T006 ─┼→ T007 → T008 ─────────────┼→ T009 → T010 → T011 → T012 ─┐
      │                           │                              │
T013 → T014 → T015 → T016 ────────┴──────────────────────────────┼→ T017..T020 → T021 → T022
                                                                  │
```

- **T001 / T002 / T005 / T013** は並列可（別ファイルの red テスト）。
- **T009 は T003・T007 の完了後**（core の関数と文言に依存）。
- **T011 は T008 の完了後**（表へ文言が入ってから集合を整える）。
- **T015 は T014 の完了後**（純粋関数が無いと書き換えられない）。
- **T022 は T009・T015 の両方の完了後**（サーバーとクライアントの両方が必要）。

## 要件のトレース

| 要件 | 対応タスク |
|---|---|
| FR-124 | T001, T009, T010 |
| FR-125 | T002, T003, T004, T009 |
| FR-126 | T005, T007 |
| FR-127 | T013, T014, T015 |
| FR-128 | T015 |
| FR-129 | T010, T013, T014 |
| FR-130 | T006, T011 |
| FR-105（前進） | T008, T011, T015 |
| SC-040 | T021, T022 |
| SC-041 | T005, T021, T022 |
| SC-042 | T022 |
| SC-043 | T010, T013, T022 |
