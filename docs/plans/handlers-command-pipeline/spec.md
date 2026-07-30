# 機能仕様: handleCommand の単一パイプライン化と handlers.ts の責務分割

**ブランチ/ディレクトリ:** `docs/plans/handlers-command-pipeline` ・ **ステータス:** Draft ・ **フロー:** 設計優先

対応 Issue: **#26**（本体）／ **#28 の B-2**（decide の決定を advanceDriver が上書きしている契約違反の統合）／ **#33 の論点4**（ADR-0002 の更新）。
ベースライン実測値は `baseline.md` を参照。

## 概要

`apps/sync/src/application/handlers.ts`（1,549行）の `handleCommand` は、25個のルームスコープコマンドのうち9個を専用ハンドラへ、残り19個を `handleRoomCommand`（`default` 分岐）へ振り分けている。この二重ルートは在室確認・アクター解決・権限判定・イベント適用・配信という横断処理を共有していない。**親セッションの実測により、現時点では専用ハンドラ側の6コマンド（`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit`）も `rejectIfUnauthorized`/`requireEditor` 経由で `checkPermission()` に実際に到達しており、Issue #26 本文が指す「デッドコード」は既に解消済みであることを確認した**（詳細は「前提」節を参照）。ただし、経路が2つに分かれていること自体は、`permissions.ts` の集合表を書き換えたときに片方の経路だけ追随し損ねるという構造的リスクを残す（Issue #22 の実装中に同種の見落としが3回起きた）。

本機能は、この二重ルートを1本の共通パイプラインへ統合し、在室を前提としないコマンド（`room.create`/`room.join`/`time.ping`/`presence.ping`）だけを型で明示された例外として扱う。あわせて、Issue #28 B-2 が指摘する「`decide` が返す交代先(`nextIndex`)を `handlers.ts` が握りつぶして `advanceDriver` の結果に差し替えている」契約違反を、`evolve` 側の意味論を `advanceDriver` に合わせることで解消する。最後に、この統合の結果を ADR-0002 に追記する。

**本機能は振る舞いを変えないリファクタリングである。** 唯一の意図的な例外は B-2 の統合による内部的な決定経路の一本化であり、これも利用者に見える値（交代回数・完成記録等）は変えない前提で設計する（`driverCounts`/`totalSwitches` は `advanceDriver` 基準の値に統一され、現状の本番挙動と一致する）。

## ユーザーシナリオとテスト *(必須)*

### ユーザーストーリー1 — 二重ルートの統合（優先度: P1）

開発者として、コマンド処理の入口を1つにしたい、なぜなら片方のルートだけ変更して他方を見落とす欠陥を構造的に無くしたいから。

**受け入れ基準（EARS）:**
1. `handleCommand` が在室を前提とするコマンドを受け取ったとき、システムは在室確認・アクター解決・権限判定・イベント適用・配信を同一のパイプライン関数群に通さなければならない。
2. もしコマンドが `room.create`/`room.join`/`time.ping`/`presence.ping` のいずれかなら、システムはそのコマンドを共通パイプラインの外側（在室前提外の専用経路）で処理しなければならない。
3. `permissions.ts` の集合表（`HOST_ONLY_BEFORE_START`/`EDITOR_PLUS_COMMANDS` 等）を変更したとき、システムは変更後の判定結果を、旧専用ハンドラが存在した6コマンド（`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit`）を含む全ての在室前提コマンドへ同一に反映しなければならない。

### ユーザーストーリー2 — B-2（decide/evolve と advanceDriver の統合）（優先度: P1）

開発者として、ドライバー交代先の決定を1箇所に持たせたい、なぜなら `decide` が返す決定を上位層が握りつぶす契約違反が、v2.7〜v2.10 の「手動と自動で交代の挙動が違う」バグ群の発生源だったから。

**受け入れ基準（EARS）:**
1. `evolve` が `DriverSwitched` イベントを適用するとき、`nextIndex` が適用前の `currentIndex` と等しいなら、システムは `driverCounts` と `totalSwitches` を加算してはならない。
2. `evolve` が `DriverSwitched` イベントを適用するとき、`nextIndex` が適用前の `currentIndex` と等しい場合でも、システムはタイマーの残量再アンカー（`anchorServerTime`/`secondsLeftAtAnchor`/`accumulatedElapsedMs`/`runningSince`）を実行しなければならない。
3. 利用者が自動交代・手動交代（`session.act SWITCH`）・強制指名（`driver.assign`）のいずれを行った場合でも、システムは統合前後で担当回数・交代回数・現在ドライバーの値を変えてはならない。
4. もし交代先の決定ロジックが2箇所（`decide`/`advanceDriver`）に存在するなら、システムは統合によりどちらか一方に決定を集約し、`handleRoomCommand` が決定結果を握りつぶして差し替える分岐を持ってはならない。

