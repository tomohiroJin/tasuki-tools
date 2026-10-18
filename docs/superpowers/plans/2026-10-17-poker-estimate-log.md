# poker の見積もりの記録（#93）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poker のルームに、開票ごとの記録（時刻・何回め・アイテム名・カードの枚数）をアイテムの束で積み、見積もり中の画面の脇に出す。ポイントは任意で、後から誰でも入れ直せる。

**Architecture:** 記録とアイテム名は poker の集約ルート `Round`（`packages/poker-core/src/round.ts`）に持たせ、保管（`RoundStore`）と配信（`commit`）の経路は変えない。記録の純関数は新しい `estimate-log.ts` に置き、開票の 2 経路（`revealBy`・`applyAutoReveal`）が時刻を受け取って 1 行を足す。`next-round` は `revote`・`next-item` に分かれ、古い `next-round` は再投票として受ける。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、vitest（poker-core・poker-web）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-17-poker-estimate-log-design.md`](../specs/2026-10-17-poker-estimate-log-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクは失敗するテストから始め、赤を見てから実装する |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 通過 | 記録はメモリの `Round` に足すだけ。回収（`ROOM_IDLE_TTL_MS`）は変えない。端末への保存はしない（設計 §4.5） |
| IV. 境界の型安全 | 通過 | 新しいクライアント操作 4 つは `v.strictObject`。`room-state` の `estimate` は受信側で省略可の `v.object`（docs/poker/adr/0004） |
| V. 実画面検証 | 通過 | Task 7 で dev の 2 タブを並べて確かめる |
| VI. 依存は内向き | 通過 | 記録は poker-core の純関数。時刻はアプリ層が `WallClock` から渡す。poker-core は `@tasuki/protocol` 以外を引かない |
| VII. 検査は壊して確かめる | 通過 | 変異 m297〜m302 を足す（Task 8） |
| VIII. 記録が正本 | 通過 | 設計正本・ws-protocol 契約・data-model・ADR-0011 の分類表を更新する |
| IX. 小さく回す | 通過 | PR 1 本・タスクごとにコミット。配布は利用者の指示待ち |
| X. 抽象は実需で | 通過 | 新しい抽象は `estimate-log.ts` の純関数群だけ。呼び手は開票 2 経路と新しい操作 |
| XI. 秘密と個人情報を持ち込まない | 通過 | アイテム名を ADR-0011 の「個人に紐づく」の扱いに入れ、ログへ出さない（Task 3）。記録は参加者 ID・表示名を持たない |

**逸脱なし。**

## Global Constraints

- 記録は**誰が何を出したかを持たない**（参加者 ID も表示名も、記録の型・wire のどこにも入れない）
- アイテム名もポイントも**入力を求めない**（必須の検証・空欄への注意の表示を作らない）
- アイテム名: 前後の空白を削る。上限 `MAX_ESTIMATE_ITEM = 120`（UTF-16 の長さ。`v.maxLength` と同じ数え方）。Markdown として描かない
- 記録の上限: 行（開票）の総数 `MAX_ESTIMATE_ENTRIES = 100`。超えたら最も古い行から落とし、行が 0 になった束は消す。**束の ID は落ちても付け替えない**
- ポイントは `NUMBER_CARD_VALUES`（`0 1 2 3 5 8 13 21`）か `null`。同時に入れたら後に届いた方が勝つ
- 画面の文言（**すべて書体の base 層で実測済み・2026-10-17**）: `見積もりの記録`／`いま見積もっているもの`／`例: PROJ-123 ログイン画面`／`（名前なし）`／`N 回め`（数字の後に半角空白）／`見積もり中`／`ポイントなし`／`ポイント（任意）`／`ポイントを変える`／`次のアイテムへ`／`再投票`／`開票すると、ここに残ります`／`記録をすべて見る`／`閉じる`／`この見積もりはもう記録にありません`／`見積もり中のアイテムにはまだポイントを付けられません`。**「点」「目」「枚」「時刻」「上限」「無」「長」は base 層に無い。使わない**
- カードの枚数の表し方は `5×2`（カードの表記 ＋ `×` ＋ 枚数）。カードの表記は `Results` と同じ関数を使う
- wire に足す `room-state` の項目は受信側で省略可（`deploy.sh` は web を先に配る。設計 §6）
- 古いクライアントの `next-round` は**再投票として受ける**
- 作業は本体（`/workspaces/claym/local/Tasuki`）のブランチ `feature/poker-estimate-log`。**サブエージェントは push・merge をしない**
- 手元の変異検査は `node scripts/mutation-check.mjs --changed`（全件は CI）
- dev サーバーを起動したら、使い終わったら止める（`ss -tlnp` で確認）。dev の入口は <http://localhost:5175/> だけ

## Review Focus

- 再投票の間にアイテム名を書き換えた → 束は分かれず、束の見出しは最後の開票時点の名前になる（Task 1 のテスト「再投票の間の改名」）
- 記録が上限を超えたあとに、古い束のポイントを入れ直した → 消えた束なら `estimate-not-found`、残った束なら ID が変わらず当たる（Task 1 の「上限で落ちても ID は変わらない」と Task 3 の往復テスト）
- アイテム名を編集している最中に、他の人が名前を変えた → 打ちかけの字は消えない。確定したら自分の値が勝つ（Task 4 のテスト）
- 途中で抜けた人が出て自動公開が立った → その開票も 1 行として記録され、抜けた人の票は数えない（Task 3 の `handleLeave` 経由のテスト）
- 新しい画面が古いサーバーにつながった（`estimate` の無い `room-state`）→ 画面は壊れず、記録の欄は空のまま出る（Task 2 の受信テストと Task 5 の描画テスト）

## 検証の実行時間の見積もり

| 検証 | 見積もり | いつ |
|---|---|---|
| poker-core の vitest | 約 15 秒 | Task 1〜2 |
| tasuki-sync の bun test（`test/poker` だけ） | 約 30 秒 | Task 3 |
| tasuki-sync の bun test（全件） | 約 1〜2 分 | Task 3 の終わり |
| poker-web の vitest（全件） | 約 40 秒 | Task 4〜6 |
| `pnpm -r typecheck` | 約 1 分 | 各タスクの終わり |
| poker の E2E（`poker-estimate-log.spec.ts`・`poker.spec.ts`・`poker-a11y.spec.ts`・`layout.spec.ts` の poker の節） | 約 4〜5 分 | Task 7 |
| `node scripts/mutation-check.mjs --changed` | 約 5〜10 分 | Task 8 |
| 検査系（audit-*・check-links・scripts の自己テスト）と `pnpm test` | 約 3 分 | Task 8 |

全体を 1 巡すると約 15〜20 分。**実測が 2 倍を超えたら統括へ報告する。**

---

## ファイルの地図

**poker-core（`packages/poker-core`）**
- Create `src/estimate-log.ts` — 記録の型と純関数（開票を足す・束を閉じる・ポイントを入れる・上限で落とす・枚数を数える）
- Modify `src/round.ts` — `Round` に `item`・`log`。`revealBy`・`applyAutoReveal` に `now`。`nextRound` を `revote`・`nextItem` に置き換え、`setItem`・`setPoints` を足す
- Modify `src/error-messages.ts`・`src/protocol.ts`・`src/snapshot.ts`・`src/index.ts`
- Tests: Create `tests/estimate-log.test.ts`、Modify `tests/round.test.ts`・`tests/round.all-equal.test.ts`・`tests/snapshot.test.ts`、protocol のテスト（`grep -l parseClientMessage tests`）

**同期サーバー（`apps/tasuki-sync`）**
- Modify `src/application/poker-commit-room-action.ts`・`src/application/poker-handlers.ts`
- Tests: Create `test/poker/estimate-log.test.ts`、Modify `test/poker/next-round.test.ts`・`test/poker/commit-room-action.test.ts`

**画面（`apps/poker-web`）**
- Create `src/components/EstimateItemField.tsx`・`src/components/EstimateLog.tsx`・`src/estimate-copy.ts`（文言の定数）
- Modify `src/hooks/useSync.ts`・`src/pages/RoomPage.tsx`・`src/index.css`
- Tests: Create `tests/estimate-item-field.test.tsx`・`tests/estimate-log.test.tsx`・`tests/estimate-copy-fits-font-base.test.ts`、Modify `tests/room-page*.test.tsx`（`nextRound` を名指しするもの）

**E2E・文書・検査**
- Create `e2e/specs/poker-estimate-log.spec.ts`、Modify `e2e/specs/layout.spec.ts`（poker の節）・`e2e/specs/poker-a11y.spec.ts`・`e2e/specs/poker.spec.ts`
- Modify `docs/adr/0011-threat-model-and-data-classification.md`・`docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`・`docs/poker/specs/001-planning-poker-mvp/data-model.md`
- Modify `scripts/lib/mutation-declarations.mjs`、Create `scripts/mutations/m297〜m302-*.patch`

---

### Task 1: 記録のドメイン（poker-core）

**Files:**
- Create: `packages/poker-core/src/estimate-log.ts`
- Modify: `packages/poker-core/src/round.ts`、`packages/poker-core/src/error-messages.ts`
- Test: Create `packages/poker-core/tests/estimate-log.test.ts`、Modify `packages/poker-core/tests/round.test.ts`・`tests/round.all-equal.test.ts`

**Interfaces:**
- Produces（`estimate-log.ts`）:

```ts
export const MAX_ESTIMATE_ITEM = 120;
export const MAX_ESTIMATE_ENTRIES = 100;
export interface CardCount { card: Card; count: number }
export interface EstimateEntry { attempt: number; at: number; item: string; counts: CardCount[] }
export interface EstimateGroup { id: number; points: NumberCardValue | null; open: boolean; entries: EstimateEntry[] }
export interface EstimateLog { nextId: number; groups: EstimateGroup[] }   // groups は古い順
export const EMPTY_ESTIMATE_LOG: EstimateLog;                               // { nextId: 1, groups: [] }
export function countCards(cards: readonly Card[]): CardCount[];
export function recordReveal(log: EstimateLog, item: string, cards: readonly Card[], at: number): EstimateLog;
export function closeOpenGroup(log: EstimateLog, points: NumberCardValue | null): EstimateLog;
export function setGroupPoints(log: EstimateLog, id: number, points: NumberCardValue | null): Result<EstimateLog, EstimateLogError>;
export type EstimateLogError = { code: 'estimate-not-found' } | { code: 'estimate-open' };
```

- Produces（`round.ts`）:

```ts
export interface Round { status: 'voting' | 'revealed'; votes: Map<string, Card>; item: string; log: EstimateLog }
export type RoundError =
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'revote' | 'next-item' }
  | { code: 'estimate-not-found' } | { code: 'estimate-open' };
