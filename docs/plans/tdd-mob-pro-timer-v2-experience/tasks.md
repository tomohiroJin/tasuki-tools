# タスク: TDD Mob Pro Timer v2 — 体験・導線の作り直し
**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く（Red→Green→Refactor）。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様トレース。
**前提:** v1 モノレポ（`tdd-mob-pro-timer/`）上で作業。既存コア（decide/evolve・ServerClock・snapshot・authorize・presence）は**壊さず加算的に拡張**。テストは各パッケージの `test/`（src 構造ミラー）に置く。中断（abort）は**記録を残さない**方針。

---

## フェーズ0 — セットアップ（最小・ブロッキング）
- [ ] T001 ブランチ作成（`feature/tdd-mob-pro-timer-v2-experience`）と `pnpm install` 健全性確認。`pnpm typecheck`/`pnpm test:unit` が現状グリーンであることを基準線として記録。 _要件: —_
- [ ] T002 v2 で追加する型の置き場を確認し、`packages/core/src/aggregate.ts` に**空のフィールド追加先**（`Participant.isPlaceholder?`・`Participant.driverEligible?`・`Problem.source`・`Problem.edited`・`Room.problemMode`）の TODO アンカーをコメントで用意（実装は各 US タスクで）。 _要件: 主要エンティティ_

---

## フェーズ1 — P1: ドメイン拡張（core）★最優先・UI 非依存で全グリーン

### 1A. 型・ヘルパ基盤（ブロッキング）
- [ ] T003 `packages/core/test/aggregate.test.ts` に **`nextEligibleIndex(state)` の失敗テスト**を書く（eligible のみ巡回・全員 ineligible は現状維持・空 rotation 安全）。 _要件: FR-051 (US9)_
- [ ] T004 `packages/core/src/aggregate.ts` に型拡張（上記5フィールド、既存は不変・任意化で後方互換）と `nextEligibleIndex` を実装し T003 を green に。 _要件: FR-047,051,061,011,042 (US3,4,9)_

### 1B. 終了種別（完成は据置・中断は新設で記録なし）
- [ ] T005 `packages/core/test/decide.test.ts` に **`session.abort` の失敗テスト**（abort は完成と別イベント `SessionAborted` を生成・phase を締めくくりへ・**記録を生成しない**）。 _要件: FR-018,020 (US5)_
- [ ] T006 `packages/core/test/decide.test.ts` に **`session.complete` が従来どおり記録生成のままである回帰テスト**を追加（abort と取り違えない）。 _要件: FR-018,020 (US5)_
- [ ] T007 `events.ts` に `SessionAborted` を追加、`decide.ts` に `session.abort` 分岐、`evolve.ts` に反映を実装し T005/T006 を green に。`SessionCompleted` は不変。 _要件: FR-018,020,044 (US5)_
- [ ] T008 `packages/core/test/records.test.ts` に **「abort では `buildCompletionRecord` を呼ばない／complete でのみ呼ぶ」テスト**を追加し、必要なら呼び出し側ガードを実装。 _要件: FR-020 (US5)_

### 1C. 在席の柔軟化（代理追加・一時離脱・改名）
- [ ] T009 `decide.test.ts` に **`participant.addProxy` の失敗テスト**（connId=null・isPlaceholder=true の参加者を作り rotation に載せドライバー対象に含める／host 限定／表示名重複拒否は v1 踏襲）。 _要件: FR-047 (US9-2)_
- [ ] T010 `events.ts`/`decide.ts`/`evolve.ts` に `ProxyMemberAdded` を実装し T009 を green に。 _要件: FR-047 (US9-2)_
- [ ] T011 `decide.test.ts` に **`participant.rename` の失敗テスト**（表示名変更が participant に反映・空名拒否）。 _要件: FR-046,048 (US9-1,9-3)_
- [ ] T012 `ParticipantRenamed` を実装し T011 を green に。 _要件: FR-046,048 (US9)_
- [ ] T013 `decide.test.ts` に **`driver.skip`/`driver.resume` の失敗テスト**（driverEligible 切替・現ドライバーが skip されたら次の eligible へ繰り上げ＋interval リセット・resume で対象復帰）。 _要件: FR-051 (US9-6)_
- [ ] T014 `DriverSkipped`/`DriverResumed` を実装し T013 を green に（`nextEligibleIndex` を再利用）。 _要件: FR-051 (US9-6)_

