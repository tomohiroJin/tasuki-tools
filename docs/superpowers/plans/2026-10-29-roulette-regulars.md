# ルーレットの「いつものメンツ」（#458）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 名前をつけた「いつものメンツ」を端末に複数保存し、一手でまとめてルーレットに入れられるようにする。足した名前の上限を 24 に上げ、入る人が 24 を超えたら回す前に知らせる。

**Architecture:** 中核（`packages/roulette-core`）に全域関数 `addGuests` を足し、同期サーバーの新しいコマンド `roulette.guest.addMany` と画面の知らせが同じ関数で「足す・とばす・入らない」を決める。組は roulette-web の `storage/regulars.ts` が localStorage に版つきで持ち、サーバーへは送らない。画面は「ルーレットに入る人」の面の末尾に区画を足す。

**Tech Stack:** TypeScript（strict）・neverthrow・valibot・React 19・vitest＋jsdom＋Testing Library（roulette-core・roulette-web）・bun test（同期サーバー）・Playwright（E2E）

**Spec:** [`docs/superpowers/specs/2026-10-29-roulette-regulars-design.md`](../specs/2026-10-29-roulette-regulars-design.md)（以下「設計」）と画面の提案 [`2026-10-29-roulette-regulars-screen.md`](../specs/2026-10-29-roulette-regulars-screen.md)（以下「画面案」）。**設計 §6 が画面案より優先する**。実装者は両方と本計画を読むこと。

- **日付**: 2026-10-29・**実測時点**: main `5f9a1ce2`
- **枝**: `feature/458-roulette-regulars`（worktree `/workspaces/claym/local/Tasuki-wt-458`）。並行用の 2 本目の worktree `/workspaces/claym/local/Tasuki-wt-458b`（枝 `wip/458-b`・統括が合流させて消す）。PR は 1 本
- **実装役**: Task 1〜5・7 は **Sonnet**。Task 6（変異）は **Opus**。タスクごとのレビューは Opus。仕上げは統括

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクは赤いテストから始める。Task 6 で変異により試験の検出力を見る |
| II. 技術選定は ADR を通す | 通過 | 新しい依存なし。ADR 0026 に追記（コマンド・同名の扱い・上限）・ADR 0011 S7 の値とデータ分類を直す（Task 7） |
| III. 揮発インメモリと単純運用 | 通過 | サーバーの状態の持ち方は変えない。組は端末の localStorage だけ（サーバーに保存しない・利用者の方針「保存は作らない」はサーバーの保存のこと） |
| IV. 境界の型安全 | 通過 | 新しいコマンドは `v.strictObject`・配列は 1〜24 件で縛る。端末の保存は読むたびに検証し、合わない項目は捨てずに一覧から外す |
| V. 実画面検証 | 通過 | 1 人で開いたルームに 2 組を作り・入れ・直し・消す。25 人になる場面・同名の参加者がいる場面を 1280px と 360px で撮る（統括） |
| VI. 依存は内向き | 通過 | `roulette-core` は `room-core` に依存しないまま（同名の判定は引数）。保存は roulette-web の中 |
| VII. 検査は壊して確かめる | 通過 | 変異 560〜571 を足す（Task 6）。触ったファイルの既存パッチを当て直す |
| VIII. 記録が正本 | 通過 | ADR 0026・0011 に決定の時制で追記。配布の順を roulette-web の NOTES に |
| IX. 小さく回す | 通過 | PR 1 本。配布は同期サーバー → roulette-web の順で、利用者の指示を待つ |
| X. 抽象は実需で | 通過 | 組の保存は roulette だけ（他の道具へ広げない）。共通の保存部品は作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | 組の名前は端末にだけ置き、ログへ出さない。消せる操作を必須にした。試験の名前は架空 |

**逸脱なし。**

## Global Constraints

- 上限の値の正本は `packages/roulette-core/src/limits.ts`。`MAX_GUESTS = 24`・`MAX_WHEEL = 24`（変えない）。保存の上限 `MAX_GROUPS = 10` は `apps/roulette-web/src/storage/regulars.ts`。**文言に数を直書きしない**（定数から組む）
- 画面の文言は**すべて `apps/roulette-web/src/copy.ts`** に置き、画面案 §3 の文をそのまま使う（書体の base 層に収まることを確かめ済み。字を変えるなら `copy-fits-font-base.test.ts` が通ること）
- 生の色を書かない。CSS は画面案 §4 のトークンだけ。組の名前の字の太さは 500（700 にしない）
- 新しいエラーコードを足さない。wire の配るフレームは変えない
- 試験は `describe`・`it` を日本語で書き、**試験の名前に Issue 番号を入れない**（`@requirements #458` の注記はよい）
- 新しい依存を足さない。**`pnpm install` は打たない**。`pnpm` が見つからなければ `corepack pnpm`
- コミットは `git add <パス>` で自分の変えたファイルだけ（`git add -A`・`.` をしない）。末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（Opus のタスクは `Claude Opus 5.5`）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない。メッセージは英語の type ＋日本語（例 `feat(roulette-core): …（#458）`）
- **サブエージェントは push・PR 作成・マージ・Issue 起票をしない。プロセスを止めない（`kill`・`pkill` をしない）。dev サーバー・E2E・Playwright を起動しない。ブランチを切り替えない（`git checkout`・`switch`・`stash`・`reset`・`restore` をしない）。自分の worktree の外は読むだけ（`/workspaces/claym/local/Tasuki` 本体と、もう 1 本の worktree に書かない）**

