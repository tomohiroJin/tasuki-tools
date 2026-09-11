# #95 S4b 同一性と在席 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一性を端末（`localStorage`・ルームコード別）へ移し、在席を接続に紐づける。参加者は接続を複数持てるようになり、ドライバーの適格判定は `presence` ではなく**在席**で行う（D12・D14・D21）。あわせて期限の来た `timer-core → room-core` の一時依存を外し、`apps/tasuki-sync/src/poker/` の入れ子を層のディレクトリへ畳む。

**Architecture:** 名簿（`@tasuki/room-core`）の `Participant` が持つ `connId: ConnId | null` と `presence` を、**`connections: ReadonlyMap<ConnId, ToolId | null>` 1 本**へ置き換える。在席（`isPresentIn`）と presence（`presenceOf`）はそこから**導出**し、二重帳簿を作らない。ツールの宣言は wire に足さず、**接続が来た入口（`/poker/ws` か否か）が宣言そのもの**であるとみなして各入口のハンドラが定数で渡す。表示名の検証は timer の wire スキーマから**境界（WS アダプタ）のアプリケーション関数**へ移し、規約の正本を `room-core` に一本化する。

**Tech Stack:** TypeScript / Bun（`apps/tasuki-sync`）/ Vitest（`packages/*`・Web）/ Valibot（境界検証）/ neverthrow（`Result`）/ Playwright（E2E）

**Spec:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（D12・D14・D21・§3.13・§3.14・§5.1・§5.4）
**Issue:** #246（親 epic は #95）。要求は R11 / R14 / R15 / R16 / R17

---

## 着手前に実測した基準値（2026-09-11・main `c723022`）

**過去の記録と比べない**（[[count-by-running-not-grepping]]）。下は今回の着手時に実行して得た値である。

| 何 | 値 | 取り方 |
|---|---|---|
| `corepack pnpm test --force` | **11 タスクすべて緑 / 40.1 秒** | timer-web 737・tasuki-sync 654・timer-core 286・rate-limit 120・poker-core 96・e2e 静的 88・room-core 41・poker-web 59・landing 17・protocol 6・ui（node:test） |
| 構造監査 | SC031 **2**（未達）/ SC032 **1416/1418（99.9%）**/ SC036 **1836** / SC039 すべて 0 | `node scripts/audit-structure.mjs` |
| 走査対象 | src 9 パッケージ 185 件 / test 10 パッケージ 277 件 | 同上 |

**SC032 は `—`（合否なし）で出る行なので、仕上げで main と突き合わせる**（S4a では 2 → 9 へ後退したのに CI が緑だった）。

## Issue #246 本文の前提を叩いた結果

| 本文の主張 | 実測 | 扱い |
|---|---|---|
| `timer-core → room-core` の一時依存がある | **実体は `src/schemas.ts` の `normalizeDisplayName` 1 本＋`test/display-name.test.ts` 1 本**。`package.json` の宣言と合わせて 3 箇所 | Task 7 |
| `apps/tasuki-sync/src/poker/` の入れ子 | 実在。`{adapters,application,ports}` に **13 ファイル** | Task 8 |
| `Participant` を多接続模型にする | room-core だけでは足りない。**poker の配信レジストリが `participantId → socket` で 1 本しか持てず、2 タブ目が 1 タブ目の socket を奪う** —— D14 が問題視している現象の実体はここにある | Task 5 |
| 在席と `presence` を接続から導く | `presence` の読み手は wire・DTO・`occupants`・ドライバー不在猶予・**お題委譲の候補選び**の 5 経路 | Task 2・4 |
| ローテーションの適格判定 | `computeIneligibleIndices`（`handlers.ts` 末尾）1 箇所。**設計正本 D21 が書いた行番号 887-901 はもう合わない** | Task 4 |

**本文に無くて出てきたもの**: wire の `Participant.connId` は **`apps/timer-web` の製品コードから 1 件も読まれていない**（テストの造作にだけ 35 ファイル現れる）。多接続模型では「接続 1 本」という形が嘘になるので落とす（下の裁定 1）。

## 着手時の裁定（利用者の承認済み・2026-09-11）

