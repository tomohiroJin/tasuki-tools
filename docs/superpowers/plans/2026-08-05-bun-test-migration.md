# timer-sync のテストを bun test へ移し、Bun.serve に統一する実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/timer-sync` のテストを vitest から `bun test` へ移し、WS アダプタを `Bun.serve` で書き直して、両 sync サーバーを同じ土台に載せる。その上で `sync-kit` として何が本当に共有できるかを再評価する。

**Architecture:** テスト基盤 → アダプタ → 共通化の順に進む。逆順にすると、アダプタを書き換えた瞬間にテストが動かなくなり（`Bun.serve` は vitest のワーカーで使えない）、正しさを確かめる手段が無くなる。

**Tech Stack:** Bun 1.3 / `bun:test` / Bun.serve WebSocket / TypeScript / turbo

**設計の正本:** `docs/superpowers/specs/2026-08-04-monorepo-unification-design.md` の「S5（#20）」

## Global Constraints

- **外から見える振る舞いを変えない。** Origin 不許可は 1008、接続数超過は 1013、64KB 超は `MESSAGE_TOO_LARGE` を返して**接続は保つ**、非 Upgrade の HTTP は 426
- **本番デプロイはしない。** epic #15 の全段階が終わってから、指示を得て 1 回だけ行う
- 作業は **`/home/vscode/tasuki-work`**（overlay）。`/workspaces` では構造変更が壊れる
- `main` への直接コミット禁止。コミットメッセージは Conventional Commits + 日本語
- 各段で `turbo run typecheck lint build test` が全緑であること

## なぜこの順序か（前提の確認）

**vitest のワーカーは Node で起動されるため、テストプロセス内で `Bun.serve` を使えない。**

```
vitest（pnpm 経由）  → typeof Bun === "undefined"
bun x vitest         → ❌ "Bun is not defined"
```

timer の heartbeat テスト 4 件は `vi.useFakeTimers` と `vi.spyOn(globalThis, "clearInterval")`
を使っており、アダプタが同一プロセスにいることが前提。サブプロセス化すると
Issue #25（半開き接続の検出）の中核が検証できなくなる。だから**テスト基盤を先に移す**。

## 実測済みの前提（再調査不要）

すべて 2026-08-05 に `bun test` v1.3.14 で確認済み。

| 確認したこと | 結果 |
|---|---|
| `Bun.serve` が `bun test` のプロセス内で動く | ✅ |
| `spyOn(globalThis, "clearInterval")` | ✅ |
| フェイクタイマー | ✅ |
| **実時間で WS 接続 → フェイク化 → `advanceTimersByTime` → `terminate` → close 観測** | ✅ |
| フェイクタイマー下でも実 I/O（fetch・WebSocket）が動く | ✅ |
| ~~**tsconfig の `paths` を Bun がそのまま解決**（`@tasuki/timer-core` / `.../aggregate` とも）~~ | ❌ **誤り**（下記） |

> ⚠ **訂正（2026-08-05・PR #61 の敵対的検証）**
>
> 「Bun が tsconfig の `paths` を解決する」は誤りだった。実際に効いているのは
> **pnpm workspace の symlink と `packages/timer-core/package.json` の
> `main: "./src/index.ts"`** で、`paths` は Bun の実行時解決には使われていない。
>
> - `paths` を存在しないファイルに書き換えても 11 件が緑のまま通る
> - `@tasuki/timer-core/evolve` を import するテストを足すと **解決に失敗する**
>
> したがって `vitest.config.ts` を消すと **サブパス import が使えなくなる**。
> timer-sync には該当する import が 1 件も無いため実害は無いが、timer-web には
> 12 件あり（vite/vitest の alias で解決）、**timer-sync だけが使えない非対称**が残る。

**順序が肝**: WebSocket の接続確立は**実タイマーのうちに済ませ**、その後でフェイク化する。

## API 対応表

| vitest | bun:test | 箇所 |
|---|---|---|
| `import ... from "vitest"` | `from "bun:test"` | 56 |
| `vi.fn` / `vi.spyOn` / `vi.restoreAllMocks` | `jest.*` そのまま | 29 |
| `vi.useFakeTimers` / `useRealTimers` / `advanceTimersByTime` | `jest.*` そのまま | 43 |
| `vi.getTimerCount` | `jest.getTimerCount` | 1 |
| **`vi.runAllTimersAsync()`** | **無い** → `jest.runAllTimers()` + 短い実待機 | 9 |
| **`vi.advanceTimersByTimeAsync(n)`** | **無い** → `jest.advanceTimersByTime(n)` + 短い実待機 | 2 |
| `vi.useFakeTimers({ toFake: [...] })` | 選択指定は無い。全フェイクでも実 I/O は動く | 14 |