### ユーザーストーリー3 — 責務分割（優先度: P2）

開発者として、トークン保持・レート制限・イベント適用・ドメインコマンド組み立てを独立モジュールへ分けたい、なぜなら `makeHandlers` の1,158行のクロージャがこれらの状態を共有しているために個々の関数を切り出せないから。

**受け入れ基準（EARS）:**
1. システムは、トークン保持（`hostTokens`/`resumeTokens`/`roomPassphrases`）を独立したモジュールへ分離しなければならない。
2. システムは、レート制限（`joinFailures`/`recentJoinFailures`）を独立したモジュールへ分離し、`room.join` と `ai.unlock` が同一の失敗窓を共有する仕様を型または命名で明示しなければならない。
3. システムは、`applyRoomLevelEvent` と `buildDomainCommand` をそれぞれ独立したファイルへ分離しなければならない。
4. 分割後、システムは `handlers.ts` 本体をルーティングとパイプライン骨格のみに縮退させなければならない。

### ユーザーストーリー4 — ADR-0002 の更新（優先度: P2）

開発者として、Decider パターンの破れが解消されたことを ADR に記録したい、なぜなら ADR は設計判断の正本であり、実態と乖離させたくないから。

**受け入れ基準（EARS）:**
1. システムは、ADR-0002 の末尾に新設する `## 更新` セクションへ、本リファクタリングによる決定経路の統合内容を追記しなければならない。
2. システムは、ADR-0002 の既存の「背景」「決定」「影響」節（「利点」小節を含む）を1文字も変更してはならない。追記は**ファイル末尾に新設する `## 更新` セクションのみ**に限定する（Issue #33 のブランチ `docs/adr-align-post-28` が「利点」節の1文（ソロモード依拠の記述）を既に修正・完了済みであり、同一ファイルへの重複編集・衝突を避けるため）。

### ユーザーストーリー5 — 安全ネットの維持（優先度: P1・横断）

開発者として、リファクタリングの全工程で既存の安全ネットとゲートを緑に保ちたい、なぜなら型が変わらない意味変更は静的検査もテストも検出できず、過去に実機検証でしか検出できない退行が実際に起きているから。

**受け入れ基準（EARS）:**
1. リファクタリングの各段階の完了時、システムは `permissions-differential.test.ts` の全件（25コマンド×3役割×2対象）を緑に保たなければならない。
2. リファクタリングの各段階の完了時、システムは既存の `typecheck`（4/4）・`lint`（3/3）・`build`（3/3）ゲートを緑に保たなければならない。
3. リファクタリング完了時点で、システムのテスト総数は実装フェーズ冒頭に実測した件数（ベースライン。当初申告値は core657/sync347/web534=1,538件だが未実行のため実装フェーズ最初のタスクで実測し直す）を下回ってはならない。
4. もしUIが事前に操作を無効化して権限拒否の経路をクリック操作で再現できないなら、システムの検証は実サーバーへの WebSocket 直結で権限拒否を確認しなければならない。
5. 各フェーズの完了時、開発者は実画面（ルーム作成・参加・役割変更・ドライバー交代・お題生成・退出）を目視確認しなければならない。

## 機能要件 *(必須)*

### パイプライン統合
- **FR-150**: システムは、在室を前提とする25個のルームスコープコマンドすべてに対し、在室確認→アクター解決→権限判定→イベント適用→配信という共通パイプラインを適用しなければならない。
- **FR-151**: システムは、在室を前提としないコマンド（`room.create`/`room.join`/`time.ping`/`presence.ping`）を型（判別可能な union 等）で区別し、共通パイプラインの型シグネチャに含めない、または明示的な別分岐として扱わなければならない。
- **FR-152**: システムは、新しいルームスコープコマンドを追加する際に、開発者が共通パイプラインを経由せずに実装できないようにしなければならない（専用ハンドラは「ドメイン処理のみ」を行う関数に縮退し、横断処理を単独で担ってはならない）。
- **FR-153**: システムは、`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit` の6コマンドについて、権限判定を `handleRoomCommand` 経由のコマンドと同一の呼び出し順序・同一の `checkPermission` 呼び出しで行わなければならない。
- **FR-154**: システムは、統合後も現在専用ハンドラを持つ9コマンドの外部から観測可能な挙動（成功レスポンス・エラーコード・エラー文言・配信内容・配信順序）を変更してはならない。