| # | 論点 | 裁定 | 代償 |
|---|---|---|---|
| 1 | wire の `Participant.connId` | **落とす**（型・`RoomSchema`・DTO から削除） | `apps/timer-web` のテスト造作 35 ファイルを機械的に直す。非 strict の `v.object` なので古い snapshot のパースは通る |
| 2 | ツールの宣言（D14 は `room.join { …, tool }` と書いている） | **wire には足さない。入口が宣言である**（timer の `room.join` は定数 `"timer"`、poker の `join-room` / `create-room` は `"poker"`）。`tool: null`（ハブ）が要るのは S5a なので、そのとき wire へ足すかを決める | 設計正本の字面と食い違う → §D14 へ追記して宛先を残す |
| 3 | `src/poker/` の平坦化の形 | **層のディレクトリへ統合**（`src/poker/application/handlers.ts` → `src/application/poker-handlers.ts`）。設計正本 §5.5 が層ごとに 1 つの `ports/` `adapters/` を書いている形に合わせる | poker の 13 ファイルの import を一斉に書き換える |
| 4 | D12 後半（表示名をルーム非依存の既定値としても保存） | **S5a（#247）へ送る**。名乗る画面がハブへ移るのが S5a であり、初期値を使う画面と同じ段に置く | #247 の完了条件へ書き足す（Task 9） |
| 5 | 表示名の検証の置き場 | **境界（`adapters/ws-adapter.ts`）で `parseBoundaryMessage` の直後に `application/normalize-command-names.ts` を通す。** 失敗は既存の `INVALID_COMMAND` 経路へ合流させ、**エラーフレームを 1 バイトも変えない** | 単体テストからハンドラを直接呼ぶ経路は正規化を通らない（**これは現状と同じ** —— 今も valibot は境界にしかない） |

---

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを Red → Green。R14（ハブに居る `online` の人が対象外になる）と R17（2 接続のうち 1 本を閉じても `online`）は**先に赤を見てから**実装する |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。`docs/adr/0017` は**期限の到来による行の削除**なので改定節で足りる（決定 2・決定 4 そのものは変えない） |
| III. 揮発インメモリと単純運用 | 通過 | 保管は揮発のまま。`localStorage` はクライアント側であり、原則 III が「この限りではない」と明示している範囲（D12） |
| IV. 境界の型安全 | 通過 | 表示名の検証を境界から外へ出さない（裁定 5）。wire の形の変更（`connId` 削除）は `RoomSchema` と型の両方を直す |
| V. 実画面検証 | 通過 | 利用者から見える変更（同じ端末で開き直すと同一人物として復帰・2 タブが 1 人）なので、`pnpm dev` の実経路で復帰と 2 タブを目視し、`pnpm e2e` を全件通す（Task 9） |
| VI. 依存は内向き | 通過 | **`timer-core → room-core` を外すのが本段の目的の 1 つ**。破壊検証（§6.3 の 3 つ）を行う |
| VII. 検査は壊して確かめる | 通過 | 依存方向の検査を 3 通りに壊して赤を確認（Task 7）。変異検査（Task 9） |
| VIII. 記録が正本 | 通過 | 裁定を設計正本と progress へ先に書く（Task 0）。**決定を書き、実施は実施後に書く**（[[record-decisions-not-completed-state]]） |
| IX. 小さく回す | 通過 | PR 1 本を main へ直接マージする（スライスの原則）。**デプロイは伴わない** |
| X. 抽象は実需で | 通過 | 新しい記号は `isPresentIn` / `presenceOf` / `normalizeCommandNames` の 3 つで、いずれも呼び出し元が 2 つ以上ある |
| XI. 秘密と個人情報を持ち込まない | 通過 | 在席は `docs/adr/0011` 決定 1 で既に「個人に紐づく」へ分類済み（S0 で実施）。`resumeToken` の扱い（ログへ出さない・自分の分だけ返す・定数時間比較）は変えない |

**逸脱なし。**

---

## Global Constraints

