# タスク: handleCommand の単一パイプライン化と handlers.ts の責務分割

**入力:** plan.md（＋ spec.md、baseline.md）。タスクは**コーディングのみ**。TDD: 挙動を変える変更は実装の前に失敗するテストを書く。純粋な移動（ロジック変更なし）は既存テストスイートを安全ネットとして使い、移動直後に全ゲートを回して回帰が無いことを確認する。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = spec.md への FR/SC トレース。
**各タスクの完了条件（明記が無い限り共通）:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全て緑、かつ `permissions-differential.test.ts` が緑。

---

## フェーズ0 — 計測（G0・ブロッキング）

- [x] T001 実装フェーズ冒頭のベースラインを実測する。`tdd-mob-pro-timer/` で `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を実行し、テスト総数（core/sync/web 別）・typecheck/lint/build の成否を `docs/plans/handlers-command-pipeline/baseline.md` の「3. ゲート現状値」節に実測値として追記する（申告値1,538件との差分があれば明記する）。以後の全タスクはこの実測値を「下回らない」基準とする。 _要件: FR-173, SC-058_

## フェーズ1 — 基盤: 型分離（ブロッキング）

- [x] T002 `apps/sync/src/application/handlers.ts`（または新設する型ファイル）に `PreRoomCommand`（`room.create`/`room.join`/`time.ping`/`presence.ping` の判別可能 union）と `RoomScopedCommand`（`permissions.ts` の `REGISTERED_COMMANDS` 25件に対応する判別可能 union）を定義する。`handleCommand` の引数型を `RoomScopedCommand | PreRoomCommand` に変更し、`PreRoomCommand` は既存の3ケース（`room.create`/`room.join`/`time.ping`）を早期分岐で処理する既存コードのまま型だけ厳密化する。`presence.ping` は型に含めるが `handlers.ts` 内では処理しない（`server.ts` 側で横取り済みのまま。コメントでその旨を明記）。既存の `pnpm typecheck` が通ることを確認する。 _要件: FR-151, FR-152_

## フェーズ2 — 責務分割: トークン保持（G1）

- [x] T003 [P] `apps/sync/test/token-store.test.ts` に、`createTokenStore()` の**失敗するテスト**を書く（host トークン発行・照合、resume トークン発行・照合、`releaseRoom` によるルーム単位の解放、を GWT で検証）。現状の `handlers.ts` 内の `hostTokens`/`resumeTokens`/`roomPassphrases` の使われ方（`releaseRoom` 関数・`handleRoomCreate`/`handleRoomJoin` 内の発行箇所）を先に読み、既存の挙動をそのまま仕様として書き下す。 _要件: FR-157 (US3)_
- [x] T004 T003 を通すため `apps/sync/src/application/token-store.ts` に `createTokenStore()` を実装する（green）。`handlers.ts` の `makeHandlers` 内の `hostTokens`/`resumeTokens`/`roomPassphrases` の宣言・全参照箇所（`handleRoomCreate`/`handleRoomJoin`/`releaseRoom` 等）をこの新モジュール呼び出しに置き換える。ロジックは変えない（純粋な移動）。全ゲート＋既存 `handlers.*.test.ts` が緑であることを確認してコミット可能な状態にする。 _要件: FR-157 (US3)_

## フェーズ3 — 責務分割: レート制限（G1）

- [ ] T005 [P] `apps/sync/test/join-rate-limiter.test.ts` に**失敗するテスト**を書く。窓内の失敗回数カウント・窓外の失効・`room.join` と `ai.unlock` が**同一インスタンスの窓を共有する**ことを直接検証するケースを含める（例: `room.join` で30回失敗させた状態から同じ `connId` で `ai.unlock` を呼ぶと即座に `RATE_LIMITED` になる）。 _要件: FR-158, FR-159 (US3)_
- [ ] T006 T005 を通すため `apps/sync/src/application/join-rate-limiter.ts` に `createJoinRateLimiter({ windowMs, max })` を実装する（green）。`handlers.ts` の `joinFailures`/`recentJoinFailures`/`JOIN_FAIL_WINDOW_MS`/`JOIN_FAIL_MAX` を置き換え、`handleRoomJoin` と `handleAiUnlock` が同一インスタンスを共有するよう `makeHandlers` で1度だけ生成する。ロジックは変えない。全ゲート緑を確認。 _要件: FR-158, FR-159 (US3)_

## フェーズ4 — 責務分割: イベント適用・コマンド組み立て（G1・純粋移動）

- [ ] T007 `apps/sync/src/application/apply-room-level-event.ts` を新設し、`handlers.ts` の `applyEvents`（1413行目付近）と `applyRoomLevelEvent`（1426〜1549行目）をロジック変更なしで移動する。`handlers.ts` からはこの新ファイルを import する。全ゲート緑・既存 `handlers.*.test.ts` の回帰が無いことを確認する。 _要件: FR-160 (US3)_
- [ ] T008 `apps/sync/src/application/build-domain-command.ts` を新設し、`handlers.ts` の `buildDomainCommand`（1235〜1310行目付近。`VALID_ACTIONS`/`VALID_PHASES` 等の付随定数を含む）をロジック変更なしで移動する。全ゲート緑を確認する。 _要件: FR-161 (US3)_

## フェーズ5 — 専用ハンドラの切り出し（G2・純粋移動）

- [ ] T009 `apps/sync/src/application/command-handlers/` ディレクトリを新設し、`handleRoomCreate`・`handleRoomJoin`・`handleTimePing`（`handlers.ts:268-477`）をそれぞれ `room-create.ts`/`room-join.ts`/`time-ping.ts` に移動する。T004/T006 で導入した `token-store`/`join-rate-limiter` への依存はそのまま引き継ぐ。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T010 [P] `handlers.ts` 内 `handleRoomCommand` の `participant.remove` 専用分岐（507〜583行目）を `command-handlers/participant-remove.ts` に切り出す（純粋関数 `handleParticipantRemove(ctx, cmd, deps)` として、パイプライン共通処理 [store.put/broadcast 呼び出しの手前まで] が呼び出せる形にする）。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T011 [P] `handleRoleSet`（`handlers.ts:792-846`）を `command-handlers/role-set.ts` に移動する。この時点ではまだ独自に在室確認・アクター解決・`rejectIfUnauthorized` を呼ぶ形のまま（縮退はフェーズ7で行う）。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T012 [P] `handleRoomPassphraseSet`（`handlers.ts:850-886`）を `command-handlers/room-passphrase-set.ts` に移動する。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T013 [P] `handleAiUnlock`（`handlers.ts:892-935`）を `command-handlers/ai-unlock.ts` に移動する。T006 の `join-rate-limiter` 共有インスタンスを正しく参照することを確認する。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T014 [P] `handleHostTransfer`（`handlers.ts:939-987`）を `command-handlers/host-transfer.ts` に移動する。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_
- [ ] T015 [P] `handleProblemRequest`/`handleProblemSubmit`（`handlers.ts:990-1041`）と、両者が使う `requireEditor`（`handlers.ts:1051-1066`）を `command-handlers/problem-request.ts`/`command-handlers/problem-submit.ts` に移動する（`requireEditor` は共有ヘルパとして `command-handlers/` 直下または `handlers.ts` に残すか判断し、コメントで理由を記す）。ロジック変更なし。全ゲート緑を確認する。 _要件: FR-162 (US3)_

## フェーズ6 — B-2: decide/evolve の統合（G3・挙動変更を含む唯一のフェーズ）

- [ ] T016 `packages/core/test/decide.test.ts`（または新規 `decide-switch-ineligible.test.ts`）に、`session.act SWITCH` へ `ineligible` を渡した場合の**失敗するテスト**を書く。「ineligible を渡さなければ従来通り隣の位置を返す」「ineligible を渡すと対象外を飛ばした次の対象を返す」の2ケースを GWT で検証する。 _要件: FR-165, FR-167 (US2)_
- [ ] T017 T016 を通すため `packages/core/src/decide.ts` の `DecideCommand` の `session.act` 変種に `ineligible?: ReadonlySet<number>` を追加し、`decideSessionAct` の `SWITCH` 分岐で `nextEligibleIndex(session, currentIndex, ineligible ?? new Set())`（`aggregate.ts` の既存 export）を使うよう変更する（green）。既存の `driver-switch-characterization.test.ts` の「decide が返す交代先: 隣の位置を指す」テストが ineligible 省略時に変わらず通ることを確認する。 _要件: FR-165, FR-167 (US2)_
- [ ] T018 `packages/core/test/evolve.test.ts`（または新規）に、`evolveDriverSwitched` が「`nextIndex === prevIndex` のとき `driverCounts`/`totalSwitches` を加算しない」ことを検証する**失敗するテスト**を書く（`driver-switch-equivalence.test.ts` の反例 `[len=1, currentIndex=0, ineligible=∅]` を単体テストとして固定する）。タイマー再アンカーは実行されることも同テストまたは対のテストで確認する。 _要件: FR-163, FR-164 (US2)_
- [ ] T019 T018 を通すため `packages/core/src/evolve.ts` の `evolveDriverSwitched` を修正する（green）。続けて `advanceDriver` を、修正後の `evolveDriverSwitched` を使う1行（`nextEligibleIndex` → `evolve(DriverSwitched)`）に縮退させ、内部の「現状維持」分岐（重複コード）を削除する。`driver-switch-characterization.test.ts` の全ケースが変更なく通ることを確認する（利用者可視の値が不変であることの直接証拠）。 _要件: FR-163, FR-164, FR-166, FR-168 (US2)_
- [ ] T020 `packages/core/test/driver-switch-equivalence.test.ts` を、T017/T019 適用後の「`decide`(ineligible付き)→`evolve`」経路と `advanceDriver` が**全入力で一致する**ことを検証する内容に書き換える（現状の「一致しない」ことを検証する `describe` ブロックと反例テストを削除し、両経路の一致を fast-check 2000回で検証する1つの `describe` に置き換える）。ファイル冒頭のコメント（「統合すると振る舞いが変わる」という結論）も、統合後の結論に更新する。 _要件: FR-167 (US2, SC-056)_
- [ ] T021 `apps/sync/src/application/handlers.ts` の `handleRoomCommand`（旧共通パイプライン）で、`domainCmd.command === "session.act" && domainCmd.action === "SWITCH"` のとき `domainCmd.ineligible = computeIneligibleIndices(targetRoom)` を注入してから `decide` を呼ぶよう変更し、現状の `isManualSwitch` 分岐（697-705行目。`decide` の結果を捨てて `advanceDriver` を呼び直すコード）を削除する。他コマンドと同じ `for (const event of result.value) newAgg = evolve(newAgg, event, now);` ループに統一する。`driver.skip` の即時繰り上げ（731-741行目）と `autoSwitch`（タイマー発火）は `advanceDriver` 直接呼び出しのまま残す（コメントで理由を明記）。 _要件: FR-165 (US2)_
- [ ] T022 T021 の変更について、実サーバーへの WebSocket 直結で実機検証する: 輪1人のルームで手動 `session.act SWITCH` を送信し、`driverCounts`/`totalSwitches` が交代前と変わらないこと（Issue #28 の反例ケース）、輪3人以上のルームで交代回数が従来通り増えることを確認する。結果を `baseline.md` に追記する。全ゲート緑を確認してコミット可能な状態にする。 _要件: FR-166, SC-057 (US2, US5)_

## フェーズ7 — パイプライン統合: 専用ハンドラの合流（G4）

- [ ] T023 `role.set` を共通パイプラインへ合流させる。`command-handlers/role-set.ts` の関数から在室確認・アクター解決・`rejectIfUnauthorized`（重複していた前置き25行）を削除し、`handleRoomCommand` が既に確立済みの `{ room, actor }` を受け取ってドメイン処理のみを行う関数へ縮退させる。`handleCommand` の switch から `role.set` の専用ケースを削除し、`RoomScopedCommand` の一般経路（`handleRoomCommand`）へ合流させる（`buildDomainCommand` に `role.set` 用の分岐を追加するか、`handleRoomCommand` 内の `participant.remove` と同様の専用ドメイン分岐として扱うかは実装時に決定し、コメントで理由を残す）。既存の `apps/sync/test/handlers.role-set.test.ts`（または該当ファイル）が変更なく緑であることを確認する。 _要件: FR-153, FR-154 (US1, SC-053)_
- [ ] T024 T023 と同じ手順で `room.passphrase.set` を合流させる。 _要件: FR-153, FR-154 (US1, SC-053)_
- [ ] T025 T023 と同じ手順で `ai.unlock` を合流させる。共有レート制限（T006）の呼び出し位置が共通パイプライン側に移っても窓の共有仕様（`room.join` との共有）が壊れていないことを T005 のテストで再確認する。 _要件: FR-153, FR-154, FR-159 (US1, SC-053)_
- [ ] T026 T023 と同じ手順で `host.transfer` を合流させる。 _要件: FR-153, FR-154 (US1, SC-053)_
- [ ] T027 T023 と同じ手順で `problem.request`/`problem.submit` を合流させる（`requireEditor` の呼び出しを共通パイプラインの権限判定に統合し、専用の `requireEditor` 呼び出しを削除する）。 _要件: FR-153, FR-154, FR-156 (US1, SC-053)_
- [ ] T028 `handleCommand` の switch を最終形（`room.create`/`room.join`/`time.ping` の3ケース＋`default→handleRoomCommand`）に整理する。**これは「デッドコードの解消」ではない**（親セッションの実測で旧6コマンドは元々 `checkPermission()` に到達していたことが確定済み。baseline.md/plan.md 参照）。ここで追加するのは回帰テストであり、`packages/core/test/permissions-differential.test.ts` の既存オラクル（25コマンド×3役割×2対象の静的突き合わせ）に対し、集合表（`HOST_ONLY_BEFORE_START`/`EDITOR_PLUS_COMMANDS`）自体へのミューテーション（1コマンドを外す/加える）を想定したテストケースを追加する。既存オラクルが「現在の判定が正しいか」を検証するのに対し、この追加ケースは「集合表を変更したとき、変更が旧専用ハンドラ6コマンドを含む全コマンドへ単一経路で反映されるか」を検証する（＝オラクルの入力側の回帰防止）。既存ファイルの `describe` 追加で足り、新規ファイルは不要（新設する場合のみ `apps/sync/test/pipeline-single-route.test.ts`）。 _要件: FR-150, FR-155, FR-156 (US1, SC-053)_
- [ ] T029 旧デッドコード6件（`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit`）それぞれについて、実サーバーへの WebSocket 直結で権限拒否を検証する（例: viewer が `role.set` を送信 → `UNAUTHORIZED`。開始前 editor が `ai.unlock` を送信可能なことの確認、開始前 viewer が `host.transfer` を送信 → 拒否、等）。結果を `baseline.md` または本タスクの完了記録に残す。全ゲート緑・テスト総数が T001 のベースライン以上であることを確認する。 _要件: FR-174, SC-059 (US5)_

## フェーズ8 — ADR 更新・最終検証（G5）

- [ ] T030 `tdd-mob-pro-timer/docs/adr/0002-decider-pure-domain.md` の**末尾に** `## 更新` セクションを追記する。内容: (1) 本リファクタリングで `decide` が `ineligible` を受け取り交代先を決定できるようになったこと、(2) `handlers.ts` 側の「decide の結果を advanceDriver で上書きする」分岐が撤去されたこと、(3) `evolve`/`advanceDriver` の重複実装が解消されたこと。**このファイルは `docs/adr-align-post-28`（Issue #33）ブランチも同時に編集しており、Issue #33 側は既に「影響」節の「利点」小節1文を修正・完了済みである。衝突を避けるため、本タスクは「背景」「決定」「影響」（「利点」小節を含む）を1文字も変更してはならず、編集はファイル末尾への追記のみに限定する。** 完了条件として、変更後に `git diff --stat tdd-mob-pro-timer/docs/adr/0002-decider-pure-domain.md` を実行し、**削除行数（`-`）が0であること**を確認する（追加行数のみが計上されている状態）。0でなければ既存セクションを変更してしまっているため、追記のみになるよう修正してから再確認する。 _要件: FR-169, FR-170 (US4, SC-060)_
- [ ] T031 最終検証: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を実行し、T001 のベースライン（テスト総数・typecheck 4/4・lint 3/3・build 3/3）と比較する。`permissions-differential.test.ts` の全件緑、`handlers.ts` の最終行数（目標 ≤600行。plan.md の見積もりと乖離があれば実測値を記録）、実機確認（ルーム作成・参加・役割変更・ドライバー交代[自動/手動/指名/輪1人]・お題生成・退出）の結果を `baseline.md` に追記して完了とする。 _要件: FR-171, FR-172, FR-173, FR-175, SC-054, SC-058 (US5)_

