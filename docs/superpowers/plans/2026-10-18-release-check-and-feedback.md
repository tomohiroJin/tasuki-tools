# リリース前の総合試験の欠陥と利用者のフィードバック（#427）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配布の前に、総合試験で見つかった欠陥 2 件（外されたタブの取り残し・320px の休憩の重なり）、利用者のフィードバック 4 件（記録の見た目・記録の切り替え・記録の名前の修正・ルーレット）、#419 の残り 2 件を 1 本の PR で直す。

**Architecture:** poker は集約ルート `Round` に「記録するか」を持たせる。束の名前の書き換えは `estimate-log.ts` の純関数にし、wire に 2 操作を足す。ルーレットは一周の記録（`drawn`）を状態とドメインから外し、wire には古い画面のために空の配列だけを残す。外された人のタブの扱いは、poker とハブを、topic・roulette がすでに使っている `planForJoinError` の `left` にそろえる。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、vitest（poker-core・roulette-core・poker-web・roulette-web・timer-web・landing）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-18-release-check-and-feedback-design.md`](../specs/2026-10-18-release-check-and-feedback-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。A〜H・J-n は設計の項目番号。
> 実施中の裁定で変わった点: 外した変異に m301 も加えた（Task 8）。外された人の行き先は告知つきの参加画面（ルームが残っているとき・Task 6）。


## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | どのタスクも失敗するテストから始める。CSS の幾何は E2E の測定を先に書く |
| II. 技術選定は ADR を通す | 通過 | 新しい依存は足さない。ルーレットの公平性の規則を撤回するので、ADR-0026 決定 4 に「撤回」を書き足す（Task 11） |
| III. 揮発インメモリと単純運用 | 通過 | 記録の切り替えは `Round` に持つだけ（揮発）。端末へは保存しない |
| IV. 境界の型安全 | 通過 | 新しい 2 操作は `v.strictObject`。サーバー→画面の `recording` は `v.optional(v.boolean(), true)`（J9） |
| V. 実画面検証 | 通過 | Task 12 で dev の実画面を撮り、ルーレットの色と記録の見た目は利用者に見てもらう |
| VI. 依存は内向き | 通過 | poker-core・roulette-core は新しい依存を持たない。landing・poker-web は既に依存している `@tasuki/sync-client` の `planForJoinError` を使う |
| VII. 検査は壊して確かめる | 通過 | 新しい振る舞いに変異 m410〜m417 を足す。撤回する規則の変異 m151・m152・m166・m300 は宣言から外す |
| VIII. 記録が正本 | 通過 | ADR-0026・#93 と #94 の設計正本・poker の ws-protocol 契約と data-model を直す（Task 11） |
| IX. 小さく回す | 逸脱 | 利用者の指示で、性質の違う 8 項目を PR 1 本にまとめる。下の Complexity Tracking |
| X. 抽象は実需で | 通過 | 束の名前の欄は、既存の `EstimateItemField` に見出しの文言を引数で渡せるようにするだけで、新しい抽象は作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | アイテム名は既に「利用者の入力・揮発・ログへ出さない」の扱い（#93）。束の名前の書き換えも同じ関数を通す |

**Complexity Tracking**: IX の逸脱。利用者は「同じ ISSUE に入れて修正を行いたい」と指示した（2026-10-18）。配布は 1 回にまとめたい（揮発インメモリなので配布のたびにルームが消える）。そのため PR は 1 本にし、代わりに**コミットを項目ごとに分け**、レビューは項目ごとのタスクで行う。

## Global Constraints

- 作業は本体 `/workspaces/claym/local/Tasuki` のブランチ `fix/427-release-check-and-feedback`。**サブエージェントは `git push`・`gh pr *`・`gh issue *`・作業ツリーやコミットを巻き戻す git 操作（`checkout --`・`checkout HEAD --`・`reset`・`stash`・`restore`）をすべてしない**。戻すときは `Edit` で手で直すか、新しいコミットを積む
- poker の画面の文言:
  - 切り替えのボタン `記録する`（`aria-pressed` で状態を示す）
  - 束の名前の欄のラベル `アイテム名を変える`
  - 既存の文言（`見積もりの記録`・`（名前なし）`・`ポイント（任意）`・`次のアイテムへ`・`再投票`）は変えない
- 文言はすべて書体の base 層に収める（`apps/poker-web/tests/estimate-copy-fits-font-base.test.ts` に足して実測する。外れたら言い換え、計画の文言を直したことを報告する）
- poker の wire の新しい操作:
  - `{ type: 'set-recording', recording: boolean }`
  - `{ type: 'set-group-item', groupId: number(整数・1 以上), item: string(trim・最大 MAX_ESTIMATE_ITEM) }`
- サーバー→画面: `estimate.recording: v.optional(v.boolean(), true)`
- 新しいルームの `Round.recording` は `false`
- ルーレットの wire: `drawn` は**常に空の配列**で送る。`roulette.cycle.reset` は受けて何もしない（配信もしない）
- 変異 ID は **m410〜m419** を使う。外すのは m151・m152・m166・m300
- 手元の変異検査は `node scripts/mutation-check.mjs --id <ID>`。全件と `--changed` は統括が流す（宣言を触るので `--changed` は全件に倒れる。手元で流さない）
- 実装役はコマンドを 1 つずつ、各 5 分以内で流す。E2E 全件と変異の連続実行は統括が流す
- コミットの末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける（実装役）

## Review Focus

1. **記録を「する」で開票し再投票したあと、「しない」に切り替えて別のアイテムで開票し、「する」に戻して開票する** → 行は新しい束に入り、最初の束（ポイントなしで閉じた）には混ざらない（Task 2「切り替えは open の束を閉じる」・Task 2「しない間の開票は行を足さない」）
2. **開票後に「する」へ切り替えた** → その開票は行にならず、ポイントの欄は出ない（Task 4「open の束が無ければポイントの欄を出さない」）
3. **閉じた束の名前を書き換えている途中に、別の人がその束のポイントを変えた** → 打ちかけの名前は消えず、確定で送られる（Task 4「他の人の更新で下書きが消えない」）
4. **外された人の poker のタブが投票中だった** → 玄関の作成画面へ `?left=removed` で移り、復帰の組は消える（Task 6「REMOVED_FROM_ROOM で玄関へ」）
5. **ルーレットで入る人 2 人・選ぶ人数 1 で 20 回回す** → 同じ人が 2 回続けて当たる回が出る（Task 8「同じ人が続けて当たりうる」）

## 検証の実行時間の見積もり

| 検証 | 1 回 | 回数 | いつ |
|---|---|---|---|
| poker-core / roulette-core の vitest | 約 10〜15 秒 | 各 4〜6 | Task 2・8 |
| poker-web / roulette-web / timer-web / landing の vitest（全件） | 約 40 秒 | 各 3〜5 | Task 4〜7・9 |
| tasuki-sync の bun test（触ったファイル） | 約 30 秒 | 6〜8 | Task 3・8 |
| tasuki-sync の bun test（全件） | 約 1〜2 分 | 2 | Task 3・8 の終わり |
| E2E（触った spec 1 本ずつ） | 約 1〜2 分 | 8〜10 | Task 5〜7・10 |
| `mutation-check --id`（1 本） | 約 1〜2 分 | 8 本 | Task 2・3・6・8 |
| パッチが当たるかの確認（`git apply --check` 全件） | 約 10 秒 | 2 | Task 8・仕上げ |
| 統括の全件（typecheck・lint・test・build・e2e・audit・自己テスト） | 約 10 分 | 2 | 仕上げ |
| CI の変異全件 | 約 11 分（CI） | 1〜2 | push 後 |

機械の待ちは合計で約 2〜2.5 時間と見積もる。2 倍（5 時間）を超えたら、統括が止まって原因を見る。

## ファイルの地図

- **#419 の残り**: `stash@{0}` の中身（`apps/poker-web/src/index.css`・`apps/tasuki-sync/test/poker/commit-room-action.test.ts`・`apps/tasuki-sync/test/room-removal.test.ts`・`docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`・`scripts/lib/mutation-declarations.mjs`・`scripts/mutations/m395-*.patch`）、`apps/tasuki-sync/src/application/poker-error-text.ts`・`poker-commit-room-action.ts`
- **poker-core**: `src/round.ts`・`src/estimate-log.ts`・`src/protocol.ts`・`src/snapshot.ts`・`src/index.ts`、`tests/round.test.ts`・`tests/estimate-log.test.ts`・`tests/protocol.test.ts`・`tests/snapshot.test.ts`
- **tasuki-sync**: `src/application/poker-commit-room-action.ts`・`src/application/roulette-handlers.ts`、`test/poker/estimate-log.test.ts`・`test/roulette-handlers.test.ts` ほか `drawn` を読むテスト
- **poker-web**:
  - `src/pages/RoomPage.tsx`・`src/components/EstimateLog.tsx`・`EstimateLogFoot.tsx`・`EstimateItemField.tsx`・`src/hooks/useSync.ts`・`src/router.ts`・`src/estimate-copy.ts`・`src/index.css`
  - テスト: `tests/room-page-estimate.test.tsx`・`tests/estimate-log.test.tsx`・`tests/estimate-item-field.test.tsx`・`tests/room-page-redirect.test.tsx`・`tests/estimate-copy-fits-font-base.test.ts`・`tests/room-page-layout.test.tsx`
- **landing**: `src/hub/use-hub-sync.ts` とそのテスト
- **timer-web**: `src/App.tsx`・`src/styles/break.css`（＋上端の帯の高さを測るフックを 1 つ）
- **roulette-core**: `src/draw.ts`・`src/roulette.ts`・`src/types.ts`・`src/index.ts`・`src/schemas.ts`、テスト（`tests/draw.test.ts`・`tests/draw-picks.test.ts`・`tests/support/draw-winner-oracle.ts` ほか `drawn` を読むもの）
- **roulette-web**: `src/roulette-view.ts`・`src/copy.ts`・`src/components/PeoplePanel.tsx`・`ModePanel.tsx`・`Stage.tsx`・`Wheel.tsx`・`src/hooks/use-roulette-sync.ts`・`src/screens/RouletteRoom.tsx`・`src/index.css` とテスト
- **e2e**: `specs/poker-estimate-log.spec.ts`・`specs/layout.spec.ts`・`specs/timer-break.spec.ts`・`specs/leave-room.spec.ts`・`specs/roulette.spec.ts`・`specs/buttons.spec.ts`・`support/roulette.ts`
- **docs / scripts**:
  - Modify: `docs/adr/0026-facilitator-roulette.md`・`docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md`・`2026-10-16-roulette-multi-pick-design.md`・`2026-10-17-roulette-turn-order-design.md`・`2026-10-17-poker-estimate-log-design.md`・`docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`・`data-model.md`・`scripts/lib/mutation-declarations.mjs`
  - Create: `scripts/mutations/m410-*.patch`〜
  - Delete: `scripts/mutations/m151-*.patch`・`m152-*.patch`・`m166-*.patch`・`m300-*.patch`

---

### Task 1: #419 の残りを片付ける（設計 G・H）— 統括が行う

stash を扱うので統括が行う（実装役は stash に触れない）。

**Files:** 上の地図の「#419 の残り」

- [ ] **Step 1: 当てる** — `git stash show -p stash@{0} | git apply`（2026-10-18 に `--check` で当たることを確認済み）。`git status --porcelain` で 6 ファイルだけが変わったことを見る
- [ ] **Step 2: テストを走らせる** — `pnpm --filter @tasuki/sync exec bun test test/poker/commit-room-action.test.ts test/room-removal.test.ts`。期待: 緑
- [ ] **Step 3: 変異を確かめる** — `node scripts/mutation-check.mjs --id 395`。期待: 検出（対照が通り、変異で落ちる）
- [ ] **Step 4: 直書きを寄せる（H）** — `POKER_ERROR_TEXT` に `NOT_JOINED: 'ルームに参加していません'` を足し、`poker-commit-room-action.ts` の 3 か所を置き換える。`grep -rn "'ルームに参加していません'" apps/tasuki-sync/src` が `poker-error-text.ts` の 1 件だけになることを見る。`pnpm --filter @tasuki/sync exec bun test test/poker` が緑
- [ ] **Step 5: コミット** — `fix: m395 の注記を直し、not-joined の文言を 1 つにする（#427）`。コミットした後に `git stash drop stash@{0}` を打つかどうかは、利用者に確かめる（`stash` は巻き戻しの操作ではないが、消すと戻せない）