export function createRound(): Round;                         // item '' / EMPTY_ESTIMATE_LOG
export function revealBy(round: Round, _actorId: string, now: number): Result<Round, RoundError>;
export function applyAutoReveal(round: Round, voters: readonly VoterView[], now: number): Round;
export function revote(round: Round, _actorId: string): Result<Round, RoundError>;
export function nextItem(round: Round, _actorId: string, points: NumberCardValue | null): Result<Round, RoundError>;
export function setItem(round: Round, item: string): Round;    // 前後の空白を削る。長さは境界が見る
export function setPoints(round: Round, groupId: number, points: NumberCardValue | null): Result<Round, RoundError>;
// nextRound は消す
```

- [ ] **Step 1: `estimate-log.test.ts` に失敗するテストを書く**

既存のテストの書き方（Given / When / Then の題・`@requirements` の注記）に合わせる。題と判定:
- 「空の記録に開票を足す → 束が 1 つ（id 1・open・points null）、行が 1 つ（attempt 1・at・item）」
- 「open の束に開票を足す → 同じ束に attempt 2 が足される。nextId は 2 のまま」
- 「再投票の間の改名: item 'A' で開票 → item 'B' で開票 → 束は 1 つで、行の item は ['A','B']」
- 「閉じた束のあとに開票を足す → id 2 の新しい束が open で足され、前の束は open: false のまま」
- 「`closeOpenGroup(log, 5)` → 末尾の束が open: false・points 5。open の束が無ければ log をそのまま返す」
- 「`setGroupPoints` → 閉じた束は points が変わる／`null` で消える／存在しない id は `estimate-not-found`／open の束は `estimate-open`」
- 「上限で落ちても ID は変わらない: 101 回開票（毎回 closeOpenGroup して束を分ける）→ 行の総数は 100、最初の束（id 1）は消え、残った先頭の束の id は 2」
- 「1 つの束の中の行も上限で古い行から落ちる: 同じ束に 101 回 → 行は 100、attempt は 2〜101」
- 「`countCards` は匿名で、デッキの順に並ぶ: [8,5,?,5,☕] → [{5,2},{8,1},{?,1},{☕,1}]。デッキに無いカードは末尾」
- 「`recordReveal` の行は参加者を持たない: 行のキーは `attempt`・`at`・`item`・`counts` だけ（`Object.keys` で突く）」

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/poker-core exec vitest run tests/estimate-log.test.ts`
Expected: FAIL（`estimate-log.js` が無い）