### 1D. お題の出所・編集・出題モード
- [ ] T015 `decide.test.ts` に **`problem.edit` の失敗テスト**（各フィールド patch を反映・`edited=true` を付す・editor+ 想定）。 _要件: FR-038 (US3-6)_
- [ ] T016 `ProblemEdited` を実装し T015 を green に。 _要件: FR-038 (US3)_
- [ ] T017 `decide.test.ts` に **`problem.submit`（持ち込み）拡張の失敗テスト**（`source="custom"` を保持してお題確定・開始可能に）。 _要件: FR-040 (US3-8)_
- [ ] T018 `problem.submit` に source 付与を実装し T017 を green に。AI 委譲経路は `source="ai"`、定型は `source="fallback"` を付す（呼び出し側）。 _要件: FR-011,015,040 (US3,4)_
- [ ] T019 `decide.test.ts` に **`problem.mode.set` の失敗テスト**（`Room.problemMode` を ai/fallback で切替・以降の出題に適用）。 _要件: FR-043 (US4)_
- [ ] T020 `ProblemModeSet` を実装し T019 を green に。 _要件: FR-042,043 (US4)_

### 1E. プロンプト品質・スキーマ・i18n・プロパティテスト
- [ ] T021 `packages/core/test/problem.test.ts` に **`buildProblemPrompt` の要件下限テスト**（要件4件以上・例示テスト必須・各要件がテスト可能な粒度を促す文言）を追加し、`problem.ts` のプロンプトを更新。 _要件: FR-009,010 (US3)_
- [ ] T022 `packages/core/test/schemas.test.ts` に **新コマンド/イベント/拡張フィールドの Valibot ラウンドトリップ失敗テスト**を追加。 _要件: FR-017 ほか境界検証_
- [ ] T023 `packages/core/src/schemas.ts` の `CommandSchema`/`ServerMsgSchema` union に新コマンド/イベントを追記し、サイズ上限（requirements 等）を設定して T022 を green に。**鍵はいかなるスキーマにも含めない**ことをテストで固定。 _要件: FR-017 (US4)_
- [ ] T024 `packages/core/test/properties.test.ts` に **不変条件を追加**（任意操作列で `rotation.length===driverCounts.length` 維持・交代は eligible のみ・proxy 追加/削除後も不変・`SessionAborted` は記録非生成）。fast-check で実装。 _要件: FR-020,047,051 (US5,9)_
- [ ] T025 [P] `packages/core/src/i18n/ja.ts` と `en.ts` に v2 文言を追加（終え方=完成/中断/リセット、お題編集、AI設定/出題モード、在席=代理/離脱/観覧、オンボーディング、接続状態）。既存セクション構造を踏襲。 _要件: FR-044, US5/3/4/9_

---

## フェーズ2 — P2: 同期反映（sync）★P1 に依存

- [ ] T026 `apps/sync/test/authorize.test.ts` に **新コマンドの権限失敗テスト**（addProxy=host のみ／rename・skip・resume=本人 or host／problem.edit・mode.set=editor+／abort=host／viewer は全状態変更拒否）。 _要件: FR-055,061 (US10,9-7)_
- [ ] T027 `apps/sync/src/application/handlers.ts` の `HOST_ONLY_COMMANDS`/`EDITOR_PLUS_COMMANDS` と本人判定ロジックを更新し T026 を green に。 _要件: FR-055,056,061 (US10)_
- [ ] T028 `apps/sync/test/handlers.lifecycle.test.ts`（または新規 `handlers.v2.test.ts`）に **各新コマンドの結合失敗テスト**（command→decide→store→broadcastSnapshot の一周。abort で phase=締めくくり＆記録非配信、rename/skip/proxy が snapshot に反映）。加えて `apps/sync/test/handoff-host.test.ts` に **既存ホスト委譲が新コマンド追加後も働く回帰**（主催者離脱→昇格→新コマンドの権限が新主催者で通る）を追加。 _要件: FR-041,045,048,052,057 (US3,5,9,10)_
- [ ] T029 handlers に各新コマンドのハンドラを実装し T028 を green に（全置換 snapshot 配信を踏襲、新経路を作らない。presence のホスト委譲は改修せず回帰を維持）。 _要件: FR-041,045,048,052,057 (US3,5,9,10)_
- [ ] T030 `apps/sync/test/problem-delegation.test.ts` に **`problemMode` 分岐の失敗テスト**（`fallback` または鍵保有候補なし→委譲せず即定型 source=fallback で選択言語/難易度に整合／`ai`＋候補あり→委譲 source=ai）。 _要件: FR-011,037,042,043 (US3,4)_
- [ ] T031 `apps/sync/src/application/problem-delegation.ts` に problemMode 前置きを実装し T030 を green に（AI を使わない出題＝定型バンクからの整合選択を保証）。 _要件: FR-011,037,042,043 (US3,4)_
- [ ] T032 `apps/sync/test/handlers.room.test.ts` に **room-not-found 応答の失敗テスト**（無効/喪失ルームへ join→`error{code:"room-not-found"}`）。 _要件: FR-007,059 (US2,10)_
- [ ] T033 handlers の join 経路で room-not-found エラー応答を実装し T032 を green に（サーバーは揮発のまま）。 _要件: FR-007,059 (US2,10)_