### 回帰防止（権限判定の到達性を機械的に固定）
- **FR-155**: システムは、`permissions.ts` の集合表（`HOST_ONLY_BEFORE_START`/`EDITOR_PLUS_COMMANDS` 等）を変更した場合、その変更結果が全ての在室前提コマンド（旧専用ハンドラ経由だった6コマンドを含む）へ単一の経路で反映されることを、`permissions-differential.test.ts` に集合表ミューテーションケース（集合表へ1コマンドを追加/削除するパッチを想定し、判定結果の乖離を検出できること）として機械的に固定しなければならない。これは「デッドコードの解消」ではなく、**現状すでに解消済みの整合性を、今後の変更でも崩さないための回帰テスト要件**である（前提節参照）。
- **FR-156**: システムは、権限判定の呼び出し箇所（`rejectIfUnauthorized`/`requireEditor` 相当）を統合後は1箇所に集約しなければならない。

### 責務分割
- **FR-157**: システムは、トークン保持（`hostTokens`/`resumeTokens`/`roomPassphrases`）を独立したモジュールへ分離しなければならない。
- **FR-158**: システムは、レート制限（`joinFailures`/`recentJoinFailures`）を独立したモジュールへ分離しなければならない。
- **FR-159**: システムは、`room.join` と `ai.unlock` が同一の失敗窓（`JOIN_FAIL_WINDOW_MS`/`JOIN_FAIL_MAX`）を共有する仕様を、分離後のモジュールのインターフェースで明示しなければならない。
- **FR-160**: システムは、`applyRoomLevelEvent` を独立したファイルへ分離しなければならない。
- **FR-161**: システムは、`buildDomainCommand` を独立したファイルへ分離しなければならない。
- **FR-162**: 分割完了後、システムの `handlers.ts` 本体は、分割前（1,549行）より大幅に縮小されていなければならない（具体的な目標行数は plan.md で確定する。`[要確認]`）。

### B-2 の統合（decide/evolve と advanceDriver）
- **FR-163**: システムは、`evolve` が `DriverSwitched` イベントを適用する際、`nextIndex` が適用前の `currentIndex` と等しい場合は `driverCounts` および `totalSwitches` を加算してはならない。
- **FR-164**: システムは、`nextIndex` が適用前の `currentIndex` と等しい場合でも、タイマーの残量再アンカーは従来通り実行しなければならない。
- **FR-165**: システムは、交代先の決定（`nextEligibleIndex` によるineligible考慮）を単一の関数に集約し、`handleRoomCommand` が `decide` の結果を握りつぶして `advanceDriver` の結果に差し替える分岐（現状の `isManualSwitch` 分岐）を撤去しなければならない。
- **FR-166**: システムは、統合前後で、自動交代・手動交代・強制指名それぞれについて、担当回数・交代回数・現在ドライバーの値を変えてはならない（`advanceDriver` 基準の値を正とする）。
- **FR-167**: システムは、`driver-switch-equivalence.test.ts` を、修正後の経路が全入力（fast-check 2000回以上）で `advanceDriver` と一致することを検証する内容に更新しなければならない（現状の「一致しない」ことを検証する内容から反転させる）。
- **FR-168**: システムは、`driver-switch-characterization.test.ts` が固定している現状の利用者可視の値（担当回数・交代回数・現在ドライバー）を、統合後も同じ値として再現しなければならない。

### ADR-0002 の更新
- **FR-169**: システムは、ADR-0002 の末尾に `## 更新` セクションを新設し、決定と適用の分裂（旧 `applyRoomLevelEvent` の二重evolve構造の解消状況、旧 `advanceDriver` の決定差し替えの解消）を記録しなければならない。
- **FR-170**: システムは、ADR-0002 の既存の「背景」節・「決定」節・「影響」節（「利点」小節を含む）を1文字も変更してはならない。編集はファイル末尾への `## 更新` セクション追加のみに限定する（`docs/adr-align-post-28` ブランチ（Issue #33）が同ファイルの「利点」節を別途・既に編集済みのため、担当領域を完全に分離する）。