## Review Focus

設計が求めているのに、素のテストでは突かない入力のうち、使う人に効きそうなもの（効く順）。各行のテストは担当のタスクに足してある。

1. **ファシリテーター自身の名前が組に入っている**（1 人で開いたルームで自分の名前を含む組を入れる）→ 自分は飛ばし、残りを足す。束全体を拒まない（Task 1・2・m561）
2. **離席中の参加者と同じ名前**（名簿にいるが在室でない）→ 飛ばす（`addGuest` と同じ相手と比べる）。在室者だけと比べると、戻ってきたときに同じ人が 2 席になる（Task 1・m562）
3. **組の中で表記だけ違う同じ名前**（`alice` と `ＡＬＩＣＥ`）→ 保存のときに 1 つに畳み、束でも 2 人目を飛ばす（Task 1・3）
4. **ゲスト 20 人の後に 8 人の組を入れる** → 4 人を足し 4 人は入らない。入らない人を「とばした」と数えない（Task 1・4・m563）
5. **localStorage が壊れている・保存禁止の端末** → 画面は出て組は 0 件、保存を押すと失敗を知らせ、壊れた中身を上書きしない（Task 3・m567）
6. **自分＋24 人の組で入る人が 25 人** → 回すボタンが押せず、一言が「チェックを外して」を言う（3 つの決め方とも）（Task 4・m565）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/roulette-core test` | Task 1・6 | 20 秒 | 6 | 2 分 |
| `pnpm --filter @tasuki/sync test -- test/roulette-handlers.test.ts` | Task 2・6 | 30 秒 | 5 | 3 分 |
| `pnpm --filter @tasuki/roulette-web test`（ファイルを絞って） | Task 3〜6 | 20〜40 秒 | 20 | 12 分 |
| `pnpm --filter @tasuki/roulette-web test`（全件） | Task 4・5 の終わり | 1〜2 分 | 3 | 6 分 |
| 各パッケージの `typecheck`・`lint` | Task 1〜5 | 30 秒 | 10 | 5 分 |
| 変異を 1 本ずつ当てて赤を見る（新しい 12 本） | Task 6 | 1 分 | 12 | 12 分 |
| 既存のパッチの `git apply --check`（約 40 本） | Task 1〜6 | 数秒 | 40 | 3 分 |
| `pnpm test --force`＋scripts の自己テスト＋全 audit・typecheck・lint | 統括・PR の前 | 10〜15 分 | 1〜2 | 25 分 |
| 変異の `--changed` | 統括 | 宣言を足すので全件に倒れる → CI に任せる（約 11 分） | 1 | CI 11 分 |
| E2E 全件 | 統括 | 25〜40 分 | 1 | 40 分 |
| 撮影（5 場面 × 2 幅）と実画面の操作 | 統括 | 40 分 | 1 | 40 分 |
| **合計の見込み** | | | | **約 2.5 時間**（うち統括の直列 1.8 時間） |

## 取り決め

- 各タスクは**テストファースト**: 赤いテストを書き、赤を見てから実装し、緑にする。今の実装でも緑になる試験（境目の反対側など）は、そう報告して残す
- **既存の変異が当たらなくなる恐れ**: 触ったファイルを名指しするパッチを `grep -l '<パス>' scripts/mutations/*.patch` で探し、タスクの終わりに `git apply --check` で 1 本ずつ確かめる。当たらなければ**パッチの文脈の行だけ**を今のファイルに合わせて直す（番号・壊し方は変えない）。直したら当てて対象の試験が赤く、`git apply -R` で戻ることを見る。対象の試験は `scripts/lib/mutation-declarations.mjs` のそのパッチの宣言の `pkg`・`tests`
- `node scripts/mutation-check.mjs` は打たない（全件に倒れて数時間かかる）
- 実行してよいのは `pnpm --filter <パッケージ> test|typecheck|lint`・`node scripts/check-links.mjs`・`git` の add・commit・diff・log・show・apply・status だけ。コマンドは 1 つずつ・各 5 分以内

## 並べ方（統括が回す）

| 段 | worktree `-wt-458`（本線） | worktree `-wt-458b`（並行） |
|---|---|---|
| A | Task 1（中核） | Task 7a（ADR と NOTES。決定は設計で固まっている） |
| B | Task 2（同期サーバー） | Task 3（端末の保存。Task 1 を合流させてから） |
| C | Task 4（画面の導出と文言。B を合流させてから） | — |
| D | Task 5（区画の部品と画面への組み込み） | — |
| E | Task 6（変異・Opus） | Task 7b（E2E のボタンの測り。D を合流させてから） |

段の終わりに統括が `-wt-458b` のコミットを本線へ `git cherry-pick` し、次の段の前に `-wt-458b` を本線に合わせる（`-wt-458b` の中で統括が `git reset --hard feature/458-roulette-regulars`。サブエージェントはしない）。同じ段の 2 人は同じファイルを触らない（下の地図）。

## ファイルの地図

| 層 | 変える | 作る | 担当 |
|---|---|---|---|
| `packages/roulette-core` | `src/limits.ts`・`src/roulette.ts`・`src/schemas.ts`・`src/index.ts`・`tests/limits.test.ts`・`tests/roulette.test.ts`・`tests/schemas.test.ts`（無ければ作る）・`tests/error-messages.test.ts` | `tests/roulette-guest-batch.test.ts` | Task 1 |
| `apps/tasuki-sync` | `src/application/roulette-handlers.ts`・`test/roulette-handlers.test.ts` | — | Task 2 |
| `apps/roulette-web`（保存） | — | `src/storage/regulars.ts`・`tests/regulars-storage.test.ts` | Task 3 |
| `apps/roulette-web`（導出） | `src/roulette-view.ts`・`src/press-view.ts`・`src/copy.ts`・`src/hooks/use-roulette-sync.ts`・`tests/roulette-view.test.ts`・`tests/press-view.test.ts`・`tests/turn-order-view.test.ts`・`tests/use-roulette-sync.test.tsx` | `src/regulars-view.ts`・`tests/regulars-view.test.ts` | Task 4 |
| `apps/roulette-web`（部品） | `src/components/PeoplePanel.tsx`・`src/screens/RouletteRoom.tsx`・`src/index.css` | `src/components/RegularsSection.tsx`・`src/hooks/use-regulars.ts`・`tests/regulars-section.test.tsx` | Task 5 |
| 検査 | `scripts/lib/mutation-declarations.mjs`・当たらなくなった既存パッチ | `scripts/mutations/m560〜m571-*.patch` | Task 6 |
| 文書・E2E | `docs/adr/0026-facilitator-roulette.md`・`docs/adr/0011-threat-model-and-data-classification.md`・`apps/roulette-web/NOTES.md`（無ければ README）・`e2e/specs/buttons.spec.ts` | — | Task 7 |

---

### Task 1: 中核の `addGuests`・上限 24・コマンドの境界（Sonnet・本線）

**Files:** 上の地図の `packages/roulette-core`

**Interfaces:**
- Produces（`@tasuki/roulette-core` から公開）:
  - `addGuests(state: RouletteState, names: readonly string[], members: readonly Member[], conflicts: NameConflict): GuestBatch`
  - `interface GuestBatch { state: RouletteState; added: string[]; skipped: string[]; overflow: string[] }`
  - `MAX_GUESTS`（24）・`MAX_WHEEL`（24）を公開に足す（`index.ts` の #365 の注記を「#458 で画面が使うので載せる」に直す）
  - `RouletteCommand` に `{ command: "roulette.guest.addMany"; names: string[] }`

- [ ] **Step 1: 赤いテスト**
  - `limits.test.ts`: `expect(MAX_GUESTS).toBe(24)`
  - `error-messages.test.ts`: `TOO_MANY_GUESTS` の期待を `"名前は 24 人まで追加できます"` に
  - 新しい `tests/roulette-guest-batch.test.ts`（`describe("addGuests")`、同名の判定は `room-core` の `conflictsWithExisting` を渡す。既存の `roulette.test.ts` の土台に倣う）:
    - 「名前を渡した順に足し、ID を g-1 から採番する」: 空の状態に `["佐藤","鈴木"]` → `added` が `["佐藤","鈴木"]`・`state.guests` が `[{id:"g-1",name:"佐藤"},{id:"g-2",name:"鈴木"}]`・`nextGuestSeq` が 3・`skipped`・`overflow` が `[]`
    - 「在室の参加者と同じ名前は飛ばし、残りを足す」: members `[{id:"p1",name:"tomo",present:true}]`、names `["tomo","佐藤"]` → `skipped` `["tomo"]`・`added` `["佐藤"]`
    - 「在室していない名簿の参加者と同じ名前も飛ばす」: members `[{id:"p1",name:"tomo",present:false}]` → `skipped` `["tomo"]`
    - 「既存のゲストと、束の中で表記だけ違う同じ名前を飛ばす」: guests に `佐藤`、names `["佐藤","alice","ＡＬＩＣＥ"]` → `added` `["alice"]`・`skipped` `["佐藤","ＡＬＩＣＥ"]`
    - 「上限に達したら残りは入らない（とばしたと数えない）」: ゲスト 20 人の状態に `["a","b","c","d","e","f","g","h"]` → `added` が 4 件・`overflow` が `["e","f","g","h"]`・`skipped` `[]`・`state.guests.length` が 24
    - 「上限に達した後でも、同じ名前なら skipped に入る」: ゲスト 24 人（`客0`〜`客23`）に `["客0","新"]` → `skipped` `["客0"]`・`overflow` `["新"]`
    - 「1 人も足さないときは同じ参照を返す」: 全員が同名 → `batch.state` が渡した状態と `toBe`
    - 「addGuest も 24 人まで足せて、25 人目は TOO_MANY_GUESTS」
  - `schemas.test.ts`（無ければ作る）: `roulette.guest.addMany` は 1 件と 24 件で通る・0 件と 25 件・余計な項目・`names` が文字列でない、で落ちる
- [ ] **Step 2: 赤を見る**: `pnpm --filter @tasuki/roulette-core test`
- [ ] **Step 3: 実装**
  - `limits.ts`: `MAX_GUESTS = 24`（注記に「#458 で 12 → 24。1 人で回す使い方では全員がゲストになる」）
  - `roulette.ts`: `addGuests` を `addGuest` の下に。同名の判定は `addGuest` と同じ内部関数（`existingOf(members, guests)` を足して両方から使う）を通す。前から 1 件ずつ: 同名なら `skipped`・ゲストが `MAX_GUESTS` 未満なら採番して足す・それ以外は `overflow`
  - `schemas.ts`: `v.strictObject({ command: v.literal("roulette.guest.addMany"), names: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(MAX_GUESTS)) })` を `roulette.guest.add` の次に。注記に「束の大きさは境界で縛る（名前の規約の前に巨大な配列を落とす）。各名前の長さは縛らない（`guest.add` と同じ）」
  - `index.ts`: `addGuests`・`GuestBatch`・`MAX_GUESTS`・`MAX_WHEEL` を公開
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/roulette-core test`・`typecheck`・`lint`。取り決めのパッチ確認（`roulette.ts`・`schemas.ts`・`limits.ts`・`index.ts`・`error-messages.ts` を名指しするもの。m157・m168 を含む）
- [ ] **Step 5: コミット**: `feat(roulette-core): 名前をまとめて足す addGuests とコマンドを足し、上限を 24 にする（#458）`

### Task 2: 同期サーバーの `roulette.guest.addMany`（Sonnet・本線）

**Interfaces:** Consumes Task 1 の `addGuests`・コマンドの型

- [ ] **Step 1: 赤いテスト**（`test/roulette-handlers.test.ts`。土台は同じファイルの `guest.add` の試験と `errorsTo`。`describe("名前をまとめて足す")` に `/** @requirements #458 */`）
  - 「束を正規化して足し、全員へ配る」: `names: ["  佐藤  ", "鈴木"]` → 配られた状態の `guests` の名前が `["佐藤","鈴木"]`
  - 「名簿の参加者と同じ名前は飛ばし、エラーを返さない」: r-1 の名前（例 `alice`）を含む束 → `errorsTo` が `[]`・ゲストに `alice` が無い
  - 「1 つでも規約に通らない名前があれば INVALID_GUEST_NAME で、1 人も足さない」: `["佐藤", "   "]` → `["INVALID_GUEST_NAME"]`・ゲスト 0 件・配られない
  - 「上限で入らない分は足さず、エラーを返さない」: 20 件足した後に 8 件 → ゲスト 24 件・`errorsTo` `[]`
  - 「全員が同じ名前なら配らない」: 送信の記録を空にしてから送り、ルーレットのフレームが 1 通も無い
  - 「ログに名前を書かない」: 既存の「秘密の名前」の試験（約 975 行）と同じ形で束にも
  - 既存の「13 件目の名前は TOO_MANY_GUESTS」を「25 件目の名前は TOO_MANY_GUESTS」（24 件足す）に改める
- [ ] **Step 2: 赤を見る**: `pnpm --filter @tasuki/sync test -- test/roulette-handlers.test.ts`
- [ ] **Step 3: 実装**: `case "roulette.guest.addMany"`: 各名前に `applyDisplayNameRule`（1 つでも err なら `fail(connId, "INVALID_GUEST_NAME")` で終わる）→ `addGuests(state, normalized, membersOf(room), conflictsWithExisting)` → `commit(room.code, stored, batch.state)`
- [ ] **Step 4: 緑**: 同じ試験・`pnpm --filter @tasuki/sync typecheck`・`lint`。パッチ確認（`roulette-handlers.ts` を名指しするもの。m156 を含む）
- [ ] **Step 5: コミット**: `feat(sync): ルーレットの名前をまとめて足すコマンドを受ける（#458）`

