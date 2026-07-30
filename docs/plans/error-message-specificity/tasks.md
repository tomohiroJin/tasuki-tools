# タスク: 失敗の説明を、実際に行った操作と一致させる

**Issue:** [#29](https://github.com/tomohiroJin/tasuki-tools/issues/29) ・ **仕様:** [`spec.md`](./spec.md) ・ **設計:** [`plan.md`](./plan.md)

> **着手条件**: Issue #32（`docs/plans/self-leave-notification/`）が `main` にマージ済であること。
> `main` から新しいブランチを分岐して開始する。

各タスクは Red → Green → Refactor の順に並べてある。`[P]` は並列実行が安全なタスク。

---

## H0 — 現状を記録するテスト

- [x] **T101** `apps/sync/test/error-specificity.test.ts` を新規作成し、
  **現状のコード**を返すことを検証するテストを 9 ケース書く（この時点では green）。
  対象の拒否箇所: (1) オフライン相手の `driver.assign`、(2) オフライン相手の `host.transfer`、
  (3) ホストを対象にした `role.set`、(4) 現ホストを対象にした `host.transfer`、
  (5) 輪に居ない相手の `driver.assign`、(6) 進行できる人が残らない `participant.remove`、
  (7) 進行できる人が残らない `role.set`（viewer 化）、(8) 試行過多の `room.join`、
  (9) 試行過多の `ai.unlock`。
  既存の sync テストのハンドラ組み立て方（`notice-signal.test.ts` 等）に倣う。
  _要件: SC-044（開始値の記録）_

- [x] **T102** `[P]` T101 に **(3') 存在しない相手を対象にした `driver.assign`** のケースを追加する。
  現状は (5) と同じコードを返す。分割後に両者が異なることを検証できるようにするための土台。
  _要件: FR-134_

## H1 — core: 語彙と文言の追加

- [x] **T103** `packages/core/test/error-messages.specificity.test.ts` を新規作成し、
  新 8 コードについて**失敗するテスト**を書く。検証:
  `displayMessageFor(code)` が `DEFAULT_ERROR_MESSAGE` でないこと。
  対象: `DRIVER_ASSIGN_OFFLINE` `HOST_TRANSFER_OFFLINE` `CANNOT_CHANGE_HOST_ROLE`
  `ALREADY_HOST` `NOT_IN_ROTATION` `LAST_MANAGER_LEAVE` `LAST_MANAGER_DEMOTE` `JOIN_RATE_LIMITED`。
  _要件: FR-131, US3-1_

- [x] **T104** 同ファイルに**文言の性質**を検証する失敗するテストを追加する。
  (a) `DRIVER_ASSIGN_OFFLINE` の文言に「移譲」が含まれない、かつ「指名」が含まれる、
  (b) `CANNOT_CHANGE_HOST_ROLE` の文言に「移譲でき」が含まれない、かつ「役割」が含まれる、
  (c) `ALREADY_HOST` の文言に「自分自身」が含まれない、
  (d) `NOT_IN_ROTATION` の文言に「見つかりません」が含まれない、
  (e) `LAST_MANAGER_LEAVE` に「退出」・`LAST_MANAGER_DEMOTE` に「見学者」が含まれる、
  (f) `JOIN_RATE_LIMITED` に「参加」が含まれる。
  **型が変わらない意味変更を検出する唯一の手段**なので、含む／含まないの両方向を書く。
  _要件: FR-132, FR-133, FR-134, FR-135, FR-136, FR-138, SC-045_

- [x] **T105** `packages/core/src/error-messages.ts` の `ERROR_MESSAGES` へ新 8 件の文言を追加し、
  T103・T104 を green にする。文言は `plan.md` の対応表のとおり。
  各コードがどの操作の失敗かをコメントで示す。
  _要件: FR-131〜FR-136, FR-138_

- [x] **T106** `packages/core/src/errors.ts` の `SYNC_ERROR_CODES` へ新 8 件を追加する
  （節の分類に従って配置）。`pnpm typecheck` が緑であること。
  _要件: FR-131_

- [x] **T107** `[P]` `packages/core/test/error-messages.specificity.test.ts` に、
  **旧 3 コードの文言が従来の値のまま引ける**ことを検証するテストを追加する。
  `PARTICIPANT_OFFLINE` `CANNOT_CHANGE_HOST` `LAST_MANAGER` の
  `displayMessageFor()` が既定文言でないこと。
  _要件: FR-137, SC-047, US4-1_

## H2 — sync: 誤った案内 2 件を正す

- [x] **T108** `apps/sync/src/application/handlers.ts` の `driver.assign` のオフライン拒否を
  `PARTICIPANT_OFFLINE` → `DRIVER_ASSIGN_OFFLINE` に差し替える
  （`sendError` の第 2 引数と `err()` の両方）。
  T101 のケース (1) を新コードの期待に更新して green にする。
  _要件: FR-132, US1-1, SC-045_

- [x] **T109** `handleHostTransfer` のオフライン拒否を
  `PARTICIPANT_OFFLINE` → `HOST_TRANSFER_OFFLINE` に差し替える。
  T101 のケース (2) を更新して green にする。
  _要件: FR-132, US1-4_

- [x] **T110** `handleRoleSet` の「対象がホスト」拒否を
  `CANNOT_CHANGE_HOST` → `CANNOT_CHANGE_HOST_ROLE` に差し替える。
  T101 のケース (3) を更新して green にする。
  _要件: FR-133, US1-2, SC-045_

- [x] **T111** `handleHostTransfer` の「対象がすでにホスト」拒否を
  `CANNOT_CHANGE_HOST` → `ALREADY_HOST` に差し替える。
  T101 のケース (4) を更新して green にする。
  **加えて**「編集者（非ホスト）が開始後に現ホストを対象に移譲を送った場合」のケースを
  T101 へ追加し、`ALREADY_HOST` が返ることを検証する（実行者と対象が異なり得ることの担保）。
  _要件: FR-138, US1-3_

## H3 — sync: 具体性 3 件を正す

- [x] **T112** `handlers.ts` の `driver.assign` の対象解決を 2 段に分ける。
  対象が `participants` に居なければ `PARTICIPANT_NOT_FOUND`、
  居るが `rotation` に居なければ `NOT_IN_ROTATION` を返す。
  T101 のケース (5) と T102 のケース (3') が**異なるコード**を返すことを検証して green にする。
  _要件: FR-134, US2-1_

- [x] **T113** `handlers.ts` の `participant.remove` の `canRemoveParticipant` 拒否を
  `LAST_MANAGER` → `LAST_MANAGER_LEAVE` に差し替える。
  T101 のケース (6) を更新して green にする。
  _要件: FR-135, US2-2_

- [x] **T114** `handleRoleSet` の `canDemote` 拒否を
  `LAST_MANAGER` → `LAST_MANAGER_DEMOTE` に差し替える。
  T101 のケース (7) を更新して green にする。
  _要件: FR-135, US2-3_

- [x] **T115** `handleRoomJoin` の試行過多の拒否を
  `RATE_LIMITED` → `JOIN_RATE_LIMITED` に差し替える。
  `handleAiUnlock` 側は `RATE_LIMITED` のまま**変更しない**。
  T101 のケース (8) を更新し、(9) が変わっていないことも確認して green にする。
  _要件: FR-136, US2-4_

## H4 — core: 旧コードを語彙から外す（差し替え漏れの検出器）

- [x] **T116** `packages/core/src/errors.ts` の `SYNC_ERROR_CODES` から
  `PARTICIPANT_OFFLINE` `CANNOT_CHANGE_HOST` `LAST_MANAGER` の 3 件を削除する。
  **`apps/sync/test/error-code-coverage.test.ts` を無変更のまま実行して緑になること**が
  差し替え漏れが無いことの証明である。落ちたら H2/H3 に漏れがある。
  _要件: FR-137, SC-046_

- [x] **T117** `packages/core/src/error-messages.ts` の旧 3 件のエントリに
  「配備前から開かれた画面が旧サーバーの応答を受け取ったときのために残す。
  語彙（`SYNC_ERROR_CODES`）からは外してある」旨の注記を書く。
  T107 が緑のままであることを確認する。
  _要件: FR-137, SC-047_

- [x] **T118** 旧コード名を直接参照している既存テストを洗い出して追随させる。
  `grep -rn "PARTICIPANT_OFFLINE\|CANNOT_CHANGE_HOST\|LAST_MANAGER" apps packages --include='*.test.ts*'`
  で検出し、新コードへ更新する。**旧コードの互換テスト（T107）は残す。**
  _要件: 非機能（後方互換）_

## H5 — 抽象化と原則の適用

- [x] **T119** `handlers.ts` の変更 9 箇所を読み返し、
  `sendError(connId, X, errorMessageFor(X))` という**同じコードを 2 回書く形**が
  重複になっていないか評価する。1 引数で済ませる小さなヘルパへ寄せられるなら寄せる
  （綴り違いを構造的に不可能にする）。寄せない判断をした場合は理由をコメントに残す。
  _要件: DRY, SoT_

- [x] **T120** `packages/core/src/error-messages.ts` の表を読み返し、
  コードの並びが操作の分類（入退室 / 参加者・権限 / 指名 / 移譲 / 制限）で
  整っているか確認し、コメントの節見出しを実態に合わせる。
  _要件: 可読性_

- [x] **T121** 追加・変更した全テストのテスト名と GWT の区切りが
  ADR 0009（`docs/adr/0009-test-conventions.md`）に従っているか照合する。
  _要件: ADR 0009_

- [x] **T122** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を通す（バックグラウンド実行）。
  core カバレッジ閾値 90% を下回らないこと。
  _要件: 全要件（統合ゲート）_

## H6 — 検証

- [x] **T123** 検出力の確認。新コードの文言のうち 1 つを意図的に旧文言へ戻し、
  T104 が**落ちること**を確認してから戻す。落ちないなら文言テストが空振りしている。
  _要件: SC-045_

- [x] **T124** 実機統合検証。
  **★ 計画時の前提が誤っていた。** この計画は「Playwright で失敗を実際に起こして画面の文言を見る」
  としていたが、**細分化した拒否のほとんどは UI が事前に抑止しており、
  通常の画面操作では発火しない。** 実機で確認した事実:

  - `RosterPanel.tsx:285-286` は「ドライバーにする」ボタンを
    **`presence === "offline"` の相手にも、rotation 外の相手にも描画しない。**
    → `DRIVER_ASSIGN_OFFLINE` と `NOT_IN_ROTATION` は画面から到達できない
    （Playwright でオフラインの相手を作ったが、ボタン自体が存在しなかった）
  - `Lobby.tsx` は自分の行に役割変更を出さず、非ホストには出さない
    → `CANNOT_CHANGE_HOST_ROLE` は画面から到達できない
  - 「ルームから抜ける」「見学に回る」は不変条件を破る場合に**無効化される**
    → `LAST_MANAGER_LEAVE` / `LAST_MANAGER_DEMOTE` は画面から到達できない

  つまりこれらは**サーバー側の防御**であり、レース（描画後に相手がオフラインになる等）・
  旧クライアント・非 UI クライアントで発火する。文言が誤っていると
  「やっていない操作の説明」が出るのは、**まさに他に手がかりが無いこの状況**である。

  **そこで実機検証は WS 直結に切り替えた**（稼働中の実サーバーへコマンドを送る）。
  スクリプトは使い捨てで `/tmp` に置いた。**全 10 経路 PASS**。
  なお PR レビューで `NOT_IN_ROTATION` の文言を直したあと、
  **表の文言を書き換えるだけで済ませず、実サーバーへの検証を再実行して実測し直している**
  （検証していないものを検証したと書かないため）。下表は再実行後の実測値である。

  | # | 経路 | コード | 実際に返った文言 |
  |---|---|---|---|
  | ① | オフライン相手の `driver.assign` | `DRIVER_ASSIGN_OFFLINE` | オフラインの参加者はドライバーに指名できません。 |
  | ② | ホストを対象にした `role.set` | `CANNOT_CHANGE_HOST_ROLE` | ホストの役割は変更できません。先にホストを移譲してください。 |
  | ③ | 現ホストを対象にした `host.transfer` | `ALREADY_HOST` | その相手はすでにホストです。 |
  | ④ | オフライン相手の `host.transfer` | `HOST_TRANSFER_OFFLINE` | オフラインの相手にはホストを移譲できません。 |
  | ⑤ | 輪に居ない相手の `driver.assign` | `NOT_IN_ROTATION` | ドライバーの輪に加わっていない相手は指名できません。先にドライバーへ加えてください。 |
  | ⑥ | 存在しない相手の `driver.assign` | `PARTICIPANT_NOT_FOUND` | 対象の参加者が見つかりません。（⑤ と別コードであることを確認） |
  | ⑦ | 唯一の編集者以上の自己退出 | `LAST_MANAGER_LEAVE` | 進行できる人がいなくなるため退出できません。… |
  | ⑧ | 試行過多の `room.join` | `JOIN_RATE_LIMITED` | 参加の試行が多すぎます。… |
  | ⑨ | `room.join` が `RATE_LIMITED` を返さない | — | 分離できていることを確認 |
  | ⑩ | 誤案内 2 件の否定条件 | — | ① に「移譲」が無く「指名」がある／② に「移譲でき」が無く「役割」がある |

  **`LAST_MANAGER_DEMOTE` だけはコマンド経路から到達できない。**
  `isManager` はホストも編集者以上に数えるため、ホストが在室する限り
  「編集者以上が対象 1 名だけ」にならず、④ の `CANNOT_CHANGE_HOST_ROLE` が先に効く。
  この事実は既存テスト `apps/sync/test/self-role-change.test.ts` の ⑤ の Given に
  **以前から明記されており**（状態を直接組んで検証している）、本 Issue で変わったものではない。
  _要件: SC-044, SC-045_

## 依存関係

```
T101 ─┬→ T108 → T109 → T110 → T111 ─┐
T102 ─┘                              │
                                     ├→ T112 → T113 → T114 → T115 ─┐
T103 → T104 → T105 → T106 ───────────┘                             │
T107 ─────────────────────────────────────────────────────────────┤
                                                                   ├→ T116 → T117 → T118
                                                                   │
                                                    T119..T122 → T123 → T124
```

- **T103 / T107** は並列可（別のテストケース）。**T101 / T102** も並列可。
- **T108 以降は T105・T106 の完了後**（語彙と文言が無いと型が通らない）。
- **T116 は T108〜T115 のすべての完了後**（1 つでも漏れると検査が落ちる）。
- **T118 は T116 の後**（型エラーで漏れを拾えるようになってから）。
- **T124 は T122 の後**（全ゲート緑を前提に実機へ進む）。

## 要件のトレース

| 要件 | 対応タスク |
|---|---|
| FR-131 | T103, T105, T106 |
| FR-132 | T104, T108, T109 |
| FR-133 | T104, T110 |
| FR-134 | T102, T104, T112 |
| FR-135 | T104, T113, T114 |
| FR-136 | T104, T115 |
| FR-137 | T107, T116, T117 |
| FR-138 | T104, T111 |
| SC-044 | T101, T124 |
| SC-045 | T104, T108, T110, T123, T124 |
| SC-046 | T116 |
| SC-047 | T107, T117 |