---

## フェーズ3 — P3: ビジュアル基盤（web/theme）★P1/P2 非依存・並行可

- [ ] T034 [P] `apps/web/src/index.css` にステージ型トークンを追加（`--stage-bg` 最暗・`--stage-focus-bg`・`--focus-glow`・`--font-size-driver`・焦点余白）。既存 chrome/intent/P3/AA は不変。 _要件: FR-028,029 (US7)_
- [ ] T035 [P] `apps/web/test/ui/stage-theme.test.ts` に **セッション/ロビーのキャンバスがテーマ非依存でダーク（`--stage-bg` 適用）になる失敗テスト**（data-theme=light でも舞台が暗い）を書く。 _要件: FR-028, SC-006 (US7)_
- [ ] T036 セッション/ロビーのルート要素にステージ背景を固定適用し T035 を green に。 _要件: FR-028, SC-006 (US7)_
- [ ] T037 `apps/web/test/ui/Session.focus.test.tsx` に **焦点階層＋レスポンシブの失敗テスト**（残り時間と現ドライバーが焦点ゾーンに在り、現ドライバーの強調が「次」より大きい＝role/サイズ/順序で検証。小画面でも主要情報/操作が破綻せず優先順位を保って再構成される）。 _要件: FR-022,026,028,030,060, SC-008 (US6,US7)_
- [ ] T038 `apps/web/src/ui/Session.tsx` を**焦点ゾーン隔離構図**へ再構成（タイマー＋現ドライバーを中央焦点に、お題詳細/統計/参加者一覧/引き継ぎメモを低明度パネル/折りたたみへ退避、現ドライバー＞次）。小画面では終了系を1カラム化し重要要素が画面外に隠れないようにして T037 を green に。 _要件: FR-022,026,028,030,060, SC-008 (US6,US7)_
- [ ] T039 [P] `apps/web/test/ui/StatusStrip.test.tsx` に **永続ステータスストリップの失敗テスト**（フェーズ・自分の役割・接続状態●⟳⚠・出題モードチップを色＋テキスト併記で表示）。 _要件: FR-036,042,032 (US8)_
- [ ] T040 `apps/web/src/ui/components/StatusStrip.tsx` を新規実装し全フェーズ共通で表示、操作結果（状態変化）を即時かつ明確なフィードバックで反映、T039 を green に。 _要件: FR-035,036,042 (US8)_
- [ ] T041 [P] `apps/web/test/ui/transition.test.ts` に **節目演出ロジックの失敗テスト**（交代・残り10秒のみ強調フラグ・reduced-motion で控えめ版・平時は静か）。 _要件: FR-025,031 (US7)_
- [ ] T042 交代/残りわずかの ≤300ms 強調を既存アナウンサーと同期して実装し T041 を green に（reduced-motion 版併設）。 _要件: FR-025,031 (US7)_

---

## フェーズ4 — P4: オンボーディング & 終え方 UI ★P2/P3 依存

- [ ] T043 `apps/web/test/ui/Setup.onboarding.test.tsx` に **初見導線の失敗テスト**（主目的と主アクション=1つが一目・既定値で入力なし開始可・不備は該当箇所近傍に提示）。 _要件: FR-001,002,003 (US1)_
- [ ] T044 `apps/web/src/ui/Setup.tsx` をオンボーディング統合（主アクション1つ・既定自動充填・近接エラー表示）へ改修し T043 を green に。 _要件: FR-001,002,003 (US1)_
- [ ] T045 `apps/web/test/ui/EndSessionZone.test.tsx` に **終え方三層の失敗テスト**（完成/中断/リセットが意味差つきで別表現・各々に結果説明・破壊操作は確認必須・アクセント1箇所）。 _要件: FR-018,019,044, SC-005 (US5,US8-3)_
- [ ] T046 `apps/web/src/ui/components/EndSessionZone.tsx` を新規実装、`Session.tsx` の操作群を主操作1＋副操作＋終了系に三層整理して T045 を green に（`完成！`→`完成`）。 _要件: FR-018,019,044, SC-005 (US5)_
- [ ] T047 `apps/web/test/ui/Summary.test.tsx` に **締めくくり出し分けの失敗テスト**（完成=達成表示＋記録、中断=記録せず中断表示、いずれも次行動導線）。 _要件: FR-020,021,044 (US5)_
- [ ] T048 `Celebration.tsx` を `Summary.tsx` に一般化（完成/中断で見出し・締めくくり・記録有無を出し分け、次行動導線）し T047 を green に。 _要件: FR-020,021,044 (US5)_
- [ ] T049 `apps/web/src/ui/components/ConfirmDialog.tsx` の説明文を中断/リセットで出し分け（共有時は他参加者への影響を明記）。テストは T045/T047 に内包。 _要件: FR-019,045 (US5,8)_