### Task 3: 端末の保存 `storage/regulars.ts`（Sonnet・並行・Task 1 の合流後）

**Interfaces:**
- Produces（`apps/roulette-web/src/storage/regulars.ts`）:
  - `REGULARS_KEY = 'tasuki.roulette.regulars'`・`CURRENT_VERSION = 1`・`MAX_GROUPS = 10`
  - `interface RegularGroup { readonly id: string; readonly name: string; readonly usedAt: number; readonly members: readonly string[] }`
  - `type GroupsResult = { ok: true; items: RegularGroup[] } | { ok: false; reason: 'invalid' | 'unreadable' | 'write-failed' | 'full' | 'name-taken' }`
  - `loadGroups(storage: Storage | null): RegularGroup[]`（`usedAt` の新しい順）
  - `saveGroup(storage: Storage | null, input: { id?: string; name: string; members: readonly string[] }, now?: number, newId?: () => string): GroupsResult`
  - `deleteGroup(storage: Storage | null, id: string): GroupsResult`
  - `touchGroup(storage: Storage | null, id: string, now?: number): GroupsResult`
  - `parseMemberLines(text: string): string[]`
  - `safeLocalStorage(): Storage | null`（`window.localStorage` の取得そのものが投げたら null）
- 名前の規約は `@tasuki/room-core` の `MAX_DISPLAY_NAME`・`normalizeDisplayName`・`rendersAsNothing`・`conflictsWithExisting`。人数の上限は roulette-core の `MAX_GUESTS`（Task 1 で公開）

