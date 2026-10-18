# poker の見学者（#419）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poker で、自分で「見学する」に切り替えた人は手札を持たず、自動公開の分母から外れる。あわせて、poker の席の一覧で同名を呼び分け、接続の無い幽霊を外せるようにする。

**Architecture:** 見学は poker の集約ルート `Round`（`packages/poker-core/src/round.ts`）に参加者 ID の集合として持たせ、保管と配信の経路は変えない。呼び分けの規則は `@tasuki/room-core` に 1 つだけ置き、3 つの画面が使う。ルームから人を外す処理は、ツールに依らない中核と timer の後段に分け、poker の入口は中核（＋timer の状態があれば後段）を呼ぶ。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、vitest（room-core・poker-core・poker-web・timer-web・landing）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-18-poker-spectator-design.md`](../specs/2026-10-18-poker-spectator-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。S-n・G-n は設計の項目番号。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. TDD | 適合 | 全タスクが失敗するテストから始まる |
| II. ADR | 適合 | 新しいライブラリは足さない。決定は設計正本に置く（ADR を新設するほどの横断の決定は無い） |
| III. 揮発インメモリ | 適合 | 見学は `Round` に持つだけ。端末へは保存しない（S-10） |
| IV. 境界の型安全 | 適合 | クライアント→サーバーの 2 操作は `v.strictObject`。`ParticipantView.spectator` は `v.optional(v.boolean(), false)`（docs/poker/adr/0004） |
| V. 実画面検証 | 適合 | Task 7 で 3 人の実画面を撮る |
| VI. 依存は内向き | 適合 | poker-core は room-core を知らないまま（見学は `Round` が持つ）。呼び分けは room-core（3 アプリとも依存を許されている） |
| VII. 検査は壊して確かめる | 適合 | Task 8 で変異 m390〜m397 |
| VIII. 記録が正本 | 適合 | 設計正本・ws-protocol 契約・data-model・ADR-0011 の分類表を更新（Task 8） |
| IX. 小さく回す | 適合 | PR 1 本（PR の粒度の既定）。タスクは層ごとに独立して検証できる |
| X. 抽象は実需で | 適合 | 呼び分けは 3 つ目の写しを書く代わりに寄せる（振り返りの申し送りの条件どおり） |
| XI. 秘密と個人情報 | 適合 | 見学かどうかは「個人に紐づく」（揮発のみ・ログへ出さない）。ADR-0011 の分類表へ足す |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 作業は本体 `/workspaces/claym/local/Tasuki` のブランチ `feature/poker-spectator`。**サブエージェントは `git push`・`gh pr *`・`gh issue *`・作業ツリーやコミットを巻き戻す git 操作（`checkout --`・`checkout HEAD --`・`reset`・`stash`・`restore`）をすべてしない**。戻すときは `Edit` で手で直すか、新しいコミットを積む
- 型・関数の語は `spectator` で揃える。画面の文言は設計 §5 の通り（`見学する`／`投票に加わる`／`見学`／`見学中です。投票には加わりません。`／見出し `参加者（N人・見学M人）`）
- 片付けの文言: ボタン `退出させる`、確認の題 `〈呼び名〉 さんを退出させますか？`、確認のボタン `退出させる`／`キャンセル`
- サーバーのエラー文言: `spectating` → `見学中は投票できません`、`participant-not-found` → `参加者が見つかりません`、`not-removable` → `接続している人は外せません`
- 呼び分けの形は `名前（ID: xxxx）`（xxxx は ID の末尾 4 文字）。敬称は `名前 さん（ID: xxxx）` の語順
- UI 文言は書体の base 層に収める（設計 §5.3 で実測済み。「札」「簿」は外れる）
- 新しい画面が古いサーバーに当たっても `room-state` を捨てない（`spectator` は省略可）
- 変異 ID は **m390〜m399** を使う（m366〜m389 は並行 PR #424 などと衝突しうるので使わない）
- 手元の変異検査は `node scripts/mutation-check.mjs --id <ID>`。全件と `--changed` は統括が流す
- 実装役はコマンドを 1 つずつ・各 5 分以内で流す。E2E 全件・変異の連続実行は統括が流す
- `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` をコミットの末尾に付ける（実装役）

## Review Focus

1. **投票中に、最後の未投票者が見学へ切り替えた** → その場で自動公開が立つ（Task 3「見学へ移ると残りで開く」）
2. **開票後に見学へ切り替え、続けて再投票した** → 開いた票・記録の行は変わらず、再投票の後はその人は手札を持たず分母にも入らない（Task 2「開票後の切り替えは票を変えない」・Task 3 の往復テスト）
3. **全員が見学者になった** → 自動公開は来ない。「票を公開する」は押せて、票 0 枚の開票になり記録の行は増えない（Task 2「投票者 0 人」）
4. **timer の名簿から外された人の poker のタブが投票した** → `not-joined` で拒まれ、集計に入らない（Task 3「名簿に居ない人の操作」）
5. **timer の状態が無いルームで幽霊を外した** → timer の状態は作られず、後から timer を開くと初期状態で始まる（Task 4「poker だけのルームでは timer の状態を作らない」）

## 検証の実行時間の見積もり

| 検証 | 1 回 | 回数 | いつ |
|---|---|---|---|
| room-core / poker-core の vitest | 約 10〜15 秒 | 各 3〜5 | Task 1・2 |
| timer-web / landing の vitest（全件） | 約 40 秒 | 2〜3 | Task 1 |
| tasuki-sync の bun test（触ったファイル） | 約 30 秒 | 5〜8 | Task 3・4 |
| tasuki-sync の bun test（全件） | 約 1〜2 分 | 2 | Task 3・4 の終わり |
| poker-web の vitest（全件） | 約 40 秒 | 4〜6 | Task 5・6 |
| E2E（poker 系 4 本） | 約 2〜3 分 | 2〜3 | Task 7 |
| `mutation-check --id`（1 本） | 約 1〜2 分 | 8 本 × 2（当てる・戻す） | Task 8 |
| `mutation-check --changed`（統括） | 約 20 分（宣言を触るので全件に倒れる） | 1〜2 | 仕上げ |
| 検査系（audit-*・check-links・scripts の自己テスト） | 約 3 分 | 2 | Task 8・仕上げ |

機械の待ちは合計で約 1.5〜2 時間。想定の 2 倍を超えたら統括が止まって原因を見る。

## ファイルの地図

- **room-core**: Create `packages/room-core/src/participant-label.ts`・`packages/room-core/tests/participant-label.test.ts`。Modify `packages/room-core/src/index.ts`
- **timer-web**: Modify `apps/timer-web/src/ui/participant-label.ts`（`labelPool` だけ残す）とその import 先 5 ファイル・`apps/timer-web/test/ui/participant-label.test.ts`（`labelPool` の分だけ残す）
- **landing**: Delete `apps/landing/src/hub/participant-label.ts`。Modify `apps/landing/src/screens/RoomChoice.tsx`・`apps/landing/tests/App.test.tsx`（期待値の形）
- **poker-core**: Modify `src/round.ts`・`src/protocol.ts`・`src/snapshot.ts`・`src/error-messages.ts`・`src/index.ts`・`tests/round.test.ts`・`tests/protocol.test.ts`・`tests/snapshot.test.ts`
- **tasuki-sync**: Create `src/application/room-removal.ts`・`test/room-removal.test.ts`・`test/poker/spectator.test.ts`・`test/poker/remove-participant.test.ts`。Modify `src/application/command-handlers/participant-remove.ts`・`src/application/handlers.ts`・`src/application/poker-handlers.ts`・`src/application/poker-commit-room-action.ts`・`src/create-sync-server.ts`
- **poker-web**: Create `src/spectator-copy.ts`・`src/components/RemovalConfirm.tsx`・`tests/spectator-copy-fits-font-base.test.ts`・`tests/participant-list-spectator.test.tsx`・`tests/participant-list-removal.test.tsx`。Modify `src/components/ParticipantList.tsx`・`src/pages/RoomPage.tsx`・`src/hooks/useSync.ts`・`src/index.css`・`tests/participant-list.test.tsx`
- **e2e**: Create `e2e/specs/poker-spectator.spec.ts`
- **docs / scripts**: Modify `docs/adr/0011-threat-model-and-data-classification.md`・`docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`・`docs/poker/specs/001-planning-poker-mvp/data-model.md`・`scripts/lib/mutation-declarations.mjs`。Create `scripts/mutations/m390-*.patch`〜`m397-*.patch`

---

### Task 1: 呼び分けの規則を room-core へ寄せる（G-1〜G-3a の土台）

**Files:**
- Create: `packages/room-core/src/participant-label.ts`、`packages/room-core/tests/participant-label.test.ts`
- Modify: `packages/room-core/src/index.ts`、`apps/timer-web/src/ui/participant-label.ts`、その import 先（`sync/notice-message.ts`・`ui/Lobby.tsx`・`ui/rotation-names.ts`・`ui/components/RosterPanel.tsx`・`ui/components/RemovalConfirmDialog.tsx`）、`apps/timer-web/test/ui/participant-label.test.ts`、`apps/timer-web/test/ui/rotation-names.test.ts`、`apps/landing/src/screens/RoomChoice.tsx`、`apps/landing/tests/App.test.tsx`
- Delete: `apps/landing/src/hub/participant-label.ts`

**Interfaces:**
- Produces（`@tasuki/room-core` から公開）:
  - `interface LabelParticipant { readonly participantId: string; readonly displayName: string }`
  - `shortParticipantId(participantId: string): string` —— 末尾 4 文字
  - `isAmbiguousName(name: string, participantId: string, participants: readonly LabelParticipant[]): boolean` —— timer の今の意味（設計 G-3a）
  - `participantLabel(name: string, participantId: string, participants: readonly LabelParticipant[], honorific?: string): string` —— 曖昧なら `${base}（ID: ${shortParticipantId(id)}）`、`base` は敬称があれば `${name} ${honorific}`
- timer-web の `labelPool` は timer-web に残す（`Seat` に依存するため）。戻り値の型は room-core の `LabelParticipant`

- [ ] **Step 1: 失敗するテストを書く**（`packages/room-core/tests/participant-label.test.ts`）。timer-web の `participant-label.test.ts` から `shortId`・`isAmbiguousName`・`participantLabel` の分を移し、関数名を `shortParticipantId` に直す。加えて次の 2 件を足す:
  - `Given p_ ＋ nanoid の ID が 2 人・同名 / When participantLabel / Then 両者の識別子が違う`（例: `p_aaaaaaaaaaaa1111` と `p_aaaaaaaaaaaa2222` → `（ID: 1111）`・`（ID: 2222）`。先頭 4 文字では同じ `p_aa` になる値を選ぶ）
  - `Given 呼び名 / When display-name の印の規則に当てる / Then 印として検出される`（`participantLabel` の出力の `（ID: xxxx）` が `packages/room-core/src/display-name.ts` の `LABEL_MARKER` に当たる形であること。公開されている関数（`normalizeDisplayName` などの印を剥がす入口）で、呼び名を名前として入れると印が剥がれることを確かめる。入口の名前は `display-name.ts` を読んで選ぶ）
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/room-core test`。期待: モジュールが無いので FAIL
- [ ] **Step 3: `packages/room-core/src/participant-label.ts` を書き、`index.ts` から明示列挙で公開する**（`export *` は使わない）。注記は timer-web の今の文章（`nameSkeleton` で比べる理由・識別子を短くする理由・敬称の語順）を移し、「先頭は `p_` で全員同じなので末尾を取る」を足す
- [ ] **Step 4: timer-web を寄せる** — `apps/timer-web/src/ui/participant-label.ts` は `labelPool` だけを残し、ほかは room-core から import する。5 つの import 先を room-core へ向け直す（`labelPool` は今の場所から）。timer-web のテストは `labelPool` の分だけ残す
- [ ] **Step 5: landing を寄せる** — `RoomChoice.tsx` の `labelFor(p, everyone)` を `participantLabel(p.displayName, p.participantId, everyone)` に置き換え、`apps/landing/src/hub/participant-label.ts` を消す。`apps/landing/tests/App.test.tsx:294` 付近の期待値を `（ID: 末尾 4 文字）` の形へ直す
- [ ] **Step 6: 走らせる** — `pnpm --filter @tasuki/room-core test`、`pnpm --filter @tasuki/timer-web test`、`pnpm --filter @tasuki/landing test`、`node scripts/audit-public-surface.mjs`、`node scripts/audit-dependency-direction.mjs`。すべて緑。`grep -rn "participant-label" apps/landing/src` が 0 件
- [ ] **Step 7: コミット** — `refactor: 呼び分けの規則を room-core に 1 つにする（#419）`