---

## フェーズ5 — P5: お題体験 UI ★P2/P3 依存

- [ ] T050 `apps/web/test/ui/ProblemEditor.test.tsx` に **お題エディタの失敗テスト**（全フィールド編集→`problem.edit` 送信・自前貼り付け→`problem.submit(custom)`・コピー取得・再生成・言語/難易度変更で出し直し・共有時 snapshot 反映）。 _要件: FR-012,013,038,039,040,041 (US3)_
- [ ] T051 `apps/web/src/ui/components/ProblemEditor.tsx` を新規実装（既存 clipboard 関数を移植）し T050 を green に。お題提示は要件一覧・例示テストまで（FR-009）。 _要件: FR-009,012,013,038,039,040,041 (US3)_
- [ ] T052 `apps/web/test/ai/byok-storage.test.ts` に **鍵保存方針の失敗テスト**（既定 sessionStorage・明示同意時のみ localStorage・**いかなる送信ペイロードにも鍵が含まれない**）。 _要件: FR-017 (US4)_
- [ ] T053 `apps/web/src/ai/byok.ts` の保存先を sessionStorage 既定＋オプトイン localStorage（リスク注意）に改修し T052 を green に。 _要件: FR-017 (US4)_
- [ ] T054 `apps/web/test/ui/AiSettingsModal.test.tsx` に **AI 設定モーダルの失敗テスト**（鍵入力/消去・出題モード切替・未設定時の設定導線・出所明示・生成中待機表示）。 _要件: FR-014,015,016,042,043 (US4)_
- [ ] T055 `apps/web/src/ui/components/AiSettingsModal.tsx` を新規実装し T054 を green に。 _要件: FR-014,015,016,042,043 (US4)_

---

## フェーズ6 — P6: 在席・継続性・招待 UI ★P2/P3 依存

- [ ] T056 `apps/web/test/ui/RosterPanel.test.tsx` に **在席一覧の失敗テスト**（全参加者＋在席状況＋現/次ドライバー常時一覧・改名・代理追加・スキップ/復帰・観覧表示。色＋テキスト併記）。 _要件: FR-046,047,048,050,051,052,061 (US9)_
- [ ] T057 `apps/web/src/ui/components/RosterPanel.tsx` を新規実装し T056 を green に。 _要件: FR-046〜052,061 (US9)_
- [ ] T058 `apps/web/test/ui/Lobby.invite.test.tsx` に **招待1操作の失敗テスト**（リンク/コードのコピーがワンアクション・在室と開始可否の提示）。 _要件: FR-004,008,033 (US2,8)_
- [ ] T059 `apps/web/src/ui/Lobby.tsx` を改修（招待1操作コピー・在室/開始可否・ステージ言語統一・小画面で破綻しないレスポンシブ）し T058 を green に。`?room=` 自動参加→1操作合流（既存 App.tsx 経路）と、**合流時に最新状態（参加者一覧/フェーズ/現次ドライバー/残り時間）が提示される**回帰テストを追加。 _要件: FR-004,005,006,008,026,033,034,060 (US2,6,8)_
- [ ] T060 `apps/web/test/ui/connection-status.test.tsx` に **接続/喪失提示の失敗テスト**（再接続中の可視化・room-not-found 受信時「セッション喪失・ローカル記録は保持」明示）。 _要件: FR-036,049,059 (US8,10)_
- [ ] T061 `App.tsx`/`StatusStrip` に接続状態・喪失提示を実装し T060 を green に（既存 SyncClient backoff/resumeToken を表示に反映）。 _要件: FR-036,049,058,059 (US8,10)_
- [ ] T062 `apps/web/test/prefs/local-prefs.test.ts` に **設定ローカル保存の失敗テスト**（表示名・言語・難易度・メンバー・交代間隔を保存→再訪で既定自動充填）。 _要件: FR-053,054 (US10)_
- [ ] T063 `apps/web/src/prefs/local-prefs.ts` を新規実装し Setup と連携、T062 を green に。 _要件: FR-053,054 (US10)_