Bun 側に存在: `runAllTimers` / `runOnlyPendingTimers` / `advanceTimersToNextTimer` /
`getTimerCount` / `setSystemTime` / `fn` / `spyOn` / `restoreAllMocks` / `clearAllMocks`。

---

## Task 1: テストを bun test へ移す

**Files:**
- Modify: `apps/timer-sync/test/**/*.test.ts`（**56 ファイル**）
- Modify: `apps/timer-sync/package.json`（`test` スクリプト）
- Delete: `apps/timer-sync/vitest.config.ts`（bare な `@tasuki/timer-core` は
  workspace の symlink で解決される。サブパスは解決できなくなるが利用箇所は 0 件）

**Interfaces:**
- Produces: `bun test` で 395 件が緑になる状態。Task 2 のアダプタ書き換えはこれが前提

- [ ] **Step 1: ブランチを切り、移行前の値を控える**

```bash
cd /home/vscode/tasuki-work
git checkout main && git pull
git checkout -b refactor/issue-20-bun-test
corepack pnpm --filter @tasuki/timer-sync test 2>&1 | grep -E "Tests|Test Files"
```

Expected: `Test Files 56 passed (56)` / `Tests 395 passed (395)`

- [ ] **Step 2: import を一括で置き換える**

```bash
cd apps/timer-sync
git grep -l 'from "vitest"' -- test | while IFS= read -r f; do
  sed -i 's|from "vitest"|from "bun:test"|' "$f"
done
git grep -c 'from "vitest"' -- test || echo "(残存なし)"
```

- [ ] **Step 3: `vi.` を `jest.` へ置き換える**

`bun:test` は `vi` を輸出しないので、識別子ごと変える。

```bash
git grep -l '\bvi\.' -- test | while IFS= read -r f; do
  sed -i 's|\bvi\.|jest.|g; s|\bvi,|jest,|g; s|{ vi }|{ jest }|g' "$f"
done
# import 文の並びを直す（vi が jest になっているか目視）
git grep -n 'import {.*jest.*} from "bun:test"' -- test | head -5
```

- [ ] **Step 4: 非同期のタイマー API を置き換える（11 箇所）**

`runAllTimersAsync` / `advanceTimersByTimeAsync` は Bun に無い。同期版に変え、
**タイマーで起きた処理がイベントループに乗るのを待つ**ため短い実待機を足す。

```ts
// 置換前
await vi.runAllTimersAsync();
// 置換後
jest.runAllTimers();
jest.useRealTimers();          // 実待機のためフェイクを外す
await new Promise((r) => setTimeout(r, 20));
```

```bash
git grep -n 'runAllTimersAsync\|advanceTimersByTimeAsync' -- test
```

Expected: 11 箇所。**1 つずつ、そのテストの意図を読んでから直す**（機械置換しない）

- [ ] **Step 5: `test` スクリプトを差し替える**

`apps/timer-sync/package.json`:

```json
"test": "bun test"
```

- [ ] **Step 6: `vitest.config.ts` を削除する**

timer-sync が使うのは bare な `@tasuki/timer-core` だけ（57 箇所）で、これは
workspace の symlink と `main: "./src/index.ts"` で解決される。**`paths` は tsc の
型解決には効くが、Bun の実行時解決には使われない**ため、サブパス import は
できなくなる（利用箇所は 0 件）。

```bash
git rm apps/timer-sync/vitest.config.ts
```

- [ ] **Step 7: 全件が通ることを確認する（緑）**

```bash
cd apps/timer-sync && bun test 2>&1 | tail -5
```

Expected: **395 pass / 0 fail**。件数が減っていたら、拾われていないファイルがある
（`bun test` の既定の探索は `*.test.ts`。`test/` 配下の入れ子も拾うことを確認する）

- [ ] **Step 8: turbo から回して全体が緑であることを確認する**