- [ ] **Step 3: `estimate-log.ts` を書く**

`countCards` の並びは `FIBONACCI_DECK` の添字（`cardKey` で引く）。上限は「足したあと、総数が上限を超える間、先頭の束の先頭の行を落とし、空になった束を消す」。どの関数も入力を書き換えない（新しい配列を返す）。

- [ ] **Step 4: `round.test.ts` を書き換え、足す**

`nextRound` のテストは `revote` へ移す（`not-revealed` の `op` が `'revote'`）。足す題:
- 「`revealBy(round, id, 1000)` → revealed になり、log に at 1000・その時点の item・票の枚数の行が足される」
- 「`applyAutoReveal` で公開が立つ → 同じく 1 行足される。立たなければ log はそのまま（同じ参照）」
- 「`revote` → voting・票は空・item はそのまま・log の open の束はそのまま」
- 「`nextItem(round, id, 8)` → voting・票は空・item は ''・open の束が閉じて points 8」
- 「`nextItem(round, id, null)` → 束は閉じて points null」
- 「`revote`・`nextItem` は voting では `not-revealed`」
- 「`setItem(round, '  PROJ-1  ')` → item 'PROJ-1'。status・votes・log は変わらない」
- 「`setPoints` は `setGroupPoints` のエラーを `RoundError` として返す」
- `round.all-equal.test.ts` の `revealBy`・`applyAutoReveal` の呼び出しに `now` を足す

- [ ] **Step 5: `round.ts` と `error-messages.ts` を直す**