### Task 2: 見学のドメインと wire（poker-core）

**Files:**
- Modify: `packages/poker-core/src/round.ts`、`src/protocol.ts`、`src/snapshot.ts`、`src/error-messages.ts`、`src/index.ts`
- Test: `packages/poker-core/tests/round.test.ts`、`tests/protocol.test.ts`、`tests/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `Round` に `spectators: ReadonlySet<string>` を足す。`createRound()` は空集合
  - `setSpectator(round: Round, participantId: string, spectator: boolean): Round` —— 投票中に `true` なら票も捨てる（S-3）。開票後は票を変えない（S-4）。同じ状態なら同じ値を返す（S-9）
  - `castVote` は見学者に `err({ code: 'spectating', op: 'vote' })`（S-7）
  - `shouldAutoReveal(round, voters)` の分母は `connected && !round.spectators.has(id)`。0 人なら立たない（S-6）
  - `discardVote(round, voterId)` は**見学の集合からも外す**（S-11）。名前は変えず注記を直す（「退出した人の票と見学を捨てる」）
  - `RoundError` に `{ code: 'spectating'; op: 'vote' }`
  - `ClientMessage` に `{ type: 'set-spectator'; spectator: boolean }` と `{ type: 'remove-participant'; participantId: string }`（ともに `v.strictObject`。`participantId` は `v.pipe(v.string(), v.minLength(1))`）
  - `ERROR_CODES` に `'spectating'`・`'participant-not-found'`・`'not-removable'`
  - `ParticipantView` に `spectator: boolean`（スキーマは `v.optional(v.boolean(), false)`）。`createSnapshotBuilder` が `round.spectators.has(p.id)` を載せる
  - `messageForRoundError({ code: 'spectating', op: 'vote' })` → `見学中は投票できません`
  - `index.ts` に `setSpectator` を足す（`apps/tasuki-sync` が使う）

- [ ] **Step 1: 失敗するテストを書く**（`round.test.ts`）:
  - `見学へ移ると票を捨てる`: 投票中に A が投票 → `setSpectator(A, true)` → `votes.has(A)` が偽、`spectators.has(A)` が真
  - `開票後の切り替えは票を変えない`: A・B が投票して開票 → `setSpectator(A, true)` → `votes` は 2 枚のまま・`log` は同一参照
  - `見学者は投票できない`: `castVote` が `spectating` を返す
  - `見学者は分母に入らない`: A（見学・未投票）・B（投票済み）で `shouldAutoReveal` が真。**対照**: A を見学にしないと偽
  - `投票者 0 人`: 接続中の全員が見学 → 偽。`revealBy` は通り、票 0 枚なので記録の行は増えない
  - `投票へ戻ると未投票から`: 見学 → 投票者へ戻る → 未投票なので B だけ投票済みでも偽
  - `同じ状態への切り替えは何も変えない`: 戻り値が入力と同じ参照
  - `退出で見学からも外れる`: `discardVote` の後 `spectators.has(A)` が偽
- [ ] **Step 2: protocol と snapshot の失敗するテストを書く**: `parseClientMessage` が `set-spectator`（`spectator` が真偽以外なら不正・余分なキーは不正）と `remove-participant`（空文字は不正）を受ける。`parseServerMessage` が `spectator` の無い `participants` の行を通し `spectator: false` を返す（古いサーバーの互換）。`createSnapshotBuilder` が見学者に `spectator: true`、それ以外に `false` を載せる
- [ ] **Step 3: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-core test`
- [ ] **Step 4: 実装する**（上の Interfaces の通り）。`shouldAutoReveal` の注記に「見学はラウンドが持つので `VoterView` に足さない（名簿の断片へ写すと、写し忘れたテストが恒真になる）」を書く
- [ ] **Step 5: 走らせる** — `pnpm --filter @tasuki/poker-core test` と `pnpm --filter @tasuki/poker-core typecheck`（無ければ `pnpm exec tsc -p packages/poker-core --noEmit`）。緑。**型検査は Round のテスト造作を拾わない**ので、`grep -rn "status: 'voting'" packages apps --include=*.ts` で `Round` を直に組んでいる箇所に `spectators` が要るかを数えて直す
- [ ] **Step 6: コミット** — `feat: poker のラウンドに見学者を持たせる（#419）`