- [ ] **Step 1: 赤いテスト**（`tests/regulars-storage.test.ts`。土台は agenda の `apps/agenda-web/tests/saved-scenarios.test.ts` に倣い、`Storage` の偽物を作る）
  - 読む: 空は `[]`・壊れた JSON は `[]`・知らない版は `[]`・`items` の中の合わない項目（名前が空・members が空・25 人・40 字超の名前・`id` が無い）だけ一覧から外れる・`usedAt` の新しい順・`storage` が null でも `[]`・`getItem` が投げても `[]`
  - 保存: 新しい組は `newId()` の ID と `now` の `usedAt` で入る・名前は前後の空白を落とす・members は `parseMemberLines` と同じ規則で畳む（`["alice","ＡＬＩＣＥ"," 佐藤 ",""]` → `["alice","佐藤"]`）・同じ名前の別の組があれば `name-taken`・自分の `id` なら名前そのままで上書きできる・11 組目は `full`（直すのは数えない）・名前が空・members が 0 人・25 人・使えない名前は `invalid`・**読めない保存（壊れた JSON）があるときは `unreadable` で、`setItem` を呼ばない**・`setItem` が投げたら `write-failed`・合わない項目は消さずに生のまま書き戻す
  - 消す: `id` で消す・知らない `id` は `ok` で書かない
  - `touchGroup`: `usedAt` だけを変え、先頭へ来る
  - `parseMemberLines`: 改行（`\r\n` も）で分け、空行を捨て、`normalizeDisplayName` を当て、`rendersAsNothing` を捨て、`conflictsWithExisting` で重複を畳む（先に出た方を残す）