`revealBy`・`applyAutoReveal` は revealed へ移るときだけ `recordReveal(round.log, round.item, [...round.votes.values()], now)` を通す。`messageForRoundError` の新しい枝: `not-revealed` は今の文言 `票の公開後にのみ次のラウンドを開始できます` を両方の `op` に使う／`estimate-not-found` → `この見積もりはもう記録にありません`／`estimate-open` → `見積もり中のアイテムにはまだポイントを付けられません`。ファイル冒頭の「#165 PR-2 以前の文字列をそのまま保つ」は既存の 2 枝についての約束なので、新しい枝はその外だと注記する。

- [ ] **Step 6: 緑を確かめる**

Run: `pnpm --filter @tasuki/poker-core exec vitest run`
Expected: PASS（`index.ts` が `nextRound` を出していて型で落ちる場合は Task 2 で直すので、ここでは `index.ts` の `nextRound` を `revote, nextItem, setItem, setPoints` に置き換えるところまでを行う）

- [ ] **Step 7: コミット**

```bash
git add packages/poker-core
git commit -m "feat(poker-core): 開票ごとの記録をアイテムの束で持つ（#93）"
```

---

### Task 2: wire と snapshot（poker-core）

**Files:**
- Modify: `packages/poker-core/src/protocol.ts`・`src/snapshot.ts`・`src/index.ts`
- Test: protocol のテスト（`grep -l "parseClientMessage\|parseServerMessage" packages/poker-core/tests` で探す）、`tests/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Round`・`EstimateLog`・`MAX_ESTIMATE_ITEM`
- Produces（クライアント→サーバー。`ClientMessageSchema` に足す・すべて `v.strictObject`）:

```ts
{ type: 'set-item'; item: string }                          // v.pipe(v.string(), v.maxLength(MAX_ESTIMATE_ITEM))
{ type: 'revote' }
{ type: 'next-item'; points: NumberCardValue | null }       // v.nullable(v.picklist(NUMBER_CARD_VALUES))
{ type: 'set-points'; groupId: number; points: NumberCardValue | null }  // groupId は正の整数
// 'next-round' は残す（古いクライアント）
```

- Produces（`ERROR_CODES` に `'estimate-not-found'`・`'estimate-open'` を足す）
- Produces（`room-state` に足す。受信側は `v.optional`）:

```ts
estimate?: {
  item: string;
  log: Array<{ id: number; item: string; points: number | null; open: boolean;
               entries: Array<{ attempt: number; at: number; counts: Array<{ card: Card; count: number }> }> }>;
}
export type EstimateView = NonNullable<RoomStateMessage['estimate']>;
export type EstimateGroupView = EstimateView['log'][number];
```

束の `item` は**その束の最後の行の item**（設計 §4.4）。wire の束・行は**古い順**（画面が逆にする）。行の `item` は wire に載せない（見出しが持つ）。受信のスキーマでは `points` を `v.nullable(v.number())`、`counts[].card` は既存の `CardSchema` を使う。

- [ ] **Step 1: 失敗するテストを書く**

- protocol: 「`set-item` は 120 字まで通り、121 字は `invalid-message` 相当の失敗」「`next-item` の points は 5 と null を通し、4 と '5' を落とす」「`set-points` は groupId 0・1.5 を落とす」「未知のキーを足した `revote` は落ちる（strictObject）」
- protocol（受信）: 「`estimate` の無い `room-state` を通す」「`estimate` に未知のキーが乗っても通る」「`error` の code `estimate-not-found` は `isKnownErrorCode` が真」
- snapshot: 「`createSnapshotBuilder` の出力の `estimate.item` が `round.item`、`estimate.log` の束の item が最後の行の item、行に item も参加者 ID も無い」「投票中でも記録は全員に同じ内容で出る（viewer を変えても `estimate` は等しい）」

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/poker-core exec vitest run`
Expected: FAIL（新しい種別・項目が無い）

- [ ] **Step 3: `protocol.ts`・`snapshot.ts`・`index.ts` を直す**

`index.ts` から出すのはパッケージの外で使うものだけ（同期サーバーが使う: `revote`・`nextItem`・`setItem`・`setPoints`。画面が使う型: `EstimateView`・`EstimateGroupView`。画面が使う値: `MAX_ESTIMATE_ITEM`・`NUMBER_CARD_VALUES` が既に外へ出ていなければ足す）。SC-039③ に掛かるので、外で使わない記号は出さない。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/poker-core exec vitest run && pnpm --filter @tasuki/poker-core typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/poker-core
git commit -m "feat(poker-core): 記録の操作と room-state の estimate を wire に足す（#93）"
```

---

### Task 3: 同期サーバーの配線とデータ分類

**Files:**
- Modify: `apps/tasuki-sync/src/application/poker-commit-room-action.ts`・`apps/tasuki-sync/src/application/poker-handlers.ts`（`applyAutoReveal` の 3 か所: 374・654 行付近と `commit-room-action` の中）
- Modify: `docs/adr/0011-threat-model-and-data-classification.md`（分類表の「個人に紐づく」の該当欄と末尾の改定節）
- Test: Create `apps/tasuki-sync/test/poker/estimate-log.test.ts`、Modify `test/poker/next-round.test.ts`・`test/poker/commit-room-action.test.ts`

