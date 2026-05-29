# タスク: TDD Mob Pro Timer

**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く（red → green → refactor）。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。
**対象範囲:** M0〜M3。パスはモノレポルート `local/Tasuki/tdd-mob-pro-timer/` 基準。
**M4 へ明示的に延期（本計画外）:** PWA・managed/subscription Provider・チーム横断記録ストア、および非機能要件「資源上限」（IP あたり同時接続上限・全体ルーム数上限・アイドルなルームの時間回収・コマンド/失敗 join のレート制限）。plan.md に初期値は定義済みだが実装は M4。サイレントに落とさず本注記で延期を明示する。

---

## フェーズ1 — セットアップ（モノレポ骨組み）

- [ ] T001 ルートに `package.json` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` を作成し、`packages/*` `apps/*` をワークスペース登録。 _要件: —_
- [ ] T002 [P] `packages/core/package.json` と `packages/core/tsconfig.json` を作成（`@tdd-mob/core`、Vitest + fast-check + Valibot + neverthrow を依存に）。 _要件: —_
- [ ] T003 [P] `apps/sync/package.json` / `apps/sync/tsconfig.json` を作成（`@tdd-mob/core` 参照、ws 互換 WS・nanoid 依存）。 _要件: —_
- [ ] T004 [P] `apps/web/package.json` / Vite + React + Tailwind 設定（`@tdd-mob/core` 参照、partysocket・qrcode・DOMPurify 依存）。 _要件: —_
- [ ] T005 [P] ルート Vitest 設定と CI ワークフロー（lint + typecheck + test）を追加。 _要件: テスト戦略（CI 必須）_

## フェーズ2 — 基盤: `@tdd-mob/core` 型とスキーマ（ブロッキング）

- [ ] T006 [P] `packages/core/src/aggregate.ts` に `Aggregate/SessionState/ServerClock` 型を定義。 _要件: FR-006, FR-008_
- [ ] T007 [P] `packages/core/src/events.ts` `errors.ts` に `DomainEvent` 合併型と `DomainError`（EmptyName/DuplicateName/MemberLimit/MinMembers/Unauthorized/PhaseConflict）を定義。 _要件: FR-010, FR-017_
- [ ] T008 [P] `packages/core/src/schemas.ts` に Command / ServerMsg / Problem / SessionConfig の Valibot スキーマを定義。 _要件: FR-021, FR-023, NFRセキュリティ(S3)_
- [ ] T009 [P] `packages/core/src/i18n/{ja,en}.ts` にメッセージキー骨組み（UI・エラー・定型お題キー）を定義。 _要件: FR-036 (US11)_

## フェーズ3 — ユーザーストーリー1: 共有タイマーで交代（P1・M0）— ドメイン中核

- [ ] T010 [P] `packages/core/test/decide.test.ts` に `decideSwitch`/`decideStart`/`decideSkip` の**失敗テスト**（交代でインデックス前進・driverCounts 加算・totalSwitches 増）を書く。 _要件: FR-003, FR-004 (US1)_
- [ ] T010b [P] `packages/core/test/decide.reject.test.ts` に `decideAddMember`/`decideRemoveMember`/`decideSetConfig` の**失敗テスト**（重複名/空名/上限超過/最小人数割れを `Err(DomainError)`・交代間隔は 3/5/7/10/15 分のみ許容・既定 5）を書く。 _要件: FR-002, FR-009, FR-010 (US1)_
- [ ] T011 `packages/core/src/decide.ts` に `decide`（START/SWITCH/PAUSE/RESUME/MOVE/ADD/REMOVE/SET_CONFIG）を実装し T010・T010b を green に（拒否ロジック・間隔列挙の検証を含む）。 _要件: FR-002, FR-003, FR-004, FR-005, FR-009, FR-010 (US1)_
- [ ] T012 [P] `packages/core/test/evolve.test.ts` に `evolveSwitched`/`evolveStarted` の**失敗テスト**（集約一括更新・clock アンカー更新）を書く。 _要件: FR-003, FR-007 (US1)_
- [ ] T013 `packages/core/src/evolve.ts` に `evolve`（全域関数・session+clock 一貫更新）を実装し T012 を green に。 _要件: FR-003, FR-007, FR-008 (US1)_
- [ ] T014 [P] `packages/core/test/clock.test.ts` に Clock 注入＋フェイクタイマーで**失敗テスト**（残り時間導出・一時停止/再開・**elapsed の停止除外**）を書く。 _要件: FR-005, FR-006 (US1, US4)_
- [ ] T015 `packages/core/src/aggregate.ts` に `secondsLeft`/`elapsedMs` 導出関数を実装し T014 を green に。 _要件: FR-005, FR-006 (US4)_
- [ ] T016 [P] `packages/core/test/properties.test.ts` に fast-check で**失敗テスト**（任意操作列で `rotation.length===driverCounts.length`・currentIndex 妥当・clock/session 整合）を書く。 _要件: FR-008, SC-010 (US1)_
- [ ] T017 T010〜T016 を満たすよう `decide`/`evolve` をリファクタし不変条件を確立。 _要件: FR-008, SC-010_

## フェーズ4 — ユーザーストーリー4: 一時停止・完成・リセット（P1・M0/M1）

- [ ] T018 [P] `packages/core/test/decide.test.ts`（追記）に PAUSE/RESUME/RESET の**失敗テスト**（停止で running=false・残り凍結、reset で setup へ）を書く。 _要件: FR-005 (US4)_
- [ ] T019 `packages/core/src/decide.ts`/`evolve.ts`（追記）に PAUSE/RESUME/RESET と phase 遷移を実装し T018 を green に。 _要件: FR-001, FR-005 (US4)_
- [ ] T020 [P] `packages/core/test/records.test.ts` に `buildCompletionRecord` の**失敗テスト**（所要時間=稼働積算・メンバー/交代回数転記）を書く。 _要件: FR-028, SC-004 (US4)_
- [ ] T021 `packages/core/src/records.ts` に `buildCompletionRecord` を実装し T020 を green に。 _要件: FR-028 (US4)_

## フェーズ5 — ユーザーストーリー3: お題出題（P1・M1）

- [ ] T022 [P] `packages/core/test/problem.test.ts` に `pickFallback`/`validateProblem`（Valibot）の**失敗テスト**（不正 JSON→定型縮退・source 表示）を書く。 _要件: FR-023, FR-024 (US3)_
- [ ] T023 `packages/core/src/problem.ts` に `FALLBACK_PROBLEMS`・`buildProblemPrompt`・`pickFallback`・`validateProblem` を実装し T022 を green に。 _要件: FR-021, FR-022, FR-023, FR-024 (US3)_
- [ ] T024 [P] `apps/web/test/ai/byok.test.ts` に `ByokProvider.generate` の**失敗テスト**（成功=ai / 失敗時 fallback・鍵は送信のみクライアント内）を書く。 _要件: FR-024, NFRセキュリティ(S6) (US3)_
- [ ] T025 `apps/web/src/ai/{provider,no-ai,byok}.ts` に `ProblemProvider` ポートと NoAi/Byok 実装（失敗時 `pickFallback`）を実装し T024 を green に。 _要件: FR-024, FR-027 (US3)_

## フェーズ6 — ユーザーストーリー9: ソロモード（P3・M1）— ローカル完結

- [ ] T026 [P] `apps/web/test/solo/local-engine.test.ts` に **失敗テスト**（ローカル setTimeout が schedule 役・共有と同一の evolve で交代/一時停止/elapsed 再現）を書く。 _要件: FR-031 (US9)_
- [ ] T027 `apps/web/src/solo/local-engine.ts` に core の `evolve` を用いたローカルエンジンを実装し T026 を green に。 _要件: FR-031 (US9)_

## フェーズ7 — ユーザーストーリー8(一部): 記録の入出力（P2・M1）

- [ ] T028 [P] `apps/web/test/records/io.test.ts` に JSON 書き出し/読み込みの**失敗テスト**（往復で欠落なし）を書く。 _要件: FR-029, SC-008 (US8)_
- [ ] T029 `apps/web/src/records/{indexeddb,io}.ts` に IndexedDB 永続化と JSON 入出力を実装し T028 を green に。 _要件: FR-028, FR-029, SC-008 (US8)_

## フェーズ8 — 基盤: 同期サーバーのポート（M2・ブロッキング）

- [ ] T030 [P] `apps/sync/ports/{clock,broadcaster,room-store,code-gen}.ts` にポート型を定義。 _要件: FR-013, FR-007_
- [ ] T031 [P] `apps/sync/test/in-memory-room-store.test.ts` に `RoomStore` の**失敗テスト**（get/put/remove/list）を書く。 _要件: FR-013_
- [ ] T032 `apps/sync/adapters/in-memory-room-store.ts` と `system-clock.ts` `nanoid-code-gen.ts` を実装し T031 を green に。 _要件: FR-011, FR-013 (US2)_

## フェーズ9 — ユーザーストーリー2: ルーム作成・参加・full snapshot 同期（P1・M2）

- [ ] T033 [P] `apps/sync/test/handlers.room.test.ts` に `room.create`/`room.join` の**失敗テスト**（一意コード発行・作成者=host・無効コード拒否・最新状態提示）を書く。 _要件: FR-011, FR-012, US2-AC1/2/3_
- [ ] T034 `apps/sync/application/handlers.ts` に `makeHandlers({clock,store,broadcast,codeGen})` と room.create/join を実装し T033 を green に。 _要件: FR-011, FR-012, FR-016 (US2)_
- [ ] T035 [P] `apps/sync/test/handlers.snapshot.test.ts` に**失敗テスト**（処理フロー: validate→authorize→decide→evolve→store→broadcast(snapshot)・冪等置き換え）を書く。 _要件: FR-013, FR-015 (US2)_
- [ ] T036 `apps/sync/application/handlers.ts`（追記）に full snapshot 配信フローを実装し T035 を green に。 _要件: FR-013, FR-015 (US2)_
- [ ] T037 [P] `apps/sync/test/schedule.test.ts` に**失敗テスト**（1 本の setTimeout で次交代のみ・発火で Switched 生成→再スケジュール・一時停止でクリア）を書く。 _要件: FR-003 (US1)_
- [ ] T038 `apps/sync/application/schedule.ts` にサーバー権威タイマーのスケジューラを実装し T037 を green に。 _要件: FR-003, FR-007 (US1)_
- [ ] T039 [P] `apps/sync/test/ws-adapter.test.ts` に**失敗テスト**（ws 互換アダプタの parse/Valibot 検証・未知 type/巨大拒否・Origin 検証）を書く。 _要件: NFRセキュリティ(S2/S3) (US2)_
- [ ] T040 `apps/sync/adapters/ws-adapter.ts` と `apps/sync/server.ts` を実装し T039 を green に（薄い WS アダプタ越し）。 _要件: FR-013, NFRセキュリティ(S2/S3)_
- [ ] T040b [P] `apps/sync/test/handlers.time-ping.test.ts` に `time.ping` の**失敗テスト**（`{clientTime}` 受信→サーバー時刻 `{serverTime}` を即応・状態を変えない・snapshot 配信しない）を書く。 _要件: FR-007, SC-001 (US1)_
- [ ] T040c `apps/sync/application/handlers.ts`（追記）に `time.ping` 応答を実装し T040b を green に（clockOffset 推定の対向）。 _要件: FR-007, SC-001 (US1)_
- [ ] T041 [P] `apps/web/test/sync/clock-offset.test.ts` に**失敗テスト**（`time.ping` を複数回送り round-trip 補正＋中央値で clockOffset 推定）を書く。 _要件: FR-007, SC-001 (US1)_
- [ ] T042 `apps/web/src/sync/{client,backoff,clock-offset}.ts` に WS クライアント（snapshot 置き換え・clockOffset・指数バックオフ）を実装し T041 を green に。 _要件: FR-007, FR-015, SC-001 (US1, US2)_
- [ ] T043 [P] `deploy/Caddyfile` を作成（静的配信 + `/ws*` reverse_proxy + 自動 HTTPS + X-Forwarded-For）。 _要件: NFRセキュリティ(S2/S7)_

## フェーズ10 — ユーザーストーリー5: 役割・権限・遅延参加/観覧（P2・M3）

- [ ] T044 [P] `apps/sync/test/authorize.test.ts` に**失敗テスト**（新規=viewer・host 限定操作の拒否・コマンドごと role 再検証・hostToken 必須）を書く。 _要件: FR-016, FR-017, US5-AC1/2/3_
- [ ] T045 `apps/sync/application/handlers.ts`（追記）に authorize 層と `role.set` を実装し T044 を green に。 _要件: FR-016, FR-017 (US5)_

## フェーズ11 — ユーザーストーリー6: 再接続・復帰・ホスト不在耐性（P2・M3）

- [ ] T046 [P] `apps/sync/test/resume.test.ts` に**失敗テスト**（resumeToken で同一参加者・同一 role 復帰・再接続後 snapshot 完全同期）を書く。 _要件: FR-019, SC-005 (US6)_
- [ ] T047 `apps/sync/application/handlers.ts`（追記）にトークン発行・resume 復帰を実装し T046 を green に。 _要件: FR-012, FR-019 (US6)_
- [ ] T048 [P] `apps/sync/test/handoff-host.test.ts` に**失敗テスト**（host 猶予超で最古 online editor へ自動委譲・サーバー喪失で session 終了通知）を書く。 _要件: FR-018, FR-020, SC-006 (US6)_
- [ ] T049 `apps/sync/application/presence.ts`/`handlers.ts`（追記）にホスト委譲とプレゼンス間引き（遷移/入退室時のみ配信）を実装し T048 を green に。 _要件: FR-014, FR-018, FR-020 (US6)_

## フェーズ12 — ユーザーストーリー7: モブ実践支援（P2・M3）

- [ ] T050 [P] `packages/core/test/config.test.ts` に**失敗テスト**（`config.set` が decide 検証を通る・navigator/break/assertive トグル・breakEveryRotations での休憩提案）を書く。 _要件: FR-030 (US7)_
- [ ] T051 `packages/core/src/decide.ts`/`evolve.ts`（追記）に navigator 明示・`break.start/end`・onBreak・handoffNote・休憩提案を実装し T050 を green に。 _要件: FR-030 (US7)_
- [ ] T052 [P] `apps/sync/test/handlers.break-note.test.ts` に**失敗テスト**（break/handoff の権限・休憩で全タイマー停止）を書く。 _要件: FR-017, FR-030 (US7)_
- [ ] T053 `apps/sync/application/handlers.ts`（追記）に `break.start/end`・`handoff.note.set` を実装し T052 を green に。 _要件: FR-030 (US7)_

## フェーズ13 — ユーザーストーリー3(共有): 代表生成・タイムアウト・再委譲（P1/P2・M3）

- [ ] T054 [P] `apps/sync/test/problem-delegation.test.ts` に**失敗テスト**（候補列=host→editor+&hasAiKey(joinedAt 昇順)→fallback・need-problem→submit、deadline 超で次候補、全滅で pickFallback 収束・リロールで旧依頼キャンセル）を書く。 _要件: FR-025, FR-026, FR-027 (US3)_
- [ ] T055 `apps/sync/application/handlers.ts`（追記）に `problem.request`/`problem.submit` と代表委譲・`signal.need-problem` を実装し T054 を green に。 _要件: FR-025, FR-026, FR-027 (US3)_

## フェーズ14 — フロント UI（M1〜M3・ストーリー横断）

- [ ] T056 [P] `apps/web/test/ui/session-derive.test.tsx` に**失敗テスト**（snapshot から secondsLeft/現・次ドライバー/ナビゲーター描画・楽観上書き）を書く。 _要件: FR-007, FR-015, FR-030 (US1, US7)_
- [ ] T057 `apps/web/src/ui/Session.tsx` と `components/{TeamOrbit,RotationStatsPanel}.tsx` を実装し T056 を green に（host 限定ボタンの活性制御含む）。 _要件: FR-007, FR-017, FR-030 (US1, US5)_
- [ ] T058 [P] `apps/web/src/ui/{Setup,Lobby,Ready,Celebration}.tsx` を実装（Setup=設定/推奨間隔指針・Lobby=コード/QR/コピー・Ready=お題プレビュー・Celebration=記録保存）。 _要件: FR-001, FR-011, FR-021, FR-028 (US2, US3, US8)_
- [ ] T059 [P] `apps/web/test/ui/lobby-qr.test.tsx` に QR/コピー/共有 URL の**失敗テスト**を書き、`components/SharePanel.tsx` を実装。 _要件: FR-011 (US8)_

## フェーズ15 — ユーザーストーリー10: 通知・スリープ防止・a11y（P3・M3）

- [ ] T060 [P] `apps/web/test/platform/wake-notify.test.ts` に**失敗テスト**（Wake Lock 取得・visibilitychange 再取得・自分の番で Notification/vibrate）を書く。 _要件: FR-032, FR-033 (US10)_
- [ ] T061 `apps/web/src/platform/{wake-lock,notify}.ts` を実装し T060 を green に。 _要件: FR-032, FR-033 (US10)_
- [ ] T062 [P] `apps/web/test/ui/a11y.test.tsx` に**失敗テスト**（prefers-reduced-motion で演出/強通知を控えめ版へ・ARIA ライブで交代/残り10秒/一時停止/休憩読み上げ）を書く。 _要件: FR-034, FR-035 (US10)_
- [ ] T063 `apps/web/src/ui`（追記）に reduced-motion 切替と ARIA ライブリージョンを実装し T062 を green に。 _要件: FR-034, FR-035 (US10)_

## フェーズ16 — i18n 仕上げ（M1〜M3・US11）

- [ ] T064 [P] `apps/web/test/i18n.test.ts` に**失敗テスト**（JA/EN 切替で UI・定型お題・エラー文言が対象言語表示）を書く。 _要件: FR-036 (US11)_
- [ ] T065 `apps/web/src/i18n` と `packages/core/src/i18n` を結線し T064 を green に。 _要件: FR-036 (US11)_

---

## 依存関係と並列グループ

- **第1波（並列・セットアップ）**: T001 → その後 T002,T003,T004,T005 [P]。
- **第2波（並列・基盤型）**: T006,T007,T008,T009 [P]（T002 後）。
- **クリティカルパス（ドメイン）**: (T010,T010b)→T011→T012→T013→T014→T015→T016→T017（US1/US4 のコア）。
- **M1 ローカル群（T013/T015 後、相互 [P]）**: {T018-T021}, {T022-T025}, {T026-T027}, {T028-T029}。
- **M2 同期（T017 後）**: T030→T031→T032 → {T033-T034}→{T035-T036} → T037→T038 → T039→T040 → T040b→T040c → T041→T042、T043 [P]。
- **M3（T036/T042 後、ストーリーごと [P]）**: {T044-T045}, {T046-T049}, {T050-T053}, {T054-T055}。
- **UI（core/sync 安定後）**: T056→T057, T058 [P], T059 [P]、{T060-T063}, {T064-T065}。
- **テスト先行の鉄則**: 各ストーリーで `*.test.*`（失敗テスト）を必ず実装タスクの前に置く（上記 T010 等）。