- [ ] **Step 2: 赤を見る**: `pnpm --filter @tasuki/roulette-web test -- tests/regulars-storage.test.ts`
- [ ] **Step 3: 実装**: agenda の `saved-scenarios.ts` の構造（`readDocument`・`migrateToCurrent`・`writeBack`・合わない項目を生のまま残す）に倣う。移行表 `MIGRATIONS` は空
- [ ] **Step 4: 緑**: 同じ試験・`typecheck`・`lint`
- [ ] **Step 5: コミット**: `feat(roulette-web): いつものメンツを端末に版つきで保存する（#458）`

### Task 4: 画面の導出と文言（Sonnet・本線）

**Interfaces:**
- Consumes: Task 1 の `addGuests`・`MAX_WHEEL`・`MAX_GUESTS`
- Produces:
  - `apps/roulette-web/src/regulars-view.ts`:
    - `interface BatchPlan { added: number; skipped: number; overflow: number; poolAfter: number }`
    - `planBatch(input: { view: RouletteView; members: readonly Member[]; names: readonly string[] }): BatchPlan`（受け取った状態の `excluded`・`guests` から `RouletteState` を組み、`addGuests` と `poolOf`（`conflictsWithExisting`）で数える）
    - `batchNoticeText(plan: BatchPlan): string`（下の文を組む）
  - `copy.ts` に画面案 §3 の全文言（関数は `addedText(n)`・`skippedText(n)`・`overflowText(n)`・`tooManyInPoolText(n)` など。**数は `MAX_GUESTS`・`MAX_WHEEL`・`MAX_GROUPS` から組む**。`MAX_GROUPS` は Task 3 の定数）
  - `TOO_MANY_TEXT`（= `回せるのは ${MAX_WHEEL} 人までなので、チェックを外してください`）
  - `use-roulette-sync.ts` の `addGuests(names: readonly string[]): void`（`{ command: 'roulette.guest.addMany', names: [...names] }` を送る）