**Interfaces:**
- Consumes: Task 1・2 の関数と wire
- Produces: `CommitRoomActionDeps` に `now: () => number`（`PokerHandlerDeps.wallClock.now` を渡す）

- [ ] **Step 1: 失敗するテストを書く**（`test/poker/helpers.ts` の作り方に合わせる。壁時計は偽物で固定値）

- 「2 人が投票し自動公開 → 両方の `room-state.estimate.log` に束 1・行 1（at は偽の壁時計の値・counts）」
- 「`set-item` → 全員の `estimate.item` が変わる。投票中でも開票後でも受ける」
- 「`revote` → 投票中に戻り、item は残り、次の開票は同じ束の attempt 2」
- 「`next-item`（points 5）→ item は ''、束は閉じて points 5。次の開票は新しい束」
- 「`set-points` → 閉じた束が変わる／open の束は error `estimate-open`／無い id は error `estimate-not-found`。どちらも状態は変わらない」
- 「古いクライアントの `next-round` → `revote` と同じ結果（item が残り、同じ束が続く）」
- 「投票した人が退出して自動公開が立つ（`handleLeave` の経路）→ その開票も 1 行、抜けた人の票は数えない」
- 「記録はどの `room-state` にも参加者 ID・表示名を含まない: 送られたフレームの `estimate` を `JSON.stringify` し、両参加者の id と name が部分文字列として出ない」
- `next-round.test.ts` は「`next-round` が再投票になる」ことの検証へ直す

- [ ] **Step 2: 赤を確かめる**

Run: `cd apps/tasuki-sync && bun test test/poker`
Expected: FAIL

- [ ] **Step 3: 配線する**

`createDispatch` に 4 つの枝を足し、`next-round` を `revote` へ向ける。`reveal` の枝と `commitRoomAction` の中の `applyAutoReveal`、`poker-handlers.ts` の 2 か所の `applyAutoReveal` に `now()` を渡す。`set-item` は `(round) => ok(setItem(round, msg.item))` の形で `commitRoomAction` を通す（not-joined の検査と配信を共有する）。**ログを足さない**（アイテム名を出す経路を作らない）。

- [ ] **Step 4: ADR-0011 の分類表を直す**

「個人に紐づく」の該当欄に「**poker のアイテム名**（バックログの題を含みうる。個人を識別する値ではないが、決定1 の『当てはまらない値は厳しい側』により同じ扱い。#93・2026-10-17）」を足し、末尾の改定節に 1 項を足す。ステータス行の改訂の列挙にも #93 を足す。

- [ ] **Step 5: 緑を確かめる**

Run: `cd apps/tasuki-sync && bun test && cd ../.. && node scripts/audit-log-hygiene.mjs && pnpm -r typecheck`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add apps/tasuki-sync docs/adr/0011-threat-model-and-data-classification.md
git commit -m "feat(sync): 記録の操作を受け、開票の時刻を壁時計から渡す（#93）"
```

---

### Task 4: 画面の操作とアイテム名の欄（poker-web）

**Files:**
- Create: `apps/poker-web/src/estimate-copy.ts`・`apps/poker-web/src/components/EstimateItemField.tsx`
- Modify: `apps/poker-web/src/hooks/useSync.ts`
- Test: Create `apps/poker-web/tests/estimate-item-field.test.tsx`・`apps/poker-web/tests/estimate-copy-fits-font-base.test.ts`

**Interfaces:**
- Consumes: Task 2 の wire・`MAX_ESTIMATE_ITEM`
- Produces（`PokerSync` から `nextRound` を消し、足す）:

```ts
setItem: (item: string) => void;
revote: () => void;
nextItem: (points: NumberCardValue | null) => void;
setPoints: (groupId: number, points: NumberCardValue | null) => void;
```

- Produces（`estimate-copy.ts`）: Global Constraints の文言をすべて名前つきの定数で持つ（`ESTIMATE_LOG_HEADING`・`ESTIMATE_ITEM_LABEL`・`ESTIMATE_ITEM_PLACEHOLDER`・`ESTIMATE_UNNAMED`・`ESTIMATE_OPEN`・`ESTIMATE_NO_POINTS`・`ESTIMATE_POINTS_LABEL`・`ESTIMATE_CHANGE_POINTS`・`NEXT_ITEM`・`REVOTE`・`ESTIMATE_LOG_EMPTY`・`ESTIMATE_LOG_SHOW_ALL`、`attemptLabel(n: number): string` → `` `${n} 回め` ``）。サーバーのエラー文言 2 つは `poker-core` の `messageForRoundError` が持つので、ここには持たない
- Produces: `<EstimateItemField item={string} onCommit={(item: string) => void} disabled={boolean} />`

- [ ] **Step 1: 失敗するテストを書く**

- 文言: 「`estimate-copy.ts` の全定数と `attemptLabel(2)`、`messageForRoundError` の新しい 2 文言が base 層に収まる」（`tests/support/font-base.ts` の `outsideBase` を使い、`[]` を期待。`topic-copy-fits-font-base.test.ts` と同じ形）
- 欄: 「item '' → `（名前なし）` を出し、入力を促す表示（`aria-invalid`・`required`）が無い」「押すと入力になり、`maxLength` は 120」「Enter で `onCommit('PROJ-1')` が 1 回」「フォーカスが外れても確定」「Escape で元に戻り `onCommit` は呼ばれない」「値が変わらなければ確定しても呼ばない」「**編集中に `item` の props が変わっても打ちかけの値は消えない**」

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run tests/estimate-item-field.test.tsx tests/estimate-copy-fits-font-base.test.ts`
Expected: FAIL