---

## 依存関係と並列グループ

- **クリティカルパス**: T001 → T002 → T004 → T006 → T007 → T008 → T009 → (T010〜T015のいずれか) → T017 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031
- **第1波（並列可）**: T003, T005（別ファイルの失敗テスト。ただし実装 T004/T006 は `handlers.ts` を編集するため直列）
- **第2波（並列可・T009完了後）**: T010, T011, T012, T013, T014, T015（いずれも `command-handlers/` 配下の別ファイルへの切り出し。ただし全て `handlers.ts` から関数を削除する編集を伴うため、同一ファイルへの同時編集を避けるならチーム運用上は直列実行が安全。並列実行する場合は各タスクの担当箇所が `handlers.ts` の非重複行範囲であることを事前に確認すること）
- **B-2（T016〜T022）は他フェーズと独立して着手可能**だが、T021（sync側統合）は T009〜T015（専用ハンドラ切り出し）の完了後に着手する方が `handlers.ts` の差分競合が少ない。
- **フェーズ7（T023〜T029）は T021/T022（B-2 統合）完了後に着手する**（`session.act` を経由する `role.set` 等は無いため技術的な依存はないが、`handlers.ts` の同一領域を編集するため競合を避ける順序として推奨）。
- 各タスク完了時点でコミット可能（動作する状態）であること。フェーズの区切り（G0〜G5）はそれぞれ独立した PR コミット単位として扱える。