- 知らせの組み方（画面案 §2 の「入れる」）: `added > 0` なら `${added} 人を入れました`／`added = 0` かつ `skipped > 0`・`overflow = 0` なら `全員もう入っています`／`added = 0` かつ `overflow > 0` なら `名前は 24 人まで追加できます。入れられませんでした`。`added > 0` のときに `skipped > 0` なら `。${skipped} 人はもう入っているので、とばしました`、`overflow > 0` なら `。名前は 24 人まで追加できます。${overflow} 人は入りませんでした` を続ける。最後に `poolAfter > MAX_WHEEL` なら `。入る人がいま ${poolAfter} 人です。回せるのは 24 人までなので、チェックを外してください`。文の区切りは画面案のとおり句点

- [ ] **Step 1: 赤いテスト**
  - `tests/regulars-view.test.ts`: 上の組み方の全分岐（全部入った・一部とばした・上限・両方・全員いる・上限で 0 人・25 人になる）を文字列の一致で。`planBatch` は Review Focus 1・2・4 の 3 場面（自分の名前を含む・離席中の同名・ゲスト 20 人に 8 人）
  - `roulette-view.test.ts`: 入る人 25 人（members 1 ＋ ゲスト 24）で `spinButtonOf` が `disabled: true`・`captionOf` が `TOO_MANY_TEXT`。24 人ちょうどでは押せる（境目の反対側）
  - `turn-order-view.test.ts`: 回の始まる前に 25 人で `orderButtonOf` が押せず `orderCaptionOf` が `TOO_MANY_TEXT`。**回の途中で「まだの人」が 24 以下なら押せる**（中核は `open.length` で見る。画面も `まだの人` の数で比べる）
  - `press-view.test.ts`: 25 人で `pressButtonOf` が押せず `pressCaptionOf`（回す前）が `TOO_MANY_TEXT`
  - `use-roulette-sync.test.tsx`: `addGuests(["佐藤","鈴木"])` で `{ command: 'roulette.guest.addMany', names: ['佐藤','鈴木'] }` を送る
- [ ] **Step 2: 赤を見る**: 該当ファイルを絞って `pnpm --filter @tasuki/roulette-web test -- <ファイル>`
- [ ] **Step 3: 実装**: 回せない判定は `poolCount > MAX_WHEEL`（順番に回すは回の途中なら「まだの人」の数）。少なすぎる（`TOO_FEW`）の判定より後に見る（2 人未満と 25 人以上は同時に起きない）
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/roulette-web test`（全件）・`typecheck`・`lint`。`copy-fits-font-base.test.ts` が通ること。パッチ確認（`roulette-view.ts`・`press-view.ts`・`copy.ts`・`use-roulette-sync.ts` を名指しするもの。m165・m182 を含む）
- [ ] **Step 5: コミット**: `feat(roulette-web): まとめて入れる知らせと、24 人を超えたら回せない表示を足す（#458）`

### Task 5: 「いつものメンツ」の区画（Sonnet・本線）

**Interfaces:**
- Consumes: Task 3 の保存の関数、Task 4 の `planBatch`・`batchNoticeText`・文言・`addGuests`
- Produces:
  - `src/hooks/use-regulars.ts`: `useRegulars(): { groups: RegularGroup[]; save(input): GroupsResult; remove(id): GroupsResult; touch(id): void }`（`safeLocalStorage()` を 1 度だけ取る）
  - `src/components/RegularsSection.tsx`: `RegularsSection(props: { locked: boolean; guestNames: readonly string[]; onInsert: (group: RegularGroup) => string })`（`onInsert` は知らせの文を返す。区画が `role="status"` に出す）
  - `PeoplePanel` に `regulars: ReactNode` を足し、`GuestForm` の後に置く。`RouletteRoom` が `onInsert` を作る: `planBatch` で文を組む → `sync.addGuests(group.members)` → `touch(group.id)` → 文を返す

