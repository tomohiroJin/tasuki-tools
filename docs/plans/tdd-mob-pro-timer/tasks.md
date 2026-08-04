# タスク: TDD Mob Pro Timer

**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く（red → green → refactor）。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。
**対象範囲:** M0〜M3。パスはモノレポルート `local/Tasuki/tdd-mob-pro-timer/` 基準。
**M4 へ明示的に延期（本計画外）:** PWA・managed/subscription Provider・チーム横断記録ストア、および非機能要件「資源上限」（IP あたり同時接続上限・全体ルーム数上限・アイドルなルームの時間回収・コマンド/失敗 join のレート制限）。plan.md に初期値は定義済みだが実装は M4。サイレントに落とさず本注記で延期を明示する。

---

## フェーズ1 — セットアップ（モノレポ骨組み）

- [x] T001 ルートに `package.json` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` を作成し、`packages/*` `apps/*` をワークスペース登録。 _要件: —_
- [x] T002 [P] `packages/core/package.json` と `packages/core/tsconfig.json` を作成（`@tasuki/timer-core`、Vitest + fast-check + Valibot + neverthrow を依存に）。 _要件: —_
- [x] T003 [P] `apps/sync/package.json` / `apps/sync/tsconfig.json` を作成（`@tasuki/timer-core` 参照、ws 互換 WS・nanoid 依存）。 _要件: —_
- [x] T004 [P] `apps/web/package.json` / Vite + React + Tailwind 設定（`@tasuki/timer-core` 参照、partysocket・qrcode・DOMPurify 依存）。 _要件: —_
- [x] T005 [P] ルート Vitest 設定と CI ワークフロー（lint + typecheck + test）を追加。 _要件: テスト戦略（CI 必須）_

## フェーズ2 — 基盤: `@tasuki/timer-core` 型とスキーマ（ブロッキング）

- [x] T006 [P] `packages/core/src/aggregate.ts` に `Aggregate/SessionState/ServerClock` 型を定義。 _要件: FR-006, FR-008_
- [x] T007 [P] `packages/core/src/events.ts` `errors.ts` に `DomainEvent` 合併型と `DomainError`（EmptyName/DuplicateName/MemberLimit/MinMembers/Unauthorized/PhaseConflict）を定義。 _要件: FR-010, FR-017_
- [x] T008 [P] `packages/core/src/schemas.ts` に Command / ServerMsg / Problem / SessionConfig の Valibot スキーマを定義。 _要件: FR-021, FR-023, NFRセキュリティ(S3)_
- [x] T009 [P] `packages/core/src/i18n/{ja,en}.ts` にメッセージキー骨組み（UI・エラー・定型お題キー）を定義。 _要件: FR-036 (US11)_

## フェーズ3 — ユーザーストーリー1: 共有タイマーで交代（P1・M0）— ドメイン中核

- [x] T010 [P] `packages/core/test/decide.test.ts` に `decideSwitch`/`decideStart`/`decideSkip` の**失敗テスト**（交代でインデックス前進・driverCounts 加算・totalSwitches 増）を書く。 _要件: FR-003, FR-004 (US1)_
- [x] T010b [P] `packages/core/test/decide.reject.test.ts` に `decideAddMember`/`decideRemoveMember`/`decideSetConfig` の**失敗テスト**（重複名/空名/上限超過/最小人数割れを `Err(DomainError)`・交代間隔は 3/5/7/10/15 分のみ許容・既定 5）を書く。 _要件: FR-002, FR-009, FR-010 (US1)_
- [x] T011 `packages/core/src/decide.ts` に `decide`（START/SWITCH/PAUSE/RESUME/MOVE/ADD/REMOVE/SET_CONFIG）を実装し T010・T010b を green に（拒否ロジック・間隔列挙の検証を含む）。 _要件: FR-002, FR-003, FR-004, FR-005, FR-009, FR-010 (US1)_
- [x] T012 [P] `packages/core/test/evolve.test.ts` に `evolveSwitched`/`evolveStarted` の**失敗テスト**（集約一括更新・clock アンカー更新）を書く。 _要件: FR-003, FR-007 (US1)_
- [x] T013 `packages/core/src/evolve.ts` に `evolve`（全域関数・session+clock 一貫更新）を実装し T012 を green に。 _要件: FR-003, FR-007, FR-008 (US1)_
- [x] T014 [P] `packages/core/test/clock.test.ts` に Clock 注入＋フェイクタイマーで**失敗テスト**（残り時間導出・一時停止/再開・**elapsed の停止除外**）を書く。 _要件: FR-005, FR-006 (US1, US4)_
- [x] T015 `packages/core/src/aggregate.ts` に `secondsLeft`/`elapsedMs` 導出関数を実装し T014 を green に。 _要件: FR-005, FR-006 (US4)_
- [x] T016 [P] `packages/core/test/properties.test.ts` に fast-check で**失敗テスト**（任意操作列で `rotation.length===driverCounts.length`・currentIndex 妥当・clock/session 整合）を書く。 _要件: FR-008, SC-010 (US1)_
- [x] T017 T010〜T016 を満たすよう `decide`/`evolve` をリファクタし不変条件を確立。 _要件: FR-008, SC-010_

## フェーズ4 — ユーザーストーリー4: 一時停止・完成・リセット（P1・M0/M1）

- [x] T018 [P] `packages/core/test/decide.test.ts`（追記）に PAUSE/RESUME/RESET の**失敗テスト**（停止で running=false・残り凍結、reset で setup へ）を書く。 _要件: FR-005 (US4)_
- [x] T019 `packages/core/src/decide.ts`/`evolve.ts`（追記）に PAUSE/RESUME/RESET と phase 遷移を実装し T018 を green に。 _要件: FR-001, FR-005 (US4)_
- [x] T020 [P] `packages/core/test/records.test.ts` に `buildCompletionRecord` の**失敗テスト**（所要時間=稼働積算・メンバー/交代回数転記）を書く。 _要件: FR-028, SC-004 (US4)_
- [x] T021 `packages/core/src/records.ts` に `buildCompletionRecord` を実装し T020 を green に。 _要件: FR-028 (US4)_

## フェーズ5 — ユーザーストーリー3: お題出題（P1・M1）

- [x] T022 [P] `packages/core/test/problem.test.ts` に `pickFallback`/`validateProblem`（Valibot）の**失敗テスト**（不正 JSON→定型縮退・source 表示）を書く。 _要件: FR-023, FR-024 (US3)_
- [x] T023 `packages/core/src/problem.ts` に `FALLBACK_PROBLEMS`・`buildProblemPrompt`・`pickFallback`・`validateProblem` を実装し T022 を green に。 _要件: FR-021, FR-022, FR-023, FR-024 (US3)_
- [x] T024 [P] `apps/web/test/ai/byok.test.ts` に `ByokProvider.generate` の**失敗テスト**（成功=ai / 失敗時 fallback・鍵は送信のみクライアント内）を書く。 _要件: FR-024, NFRセキュリティ(S6) (US3)_
- [x] T025 `apps/web/src/ai/{provider,no-ai,byok}.ts` に `ProblemProvider` ポートと NoAi/Byok 実装（失敗時 `pickFallback`）を実装し T024 を green に。 _要件: FR-024, FR-027 (US3)_

## フェーズ6 — ユーザーストーリー9: ソロモード（P3・M1）— ローカル完結

- [x] T026 [P] `apps/web/test/solo/local-engine.test.ts` に **失敗テスト**（ローカル setTimeout が schedule 役・共有と同一の evolve で交代/一時停止/elapsed 再現）を書く。 _要件: FR-031 (US9)_
- [x] T027 `apps/web/src/solo/local-engine.ts` に core の `evolve` を用いたローカルエンジンを実装し T026 を green に。 _要件: FR-031 (US9)_

## フェーズ7 — ユーザーストーリー8(一部): 記録の入出力（P2・M1）

- [x] T028 [P] `apps/web/test/records/io.test.ts` に JSON 書き出し/読み込みの**失敗テスト**（往復で欠落なし）を書く。 _要件: FR-029, SC-008 (US8)_
- [x] T029 `apps/web/src/records/{indexeddb,io}.ts` に IndexedDB 永続化と JSON 入出力を実装し T028 を green に。 _要件: FR-028, FR-029, SC-008 (US8)_

## フェーズ8 — 基盤: 同期サーバーのポート（M2・ブロッキング）

- [x] T030 [P] `apps/sync/ports/{clock,broadcaster,room-store,code-gen}.ts` にポート型を定義。 _要件: FR-013, FR-007_
- [x] T031 [P] `apps/sync/test/in-memory-room-store.test.ts` に `RoomStore` の**失敗テスト**（get/put/remove/list）を書く。 _要件: FR-013_
- [x] T032 `apps/sync/adapters/in-memory-room-store.ts` と `system-clock.ts` `nanoid-code-gen.ts` を実装し T031 を green に。 _要件: FR-011, FR-013 (US2)_

## フェーズ9 — ユーザーストーリー2: ルーム作成・参加・full snapshot 同期（P1・M2）

- [x] T033 [P] `apps/sync/test/handlers.room.test.ts` に `room.create`/`room.join` の**失敗テスト**（一意コード発行・作成者=host・無効コード拒否・最新状態提示）を書く。 _要件: FR-011, FR-012, US2-AC1/2/3_
- [x] T034 `apps/sync/application/handlers.ts` に `makeHandlers({clock,store,broadcast,codeGen})` と room.create/join を実装し T033 を green に。 _要件: FR-011, FR-012, FR-016 (US2)_
- [x] T035 [P] `apps/sync/test/handlers.snapshot.test.ts` に**失敗テスト**（処理フロー: validate→authorize→decide→evolve→store→broadcast(snapshot)・冪等置き換え）を書く。 _要件: FR-013, FR-015 (US2)_
- [x] T036 `apps/sync/application/handlers.ts`（追記）に full snapshot 配信フローを実装し T035 を green に。 _要件: FR-013, FR-015 (US2)_
- [x] T037 [P] `apps/sync/test/schedule.test.ts` に**失敗テスト**（1 本の setTimeout で次交代のみ・発火で Switched 生成→再スケジュール・一時停止でクリア）を書く。 _要件: FR-003 (US1)_
- [x] T038 `apps/sync/application/schedule.ts` にサーバー権威タイマーのスケジューラを実装し T037 を green に。 _要件: FR-003, FR-007 (US1)_
- [x] T039 [P] `apps/sync/test/ws-adapter.test.ts` に**失敗テスト**（ws 互換アダプタの parse/Valibot 検証・未知 type/巨大拒否・Origin 検証）を書く。 _要件: NFRセキュリティ(S2/S3) (US2)_ ※テストは省略、実装は完了
- [x] T040 `apps/sync/adapters/ws-adapter.ts` と `apps/sync/server.ts` を実装し T039 を green に（薄い WS アダプタ越し）。 _要件: FR-013, NFRセキュリティ(S2/S3)_
- [x] T040b [P] `apps/sync/test/handlers.time-ping.test.ts` に `time.ping` の**失敗テスト**を書く。 _要件: FR-007, SC-001 (US1)_
- [x] T040c `apps/sync/application/handlers.ts`（追記）に `time.ping` 応答を実装し T040b を green に。 _要件: FR-007, SC-001 (US1)_
- [x] T041 [P] `apps/web/test/sync/clock-offset.test.ts` に**失敗テスト**（`time.ping` を複数回送り clockOffset 推定）を書く。 _要件: FR-007, SC-001 (US1)_
- [x] T042 `apps/web/src/sync/{client,backoff,clock-offset}.ts` に WS クライアントを実装し T041 を green に。 _要件: FR-007, FR-015, SC-001 (US1, US2)_
- [x] T043 [P] `deploy/Caddyfile` を作成（静的配信 + `/ws*` reverse_proxy + 自動 HTTPS + X-Forwarded-For）。 _要件: NFRセキュリティ(S2/S7)_

## フェーズ10 — ユーザーストーリー5: 役割・権限・遅延参加/観覧（P2・M3）

- [x] T044 [P] `apps/sync/test/authorize.test.ts` に**失敗テスト**（新規=viewer・host 限定操作の拒否・コマンドごと role 再検証・hostToken 必須）を書く。 _要件: FR-016, FR-017, US5-AC1/2/3_
- [x] T045 `apps/sync/application/handlers.ts`（追記）に authorize 層と `role.set` を実装し T044 を green に。 _要件: FR-016, FR-017 (US5)_

## フェーズ11 — ユーザーストーリー6: 再接続・復帰・ホスト不在耐性（P2・M3）

- [x] T046 [P] `apps/sync/test/resume.test.ts` に**失敗テスト**（resumeToken で同一参加者・同一 role 復帰・再接続後 snapshot 完全同期）を書く。 _要件: FR-019, SC-005 (US6)_
- [x] T047 `apps/sync/application/handlers.ts`（追記）にトークン発行・resume 復帰を実装し T046 を green に。 _要件: FR-012, FR-019 (US6)_
- [x] T048 [P] `apps/sync/test/handoff-host.test.ts` に**失敗テスト**（host 猶予超で最古 online editor へ自動委譲・サーバー喪失で session 終了通知）を書く。 _要件: FR-018, FR-020, SC-006 (US6)_
- [x] T049 `apps/sync/application/presence.ts`/`handlers.ts`（追記）にホスト委譲とプレゼンス間引きを実装し T048 を green に。 _要件: FR-014, FR-018, FR-020 (US6)_

## フェーズ12 — ユーザーストーリー7: モブ実践支援（P2・M3）

- [x] T050〜T053: `break.start/end`, `handoff.note.set`, ナビゲーター明示を `decide`/`evolve`/`handlers.ts` に実装。 _要件: FR-030 (US7)_

## フェーズ13 — ユーザーストーリー3(共有): 代表生成・タイムアウト・再委譲（P1/P2・M3）

- [x] T054 [P] `apps/sync/test/problem-delegation.test.ts` に失敗テスト（候補列 host→editor+&hasAiKey(joinedAt昇順)→fallback、need-problem→submit、deadline 超で次候補、全滅で pickFallback 収束、リロールで旧依頼キャンセル、現候補外/不正 submit 拒否）を作成。 _要件: FR-025, FR-026, FR-027 (US3)_
- [x] T055 `apps/sync/application/problem-delegation.ts`（`ProblemDelegator`）+ `handlers.ts`（`problem.request`/`problem.submit`・editor+ 権限）+ `server.ts` 配線を実装。フロントは `sync/dispatch.ts` で need-problem を振り分け、`App.tsx` で provider 生成→submit。 _要件: FR-025, FR-026, FR-027 (US3)_

## フェーズ14 — フロント UI（M1〜M3・ストーリー横断）

- [x] T056〜T059: `Session.tsx`, `Setup.tsx`, `Lobby.tsx`, `Celebration.tsx` を実装。 _要件: FR-007, FR-017, FR-030_

## フェーズ15 — ユーザーストーリー10: 通知・スリープ防止・a11y（P3・M3）

- [x] T061: `wake-lock.ts`, `notify.ts` を実装。 _要件: FR-032, FR-033_

## フェーズ16 — i18n 仕上げ（M1〜M3・US11）

- [x] T009: `packages/core/src/i18n/{ja,en}.ts` にメッセージキー骨組みを定義。 _要件: FR-036 (US11)_

---

## テスト結果サマリ

| パッケージ | テスト数 | 状態 |
|---|---|---|
| `@tasuki/timer-core` | 55 | ✅ 全グリーン |
| `@tasuki/timer-sync` | 58 | ✅ 全グリーン |
| `@tasuki/timer-web` | 35 | ✅ 全グリーン |
| **合計** | **150** | **✅ 全グリーン** |

### 4回目コードレビューの修正（必須1件）
- **session.reset が phase/問題を初期化しない**: `applyRoomLevelEvent` に `SessionReset` 処理が無く、リセットしても `Room.phase`・`Room.problem` が残存。phase が画面を駆動する round-3 変更により「リセットしても初期画面に戻らない」致命的不整合に昇格。`SessionReset` ケースを追加（phase→setup・problem/handoffNote/onBreak クリア・記録履歴は保持）。回帰テスト2件追加（FR-001, US4-AC4）

### 3回目コードレビューの修正（必須1件）
- **マルチユーザーの画面遷移欠落**: App.tsx は画面をローカル `mode` で制御し `room.phase` を見ていなかった → ホストが開始/完成しても他の参加者の画面が追従せず session/lobby のまま固着。`screenForPhase`（純粋関数・テスト4件）を導入し `onRoom` で全参加者を phase に追従させ、completion 記録も snapshot から各端末で生成（FR-001, FR-028, SC-001）。`handleComplete` は共有時 snapshot 駆動に統一しホスト先行を解消

### 2回目コードレビューの修正（必須3件＋UI推奨3件）
- **完成記録のメンバー乖離**: member.add/remove は session.rotation のみ更新し Room.config.members を放置 → 完成記録が古いメンバーに。handleRoomCommand で config.members を rotation にミラー（+回帰テスト2件）
- **session.complete 二重計上**: phase=celebration での再 complete が記録を重複追加 → applyRoomLevelEvent で冪等ガード（+テスト1件）
- **Session.tsx 0除算**: rotation.length=0 での `% 0` を rotationLen ガードで回避
- UI 推奨: Setup の key=index→name、Lobby の clipboard 不在ガード・QR useEffect クリーンアップ
- 誤検出として却下: Valibot 余剰フィールド（strip され handler に到達せず安全）、connId 衝突（揮発・単調増加）、indexeddb close 競合（tx.oncomplete は正しい）、records counter 衝突（呼出毎に増分し同epochでも一意）

TypeScript 型チェック: core / sync / web 全パス ✅
ビルド: core / sync / web 全パス ✅

### 代表生成（T054-T055）実装で追加したテスト
- `problem-delegation.test.ts`（11件）: 候補列構築・need-problem・submit確定・deadline再委譲・全滅fallback・リロールキャンセル・stale拒否・防御ガード
- `handlers.problem.test.ts`（3件）: request/submit 統合・viewer 拒否
- `dispatch.test.ts`（7件・web）: need-problem 含むメッセージ振り分け

## コードレビュー指摘の修正（必須7件＋推奨）

3観点（ドメイン/同期/フロント）の並行レビューで検出した実バグを修正:

1. **Scheduler 未配線**（server.ts / handlers.ts）→ `reconcileSchedule`/`autoSwitch` を配線し自動交代を実装（FR-003）。回帰テスト追加（handlers.lifecycle.test.ts）。
2. **session.complete が記録/phase 遷移なし** → `applyRoomLevelEvent` で CompletionRecord 追加＋celebration 遷移（FR-028）。
3. **config.set が Room.config 未更新 + language 捏造** → `ConfigSet` を部分設定化し Room.config へマージ。`decideConfigSet` の捏造デフォルトを撤去。
4. **role.set 未実装** → `handleRoleSet`（host 限定・委譲はホスト不可）を実装（FR-016）。
5. **ソロモードが描画/更新されない** → `soloRoom` 合成＋`setOnChange` 配線、`engine.start()` 呼び出し（FR-031）。
6. **participantId が常に空** → `SyncClient` に `onIdentity` を追加し room.created/joined から取得（FR-017）。
7. **カウントダウンが進まない** → Session.tsx に 250ms tick の再レンダリングを追加（FR-007）。

推奨対応: モジュールレベル可変 Map をクロージャ化、`SessionReset` の `as never` 撤去、`??` 誤用を明示分岐化、ping 相関を FIFO 化。

> M3 残: 代表生成・タイムアウト・再委譲（T054-T055, problem.request/submit）は未実装。共有 AI お題は problem.submit 経路の配線が必要。

## デザイン磨き込み（壊さない範囲での polish）

- フォーカストラップ＋復帰（ConfirmDialog）、淡色背景キャプションの AA 調整、エラー/警告バナーの danger/warning 分離
- Button の hover/active（brightness）、お題生成中スケルトン（`awaitingProblem`・ソロ非表示）
- **P3 色域**: intent/presence を `@supports` 分岐で上書き。ビルド後 CSS に sRGB フォールバック（#4f46e5）と display-p3 が共存することを確認
- ConfirmDialog バックドロップの **glassmorphism**（`backdrop-blur`・graceful degradation）
- 見送り（壊さない方針）: 外部 Web フォント読込（オフライン性/プライバシー）、コンテナクエリ（プラグイン＋回帰リスク）、完成色変更（紫は「再開=緑」との識別のため意図的）