### Task 3: 見学の配線と、名簿に居ない人の操作を拒む（tasuki-sync・S-1〜S-12・G-9）

**Files:**
- Modify: `apps/tasuki-sync/src/application/poker-commit-room-action.ts`、`src/application/poker-handlers.ts`
- Create: `apps/tasuki-sync/test/poker/spectator.test.ts`
- Modify: `apps/tasuki-sync/test/poker/commit-room-action.test.ts`

**Interfaces:**
- Consumes: Task 2 の `setSpectator`・`discardVote`・`ERROR_CODES`
- Produces: `dispatch` が `set-spectator` を `commitRoomAction(ws, (round, id) => ok(setSpectator(round, id, msg.spectator)))` で受ける。Task 2 で `ClientMessage` に `remove-participant` も増えて `switch` の網羅が崩れるので、この Task では `remove-participant` の枝に「Task 4 で差し替える」注記つきで `sendError(ws, 'not-removable', …)` だけを置く（Task 4 が必ず置き換える）
- `commitRoomAction` は `loadState` の後に「`participantId` が `state.room.participants` に居るか」を見て、居なければ `not-joined`（文言は既存の `ルームに参加していません`）を返して何も変えない（G-9）

- [ ] **Step 1: 失敗するテストを書く**（`test/poker/spectator.test.ts`。既存の `test/poker/helpers.ts` の `startServer`・`WsClient` を使う in-process か実サーバーの型に合わせる）:
  - `見学へ移ると残りで開く`: A・B・C が入り、A・B が投票 → C が `set-spectator: true` → 全員に `round.status === 'revealed'` が届く
  - `見学者の票は spectating`: C が見学で `vote` → C にだけ `error`（`code: 'spectating'`）、状態は変わらない
  - `見学は再接続でも保たれる`: C が見学 → C が切断してトークンで入り直す → `participants` の C が `spectator: true`
  - `見学の切り替えは全員へ配信される`: B の画面の `participants` の C が `spectator: true`
  - `往復`: A・B が投票して開票 → A が見学 → B が `revote` → B が投票 → 自動で開く（A を待たない）