### Task 2: 記録の切り替えと束の名前（poker-core・設計 D・E）

**Files:**
- Modify: `packages/poker-core/src/round.ts`・`src/estimate-log.ts`・`src/protocol.ts`・`src/snapshot.ts`・`src/index.ts`
- Test: `packages/poker-core/tests/round.test.ts`・`tests/estimate-log.test.ts`・`tests/protocol.test.ts`・`tests/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `Round` に `recording: boolean` を足す。`createRound()` は `false`
  - `setRecording(round: Round, recording: boolean): Round` —— 同じ値なら入力と同じ参照を返す。違えば `closeOpenGroup(round.log, null)` を当ててから `recording` を変える（J7）
  - `revealed()`（手動・自動の両方が通る）は `round.recording && round.votes.size > 0` のときだけ `recordReveal` する
  - `estimate-log.ts` に `setGroupItem(log: EstimateLog, id: number, item: string): Result<EstimateLog, EstimateLogError>` —— 束が無ければ `estimate-not-found`、open なら `estimate-open`。閉じた束の**全部の行**の `item` を書き換える（見出しは最後の行から決まるので、#93 §4.4 と食い違わない）
  - `round.ts` に `renameGroup(round: Round, groupId: number, item: string): Result<Round, RoundError>` —— `item` は `setItem` と同じ不可視文字の除去と `trim` を通す。そのため、今 `setItem` の中にある除去を `cleanItem(item: string): string`（非公開）に切り出し、両方から呼ぶ
  - `protocol.ts`: クライアントの 2 操作（Global Constraints の形）、`EstimateViewSchema` に `recording: v.optional(v.boolean(), true)`
  - `snapshot.ts`: `estimate.recording = round.recording`
  - `index.ts` から `setRecording`・`renameGroup` を明示列挙で公開する

- [ ] **Step 1: 失敗するテストを書く**（Given/When/Then の題で）
  - `round.test.ts`:
    - 「新しいラウンドは記録しない」
    - 「記録しない間の開票は行を足さない」（手動と自動の両方）
    - 「記録する間の開票は今までどおり行を足す」
    - 「切り替えは open の束をポイントなしで閉じる（しない→する・する→しないの両方）」
    - 「同じ値への切り替えは同じ参照を返す」
    - 「Review Focus 1 の往復で、行は新しい束に入る」
    - 「renameGroup は不可視文字を除き前後の空白を削る」
    - 「renameGroup は open の束に estimate-open」
  - `estimate-log.test.ts`:
    - 「setGroupItem は閉じた束の全部の行の名前を変え、ほかの束を変えない」
    - 「無い ID に estimate-not-found」
    - 「空の名前を受ける」
  - `protocol.test.ts`:
    - 「2 操作を受ける」
    - 「groupId 0・小数・MAX_ESTIMATE_ITEM + 1 字を拒む」
    - 「余計なキーを拒む」
    - 「estimate に recording が無い room-state は recording: true と読む」
  - `snapshot.test.ts`: 「recording が載る」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-core test`。期待: FAIL（未定義・期待値の違い）