- [ ] **Step 3: 書く**

欄の見た目は「題」（ボタン）で、押すと `<input>` に替わる（設計 §4.1）。ラベル `いま見積もっているもの` は見える形で出す。`useSync.ts` は 4 操作を `send` に流す。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run`
Expected: `nextRound` を名指しする既存テスト（`room-page*.test.tsx`）が型か実行で落ちる → Task 5 で直すので、ここでは新しいテストが緑であることだけを確かめる

- [ ] **Step 5: コミット**

```bash
git add apps/poker-web
git commit -m "feat(poker-web): アイテム名の欄と記録の操作を足す（#93）"
```

---

### Task 5: 記録の欄と開票後の 2 操作（poker-web）

**Files:**
- Create: `apps/poker-web/src/components/EstimateLog.tsx`
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`（`RevealedSection`・`VotingSection`）
- Test: Create `apps/poker-web/tests/estimate-log.test.tsx`、Modify `tests/room-page*.test.tsx`・`tests/room-page.all-equal.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `EstimateGroupView`、Task 4 の文言と `PokerSync`
- Produces: `<EstimateLog groups={EstimateGroupView[]} onSetPoints={(id: number, p: NumberCardValue | null) => void} disabled={boolean} limit?: number />`（`limit` は新しい束から数えて出す数。省略で全部）

- [ ] **Step 1: 失敗するテストを書く**

- 「束が 0 → 見出し `見積もりの記録` と `開票すると、ここに残ります`」
- 「束は新しい順、束の中の行も新しい順（wire の古い順を逆にする）」
- 「open の束は `見積もり中`、ポイントの選択を出さない」
- 「閉じた束: points 5 → `5` を見出しの右に出す。null → `ポイントなし`」
- 「閉じた束のポイントの選択（`ポイントを変える` の名前を持つ `<select>`。選択肢は空と 0 1 2 3 5 8 13 21）で 8 を選ぶ → `onSetPoints(id, 8)`、空を選ぶ → `onSetPoints(id, null)`」
- 「行は `2 回め`・時刻（`HH:MM`・端末の時間帯）・`5×4` の形。item の空の束は `（名前なし）`」
- 「`limit={3}` で 5 束 → 新しい 3 束だけ出る」
- 「束は `<ol>`、記録の領域は見出しで名前を持つ（`aria-labelledby`。2 つ描いても id が衝突しないよう `useId`）」
- RoomPage: 「開票後に `再投票`（主・最後）と `次のアイテムへ`（副）と `ポイント（任意）` の選択が出る」「`再投票` → `revote` が 1 回」「ポイント 5 を選んで `次のアイテムへ` → `nextItem(5)`、選ばずに → `nextItem(null)`」「投票中は手札の上にアイテム名の欄、開票後も欄は出る」「`estimate` の無い snapshot（古いサーバー）でも描ける（記録は空の表示）」
- 既存の `nextRound` を名指しするテストは `revote`／`nextItem` へ直す（ラベルで押し分けているものは押した方の操作へ）

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run`
Expected: FAIL

- [ ] **Step 3: 書く**

カードの表記は `Results.tsx` が使っている関数を使う（無ければ `Results.tsx` から取り出して両方で使う）。時刻は `Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' })`。ポイントの選択は開票後の帯（`.ui-actions--dock`）の中で `次のアイテムへ` の直前に置く（主の操作 `再投票` を最後に置く今の規則を保つ）。`次のアイテムへ` を押したら選択を空へ戻す。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run && pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/poker-web
git commit -m "feat(poker-web): 記録の欄と、再投票・次のアイテムへの 2 操作を出す（#93）"
```

---

### Task 6: 段組み（脇を常に出し、お題の札だけを畳む）

**Files:**
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`（`ui-workspace` の中）・`apps/poker-web/src/index.css`（`.room-main`・`.room-topic-side` の規則・46rem の規則）
- Test: Modify `apps/poker-web/tests/current-topic.test.tsx`・`tests/room-page*.test.tsx`（脇の有無を見ているもの）

**Interfaces:**
- Consumes: Task 5 の `EstimateLog`
- Produces（DOM。E2E が使う）: 脇は常に `.room-side`（`ui-workspace-side`）。その中に お題の札の包み `.room-topic-side`（`data-state="open|closed"`・閉じたら `inert`。お題が無ければ描かない）と `.room-log--side`（`EstimateLog`・limit 無し）。操作の面 `.room-main` の最後の節の後に `.room-log--foot`（`EstimateLog`・`limit={3}`・`記録をすべて見る` で `.ui-drawer` のシートに全部）