- **在席と presence を参加者の欄として持たない。** `connections` から導く関数だけを公開する（二重帳簿を作った瞬間に「片方だけ直す」事故が戻る）
- **`packages/room-core` はツールを知らない。** `ToolId` は不透明な文字列で、`"timer"` / `"poker"` という綴りは `apps/tasuki-sync` にしか無い
- **`packages/poker-core` は `room-core` に依存できない**（許可表は `@tasuki/protocol` のみ）。名簿の断片は構造的型で受ける形を維持する
- **公開記号は `index.ts` で明示列挙。`export *` は使わない**（ADR-0016 決定 2）
- **ドメインの失敗は `Result`**（ADR-0016 決定 2 項目 1）。`validateDisplayName` は `Result` を返す
- **ドメインで `Date.now()` / `Math.random()` を呼ばない**（`scripts/audit-domain-side-effects.mjs`）
- **エラーフレームを変えない。** 表示名の検証を移しても、コード（`INVALID_COMMAND`）と文言（「コマンドの形式が不正です」）は同一の 1 経路から出す
- **`git mv` は 1 ファイルずつ当て、`git status --porcelain` が `R` を出すことを毎回確かめる**（9p でディレクトリ rename が壊れる → [[9p-mount-breaks-directory-moves]]）
- **DoD 8 項目**（`docs/guides/definition-of-done.md`）。該当しない項目は「該当なし」と明記
- **コミットは Conventional Commits・日本語。** 1 コミット = 1 つの論理的変更。コミットしたら push する
- **テストコマンド**: `packages/*` は `corepack pnpm --filter <name> test`、`apps/tasuki-sync` は `corepack pnpm --filter @tasuki/sync test`（bun）、全体は `corepack pnpm test`（キャッシュに当たるので判定は `--force`）
- **作業場所**: `/workspaces/claym/local/Tasuki`。ブランチは `feature/246-identity-and-presence`
- **`main` は常にデプロイ可能に保つ。** 本段に配備資材の変更は無い（上限・レート制限・Caddy 断片はいずれも触らない）が、**S2 と S4a の未配布分（`MAX_ROOMS=100` / `MAX_CONNECTIONS=400`）の申し送りを消さないこと**

---

## File Structure

**新規**

| ファイル | 責務 |
|---|---|
| `apps/tasuki-sync/src/application/normalize-command-names.ts` | 境界で表示名を正規化・検証する（timer の wire スキーマから移す先） |
| `apps/tasuki-sync/test/normalize-command-names.test.ts` | 同上の単体テスト（timer-core から移設した観点を含む） |
| `apps/tasuki-sync/test/presence-model.test.ts` | 多接続の在席（R17）とドライバー適格（R14・R15） |
| `e2e/specs/timer-resume.spec.ts` | R16（同じ URL を開き直しても名簿が増えない） |

**改造（主なもの）**

| ファイル | 変更 |
|---|---|
| `packages/room-core/src/room.ts` | `Participant.connections` へ。`isPresentIn` / `presenceOf` / `attachConnection(room, id, connId, tool)` / `detachConnection(room, connId)` / `findParticipantByConnId` |
| `packages/room-core/src/display-name.ts` | `MAX_DISPLAY_NAME` / `MAX_NFKC_EXPANSION` を引き取り、`validateDisplayName(raw): Result<string, DisplayNameError>` を足す |
| `packages/room-core/src/index.ts` | 上記を明示列挙で公開 |
| `packages/timer-core/src/schemas.ts` | `normalizeDisplayName` の import を外す。`displayNameStr` を素の文字列へ。`ParticipantSchema` から `connId` を削除 |
| `packages/timer-core/src/aggregate.ts` | `MAX_DISPLAY_NAME` / `MAX_NFKC_EXPANSION` を削除（room-core へ） |
| `packages/timer-core/src/wire.ts` | `Participant.connId` を削除（裁定 1） |
| `packages/timer-core/package.json` | `@tasuki/room-core` の依存宣言を削除 |
| `apps/tasuki-sync/src/adapters/ws-adapter.ts` | パース直後に `normalizeCommandNames` を通す |
| `apps/tasuki-sync/src/application/presence.ts` | 接続単位へ。`handlePing` / `handleDisconnect` が `connections` を触る |
| `apps/tasuki-sync/src/application/handlers.ts` | `connId` での参加者・ルーム特定を `connections` 経由へ。`computeIneligibleIndices` を在席判定へ |
| `apps/tasuki-sync/src/application/timer-snapshot-dto.ts` | `presence` を導出。wire から `connId` を落とす。`Occupant` も同様 |
| `apps/tasuki-sync/src/application/problem-delegation.ts` | 候補の送信先を「timer に在席している接続の 1 本」へ |
| `apps/tasuki-sync/src/application/command-handlers/{room-create,room-join,participant-remove}.ts` | 接続の結び付け・退出通知の宛先を接続単位へ |
| `apps/tasuki-sync/src/create-sync-server.ts` | 配信先を「そのツールに在席している接続」へ |
| `apps/tasuki-sync/src/poker/**`（**実測 11 ファイル**。この表の「13」は着手前の私の数え違い） | 多接続対応＋層のディレクトリへ移設（裁定 3） |
| `apps/timer-web/src/sync/resume-identity.ts` | `localStorage` にルームコード別。`load/save/clear` がコードを取る |
| `apps/timer-web/src/sync/use-timer-sync.ts` | 保存・読み出し・破棄にルームコードを渡す |
| `apps/timer-web/src/ui/{Join,Setup,components/RosterPanel}.tsx` | `MAX_DISPLAY_NAME` の取り込み先を `@tasuki/room-core` へ |
| `scripts/audit-dependency-direction.mjs` | `ALLOWED` から `packages/timer-core` の行の中身を空へ |
| `docs/adr/0017-bounded-contexts-and-packages.md` | 改定節：期限つき一時依存の解消を記録 |
| `docs/adr/0012-logging-secrets-and-disclosure.md` / `docs/timer/ARCHITECTURE.md` / `docs/plans/resume-token-wiring/spec.md` | `sessionStorage` を名指ししている記述を実体へ合わせる |
| `docs/superpowers/specs/2026-09-06-...-design.md` | S4b 実施時の追記（裁定 1・2・4） |