- [ ] **Step 3: 実装する**（Interfaces のとおり）
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/poker-core test`・`pnpm --filter @tasuki/poker-core typecheck`・`node scripts/audit-public-surface.mjs`。期待: 緑
- [ ] **Step 5: 変異を足す**（`scripts/lib/mutation-declarations.mjs` に宣言し、`scripts/mutations/` にパッチを置く。書き方は m390 を写す）
  - m410「記録しない間も開票で行を足す」（`revealed` の `round.recording &&` を外す）→ `tests/round.test.ts`
  - m411「切り替えで open の束を閉じない」→ `tests/round.test.ts`
  - m412「束の名前の書き換えが最後の行だけを変える」→ `tests/estimate-log.test.ts`
  - それぞれ `node scripts/mutation-check.mjs --id 410`（411・412 も）。期待: 検出
- [ ] **Step 6: コミット** — `feat: poker の記録を切り替えられ、束の名前を後から直せるようにする（poker-core・#427）`

### Task 3: サーバーで 2 操作を受ける（tasuki-sync・設計 D・E）

**Files:**
- Modify: `apps/tasuki-sync/src/application/poker-commit-room-action.ts`
- Test: `apps/tasuki-sync/test/poker/estimate-log.test.ts`（記録の既存テストは、最初に `set-recording: true` を送る形へ直す）