- [ ] **Step 2: G-9 の失敗するテストを書く**（`commit-room-action.test.ts`）: `loadState` が返す名簿に `participantId` が居ないとき、`vote` が `not-joined` を返し `commit` が呼ばれない。**対照**: 居れば `commit` が呼ばれる
- [ ] **Step 3: 走らせて失敗を見る** — `cd apps/tasuki-sync && bun test test/poker/spectator.test.ts test/poker/commit-room-action.test.ts`
- [ ] **Step 4: 実装する**。`handleParticipantRemoved` は `discardVote` を呼ぶだけで見学も外れる（Task 2）ので触らない
- [ ] **Step 5: 走らせる** — 上の 2 ファイル → `cd apps/tasuki-sync && bun test test/poker`（約 30 秒）→ `bun test`（全件・約 1〜2 分）。緑
- [ ] **Step 6: コミット** — `feat: 同期サーバーで見学の切り替えを受け、名簿に居ない人の操作を拒む（#419）`

### Task 4: ルームから外す処理を分け、poker の入口から幽霊を外す（tasuki-sync・G-4〜G-8）

**Files:**
- Create: `apps/tasuki-sync/src/application/room-removal.ts`、`apps/tasuki-sync/test/room-removal.test.ts`、`apps/tasuki-sync/test/poker/remove-participant.test.ts`
- Modify: `src/application/command-handlers/participant-remove.ts`、`src/application/handlers.ts`、`src/application/poker-handlers.ts`、`src/application/poker-commit-room-action.ts`、`src/create-sync-server.ts`