---

### Task 0: 裁定を先に記録する

実装より先に、裁定 1〜5 を**設計正本と作業台帳**へ書く。[[spec-errors-get-ratified-downstream]]（設計の誤りは下流が承認する）を避けるため、字面と食い違う判断は着手前に紙へ残す。

**Files:**
- Create: `.superpowers/sdd/2026-09-11-shared-identity-s4b-identity-and-presence/progress.md`
- Modify: `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（D14 と D12 へ「S4b 実施時の追記」）

- [ ] **Step 1: 作業台帳を作る**（基準値・裁定表・タスク一覧・レビュー結果欄）
- [ ] **Step 2: 設計正本 D14 へ追記** —— ツールの宣言を wire へ足さず入口で決める理由（裁定 2）と、`tool: null` の宛先が S5a であること
- [ ] **Step 3: 設計正本 D12 へ追記** —— ルーム非依存の既定表示名を S5a（#247）へ送ったこと（裁定 4）。**完了形を書かない**
- [ ] **Step 4: `docs/adr/0011` を確認**（在席の分類は S0 で入っているので**触らない**。確認だけ）
- [ ] Verify: `node scripts/check-links.mjs`

---

### Task 1: room-core を多接続模型にする

room-core だけで閉じるので、ここは自己完結で緑になる。利用側（tasuki-sync）は Task 2 以降で直す。

**Files:**
- Modify: `packages/room-core/src/room.ts` / `src/index.ts`
- Modify: `packages/room-core/tests/room.test.ts`

**Interfaces:**
- Produces:
  - `type ToolId = string`
  - `interface Participant { id; displayName; connections: ReadonlyMap<ConnId, ToolId | null>; joinedAt }` —— **`connId` と `presence` は消える**
  - `isPresentIn(p: Participant, tool: ToolId): boolean`
  - `presenceOf(p: Participant): "online" | "offline"`
  - `attachConnection(room: Room, id: ParticipantId, connId: ConnId, tool: ToolId | null): Room`
  - `detachConnection(room: Room, connId: ConnId): Room` —— **参加者 ID ではなく接続 ID で外す**（切断は接続の事象）
  - `findParticipantByConnId(room: Room, connId: ConnId): Participant | undefined`
  - `connectionsIn(room: Room, tool: ToolId): ConnId[]` —— 配信先の解決（`create-sync-server.ts` と poker の配信が使う）
- Consumes: なし

- [ ] **Step 1: 失敗するテストを書く**（R17 を含む）
  - 2 接続のうち 1 本を閉じても `presenceOf` が `online`
  - 両方閉じたら `offline`。**名簿からは消えない**（§3.13）
  - `isPresentIn` が接続の宣言したツールだけに真を返す（`tool: null` のハブ接続は timer に在席しない）
  - 同じ `connId` で 2 度 attach しても接続は増えない（冪等）
  - `detachConnection` は持ち主が居なくても何も壊さない
  - `connectionsIn` が宣言順に返す
- [ ] **Step 2: 赤を確認** `corepack pnpm --filter @tasuki/room-core test`
- [ ] **Step 3: 実装**（`presence` の値域 `"idle"` は **wire 側の契約としてのみ残す** —— 名簿からは消える。理由を room.ts の docstring に書く）
- [ ] **Step 4: 緑を確認**
- [ ] Verify: `corepack pnpm --filter @tasuki/room-core test` / `node scripts/audit-public-surface.mjs` / `node scripts/audit-domain-side-effects.mjs`

---

### Task 2: timer の在席を接続単位へ寄せる

**Files:**
- Modify: `apps/tasuki-sync/src/application/presence.ts` / `handlers.ts` / `timer-snapshot-dto.ts` / `problem-delegation.ts`
- Modify: `apps/tasuki-sync/src/application/command-handlers/{room-create,room-join,participant-remove}.ts`
- Modify: `apps/tasuki-sync/src/create-sync-server.ts`

**Interfaces:**
- Consumes: Task 1 の room-core API
- Produces: 変化なし（wire は Task 3 で変える）

- [ ] **Step 1: 失敗するテストを書く**（`test/presence-model.test.ts`）
  - **同じ参加者が 2 接続を持てる**（2 度目の `room.join` が resumeToken つきで来たとき、1 本目を奪わない）
  - 1 本閉じても snapshot の `presence` は `online`
  - 両方閉じたら `offline`。名簿には残る
  - `presence.ping` が閉じた接続では何も起こさない
- [ ] **Step 2: 赤を確認**
- [ ] **Step 3: 実装**
  - `room-join`: 復帰経路は `attachConnection(room, id, connId, "timer")` で**接続を足す**（置き換えない）
  - `room-create`: 新規参加者の `connections` は `{ connId → "timer" }` の 1 本
  - `presence.ts`: `findRoomByConnId` を `findParticipantByConnId` へ。`handleDisconnect` は `detachConnection(room, connId)`。**ドライバー不在の猶予は「その人が timer に在席していないこと」で判定する**（`presence === "offline"` ではない —— 他タブが生きていれば繰り上げない）
  - `handlers.ts`: `participants.find(p => p.connId === connId)` を `findParticipantByConnId` へ（2 箇所）
  - `problem-delegation.ts`: 候補の宛先を「timer に在席している接続の先頭 1 本」へ。**全接続へ送らない**（同じ人の複数タブが同時に生成を始める）
  - `create-sync-server.ts`: `broadcastSnapshot` / `broadcastSignal` の宛先を `connectionsIn(room, "timer")` へ
  - `participant-remove.ts`: 退出通知の宛先を**その人の全接続**へ（タブが 2 つあるなら両方に伝える）
- [ ] **Step 4: 緑を確認** `corepack pnpm --filter @tasuki/sync test`
- [ ] Verify: 既存 654 件が緑（造作の直しは許すが、**アサーションを書き換えたら理由を台帳へ**）

---

### Task 3: wire から `connId` を落とす（裁定 1）

**Files:**
- Modify: `packages/timer-core/src/wire.ts` / `src/schemas.ts`
- Modify: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts`
- Modify: `apps/timer-web/test/**`（造作 35 ファイル）/ `apps/timer-web/test/support/room-view.ts`