**Interfaces:**
- Consumes: Task 2 の `setRecording`・`renameGroup`
- Produces: `dispatch` の 2 つの枝
  - `'set-recording'` → `commitRoomAction(ws, (round) => ok(setRecording(round, msg.recording)))`
  - `'set-group-item'` → `commitRoomAction(ws, (round) => renameGroup(round, msg.groupId, msg.item))`
  - エラー文言は既存の `messageForRoundError` が返す（`estimate-not-found`・`estimate-open` は #93 で既にある）

- [ ] **Step 1: 失敗するテストを書く**（`test/poker/estimate-log.test.ts`）:
  - 「新しいルームで開票しても記録は空」
  - 「set-recording true の後の開票は行になり、全員に recording: true が配られる」
  - 「set-group-item で閉じた束の名前が全員に配られる」
  - 「open の束への set-group-item は estimate-open のエラー」
  - 「名簿に居ない接続の set-recording は not-joined」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/sync exec bun test test/poker/estimate-log.test.ts`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — 上と同じファイル、続いて `pnpm --filter @tasuki/sync test`（全件）・`pnpm --filter @tasuki/sync typecheck`。期待: 緑
- [ ] **Step 5: 変異** — m413「set-group-item を set-points と同じ枝で受けて名前を捨てる」（dispatch の枝が `ok(round)` を返す）→ `test/poker/estimate-log.test.ts`。`--id 413` で検出
- [ ] **Step 6: コミット** — `feat: 同期サーバーで記録の切り替えと束の名前を受ける（#427）`

### Task 4: poker の画面で記録を切り替え、束の名前を直す（poker-web・設計 D・E）

**Files:**
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`・`src/components/EstimateLog.tsx`・`src/components/EstimateLogFoot.tsx`・`src/components/EstimateItemField.tsx`・`src/hooks/useSync.ts`（`setRecording(recording: boolean)`・`renameGroup(groupId: number, item: string)` を足す）・`src/estimate-copy.ts`
- Test: `tests/room-page-estimate.test.tsx`・`tests/estimate-log.test.tsx`・`tests/estimate-item-field.test.tsx`・`tests/estimate-copy-fits-font-base.test.ts`・`tests/room-page-layout.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `estimate.recording`、Task 3 の 2 操作
- Produces:
  - `EstimateItemField` に省略可の `label?: string`（既定は今の `ESTIMATE_ITEM_LABEL`）と `size?: 'title' | 'inline'` を足す。束の見出しは `inline` を使う
  - `EstimateLog` に `onRenameGroup: (groupId: number, item: string) => void` を足す。閉じた束の見出しの名前は `EstimateItemField`（`label` は `アイテム名を変える`）にする。open の束は今の `<span>` のまま
  - `estimate-copy.ts`: `RECORDING_TOGGLE = '記録する'`・`RENAME_GROUP = 'アイテム名を変える'`
  - `RoomPage`:
    - 見出しの並び（`.room-title`）に、切り替えのボタン（`aria-pressed={recording}`）を置く
    - `recording === false` のとき、`EstimateLog`（脇）・`EstimateItemField`・`EstimateLogFoot` を描かない。脇にお題の札も無ければ `.room-side` ごと描かない
    - `RevealedDock` の `PointsSelect` は、`recording && 記録に open の束がある` ときだけ描く（J8）