### 安全ネット・非退行
- **FR-171**: システムは、リファクタリングの全工程で `permissions-differential.test.ts` を緑に保たなければならない。
- **FR-172**: システムは、リファクタリングの全工程で既存の `typecheck`（4/4）・`lint`（3/3）・`build`（3/3）ゲートを緑に保たなければならない。
- **FR-173**: システムは、リファクタリング完了時点のテスト総数を、実装フェーズ冒頭に実測したベースライン件数以上に保たなければならない。
- **FR-174**: もしUIが事前抑止により権限拒否の経路を画面操作で再現できないなら、開発者は実サーバーへの WebSocket 直結で権限拒否（旧デッドコード6件を含む主要な拒否ケース）を検証しなければならない。
- **FR-175**: 各フェーズの完了時、開発者は実画面上で主要操作（ルーム作成・参加・役割変更・ドライバー交代・お題生成・退出）を目視確認しなければならない。

## 非機能要件

- **保守性**: `makeHandlers` クロージャが保持する可変状態は、独立モジュールに分離された時点でそれぞれ単体テスト可能でなければならない。
- **可観測性**: 統合後も `sendError`/`broadcastSnapshot`/`broadcastSignal` の呼び出し内容・タイミング・順序は変更しない（FR-154 の一部）。
- **セキュリティ**: 権限判定は default-deny を維持する（`permissions.ts` の `REGISTERED_COMMANDS` に無いコマンドは拒否）。本機能はこの方針を変更しない。
- **移行安全性**: 段階ごとの中間状態で全ゲートが緑であること（strangler fig 的な移行。tasks.md で規定）。

## 主要エンティティ

- **PreRoomCommand** — 在室を前提としないコマンドの型（`room.create`/`room.join`/`time.ping`/`presence.ping`）。共通パイプラインの入力型には含まれない。
- **RoomScopedCommand** — 在室を前提とする25コマンドの型。共通パイプラインの唯一の入力型。
- **CommandPipelineContext** — 在室確認・アクター解決・権限判定の結果（`room`/`actor`/`verdict`）を保持する、専用ハンドラへ渡される共通の中間表現。
- **TokenStore**（仮称） — `hostTokens`/`resumeTokens`/`roomPassphrases` を保持する独立モジュールのインターフェース。
- **JoinRateLimiter**（仮称） — `joinFailures`/`recentJoinFailures` を保持する独立モジュールのインターフェース。`room.join` と `ai.unlock` が窓を共有することを型で表現する。
- **DriverSwitchDecision** — 交代先（`nextIndex`）と、それが「交代とみなされるか（`nextIndex !== currentIndex`）」を保持する、`decide`/`evolve` 双方が参照する統合後の決定単位。

## 成功基準 *(必須・技術非依存)*

- **SC-052**: `permissions-differential.test.ts` が実装の全段階で100%パスする（0件失敗）。
- **SC-053**: 旧専用ハンドラが権限判定を独自に呼んでいた6コマンド（`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit`）が、統合後は共通パイプラインの権限判定呼び出しを1箇所だけ経由する（専用ハンドラ関数がドメイン処理のみに縮退し、`rejectIfUnauthorized`/`requireEditor` 相当の呼び出しを個別に持たない）。
- **SC-054**: `handlers.ts` 本体の行数が、分割前（1,549行）から plan.md で確定する目標値以下に縮小する。
- **SC-055**: 新設モジュール（トークン保持・レート制限・`applyRoomLevelEvent`・`buildDomainCommand` 相当）それぞれについて、単体テストが存在し緑である。
- **SC-056**: `driver-switch-equivalence.test.ts` が「全入力で一致する」ことを検証する内容に更新され、fast-check 2000回全て通過する。
- **SC-057**: 実機確認で、輪1人のケースと複数人ケースの両方について、交代回数・担当回数の表示値が統合前後で一致する。
- **SC-058**: 実装完了時点で全ゲート（test/typecheck/lint/build）が緑であり、テスト総数が実装フェーズ冒頭のベースライン以上である。
- **SC-059**: 旧デッドコード6件それぞれについて、少なくとも1つの拒否ケースが実サーバーへの WebSocket 直結で検証済みである。
- **SC-060**: ADR-0002 に `## 更新` セクションが追加され、既存の「背景」節・「決定」節・「影響」節（「利点」小節を含む）の diff が0行である（`git diff --stat` の削除（`-`）行数が0であることで確認する）。

## スコープ外 / 非目標 *(必須)*