- [ ] **Step 1: 先に DTO のテストを直し、赤を見る**（`connId` を出さないことを固定する）
- [ ] **Step 2: 実装** —— `wire.ts` の `Participant` と `ParticipantSchema` から `connId` を削除。DTO の 2 箇所（`members` / `proxies`）から削除。`Occupant` からも削除（`participant-remove` は接続を room-core 側で引く）
- [ ] **Step 3: `apps/timer-web` の造作を直す**（機械的置換。**`sed` 後に必ず typecheck で残りを拾う**）
- [ ] **Step 4: 非 strict の `v.object` なので古い snapshot のパースが通ることをテストで固定**（`startedAt` を落としたときと同じ観点）
- [ ] Verify: `corepack pnpm --filter @tasuki/timer-core test` / `--filter @tasuki/timer-web test` / `--filter @tasuki/sync test` / `corepack pnpm typecheck`

---

### Task 4: ローテーションの適格判定を在席へ（R14・R15）

**Files:**
- Modify: `apps/tasuki-sync/src/application/handlers.ts`（`computeIneligibleIndices`）
- Modify: `apps/tasuki-sync/test/presence-model.test.ts`

- [ ] **Step 1: 失敗するテストを書く** —— 設計正本 §6.2 が名指しした形をそのまま置く
  - **`online` だが timer に在席していない参加者（`tool: null` の接続しか持たない）が対象外になる**（`offline` だけを見ていると通ってしまうので必ず置く）
  - 代理（`kind: "proxy"`）は在席の概念を持たず**常に対象**
  - `eligible === false` の席は在席でも対象外
  - **対象者が 0 名なら現在のドライバーを維持する**（R15）
- [ ] **Step 2: 赤を確認**（現行は `presence === "offline"` 判定なので、1 つめは緑で通ってしまうはず。**通ったら判定の書き方を疑う** → [[checks-need-a-control-run]]）
- [ ] **Step 3: 実装** —— 対象外 = `eligible === false` ∨（`kind === "member"` ∧ その参加者が timer に在席していない）
- [ ] **Step 4: 緑を確認**。あわせて `autoSwitch` / `advanceForAbsence` の既存テストが緑であることを見る
- [ ] Verify: `corepack pnpm --filter @tasuki/sync test`