- [ ] **Step 1: 失敗するテストを書く**
  - `room-page-estimate.test.tsx`:
    - 「recording false の room-state では記録の欄・いま見積もっているもの・ポイントの欄が無い」
    - 「recording true では今までどおり出る」
    - 「切り替えのボタンは aria-pressed で状態を示し、押すと set-recording を送る」
    - 「開票後でも open の束が無ければポイントの欄を出さない」
    - 「recording false でお題も無ければ .room-side が無い」
    - 「recording が無い（古いサーバー）room-state は記録の欄を出す」
  - `estimate-log.test.tsx`:
    - 「閉じた束の名前を押すと欄になり、Enter で onRenameGroup(id, 名前)」
    - 「open の束の名前は押せない」
    - 「他の人の更新で下書きが消えない」（props の `groups` を差し替えても打ちかけが残る）
  - `estimate-copy-fits-font-base.test.ts`: `RECORDING_TOGGLE`・`RENAME_GROUP` を測る対象に足す
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-web test`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/poker-web test`・`typecheck`・`lint`・`node scripts/audit-ui-components.mjs`。期待: 緑
- [ ] **Step 5: 変異** — m414「open の束が無くてもポイントの欄を出す」→ `tests/room-page-estimate.test.tsx`。`--id 414` で検出
- [ ] **Step 6: コミット** — `feat: poker の画面で記録を切り替え、束の名前を直せるようにする（#427）`

### Task 5: 記録の札とお題の札をそろえる（poker-web の CSS・設計 C）

**Files:**
- Modify: `apps/poker-web/src/index.css`（`.room-log--side`・`.room-log--side > .estimate-log-body`・`.room-topic-side > .ui-reader`）。お題の札の中身の構造を変えるなら `src/components/CurrentTopic.tsx` も
- Test: `e2e/specs/layout.spec.ts`（poker の 64rem 以上の節に足す）

**決めてあること:**
- 記録の本文（`.estimate-log-body`）は札の左右の余白の外まで広げ、内側に同じ余白を持たせる（例: `margin-inline: calc(-1 * var(--space-5)); padding-inline: var(--space-5)`）。スクロールバーは札の右端に出る。`scrollbar-gutter: stable` で、束が増えて溢れた瞬間に中身が横へずれないようにする
- お題の札は脇の高さの中に収める。溢れたら札の中でスクロールするか、札が伸びるか（設計 §7 で実装役に任せた）。どちらでも記録の見出しは見える

- [ ] **Step 1: 失敗する E2E を書く**（`layout.spec.ts`。1280×800・お題あり・記録する・開票と「次のアイテムへ」を 6 回）:
  - 「お題の見出しと記録の見出しの左端が 1px 以内でそろう」
  - 「記録の本文の右端が、記録の札の枠の内側の右端から 2px 以内」
  - 「束の見出しのポイントの欄の右端と、本文のスクロールできる範囲の右端（`left + clientWidth`）の間が 16px 以上」
  - 「お題の札の中身が札の外へはみ出さない」（札の `scrollHeight <= clientHeight` か、溢れた札が `overflow-y` に `auto`/`scroll` を持つ）
  - 「記録の見出しが画面の中に見える」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/e2e exec playwright test specs/layout.spec.ts -g "記録"`（事前に `pnpm build`。E2E は dist を配る）
- [ ] **Step 3: CSS を直す**
- [ ] **Step 4: 走らせる** — 同じ E2E、続いて `pnpm --filter @tasuki/e2e exec playwright test specs/layout.spec.ts specs/poker-a11y.spec.ts`。期待: 緑
- [ ] **Step 5: 撮る** — 1280×800 と 1024×700 の画面を `.playwright-mcp/` に撮り、報告に添える（統括が利用者に見せる）
- [ ] **Step 6: コミット** — `fix: poker の記録の札をお題の札とそろえ、お題がはみ出さないようにする（#427）`

### Task 6: 外された人のタブを玄関へ戻す（poker-web・landing・設計 A）

**Files:**
- Modify: `apps/poker-web/src/hooks/useSync.ts`・`src/router.ts`・`src/pages/RoomPage.tsx`・`apps/landing/src/hub/use-hub-sync.ts`
- Test: `apps/poker-web/tests/room-page-redirect.test.tsx`、landing の `use-hub-sync` のテスト（無ければ `apps/landing/tests/` に `hub-departure.test.tsx` を作る）、`e2e/specs/leave-room.spec.ts`