- この機能は、Issue #28 の C-4（参加者行UIの二重実装。`Lobby.tsx`/`RosterPanel.tsx`）を扱わない（別ブランチ `refactor/roster-row-unify` の担当）。
- この機能は、Issue #24/#25（リジューム配線・死活監視のうち web からの `presence.ping` 送信配線）の web 側実装を扱わない。サーバー側処理は既存のまま、パイプラインの「在室前コマンド」型に含めるところまでを扱う。
- この機能は、Issue #28 の D-2（`App.tsx` の state/ref 二重管理）を扱わない。
- この機能は、Issue #28 の F節（テストコードの命名・GWT構造規約）を扱わない。
- この機能は、ADR-0001／ADR-0009／ADR-0002の「利点」節の修正を扱わない（`docs/adr-align-post-28` ブランチの担当）。
- この機能は、`decide` のシグネチャに ineligible 集合を追加するかどうかを含め、B-2 の実装方式そのものの選定を spec.md では確定しない（plan.md で確定する）。ただし振る舞い上の結果（FR-163〜FR-168）は本 spec が固定する。

## 前提

- **Issue #26 本文の記述と実態の食い違い（解決済み・記録）**: Issue #26 本文は「`HOST_ONLY_COMMANDS`/`EDITOR_PLUS_COMMANDS` に登録されているが `authorize()`（`checkPermission()`）に到達しないデッドコードが6件ある」と主張しているが、**親セッションが `apps/sync/src/application/handlers.ts` を実測で行トレースした結果、この主張は古く、実態と食い違っている**ことを確認した。当該6コマンドはいずれも `rejectIfUnauthorized`（`role.set` 811行目・`room.passphrase.set` 868行目・`ai.unlock` 910行目・`host.transfer` 958行目）または `requireEditor`→`rejectIfUnauthorized`（`problem.request` 994行目→1062行目・`problem.submit` 1019行目→1062行目）を経由して `checkPermission()` に実際に到達している。`rejectIfUnauthorized`（1076行目付近）は `checkPermission()` を単独の判定として呼ぶ実装であり、`HOST_ONLY_COMMANDS`/`EDITOR_PLUS_COMMANDS` は `permissions.ts` 内部で生きている集合であって宙に浮いた別テーブルではない。Issue #22 で権限判定が `checkPermission()` へ統合された際に、この6コマンドの経路も追随済みだったと考えられる。**この食い違いを踏まえ、本 spec は「デッドコードの解消」を目的から外し、FR-155 を「集合表変更の到達性を回帰テストで固定する」要件に置き換えた。** 二重経路そのもの（専用ハンドラ / `handleRoomCommand`）は依然として存在し、これが将来同種の見落としを生む構造的リスクである点は変わらないため、US1（二重ルートの統合）は従来どおり主目的として残す。
- **[要確認]** `handlers.ts` 分割後の具体的なファイル構成・目標行数（暫定 600行）は plan.md で見積もり済みだが実測値ではない。実装完了時（T031）に実測し、乖離があれば SC-054 の具体値を実測値へ更新する。
- **（解決済み）B-2 の実装方式**: plan.md の「技術コンテキストと意思決定」表で確定済み。`decide` の `session.act SWITCH` に任意の `ineligible?: ReadonlySet<number>` を追加し、`evolveDriverSwitched` を修正した上で `advanceDriver` をその1行ラッパへ縮退させる方式（plan.md 記載の(a)〜(d)）を採る。FR-163〜FR-168 の振る舞い要件はこの方式のもとで固定される。なお `driver.skip` の即時繰り上げと `autoSwitch`（タイマー発火）は本方式の対象外とし、従来どおり `advanceDriver` を直接呼ぶ設計を維持する（この点の再検討要否は plan.md の「未解決の論点」に `[要確認]` として残す）。
- 実装フェーズ冒頭で `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を実行し、baseline.md の申告値（core657/sync347/web534=1,538件、typecheck 4/4、lint 3/3、build 3/3）を実測し直して記録する。これ以後の全ゲート判定はこの実測値を基準とする。

## レビュー＆受け入れチェックリスト
- [x] 実装詳細が漏れていない（具体的なファイル分割案は plan.md へ）
- [x] 各ストーリーにテスト可能な EARS 基準がある
- [x] 非目標が明示されている
- [x] 成功基準が計測可能
- [x] Issue #26 本文とデッドコード実態の食い違いは親セッションの実測で解決済み（前提セクション参照。旧 `[要確認]` 2番はクローズ）
- [x] B-2 の実装方式は plan.md の意思決定表で確定済み（前提セクション参照。旧 `[要確認]` 3番はクローズ）
- [ ] 未解決の `[要確認]` が1件残っている（`handlers.ts` 縮退後の目標行数の実測反映。実装フェーズ完了時のタスクで解消する）