**Interfaces:**
- Produces:
  - `room-removal.ts` に純関数（送信も保管もしない）:
    ```ts
    type RemovalOutcome =
      | { kind: 'destroy' }                                   // 名簿が空になる
      | { kind: 'removed'; membership: Room; timer: TimerState | undefined };
    type RemovalError = 'PARTICIPANT_NOT_FOUND' | 'BelowMinMembers' | { code: 'DECIDE'; type: ErrorCode };
    function planRemoval(
      input: { membership: Room; timer: TimerState | undefined },
      targetId: string,
      now: number,
    ): Result<RemovalOutcome, RemovalError>
    ```
    中身は今の `handleParticipantRemove` の「名簿から外す → 空なら destroy → 輪の席を外す（繰り上げ含む）」をそのまま移す。**timer が `undefined` なら輪の処理を飛ばす**。対象は timer があれば `occupants(membership, timer)`（代理を含む・今の timer の振る舞い）、無ければ名簿の人だけ
  - `handleParticipantRemove`（timer の入口）は `planRemoval` を呼び、今と同じ順で `destroyRoom`・`commit`・`discardPokerVote`・`reconcileSchedule`・`broadcastSignal`・本人への通知を行う。**timer の振る舞いは変えない**（既存の `test/participant-remove.test.ts`・`solo-leave.test.ts`・`notice-signal.test.ts`・`room-lifecycle.test.ts` が無修正で緑のこと）
  - `handlers.ts` が `removeFromRoom(roomCode: string, actorId: string, targetId: string): Result<void, 'participant-not-found' | 'not-removable'>` を返り値に足す。中身: `store.get(roomCode)` と `timers.get(roomCode)`（無くてよい）で `planRemoval` を呼ぶ。`destroy` なら `destroyRoom`。`removed` なら、**timer があれば** timer の `commit` と `reconcileSchedule` と `broadcastSignal`（実行者・対象の名前つき・今と同じ形）、**無ければ** `saveRoster` で名簿だけ保管する（`timers.put` を呼ばない）。どちらも続けて `discardPokerVote(roomCode, targetId)`。`PARTICIPANT_NOT_FOUND` → `participant-not-found`、それ以外 → `not-removable`
  - `PokerHandlerDeps` に `removeFromRoom` を足し（**必須**。`discardPokerVote` と同じ理由）、`create-sync-server.ts` で `handlers.removeFromRoom` へ繋ぐ（`pokerHandlers` と `handlers` の組み立て順は `discardPokerVote` の配線と同じく遅延参照で解く）
  - poker の `dispatch` の `remove-participant`: 参加済みで名簿に居ることを確かめ（居なければ `not-joined`）、対象が自分自身・名簿に居ない・**接続を 1 本でも持つ**（`participant.connections.size > 0`）なら `not-removable`／`participant-not-found` を返す。通れば `removeFromRoom` を呼び、エラーなら `sendError`。成功時の poker の配信は `discardPokerVote` 経由の `handleParticipantRemoved`（poker の `commit`）が行う（実行者が poker に入った時点でラウンドは保管されているので、配信は必ず起きる。テスト「幽霊を外せる」がこれを見る）
  - `poker-handlers.ts` の `handleParticipantRemoved` の注記（「poker の wire には対応するコマンドが無い」）を、入口が 2 つになったことに合わせて書き直す