**Interfaces:**
- Consumes: `@tasuki/sync-client` の `planForJoinError(code, message, defaultText)`、`@tasuki/room-core` の `DEPARTURE_PARAM`・`DepartureReason`
- Produces:
  - poker-web の `router.ts` の `hubPathFor(roomId: string, departure?: DepartureReason): string`（topic-web の `router.ts` と同じ形）
  - `useSync` に `departed: DepartureReason | null`。`error` のフレームで `planForJoinError(...).kind === 'left'` なら、復帰の組を捨て、接続を畳み、`departed` を立てる（`error` には入れない）
  - `RoomPage` は `departed !== null` で `redirectTo(hubPathFor(roomId, departed))`
  - ハブ: `LEFT_ROOM`・`REMOVED_FROM_ROOM`・`REMOVED_BY_HOST` を受けたら、復帰の組を捨て、接続を畳み、`location.replace` で `/?room=CODE&left=<reason>` へ移る（玄関の `?left=` の扱いは #290 のまま）

- [ ] **Step 1: 失敗するテストを書く**
  - poker-web:
    - 「REMOVED_FROM_ROOM で玄関へ ?left=removed、復帰の組が消える」
    - 「LEFT_ROOM で ?left=self」
    - 「未知のコードは今までどおり帯に出る」
  - landing:
    - 「参加中に REMOVED_FROM_ROOM を受けたら ?left=removed へ置き換えて移る」
  - `leave-room.spec.ts`: 「B がハブ・poker・timer・topic・roulette を開いた状態で、A が timer から B を外す / B のどのタブも玄関の作成画面に退出の告知つきで居る」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/poker-web test`・`pnpm --filter @tasuki/landing test`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — 2 つの vitest、続いて `pnpm build` の後に `pnpm --filter @tasuki/e2e exec playwright test specs/leave-room.spec.ts`。期待: 緑。**topic・roulette のタブがこの E2E で落ちたら、その原因も同じタスクで直す**（設計 A の「実画面で確かめる」）
- [ ] **Step 5: 変異** — m415「poker が REMOVED_FROM_ROOM を未知のエラーとして帯に出す」→ `tests/room-page-redirect.test.tsx`。`--id 415` で検出
- [ ] **Step 6: コミット** — `fix: 外された人の poker とハブのタブを玄関へ戻す（#427）`

### Task 7: 休憩の覆いを上端の帯の下から始める（timer-web・設計 B）

**Files:**
- Modify: `apps/timer-web/src/App.tsx`・`src/styles/break.css`
- Create: `apps/timer-web/src/ui/use-top-band-height.ts`（`useTopBandHeight(ref: RefObject<HTMLElement | null>): void`。`ResizeObserver` で上端の帯の高さを測り、`document.documentElement` の CSS 変数 `--top-band-height` に px で書く。外すときに変数を消す）
- Test: `apps/timer-web/test/ui/use-top-band-height.test.tsx`・`e2e/specs/timer-break.spec.ts`

**決めてあること:** `.break-overlay` の `padding-block-start` を `max(calc(var(--space-6) * 5), calc(var(--top-band-height, 0px) + var(--space-4)))` にする。名前は切り詰めない（バナーが何行になっても、中身はその下から始まる）。

- [ ] **Step 1: 失敗するテストを書く**
  - `use-top-band-height.test.tsx`:
    - 「帯の高さが変わると --top-band-height が変わる」（`ResizeObserver` は差し替える）
    - 「アンマウントで変数を消す」
  - `timer-break.spec.ts` の 320px のテストを `test.describe` の中で 2 通りにする: 今の短い名前と、**40 字の名前**（`'あ'.repeat(40)` ではなく、折り返しの起きる実際の字の並び。例: 設計の再現に使った 39 字＋1 字）。どちらも「覆いの見出しと時計の中心で elementFromPoint が覆いの中を返す」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/timer-web test`、`pnpm build` の後に `pnpm --filter @tasuki/e2e exec playwright test specs/timer-break.spec.ts`。期待: 40 字の場合だけ FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — 上と同じ 2 つと `specs/timer-a11y.spec.ts`。期待: 緑
- [ ] **Step 5: コミット** — `fix: 長い名前で休憩の知らせが折り返しても覆いの見出しを隠さない（#427）`

### Task 8: ルーレットの一周の規則を外す（roulette-core・tasuki-sync・設計 F）

**Files:**
- Modify: `packages/roulette-core/src/draw.ts`・`src/roulette.ts`・`src/types.ts`・`src/index.ts`・`src/schemas.ts`、`apps/tasuki-sync/src/application/roulette-handlers.ts`
- Test: `packages/roulette-core/tests/draw.test.ts`・`tests/draw-picks.test.ts`・`tests/support/draw-winner-oracle.ts`、および `grep -rln drawn packages/roulette-core/tests apps/tasuki-sync/test` が返す全部
- Delete: 変異 m151・m152・m166・m300 の宣言とパッチ