- [ ] **Step 1: 赤いテスト**（`tests/regulars-section.test.tsx`。`RouletteRoom` を通す試験は `roulette-room.test.tsx` の土台（`latestSocket`・フレームの差し込み）に倣って同じファイルの末尾へ）
  - 0 組: 見出し「いつものメンツ」・添え書き「この端末だけ」・説明文・[新しく作る]。追加した名前が 0 人なら [追加した名前から作る] が無い
  - 作る: [新しく作る] → 名前の欄にフォーカス → 名前と複数行欄を入れて [この端末に保存] → 一覧に札「朝会 3 人を入れる」・知らせ「この端末に保存しました」・**フォーカスはその札**・localStorage に入っている
  - [追加した名前から作る] → 複数行欄にいまのゲストの名前が 1 行ずつ入っている
  - 検証: 名前が空・0 人・25 人・同じ名前のメンツ・11 組目で `role="alert"` の文（画面案 §2 の各文）。欄は閉じない
  - [やめる] → 開いたボタンへフォーカスが戻る
  - 入れる（`RouletteRoom` を通す）: 札を押すと `{ command: 'roulette.guest.addMany', names: [...] }` を送り、知らせが `batchNoticeText` の文（自分の名前を含む組で「…とばしました」）・その組が先頭へ・フォーカスは札のまま
  - 切断中は札が `disabled`、[直す]・[新しく作る] は押せる
  - 直す・消す: [直す] → 欄に中身・[このメンツを消す] → 確認「「朝会」をこの端末から消しますか」でフォーカスは [やめる] → [消す] → 一覧から消え、知らせ「「朝会」を消しました」・フォーカスは次の札（無ければ [新しく作る]）
  - 保存が壊れている（`localStorage` に `{` を入れておく）: 0 組で描け、保存で「保存したメンツを読めないため、保存を止めました」・中身は `{` のまま
  - 名前のフォント: 札の名前の要素が `roulette-regulars-name` クラスを持つ（太さは CSS）
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装**: 構成・クラス・a11y は画面案 §1・§4・§5 のとおり。CSS は画面案 §4 の規則を `index.css` の「ルーレットに入る人」の規則の後へ。知らせの `<p role="status" className="ui-note">` は常に置き、同じ文が続くときは一度空にしてから入れる
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/roulette-web test`（全件・`rendered-text-fits-font-base.test.tsx` を含む）・`typecheck`・`lint`、`pnpm --filter @tasuki/ui test`（CSS を触ったので）。パッチ確認（`PeoplePanel.tsx`・`RouletteRoom.tsx`・`index.css` を名指しするもの。m173・m181 を含む）
- [ ] **Step 5: コミット**: `feat(roulette-web): 「いつものメンツ」の区画で作る・入れる・直す・消す（#458）`

### Task 6: 変異 560〜571（Opus・本線）

**帯の確かめ**: 着手時に `grep -oE 'id: *[0-9]+' scripts/lib/mutation-declarations.mjs | grep -oE '[0-9]+' | sort -n | tail -3`（main は 539 まで）と、本体の作業ツリー（#406・520 まで）・`gh pr diff 457`（494〜499）を見て 560〜571 が空いていることを確かめる

| ID | 名前 | 壊し方 | pkg | 赤になる試験 |
|---|---|---|---|---|
| m560 | batch-checks-only-existing | `addGuests` が束の中で先に足した名前と比べない（束の中の重複が 2 人入る） | `packages/roulette-core` | `tests/roulette-guest-batch.test.ts` |
| m561 | batch-rejects-on-conflict | 同名を飛ばさず、同名が 1 人でもいれば何も足さない | `packages/roulette-core` | 同上 |
| m562 | batch-compares-present-only | 比べる相手を在室の参加者だけにする | `packages/roulette-core` | 同上 |
| m563 | batch-overflow-counted-as-skipped | 上限で入らない名前を `skipped` へ入れる | `packages/roulette-core` | 同上・`apps/roulette-web/tests/regulars-view.test.ts` |
| m564 | batch-schema-unbounded | 境界の `v.maxLength(MAX_GUESTS)` を外す | `packages/roulette-core` | `tests/schemas.test.ts` |
| m565 | spin-allows-over-wheel | `spinButtonOf` が `poolCount > MAX_WHEEL` を見ない | `apps/roulette-web` | `tests/roulette-view.test.ts` |
| m566 | order-blocks-mid-round | 順番に回すが回の途中も入る人の総数で比べる（まだの人 24 以下でも押せない） | `apps/roulette-web` | `tests/turn-order-view.test.ts` |
| m567 | regulars-overwrites-unreadable | 読めない保存のときも書き込む | `apps/roulette-web` | `tests/regulars-storage.test.ts` |
| m568 | regulars-drops-invalid-items | 書き戻しで合わない項目を捨てる | `apps/roulette-web` | 同上 |
| m569 | regulars-parse-keeps-duplicates | `parseMemberLines` が表記違いの同じ名前を畳まない | `apps/roulette-web` | 同上 |
| m570 | sync-batch-skips-name-rule | 同期サーバーが束の名前に表示名の規約を当てない | `apps/tasuki-sync` | `test/roulette-handlers.test.ts` |
| m571 | insert-focus-lost | 入れた後に札へフォーカスを戻さない（並びが変わって札が付け替わる） | `apps/roulette-web` | `tests/regulars-section.test.tsx` |