---

### Task 5: poker を多接続へ（配信レジストリを接続単位にする）

**実測で出てきた穴**（Issue 本文に無い）。`participantId → socket` の 1 対 1 レジストリを `participantId → Set<socket>` へ。

**Files:**
- Modify: `apps/tasuki-sync/src/poker/adapters/ws-broadcaster.ts` / `ports/broadcaster.ts`
- Modify: `apps/tasuki-sync/src/poker/application/handlers.ts`（`admit` / `detachFromCurrentRoom` / `fragmentsOf` / `completeJoin`）

- [ ] **Step 1: 失敗するテストを書く**
  - 同じ参加者が 2 ソケットで join したとき、**両方が snapshot を受け取る**
  - 1 本閉じても残りが受け取り続け、`connected` は真のまま
  - 両方閉じたら `connected` が偽になり、自動公開の再評価が走る
  - `detachFromCurrentRoom` が**その接続だけ**を外す（同じ人の別タブを落とさない）
- [ ] **Step 2: 赤を確認**（1 つめで socket が奪われることを実際に見る）
- [ ] **Step 3: 実装**
  - `attach` / `detach` を接続単位へ。`detach` の戻り値の意味は「この接続を外したか」
  - `fragmentsOf` の `connected` は **`isPresentIn(p, "poker")`**（`presenceOf` ではない。ハブに居る人が未投票欄を埋め続けるのを防ぐ・D4）
  - `admit` は `connections: { connId → "poker" }`
- [ ] **Step 4: 緑を確認**
- [ ] Verify: `corepack pnpm --filter @tasuki/sync test`

---

### Task 6: 復帰の組を `localStorage` へルームコード別で保存する（R16・D12）

**Files:**
- Modify: `apps/timer-web/src/sync/resume-identity.ts` / `src/sync/use-timer-sync.ts`
- Modify: `apps/timer-web/test/sync/resume-identity.test.ts` / `test/sync/use-timer-sync.test.tsx` / `test/ui/App.resume-on-load.test.tsx` ほか

**Interfaces:**
- Produces: `saveResumeIdentity(identity)`（鍵は `identity.code`）/ `loadResumeIdentity(code)` / `clearResumeIdentity(code)` / `shouldResumeOnLoad(saved, codeFromUrl)`（署名は変えない）
- 鍵は `tasuki:resume:<ROOMCODE>`。poker（`poker:participant:<roomId>`）と同じ形

- [ ] **Step 1: 失敗するテストを書く**
  - `localStorage` に保存され、**`sessionStorage` には書かれない**（旧テストの逆向き。1 本は「移した」テストとして残す）
  - ルームコード別に鍵が分かれ、別ルームの保存値を取り違えない
  - 壊れた JSON・欠けた項目は `null`（poker の `loadIdentity` と同じく**壊れた値はその鍵を消す**）
  - **別タブで同じ `?room=` を開くと同じ `participantId` で復帰する**（R16 の単体側）
- [ ] **Step 2: 赤を確認**
- [ ] **Step 3: 実装** —— 再接続経路（`sendResumeJoin`）はルームコードを**いま居るルーム**（`room?.code ?? joinCode`）から取る。退出・`session-lost` の破棄はそのルームの鍵だけを消す
- [ ] **Step 4: 移行は行わない。** 旧 `sessionStorage` の値は読まない（トークンはサーバー再起動で失効する短命な資格情報であり、移す価値が無い）。**この判断を docstring に書く**
- [ ] **Step 5: 緑を確認**
- [ ] Verify: `corepack pnpm --filter @tasuki/timer-web test`

---

### Task 7: `timer-core → room-core` を外す（Issue #246 完了条件・D17）