- [ ] **Step 1: `planRemoval` の失敗するテストを書く**（`test/room-removal.test.ts`）: 名簿 2 人・timer 無し → `removed` で `timer` が `undefined`・名簿 1 人／名簿 1 人 → `destroy`／名簿に居ない ID → `PARTICIPANT_NOT_FOUND`／timer あり・対象が唯一の席 → 繰り上げてから外す（今の `participant-remove.test.ts` の該当ケースと同じ期待値）
- [ ] **Step 2: poker の入口の失敗するテストを書く**（`test/poker/remove-participant.test.ts`）:
  - `幽霊を外せる`: A・B が poker に入り、B の接続を閉じる（トークンは使わない）→ A が `remove-participant: B` → A に届く `participants` から B が消える
  - `接続している人は外せない`: B が接続中 → `not-removable`、B は残る
  - `自分は外せない`: `not-removable`
  - `居ない人`: `participant-not-found`
  - `poker だけのルームでは timer の状態を作らない`: 外した後、`timers.get(code)` が `undefined`（in-process で保管を覗ける形。`create-sync-server.in-process.test.ts` の型を参照）。続けて timer の入口から入ると、初期状態の timer が返る
  - `timer の輪に居る幽霊を外すと輪からも外れる`: 同じルームで B が timer の輪に席を持ち、全接続を閉じる → A が poker から外す → timer の在室者に `participant-removed` の知らせが届き、輪から B が消える
  - `外した幽霊の票と見学が消える`: B が投票済みで切断 → 外す → 残る A が投票済みなら自動で開く
- [ ] **Step 3: 走らせて失敗を見る** — `cd apps/tasuki-sync && bun test test/room-removal.test.ts test/poker/remove-participant.test.ts`
- [ ] **Step 4: 実装する**。`participant-remove.ts` の注記（#79・#290・#376 の理由）は `planRemoval` 側へ移し、消さない
- [ ] **Step 5: 走らせる** — 上の 2 ファイル → 既存の `test/participant-remove.test.ts test/solo-leave.test.ts test/notice-signal.test.ts test/room-lifecycle.test.ts`（**無修正で緑**）→ `bun test`（全件）→ `node scripts/audit-assembly-wiring.mjs`・`node scripts/audit-structure.mjs`
- [ ] **Step 6: コミット** — `feat: ルームから外す処理を分け、poker から幽霊を外せるようにする（#419）`

### Task 5: 見学の画面（poker-web・設計 §5）

**Files:**
- Create: `apps/poker-web/src/spectator-copy.ts`、`tests/spectator-copy-fits-font-base.test.ts`、`tests/participant-list-spectator.test.tsx`
- Modify: `src/components/ParticipantList.tsx`、`src/pages/RoomPage.tsx`、`src/hooks/useSync.ts`、`src/index.css`、`tests/participant-list.test.tsx`、`tests/room-page*.test.tsx`（造作の `participants` に `spectator: false`）

**Interfaces:**
- Consumes: Task 2 の `ParticipantView.spectator`・`ClientMessage` の `set-spectator`
- Produces:
  - `spectator-copy.ts`: `SPECTATE = '見学する'`、`JOIN_VOTING = '投票に加わる'`、`SPECTATOR_BADGE = '見学'`、`SPECTATING_NOTE = '見学中です。投票には加わりません。'`、`participantsHeading(total: number, spectators: number): string`（見学 0 なら `参加者（N人）`、それ以外 `参加者（N人・見学M人）`）
  - `PokerSync` に `setSpectator(spectator: boolean): void`
  - `ParticipantList` は投票者を先・見学者を後に並べる（それぞれ元の順）。見学者の行は `SeatCard` を出さず `SPECTATOR_BADGE` の印。ただし開票後に票を持つ見学者は札を出す。`--seat-order` は札を出す行だけで 0 から振る
  - `RoomPage`: 見出しを `participantsHeading` に、見出しの脇に自分の切り替えボタン（`ui-button ui-button--secondary ui-button--sm`・`disabled={offline}`）。投票中に自分が見学者なら手札の節の中身を `SPECTATING_NOTE` の 1 文にする（見出し `あなたのカード` は残す）。`Results` の `seatCount` は札を出す席の数