- [ ] 各パッチの 1 行目は `# 変異 NNN: <名前>`。説明・適用と復元の手順は既存のパッチ（例 m538）の型に。宣言は末尾に `{ id, label, patch, pkg, tests, note }`（`note` は `"#458。…"` で始める）
- [ ] 1 本ずつ: `git status --porcelain` が空 → `git apply` → 対象の試験で赤 → `git apply -R` → 空に戻る。12 本の赤の行（試験の名前）を報告に書く。**赤にならない変異は、試験が守っていない証拠なので、試験を足して赤にする**（足した試験は担当の試験ファイルへ）
- [ ] Task 1〜5 で触ったファイルを名指しする既存のパッチを、すべてもう一度 `git apply --check`
- [ ] コミット: `test: いつものメンツの変異 m560〜m571 を足す（#458）`（`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）

### Task 7: 文書（7a・段 A）と E2E の測り（7b・段 E）（Sonnet・並行）

- [ ] `docs/adr/0026-facilitator-roulette.md` の**末尾**に `## 追記（2026-10-29・#458）: 名前をまとめて足し、組は端末に置く` を足す。中身: コマンド `roulette.guest.addMany`（1〜24 件・境界で縛る）・同じ名前は拒まずに飛ばす（比べる相手は `addGuest` と同じ）・上限で入らない分は足さずエラーも返さない・知らせは画面が同じ関数で出す（返事のフレームを足さない）・`MAX_GUESTS` は 24・組は端末の localStorage にだけ置く。決定の時制で書く。設計へ相対リンク
- [ ] `docs/adr/0011-threat-model-and-data-classification.md` の S7 の「12 件」を「24 件」に、その直後に「1 コマンドで足せるのも 24 件まで（境界で縛る・#458）」。データ分類の行に「いつものメンツの名前は端末の localStorage にだけ置き、サーバーへは入れたときの名前だけを送る（#458）」。**#457（別の PR）も同じ ADR を触るので、行を書き換えるのは S7 の 1 行だけにし、ほかは新しい行で足す**
- [ ] `apps/roulette-web` の NOTES（無ければ README の配布の節）に「#458 の配布は同期サーバー（`deploy.sh timer`）が先、roulette-web が後。逆だと新しいコマンドが `INVALID_COMMAND` で拒まれる」
- [ ] （7b）`e2e/specs/buttons.spec.ts` の末尾に**独立した** `test.describe('ルーレットの「いつものメンツ」のボタンは部品で、押せる大きさがあり、重ならない', …)` を 1 本。幅 390 と 1280 で、0 組・2 組（`page.addInitScript` で localStorage に入れる）・欄を開いた状態を測る。測り方は同じファイルの roulette の既存の場面（`grep -n roulette e2e/specs/buttons.spec.ts`）の補助関数を使う。**E2E を実行しない**（統括が回す）。`pnpm --filter @tasuki/e2e typecheck` が通ること（パッケージ名は `e2e/package.json` で見る）
- [ ] （7a の終わり）`node scripts/check-links.mjs`・コミット: `docs: ルーレットの名前をまとめて足す決定を ADR に追記する（#458）`
- [ ] （7b の終わり）コミット: `test(e2e): いつものメンツのボタンの大きさと重なりを測る（#458）`

### 統括の仕上げ（タスクにしない）

- 段ごとの合流（`cherry-pick`）と、タスクごとのレビュー（Opus・文脈を共有しない）
- `pnpm test --force`・scripts の自己テスト・全 audit・`pnpm typecheck`・`pnpm lint`
- E2E 全件（本体ではなく本線の worktree で。8787 は headroom のプロキシが持っていることがあるので先に `ss -ltn` を見る）
- 撮影: 1 人で開いたルームで 0 組 → 作る → 入れる（自分の名前を含む組）→ 25 人になる組 → 直す → 消す確認、を 1280px と 360px。同じ名前の参加者が後から入った場面（行の「同じ名前の人がいます」）
- 最終レビュー（Opus）・PR（本文に配布の順）・`/code-review <番号>`・CI
- 利用者へ一覧で渡すもの: 設計 §9 の R1〜R5 と、実装中の Ruling