- [ ] **Step 1: 失敗するテストを書く**

- 「お題が無くても `.room-side` と記録が描かれる」
- 「`お題を隠す` → `.room-topic-side` が `data-state="closed"`・`inert`、記録は inert でない」
- 「`.room-log--foot` に `記録をすべて見る` があり、押すとシート（`dialog`）が開いて全部の束が出る。`閉じる` でボタンへフォーカスが戻る（`useReaderDrawer`）」

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run`
Expected: FAIL

- [ ] **Step 3: 書く**

CSS の要点（値は決めてある。書き方は任せる）:
- 64rem 以上: 列は常に `minmax(0, 0.75fr) minmax(0, 1fr)`。**46rem の中央寄せの規則と、脇の列を幅 0 へ移り変わらせる規則は消す**（設計 §5.1）。`.room-log--foot` は描かない（`display: none`）
- 脇の中は縦の並び。閉じた札は高さ 0・`visibility: hidden`（不透明度の移り変わりは残してよい。`prefers-reduced-motion` で遅延 0）。記録は脇の残りの高さでスクロールする（`overflow: auto`）。脇の高さの上限は今の `100dvh` の考え方を保つ
- 64rem 未満: `.room-log--side` は描かない、`.room-log--foot` を出す。閉じた札は今どおり `display: none`
- 記録の地はお題と同じ読む面（`.ui-reader` の札）。生の色を書かない（トークンだけ）。時刻は札の上の `--coal-soft`、ポイントは一番強く
- 消した規則を名指ししているコメント（`#348 D7〜D9` を引く行）は、今の振る舞いに合わせて直す。`grep -n "46rem" apps/poker-web/src` が 0 件になること

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/poker-web exec vitest run && pnpm --filter @tasuki/poker-web build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/poker-web
git commit -m "feat(poker-web): 脇に記録を常に置き、お題を隠すときは札だけを畳む（#93）"
```

---

### Task 7: E2E と実画面

**Files:**
- Create: `e2e/specs/poker-estimate-log.spec.ts`
- Modify: `e2e/specs/layout.spec.ts`（`poker のルームは広い画面で読む面と操作の面を並べる` の節）・`e2e/specs/poker-a11y.spec.ts`・`e2e/specs/poker.spec.ts`（`次のラウンドへ` を押すもの）

- [ ] **Step 1: E2E を書く**（新しいタグは足さない。既存の `openPeer`・`joinRoom`・`chooseCard` の作法に従う）

- `poker-estimate-log.spec.ts`: 「Given 2 人のルーム / When アイテム名を入れ、割れて再投票し、そろって 5 を選んで次のアイテムへ、名前なしでもう 1 件開票する / Then 両方の画面の記録に、新しい順で `（名前なし）`（見積もり中）と `PROJ-120`（5・2 回め と 1 回め）が出る」
- 同じファイル: 「Given 閉じた束 / When 2 人目が記録の欄でポイントを 8 に変える / Then 1 人目の画面も 8 になる」
- 同じファイル: 「Given 記録が 1 件ある / When 3 人目が後から入る / Then 同じ記録が見える」
- `layout.spec.ts`: 「お題が無い → 脇が無く 46rem で中央」のテストを「お題が無い → 脇に記録があり、操作の面は右の列」へ書き換える。「お題を隠す → 脇が幅 0」のテスト（425 行付近）を「お題を隠す → 札だけが畳まれ、記録の上端が脇の上端に寄り、操作の面の幅は変わらない」へ書き換える。64rem 未満の 46rem の判定（490〜510 行付近）は「記録は手札・結果より下にある」へ書き換える
- `poker-a11y.spec.ts`: 記録に束が 2 つ（閉じた束と open の束）ある状態で `scanContrast` を通す。動きを抑える設定で `.room-topic-side` の遅延が 0 のテスト（77 行付近）は、閉じた札が「幅 0」ではなく「高さ 0・hidden」になることへ直す

- [ ] **Step 2: 流す**

Run: `cd e2e && pnpm e2e poker-estimate-log poker.spec poker-a11y layout`
Expected: PASS

- [ ] **Step 3: 実画面で確かめる**（dev を背景で起動し、<http://localhost:5175/> の 2 タブ）

幅 1280 と 390 で: 3 件を続けて見積もる（割れる → 再投票 → 次のアイテムへ）／お題を掲げて隠す／記録のポイントを入れ直す。**開票の瞬間に操作の面が跳ばないこと**と、10 束ほど積んだときに手札が押し出されないことを目で見る。スクリーンショットを統括に渡す。終わったら dev を止める（`ss -tlnp` で 5173〜5175 と同期のポートが空いていること）

- [ ] **Step 4: コミット**

```bash
git add e2e
git commit -m "test(e2e): 記録が両方の画面で同じ束に積まれ、ポイントを入れ直せることを確かめる（#93）"
```

---

### Task 8: 変異検査・文書・検査系

**Files:**
- Modify: `scripts/lib/mutation-declarations.mjs`、Create `scripts/mutations/m297-*.patch`〜`m302-*.patch`
- Modify: `docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md`・`docs/poker/specs/001-planning-poker-mvp/data-model.md`

- [ ] **Step 1: 既存の変異のパッチが当たるかを確かめる**

Run: `node scripts/mutation-check.mjs --changed`
Expected: すべて殺された。`round.ts`・`poker-commit-room-action.ts`・`RoomPage.tsx`・`index.css` の行が動いて当たらないパッチは、意図を変えずに今のコードへ合わせて書き直す

- [ ] **Step 2: 新しい変異を足す**（ID は着手時に `ls scripts/mutations | sort -V | tail -1` で main の最大を見て、その次から振る。並列の作業と衝突したら改番はパッチの中身まで）

| ID | 壊し方 | 殺すテスト |
|---|---|---|
| m297 | `recordReveal` が閉じた束のあとでも末尾の束に行を足す | `estimate-log.test.ts` の「閉じた束のあとに開票を足す」 |
| m298 | 上限で落とすときに束の ID を振り直す | `estimate-log.test.ts` の「上限で落ちても ID は変わらない」 |
| m299 | `applyAutoReveal` が記録を足さない | `round.test.ts` の自動公開の行 |
| m300 | `revote` が item を空にする | `round.test.ts` の `revote` と sync の `revote` |
| m301 | dispatch の `next-round` を `nextItem(null)` へ向ける | sync の「古いクライアントの `next-round`」 |
| m302 | `EstimateItemField` が編集中に props の item で打ちかけを上書きする | `estimate-item-field.test.tsx` の編集中のテスト |

各変異について `node scripts/mutation-check.mjs --id <ID>` で、当てると赤・戻すと緑を確かめる。

- [ ] **Step 3: 文書を直す**

- `contracts/ws-protocol.md`: 4 つの新しい操作・2 つのエラーコード・`room-state.estimate`・`next-round` を再投票として受けることを足す
- `data-model.md`: `Round` の状態機械に `item`・`log` と、`revote`／`next-item` の 2 つの遷移を足す
- 設計正本の §6 の「`next-round` を受けたときの扱い」を決定済みの形（再投票として受ける）へ直し、§3・§4 の画面の語を実測で決めた文言（「点数」→「ポイント」、「何回目」→「N 回め」）へ揃える
- `grep -rn "next-round\|nextRound" docs/poker docs/guides --include='*.md'` で、現況を述べている文だけを直す（過去の設計書・計画書は当時の記録なので直さない）

- [ ] **Step 4: 検査系を流す**

Run（並べて）:
- `node scripts/audit-structure.mjs`
- `node scripts/audit-log-hygiene.mjs`
- `node scripts/audit-dependency-direction.mjs`
- `node scripts/audit-domain-error-shape.mjs`
- `node scripts/audit-domain-side-effects.mjs`
- `node scripts/check-links.mjs`
- `bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'`
- `pnpm test`