- [ ] **Step 1: 失敗するテストを書く**:
  - 書体: `spectator-copy` の全定数と `participantsHeading(3, 1)`、`messageForRoundError({ code: 'spectating', op: 'vote' })` が base 層に収まる（`estimate-copy-fits-font-base.test.ts` と同じ型・対照の件数つき）。値も固定する
  - 一覧: 見学者が後ろに並ぶ／見学者の行に札が無く `見学` がある／開票後に票を持つ見学者は札が出る／`--seat-order` が札の行だけで 0,1,2 と続く（見学者を間に挟んだ並びで確かめる）
  - ページ: 自分が投票者なら `見学する` があり押すと `setSpectator(true)`／見学者なら `投票に加わる` と `SPECTATING_NOTE`、手札のボタンが無い／開票後もボタンが出る／切断中は押せない／見出しが `参加者（3人・見学1人）`
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-web test`
- [ ] **Step 3: 実装する**。CSS は既存の色の変数だけを使う（生の色は禁止）
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/poker-web test`、`pnpm --filter @tasuki/poker-web lint`（stylelint があれば）、`pnpm --filter @tasuki/poker-web typecheck`
- [ ] **Step 5: コミット** — `feat: poker の画面で見学に切り替えられるようにする（#419）`

### Task 6: 呼び分けと幽霊の片付けの画面（poker-web・G-1・G-4）

**Files:**
- Create: `apps/poker-web/src/components/RemovalConfirm.tsx`、`tests/participant-list-removal.test.tsx`
- Modify: `src/components/ParticipantList.tsx`、`src/pages/RoomPage.tsx`、`src/hooks/useSync.ts`、`src/spectator-copy.ts`（片付けの文言を足す。ファイル名はそのまま）、`tests/spectator-copy-fits-font-base.test.ts`

**Interfaces:**
- Consumes: Task 1 の `participantLabel`、Task 2 の `remove-participant`
- Produces:
  - `PokerSync` に `removeParticipant(participantId: string): void`
  - 文言: `REMOVE = '退出させる'`、`CANCEL = 'キャンセル'`、`removalTitle(label: string): string` → `${label} さんを退出させますか？`。ただし敬称は `participantLabel(name, id, everyone, 'さん')` の語順に合わせ、`removalTitle` は `participantLabel(..., 'さん')` の結果に `を退出させますか？` を付ける形にする（`名前 さん（ID: xxxx）を退出させますか？`）
  - `ParticipantList` は名前を `participantLabel(p.name, p.id, everyone)`（`everyone` は一覧の全員を `{ participantId: p.id, displayName: p.name }` へ写したもの）で出す。`!p.connected && p.id !== you` の行に `退出させる` のボタン（`onRemove` を受ける）
  - `RemovalConfirm`: ネイティブの `<dialog>`（`showModal`）。題・`退出させる`・`キャンセル`。確定で `onConfirm`、閉じたら押した行のボタンへフォーカスを戻す（行が消えていれば一覧の見出しへ）
- [ ] **Step 1: 失敗するテストを書く**: 同名 2 人で両方に `（ID: 末尾 4）`、同名でなければ付かない／切断中の他人にだけ `退出させる`（自分・接続中には無い）／押すと確認が開き、`キャンセル` では送らず、`退出させる` で `removeParticipant(id)`／確認の題が `あや さん（ID: xxxx）を退出させますか？`（同名のとき）／文言が base 層に収まる
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-web test`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/poker-web test`・typecheck・lint
- [ ] **Step 5: コミット** — `feat: poker の席で同名を呼び分け、接続の無い人を外せるようにする（#419）`

### Task 7: E2E と実画面

**Files:**
- Create: `e2e/specs/poker-spectator.spec.ts`
- Modify: 必要なら `e2e/specs/poker-a11y.spec.ts`（見学者の居る画面のコントラスト・a11y を既存の走査に通す。**新しいタグは足さない**）

- [ ] **Step 1: E2E を書く**（3 つのブラウザ文脈）:
  - 見学者 1 人・投票者 2 人で、2 人が出すと自動で開く。見学者の画面に手札が無く、見出しが `参加者（3人・見学1人）`
  - 見学者が `投票に加わる` を押すと手札が出て、その人が出すまで開かない
  - 1 人の文脈を閉じる → 残る人の一覧で `切断中` の行に `退出させる` → 確認 → 行が消える