```bash
cd /home/vscode/tasuki-work
corepack pnpm turbo run typecheck lint build test --force 2>&1 | grep -E "Tasks:|Tests"
```

Expected: 30 タスク成功・**合計 1,743 件**

- [ ] **Step 9: CI が通ることを確認してコミット**

CI は `pnpm test` → `turbo run test` 経由なので、ジョブ定義の変更は不要（Bun は既に導入済み）。

## Task 2: WS アダプタを Bun.serve へ書き直す

**Files:**
- Modify: `apps/timer-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/timer-sync/src/server.ts`（`httpHandler` の呼び出し）
- Modify: `apps/timer-sync/test/ws-adapter.admin.test.ts`（`req.url` → `req.path`）
- Modify: `apps/timer-sync/package.json`（`ws` を devDependencies へ）

**Interfaces:**
- Consumes: Task 1 の `bun test` 環境
- Produces: `Bun.serve` ベースのアダプタ。`WsAdapterOptions` の `httpHandler` が
  `{ method, path, headers }` を受け取る形になる

**注意点（前回書いたときに判明したもの）:**

- **Origin / 接続数の検査は upgrade してから `close(1008/1013)`。**
  ハンドシェイク自体を拒否すると、クライアントには「接続失敗」としか見えず、
  理由を表す close コードが届かない（既存テストが code を検証している）
- **Bun の `maxPayloadLength` を使わない。** 超過時に接続を閉じてしまう。
  現行は `MESSAGE_TOO_LARGE` を返して接続を保つので、自前に測る
- `httpHandler` は Node の `IncomingMessage` 依存を外し、
  `{ method, path, headers }`（小文字キー）に正規化する。
  **`handleAdminHttp` の signature は変えない**
- `ws` はテストがクライアントとして使うので **devDependencies に残す**
  （`origin` ヘッダを指定できるのが標準 WebSocket に無い）

- [ ] **Step 1: 書き換え前に全テストが緑であることを確認する**
- [ ] **Step 2: アダプタを `Bun.serve` で書き直す**
- [ ] **Step 3: `server.ts` と admin テストの呼び出しを新しい形へ**
- [ ] **Step 4: `apps/timer-sync` の 395 件が緑であることを確認する（最重要ゲート）**
- [ ] **Step 5: 実サーバーを起動して WebSocket 往復を確認する**

```bash
PORT=8787 corepack pnpm --filter @tasuki/timer-sync start &
# 別プロセスで web を起動し、ルーム作成 → 2 人目参加 → 同期までを Playwright で通す
```

- [ ] **Step 6: コミット**

## Task 3: sync-kit として何が共有できるか再評価する

**両者が同じ土台に乗ってから測る。** 先に「共有するもの」を決めない。

- [ ] **Step 1: 両 sync の実装を並べて、同じ形になった箇所を数える**
- [ ] **Step 2: 20 行に満たないなら抽出しない**。理由を #20 に記録して閉じる
- [ ] **Step 3: 抽出する場合は、両方が実際に使う形にしてから緑を確認する**

> ⚠ **利用者が 1 つしかないものを「将来のため」に抽出しない。**
> `packages/ui` から伏せ札の裏模様を外したのと同じ判断基準を使う。

## Task 4: #20 を閉じる

- [ ] **Step 1: 全体検証**（turbo 全緑・構造監査・変異検査 9 件検出）
- [ ] **Step 2: PR を出す**（本番検証未実施を明記）
- [ ] **Step 3: #20 に結果を記録してクローズ**

---

## リスクと対処

| リスク | 対処 |
|---|---|
| 一括置換で意図が壊れる（特に非同期タイマー 11 箇所） | Step 4 は**機械置換しない**。1 つずつテストの意図を読んで直す |
| `bun test` が拾うファイルが vitest と違い、件数が静かに減る | Step 7 で **395 件**を数える。減っていたら探索範囲を疑う |
| アダプタ書き換えで close コードや エラーコードが変わる | `test/ws-adapter.*.test.ts` 18 件が押さえている。**メッセージ経路の 7 件は 2026-08-05 に新設したもの** |
| フェイクタイマーの全フェイク化で WS ハンドシェイクが止まる | **接続確立を実タイマーのうちに済ませる**順序にする（実測で成立を確認済み） |
| 共有できるものが無いのに sync-kit を作ってしまう | Task 3 Step 2 の「20 行に満たないなら抽出しない」を守る |