Expected: すべて緑。SC-039③ で新しい export が引っかかったら、パッケージの外で使っていない記号の `export` を外す

- [ ] **Step 5: コミット**

```bash
git add scripts docs
git commit -m "docs: 記録の契約を ws-protocol と data-model に足し、変異 m297〜m302 で守る（#93）"
```

---

## PR の出し方（統括が行う）

1. 統括が `git push` し、PR を作る（タイトル: `feat: poker に見積もりの記録を足す（#93）`）。本文には `Closes #93` を地の文で 1 回だけ書く（バッククォートで囲まない）
2. `/code-review <PR 番号>` を流す
3. Issue #93 の本文を、設計正本の決定（§8 の対応表）に合わせて書き直す文案を利用者に見せ、承認を得てから更新する
4. 配布は利用者の指示を待つ

**この計画に入れないもの**: roadmap の申し送り「poker の幽霊の片付けと同名の呼び分け（`participant-label.ts` を共有パッケージへ）」。記録とは触る場所が違い、差分を大きくするので、本 PR のマージ後に #93 を参照する別の PR で行う（統括の判断）。

## 完了条件

- [ ] 開票ごとに、時刻・何回め・アイテム名・カードの枚数が記録に積まれ、全員の画面の脇に同じ内容で出る（Task 1〜6）
- [ ] アイテム名・ポイントは入れなくても今までどおり使える（Task 4・5）
- [ ] 再投票は同じ束を続け、次のアイテムへは束を閉じてポイントを任意で添える（Task 1・3・5）
- [ ] 閉じた束のポイントは誰でも入れ直せる（Task 1・3・5・7）
- [ ] 記録は誰が何を出したかを持たない（Task 1・2・3 のテスト）
- [ ] お題を隠すと札だけが畳まれ、記録は残る（Task 6・7）
- [ ] DoD（`docs/guides/definition-of-done.md`）の各項目を満たす（テスト・変異・E2E・実画面・文書）
