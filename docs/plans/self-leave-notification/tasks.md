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

- [ ] **T013** `[P]` `apps/web/test/ui/error-action.test.ts` を新規作成し、
  `errorAction(code)` の**失敗するテスト**を書く。検証する写像:
  `ROOM_NOT_FOUND` → `session-lost` /
  `LEFT_ROOM` → `leave-room` かつ `destination === "setup"` /
  `REMOVED_FROM_ROOM` と `REMOVED_BY_HOST` → `leave-room` かつ `destination === "join"` /
  未知のコード（例 `"WHATEVER"`）と `LAST_MANAGER` → `transient`。
  _要件: FR-127, FR-129, US1-4, US2-1, US2-2_

- [ ] **T014** `apps/web/src/ui/error-action.ts` を新規作成し `ErrorAction` 型と
  `errorAction()` を実装して T013 を green にする。
  **既定は `transient`** とし、画面を移すコードだけを明示的に列挙する理由を docstring に書く。
  _要件: FR-127, FR-129_

- [ ] **T015** `apps/web/src/App.tsx` の `onError` を `errorAction(code)` による分岐へ書き換える。
  `leave-room` の後始末（`dispose` / `setRoom(null)` / `setClient(null)` / `setParticipantId("")` /
  `isCreatorRef` / `problemRequestedRef` / `recordSavedRef` / `setSessionLost(false)` / `setRecord(null)`）
  を**行き先によらない 1 箇所**に集約する。
  バナー文言は `friendlyError(code)` から引く（直書きリテラルを廃止する）。
  `destination === "join"` のときのみ直前のルームコードを `setJoinCode` へ保持し、
  `"setup"` のときは保持せず `setMode("setup")` とする。
  _要件: FR-127, FR-128, US2-1, US2-2, US2-3_

- [ ] **T016** `pnpm --filter @tdd-mob/web test` を実行し、既存の web テストが全て緑であることを
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

- [ ] **T018** `apps/web/src/App.tsx` の `onError` を読み返し、
  `errorAction` の判別可能合併に対する分岐が**網羅的**であること（`kind` の取り得る値をすべて扱う）を
  型で保証する形にする。必要なら `never` による網羅チェックを添える。
  _要件: DbC（契約の明示）_

- [ ] **T019** 追加・変更した全テストのテスト名と GWT の区切りが ADR 0009
  （`docs/adr/0009-test-conventions.md`）の規約に従っているか照合する。
  仕様 ID をテスト名に含めない・呼び出し語を使わない・`// Given` `// When` `// Then` の区切りを持つ。
  _要件: ADR 0009_

- [ ] **T020** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を通す（バックグラウンド実行）。
  core カバレッジ閾値 90% を下回らないこと。
  _要件: 全要件（統合ゲート）_

## G5 — 検証

- [ ] **T021** 追加した通知経路に対して、`scripts/mutation-check.mjs` の考え方で
  「`removalNotificationFor` の条件を反転させたらテストが落ちるか」を手で確認する。
  落ちないなら検出力が無いのでテストを補強する。
  _要件: SC-040, SC-041_

- [ ] **T022** 実機統合検証。sync と web を起動し（**起動前に `lsof -ti tcp:5173 tcp:8787` で
  古いプロセスを掃除し、dev ログの `Local:` URL を確認する**）、Playwright で 2 タブを開く。
  検証: (1) 参加者が「ルームから抜ける」→ **入口画面へ移りバナーが出る**、
  (2) 入口画面に直前のルームへ戻る手がかりが無い、
  (3) ホスト側の一覧から退出者が消えている、
  (4) 単独の編集者の場合はボタンが押せない（画面が移らない）。
  _要件: SC-040, SC-041, SC-042, SC-043_

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