**Files:**
- Create: `apps/tasuki-sync/src/application/normalize-command-names.ts` / `test/normalize-command-names.test.ts`
- Modify: `packages/room-core/src/display-name.ts` / `src/index.ts`
- Modify: `packages/timer-core/src/schemas.ts` / `src/aggregate.ts` / `package.json`
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/timer-web/src/ui/{Join,Setup,components/RosterPanel}.tsx`
- Modify: `packages/poker-core/src/name.ts`（コメントの名指し先）
- Delete → 移設: `packages/timer-core/test/display-name.test.ts`
- Modify: `scripts/audit-dependency-direction.mjs` / `docs/adr/0017-bounded-contexts-and-packages.md`

- [ ] **Step 1: 失敗するテストを書く**（`normalize-command-names.test.ts`）—— timer-core の `display-name.test.ts` が `CommandSchema` 経由で見ていた観点を**移す**
  - 前後空白・全角・不可視文字・ラベル偽装の正規化が `room.create` / `room.join` / `participant.addProxy` / `participant.rename` の 4 コマンドで効く
  - 正規化後に空になる名前を拒否する
  - **NFKC で展開する名前が、展開後の長さで拒否される**（前段の緩い上限だけでは突破される）
  - 表示名を持たないコマンドは素通りする（同一オブジェクトを返す）
- [ ] **Step 2: 赤を確認**
- [ ] **Step 3: `room-core` へ規約を集める** —— `MAX_DISPLAY_NAME` / `MAX_NFKC_EXPANSION` を `display-name.ts` へ移し、`validateDisplayName(raw): Result<string, "EmptyName" | "NameTooLong">` を足す（ADR-0016 決定 2 の `Result` 要求）
- [ ] **Step 4: 境界へ配線** —— `ws-adapter` のパース直後に通し、失敗は**既存の `INVALID_COMMAND` フレームと同じ 1 経路**へ合流させる
- [ ] **Step 5: timer-core から表示名を抜く** —— `displayNameStr` を素の文字列へ、import と定数を削除、`package.json` の依存宣言を削除
- [ ] **Step 6: 実経路で確かめる**（[[verify-the-live-path]]）—— live-WS のテストで「正規化された名前が snapshot に載る」「長すぎる名前が `INVALID_COMMAND` で拒まれる」を固定する。**関数のテストだけでは配線の死を検出できない**
- [ ] **Step 7: 破壊検証**（設計正本 §6.3 の 3 つ）
  1. `packages/timer-core` から `@tasuki/room-core` を import → **赤**
  2. `package.json` にだけ書いて import しない → **赤**
  3. どちらもしない → **緑**（対照実行）
  - **入る前に `git status --porcelain` が空であることを見る**（[[verify-the-break-itself]]）
- [ ] **Step 8: 表と記録を直す** —— `ALLOWED` の `packages/timer-core` を `[]` へ（注記も消す）。`docs/adr/0017` に改定節を足し、**期限つき一時依存が解消したことを実測つきで書く**
- [ ] **Step 9: 名指しを掃除する**（[[deleted-symbols-live-on-in-declarations]]）—— `grep -rn "MAX_DISPLAY_NAME\|一時依存\|⏳ S4b" --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md'` で残りを 0 件にする
- [ ] Verify: `corepack pnpm test --force` / `node scripts/audit-dependency-direction.mjs` / `node scripts/audit-structure.mjs`

---

### Task 8: `apps/tasuki-sync/src/poker/` の入れ子を畳む（裁定 3）

**機械的移動。振る舞いを変えない。** 9p の地雷を踏むので 1 ファイルずつ。

**Files:**（13 ファイル）
- `src/poker/adapters/{crypto-id-gen,in-memory-round-store,performance-clock,ws-broadcaster}.ts` → `src/adapters/poker-*.ts`
- `src/poker/application/{commit-room-action,handlers,rate-limit-gate}.ts` → `src/application/poker-*.ts`
- `src/poker/ports/{broadcaster,id-gen,monotonic-clock,round-store}.ts` → `src/ports/poker-*.ts`
- Modify: `src/create-sync-server.ts` / `src/adapters/ws-adapter.ts` / `apps/tasuki-sync/test/poker/*`

- [ ] **Step 1: 移動前に緑であることを確認し、作業ツリーを clean にする**
- [ ] **Step 2: `git mv` を 1 ファイルずつ当て、毎回 `git status --porcelain` で `R` を確認**
- [ ] **Step 3: import を書き換える**（相対パスの深さが 1 段変わる。`../../` → `../`）
- [ ] **Step 4: 名前の衝突を確認** —— `src/application/rate-limit-gate.ts`（timer）と `poker-rate-limit-gate.ts`、`src/ports/broadcaster.ts` と `poker-broadcaster.ts` が並ぶ。**大小違いだけの名前を作らない**（この FS は大文字小文字非区別）
- [ ] **Step 5: 緑を確認**（テストは 1 件も書き換わらないはず。書き換わったら移動ではない）
- [ ] Verify: `corepack pnpm --filter @tasuki/sync test` / `node scripts/audit-assembly-wiring.mjs` / `node scripts/audit-log-hygiene.mjs`（走査対象の宣言が実体と全単射か）

---

### Task 9: 検査・規範文書・E2E・変異検査・仕上げ