---

## フェーズ7 — 横断: ソロ対応・記録ガード・開発証跡・仕上げ

- [ ] T064 `apps/web/test/solo/local-engine.test.ts` に **新コマンドのソロ失敗テスト**（abort/skip/resume/rename/problem.edit/mode.set をローカル decide/evolve で処理）。 _要件: FR-018,038,043,048,051 (全 US)_
- [ ] T065 `apps/web/src/solo/local-engine.ts` に新コマンド対応を実装し T064 を green に。 _要件: 同上_
- [ ] T066 `apps/web/test/records/io.test.ts` に **中断で IndexedDB 保存が呼ばれず完成でのみ保存される回帰テスト**を追加し、`App.tsx` の保存呼び出しを完成イベント限定にする。 _要件: FR-020 (US5)_
- [ ] T067 `apps/web/src/sync/client.ts` の送信メッセージ型に新コマンドを追加（ロジック改修なし）。型レベルの回帰のみ。 _要件: FR-018,038,043,047,048,051 (全 US)_
- [ ] T068 開発・テスト専用表示（自己テストトースト等）を本番描画経路から除去し、`?diag=1` 等の明示要求時のみ表示へ。`apps/web/test/ui/dev-artifacts.test.tsx` に「通常時に診断表示が出ない」テストを先に書く。 _要件: FR-027 (US11)_
- [ ] T069 アクセシビリティ通し検証のテスト追加（キーボードのみで主要操作完結・モーダルのフォーカストラップ+Esc・状態変化の aria-live 通知・主要要素 AA）。`apps/web/test/ui/a11y.test.tsx`。 _要件: 非機能(A11y), FR-032, SC-010_
- [ ] T070 i18n 文言の最終確定（v2 で増えた全 UI 文言が ja/en に存在することの網羅テスト）。 _要件: 非機能(多言語)_
- [ ] T071 検証ループ: `pnpm typecheck`・`pnpm test:unit`・`pnpm build` を全グリーン化。基準線（T001）から壊れていないことを確認。 _要件: 互換性(NFR)_

---

## 依存関係と並列グループ

- **クリティカルパス:** T001 → T002 → (P1: T003/T004 → 1B〜1E) → (P2: T026〜T033) → (P4/P5/P6 UI) → T071。
- **第1波（並列可・別ファイル）:** T025（i18n）, T034（CSS トークン）, T035/T039/T041（P3 のテスト雛形）は P1 本体と並行で着手可。
- **P3（ビジュアル基盤）は P1/P2 と並行可**（テーマ/CSS は別ファイル中心）。ただし T037/T038（Session 再構成）は終え方 UI（T045/T046）と同一ファイルを触るため P4 と直列化する。
- **P4・P5・P6 は P2 と P3 完了後**に相互並行可能（各々別コンポーネント中心）。共有する `Session.tsx`/`App.tsx`/`StatusStrip.tsx` を触るタスク（T038・T046・T061）は同一ファイル衝突回避のため直列。
- **TDD 厳守:** 各「失敗テスト」タスク（奇数番が多い）は対応する実装タスクの**前に**完了させる。core の共有ファイル（decide.ts/events.ts/evolve.ts/schemas.ts）を編集する実装タスクは同フェーズ内で直列。

## トレーサビリティ要約（FR → 主タスク）
- US1: FR-001/002/003 → T043,T044
- US1: FR-001/002/003 → T043,T044
- US2: FR-004/005/006/007/008 → T032,T033,T058,T059
- US3: FR-009/010/011/012/013/037/038/039/040/041 → T015〜T018,T021,T030,T031,T050,T051
- US4: FR-014/015/016/017/042/043 → T019,T020,T030,T031,T040,T052〜T055
- US5: FR-018/019/020/021/044/045 → T005〜T008,T045〜T049,T066
- US6: FR-022/026/060 → T037,T038（焦点順序＋レスポンシブ）, T059（ロビー）
- US7: FR-025/028/029/030/031/032 → T034〜T038,T041,T042
- US8: FR-033/034/035/036 → T039,T040,T058,T059,T060,T061
- US9: FR-046〜052/061 → T009〜T014,T056,T057,T026,T027
- US10: FR-053〜059 → T060〜T063,T032,T033,T028（既存 authorize/handoff/resume は P2 で権限追記＋回帰のみ。FR-057 ホスト委譲=T028）
- US11: FR-027 → T068
- US11: FR-027 → T068