**Interfaces:**
- Produces:
  - `RouletteState` から `drawn` を消す（`INITIAL_STATE` も）
  - `drawPicks(pool: readonly Entry[], pickCount: number, randomInt: (n: number) => number): Result<number[], RouletteError<"INVALID_RANDOM">>` —— 各回の候補は「pool − この回転ですでに選んだ人」。一様に 1 人ずつ引く
  - `resetCycle` を消す（`index.ts` の公開からも）
  - `removeGuest`・`prune` から `drawn` の扱いを消す（`prune` の「同じ参照を返す」は `excluded` だけで判定する）
  - `toView` は `drawn: []` を載せる（J6）。`RouletteView.drawn` の型と `schemas.ts` の `drawn: v.array(v.string())` は残す（古い画面のため）。**新しい画面は `drawn` を読まない**（Task 9）
  - `schemas.ts` の `roulette.cycle.reset` は残す。`roulette-handlers.ts` の枝は何も変えずに返す（`commit` しない＝配信しない）

- [ ] **Step 1: 失敗するテストを書く**
  - `draw-picks.test.ts`（一周の規則のテストは消し、次に置き換える）:
    - 「Review Focus 5: 入る人 2 人・選ぶ人数 1 で、randomInt が毎回 0 を返すと同じ人が続けて選ばれる」
    - 「1 回の回転では同じ人を 2 度選ばない（k = 4・pool = 5）」
    - 「候補の数を randomInt に渡す（k 回目は pool − (k−1)）」
    - 「randomInt が範囲外なら INVALID_RANDOM」
  - `roulette.test.ts`:
    - 「startSpin の後の状態に drawn が無い」
    - 「toView の drawn は常に空」
  - tasuki-sync の `roulette-handlers.test.ts`: 「roulette.cycle.reset は状態を変えず配信しない」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/roulette-core test`
- [ ] **Step 3: 実装する。** `draw-winner-oracle.ts`（一周の規則の 1 人の正解）と、それを比べるテストは消す
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/roulette-core test`・`typecheck`・`pnpm --filter @tasuki/sync test`（全件）・`node scripts/audit-public-surface.mjs`。期待: 緑
- [ ] **Step 5: 変異を入れ替える**
  - m151・m152・m166・m300 の宣言とパッチを消す
  - m416「1 回の回転で同じ人を 2 度選びうる」（候補から「この回転ですでに選んだ人」を外さない）→ `tests/draw-picks.test.ts` を足して `--id 416` で検出
  - 全パッチが当たるかを確かめる: `bash -c 'for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NG $p"; done'`。NG がルーレットのファイルに当たるものなら、文脈行を今のコードに合わせて作り直し、その ID を `--id` で検出させる。NG が 0 件になるまで
- [ ] **Step 6: コミット** — `feat!: ルーレットの「一周するまで同じ人を選ばない」規則を外す（#427）`

### Task 9: ルーレットの画面から一周の印を外し、円盤の色を整える（roulette-web・設計 F）

**Files:**
- Modify: `apps/roulette-web/src/roulette-view.ts`・`src/copy.ts`・`src/components/PeoplePanel.tsx`・`ModePanel.tsx`・`Stage.tsx`・`Wheel.tsx`・`src/hooks/use-roulette-sync.ts`・`src/screens/RouletteRoom.tsx`・`src/index.css`
- Test: `apps/roulette-web/tests/` の `drawn`・`cycle` を読む全部（Task 8 の grep の結果）、`tests/wheel.test.tsx`

**Interfaces:**
- Consumes: Task 8（`drawn` は常に空。画面は読まない）
- Produces:
  - `RowMark` から `'drawn'` を消す。`PeoplePanel` の「選ばれた」、`ModePanel` の一周の行（`cycleLineOf`・`CYCLE_NOTE`・`cycleProgressText`）と「一周をやり直す」（`CYCLE_RESET_BUTTON`・`onResetCycle`・`resetCycle`）を消す
  - `Wheel` の `drawnIds` を消す
  - 色: `.wheel-segment--drawn`・`.wheel-label--drawn` を消す。当たり以外の席は、明度の近い 2 段の交互にする（奇数のときの最後の席は 3 段目）。字はどの段でも `--ivory` で AA。当たりは `--gold` の地に `--on-gold` のまま。具体のトークンの組は実装役が選び、`scripts/` のコントラストの走査（`pnpm --filter @tasuki/roulette-web test` に含まれる a11y の検査と `e2e/specs/buttons.spec.ts`）を通す

- [ ] **Step 1: 失敗するテストを書く / 直す**
  - `roulette-view.test.ts`: 「一覧の行に drawn の印が付かない（view.drawn に ID があっても）」
  - `roulette-room.test.tsx`: 「一周の行と一周をやり直すが無い」
  - `wheel.test.tsx`: 「当たり以外の席の塗りは 3 種類以内で、当たりの席だけが winner の塗り」「奇数の席で最初と最後が同じ段にならない」