- [ ] **Step 2: 走らせる** — `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/poker-spectator.spec.ts`（ポート 18080。`pnpm dev` と同時に走らせない）
- [ ] **Step 3: 実画面を撮る** — 同じ spec の中か scratchpad のスクリプトで、投票中（見学者あり）・開票後（見学者が票を持つ）・同名 2 人と幽霊の行・確認の開いた状態を、320px と 1280px で撮り、統括へパスを報告する（**統括が目で見る**）
- [ ] **Step 4: コミット** — `test: poker の見学と幽霊の片付けを E2E で確かめる（#419）`

### Task 8: 変異検査・文書・検査系

**Files:**
- Modify: `scripts/lib/mutation-declarations.mjs`、`docs/adr/0011-threat-model-and-data-classification.md`、`docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`、`docs/poker/specs/001-planning-poker-mvp/data-model.md`
- Create: `scripts/mutations/m390-*.patch`〜`m397-*.patch`

- [ ] **Step 1: 変異を足す**（既存の宣言の形に合わせ、`note` に `#419。**対応表より後に足した変異。**` を付ける）:

| ID | 壊し方 | 殺すテスト |
|---|---|---|
| m390 | `shouldAutoReveal` が見学者を分母から外さない | `packages/poker-core/tests/round.test.ts` |
| m391 | `setSpectator` が投票中に票を捨てない | `round.test.ts` |
| m392 | `castVote` が見学者の票を受ける | `round.test.ts` |
| m393 | `discardVote` が見学の集合から外さない | `round.test.ts` |
| m394 | `commitRoomAction` が名簿に居ない人を通す | `apps/tasuki-sync/test/poker/commit-room-action.test.ts` |
| m395 | poker の `remove-participant` が接続中の人も外す | `apps/tasuki-sync/test/poker/remove-participant.test.ts` |
| m396 | `removeFromRoom` が timer の状態の無いルームで `timers.put` する | 同上 |
| m397 | `shortParticipantId` が先頭 4 文字を取る | `packages/room-core/tests/participant-label.test.ts` |

各変異について `node scripts/mutation-check.mjs --id <ID>` で「当てると赤・戻すと緑」を確かめる（**作業ツリーが clean でないと走らないので、Step 1 の前にコミットしておく**）。パッチは `git apply --check` で当たることを見る。
- [ ] **Step 2: 文書を直す**:
  - ADR-0011 の分類表の「個人に紐づく」の行に「**poker の見学かどうか**（どの利用者がいま見積もりに加わっているか。#419・2026-10-18）」を足し、末尾の追記の節に #419 の 1 段落を足す（**追記は末尾へ**）
  - `ws-protocol.md`: `set-spectator`・`remove-participant`・3 つのエラーコード・`participants[].spectator`（省略時 false）・名簿に居ない人の操作は `not-joined`
  - `data-model.md`: `Round.spectators` と、`setSpectator` の遷移（投票中は票を捨てる・開票後は変えない）
- [ ] **Step 3: 検査系を流す** — `node scripts/audit-structure.mjs`、`node scripts/audit-log-hygiene.mjs`、`node scripts/audit-dependency-direction.mjs`、`node scripts/audit-public-surface.mjs`、`node scripts/audit-assembly-wiring.mjs`、`node scripts/audit-domain-error-shape.mjs`、`node scripts/audit-domain-side-effects.mjs`、`node scripts/check-links.mjs`、`bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'`。すべて緑
- [ ] **Step 4: コミット** — `docs: 見学と片付けの契約を文書に足し、変異 m390〜m397 で守る（#419）`

## PR の出し方（統括が行う）

1. 統括が `pnpm test --force`・E2E 全件・`mutation-check --changed` を流して緑を見る
2. 統括が `git push` し、PR を作る（タイトル: `feat: poker に見学者を置けるようにする（#419）`）。本文には Closes #419 を地の文で 1 回だけ書く（バッククォートで囲まない）。設計者が決めたこと（設計 §9）を一覧で載せる
3. `/code-review <PR 番号>` を流し、PR のコメントを push のたびに読む
4. マージと配布は利用者の指示を待つ。Issue 本文の書き換えは文案を見せてから

## 完了条件

- [ ] 見学に切り替えた人は手札を持たず、自動公開の分母から外れる（Task 2・3・5・7）
- [ ] 見学と投票をいつでも自分で切り替えられ、投票中は票を捨て開票後は残す（Task 2・3・5）
- [ ] poker の席で同名を `（ID: 末尾 4）` で呼び分け、玄関・timer と同じ規則を使う（Task 1・6）
- [ ] poker から接続の無い人を外せ、結果は timer から外したときと同じ。timer の状態が無いルームでも timer の状態を作らない（Task 4・6・7）
- [ ] 名簿に居ない人の poker の操作は拒まれる（Task 3）
- [ ] DoD（`docs/guides/definition-of-done.md`）の各項目を満たす