- [ ] **Step 1: 規範文書を実体へ合わせる**
  - `docs/plans/resume-token-wiring/spec.md`: FR-006 の「実装は S4b で行う／それまで sessionStorage のまま」を**実施済みの記述へ**（ここは実施後なので完了形が正しい）
  - `docs/timer/ARCHITECTURE.md`（2 箇所）・`docs/adr/0012` の「timer が sessionStorage、poker が localStorage」
  - `e2e/fixtures/test.ts` と `e2e/specs/timer.spec.ts` のコメント
  - **`docs/plans/*/plan.md` は記録なので直さない**（当時の記録である）
- [ ] **Step 2: E2E を足す**（R16）—— 名乗って参加 → タブを閉じる → 同じ URL を開き直す → **名簿の人数が増えないこと**を数で固定する。**既存タグの語彙を増やさない**。文字列一致・`toContain`・否定の空振りを避ける（[[playwright-assertion-traps]]）
- [ ] **Step 3: 申し送りを宛先のある Issue へ書く**（[[dated-obligations-need-their-own-home]]）
  - #247（S5a）: ルーム非依存の既定表示名（裁定 4）／ツール宣言を wire へ足すかの判断（裁定 2）
- [ ] **Step 4: 変異検査** `node scripts/mutation-check.mjs`（作業ツリーが clean でないと走らない）。**在席判定に変異が無ければ足す**（S4a で `shouldAutoReveal` に変異が無かったのと同じ型の穴）
- [ ] **Step 5: 指標を main と突き合わせる**（[[metrics-without-a-verdict-need-a-baseline]]）—— `git worktree add --detach <path> origin/main` で main 側も流し、SC031 / SC032 / SC036 を並べる。**SC032 が後退していたらこの PR で直す**
- [ ] **Step 6: 実画面検証**（原則 V）—— `pnpm dev` の `http://localhost:5175/` で
  1. timer のルームを作り、同じ URL を**別タブ**で開いて 2 タブが 1 人として見えること
  2. 1 タブを閉じても残りが `online` のままであること
  3. タブを全部閉じて開き直すと同じ人として戻ること
  4. 終わったら**ポートを解放する**（[[free-dev-ports-when-done]]）
- [ ] **Step 7: `corepack pnpm test --force` と `pnpm e2e` を全件**
- [ ] **Step 8: DoD 8 項目**を PR 本文へ。**利用者から見える変化**を列挙する
- [ ] **Step 9: 敵対的レビュー**（[[verify-artifacts-adversarially]]）—— 文脈を共有しない分割レビューを掛ける。**ブランチ全体に対しても掛ける**（S4a ではタスク単位を通り抜けた Important が全体レビューで 12 件出た）

---

## 仕上げ

- [ ] `git status --porcelain` が空
- [ ] `corepack pnpm test --force` が 11 タスク緑
- [ ] `pnpm e2e` 全件緑
- [ ] `node scripts/audit-structure.mjs` / `audit-dependency-direction.mjs` / `check-links.mjs` / `mutation-check.mjs`
- [ ] PR を `main` へ（squash）。本文に**利用者から見える変化**・移した／消したテストの根拠・未配布の申し送り（`MAX_ROOMS` / `MAX_CONNECTIONS`）
- [ ] **デプロイはしない**（[[never-deploy-without-asking]]）

## 自己レビュー（着手前に自分の計画を疑う）

- **Task 2 と Task 3 を分けた理由**: wire の変更（35 ファイルの機械的差分）と模型の変更（振る舞い）を 1 コミットに混ぜると、レビューがどちらも見なくなる
- **Task 4 の 1 つめのテストは現行実装で緑になりうる。** `presence === "offline"` 判定でも「ハブ接続だけの人」は作れない（ハブが無いため）。**だから「`tool: null` の接続を持つ参加者」を先に作れる形にしてから赤を見る**。ここを飛ばすと D21 の変更が恒真化する
- **Task 5 は Issue 本文に無い。** 完了条件の「`Participant` を多接続模型にし」の射程に入ると判断した。入らないなら poker は 2 タブで壊れたまま残る
- **Task 7 の危険**: 表示名の検証を境界の外へ出すと、**単体テストから直接ハンドラを呼ぶ 600 件超が正規化されない値を流す**。これは現状と同じだが、「テストが緑だから配線が生きている」とは言えない。Step 6 の live-WS を必ず通すこと
- **最大の危険は Task 2**。`connId` を読む 200 箇所のうち、名簿の `connId` を読んでいるのは一部で、残りは接続そのものの ID である。**取り違えると「自分の接続を他人の在席として数える」**。置換ではなく 1 箇所ずつ意味を見て直す