- [ ] **Step 2: 走らせて失敗を見る** — `pnpm --filter @tasuki/roulette-web test`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせる** — `pnpm --filter @tasuki/roulette-web test`・`typecheck`・`lint`・`node scripts/audit-ui-components.mjs`。期待: 緑。続いて `pnpm build` の後に `pnpm --filter @tasuki/e2e exec playwright test specs/roulette.spec.ts specs/buttons.spec.ts`（`e2e/support/roulette.ts` の一周の読み取りを消す）
- [ ] **Step 5: 撮る** — 席 5・6・7 人で、止まった直後の円盤を 1280×800 と 390×844 で撮り、`.playwright-mcp/` に置く（統括が利用者に見せる。色の組は利用者の返事で直しうる）
- [ ] **Step 6: 変異** — m417「当たり以外の席にも winner の塗りを付ける」→ `tests/wheel.test.tsx`。`--id 417` で検出
- [ ] **Step 7: コミット** — `feat: ルーレットの画面から一周の印を外し、円盤の色を当たりだけに絞る（#427）`

### Task 10: poker の E2E を記録の切り替えに合わせる（e2e・設計 D）

**Files:**
- Modify: `e2e/specs/poker-estimate-log.spec.ts`（各テストの Given で「記録する」を押す）、`e2e/specs/layout.spec.ts`（記録の脇を前提にしているテストも同じく）

- [ ] **Step 1: 足す** — `poker-estimate-log.spec.ts` に次を足す:
  - 「Given 新しいルーム / When 開票する / Then 記録の欄・いま見積もっているもの・ポイントの欄が無い」
  - 「Given 2 人 / When 1 人目が記録するを押す / Then 2 人目の画面にも記録の欄が出る」
  - 「Given 閉じた束 / When 2 人目が束の名前を変える / Then 1 人目の画面の見出しも変わる」
- [ ] **Step 2: 走らせる** — `pnpm build` の後に `pnpm --filter @tasuki/e2e exec playwright test specs/poker-estimate-log.spec.ts specs/layout.spec.ts specs/poker.spec.ts specs/poker-a11y.spec.ts`。期待: 緑
- [ ] **Step 3: コミット** — `test: poker の E2E を記録の切り替えに合わせる（#427）`

### Task 11: 正本を直す（docs・設計 D・E・F）

**Files:** 地図の docs の行

- [ ] **Step 1: ADR-0026** — 決定 4 の節の末尾に「**撤回（2026-10-18・#427）**」を足す。利用者の言葉（設計 §4 F の引用）と、残したもの（1 回の回転の中では重ねない・wire の `drawn` は空で残す）を書く。題（H1）の「一周の規則」は消さず、「（決定 4 は #427 で撤回）」と添える。決定 4 を前提にしている後の追記（k 人・順番に回す・押して止める）の文には、「撤回後は該当しない」と 1 行ずつ添える
- [ ] **Step 2: #94・#401 の設計正本** — R6・M7・M8 など一周の規則を定める行に「#427 で撤回（ADR-0026 決定 4）」と添える（本文は消さない）
- [ ] **Step 3: #93 の設計正本** — §4.4 の「束の見出し」に「閉じた束の名前は後から直せる（#427）」を、§5.1 の「脇はルームに入った時点から出ている」に「記録を切っている間は除く（#427）」を添える
- [ ] **Step 4: poker の契約** — `ws-protocol.md` に 2 操作と `estimate.recording` を、`data-model.md` の `Round` に `recording` を足す
- [ ] **Step 5: 走らせる** — `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`。期待: 緑
- [ ] **Step 6: コミット** — `docs: 記録の切り替え・束の名前・一周の規則の撤回を正本に書く（#427）`

### Task 12: 仕上げ（統括）

- [ ] **Step 1: 全件** — 2026-10-18 の総合試験と同じ一式（scratchpad の `run-all.sh` の中身: typecheck・lint・test・build・e2e を `--force` で、check-links・audit-plan-gate・audit-*.mjs 11 本・scripts の自己テストを bash で、shellcheck）。期待: 全部 0
- [ ] **Step 2: 実画面** — dev で 2 人のルームを作り、次を撮る:
  - Review Focus の 1〜5
  - 設計 A の 5 つのタブ
  - 設計 B の 40 字の名前
  - 設計 C の 1280×800
  - 設計 F の円盤

  撮った画面を利用者に見せ、とくに C と F の見た目の承認を得る
- [ ] **Step 3: PR** — push してから `gh pr create`。本文に `Closes #427` を地の文で書く。続けて `/code-review <番号>` を流し、指摘を直す
- [ ] **Step 4: CI** — 変異の全件を含めて緑を見る

## 完了条件

- 設計の A〜H のすべてに、対応するテストと実画面の確認がある
- 統括の全件と CI が緑
- 利用者が C（記録の見た目）と F（円盤の色）を実画面で見て承認した
