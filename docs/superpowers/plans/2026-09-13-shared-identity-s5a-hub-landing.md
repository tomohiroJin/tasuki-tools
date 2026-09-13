# #95 S5a（#247）LP をハブにし、timer をハブ経由で使えるようにする — 実装計画

> **作業する人へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` でタスク単位に実施すること。手順はチェックボックス（`- [ ]`）で追う。

**目的:** LP（`apps/landing`）を同期クライアントにし、ルームの作成・参加・ツール選択を
LP だけで行えるようにする。timer は選択画面から使えるようにし、**旧入口も残す**（S5c で畳む）。

**設計:** ハブ（LP）は `/ws` に繋ぐ。接続がどのツールに居るかは **入口（パス）が宣言する**
（S4b の形の延長）。ハブは名簿だけを扱う専用のメッセージ層と話し、timer の wire を知らない。
同期クライアントの接続部分は `packages/sync-client` へ切り出し、LP と timer-web の 2 つが使う。

**技術:** TypeScript 6 / React 19 / Vite 8 / Vitest 4 / Bun（sync）/ valibot / Playwright。

**設計正本:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`
（§3.10・§3.13b・§5.7・§7 の S5a 行・D7・D10・D11・D12・D14・D18・D20・D21）
**要求の正本:** [#247](https://github.com/tomohiroJin/tasuki-tools/issues/247)（EARS: R1・R2・R3・R4・R6・R7・R10・R13）
**決定の正本:** `docs/adr/0017`・`0018`・`0019`

---

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを失敗するテストから始める。判定は純粋関数へ切り出す（`hub-state.ts` / `roster-dto.ts`） |
| II. 技術選定は ADR を通す | 該当なし | 新しいライブラリを足さない。`valibot` は既にリポジトリにある同じ版を room-core へ足すだけである（`@tailwindcss/postcss` の前例と同型） |
| III. 揮発インメモリと単純運用 | 通過 | ルームの寿命と回収（`room-reclaimer`）を変えない。ハブの接続も揮発のままで、端末側の保存は `localStorage`（原則 III が「クライアント側のローカル保存はこの限りではない」と明示している） |
| IV. 境界の型安全 | 通過 | ハブの受信は `parseBoundaryMessage(HubServerMsgSchema, raw)`、送信の検証は `HubCommandSchema`。`localStorage` の読み出しも型注釈を信じず形を検める |
| V. 実画面検証 | 通過 | Task 10 Step 3 で `http://localhost:5175/` の全遷移を目で通す（#247 の完了条件） |
| VI. 依存は内向き | 通過 | LP は `@tasuki/room-core` と `@tasuki/sync-client` にだけ依存し、`@tasuki/timer-core` を知らない。依存の向きは `scripts/audit-dependency-direction.mjs` が機械的に見る |
| VII. 検査は壊して確かめる | 通過 | Task 1 Step 7・Task 4 Step 6 で破壊検証（対照実行つき）。Task 10 Step 2 で変異検査へ 3 件足す |
| VIII. 記録が正本 | 通過 | 決定は ADR-0017/0018/0019、要求は #247、実測と段階は設計正本、様式は `docs/guides/`。この計画はそれらを指すだけで転記しない |
| IX. 小さく回す | 通過 | PR 1 本。配備資材は同じ PR に入れる（設計正本 §7 スライスの原則 3）。**デプロイは伴わない**（全段完了後に 1 回・利用者の承認を得てから） |
| X. 抽象は実需で | 通過 | `packages/sync-client` の利用者は LP と timer-web の 2 つ（S5b で poker-web が 3 つ目）。**抽出だけを先行させない**（設計正本 §8） |
| XI. 秘密と個人情報を持ち込まない | 通過 | 表示名と在席は分類「個人に紐づく」（ADR-0011 決定 1・D12）。ログへ出さず、ルーム内へのみ配信する。`resumeToken` は分類「資格情報」で扱いを変えない。**ハブの参加にも合言葉の照合を置く**（Task 5） |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

---

## 着手前に読むもの

1. `docs/guides/definition-of-done.md`（DoD 8 項目。該当しない項目は「該当なし」と明記する）
2. `docs/constitution.md`（原則 IV 境界の検証・原則 V 実画面検証・原則 VII 破壊検証・原則 X 抽象の下限）
3. `docs/adr/0015`（web 層の 3 責務）と `docs/adr/0019`（その射程に LP を含める）

## この計画が前提を実測した結果（2026-09-13・main `7689fb5`）

**Issue 本文と設計正本に無かった事実が 4 つある。** どれも実装の形を変える。

| # | 実測した事実 | 帰結 |
|---|---|---|
| 1 | **`/ws` は今まさに timer が使っている。** `deploy/timer/caddy/10-timer-ws.conf` が `/timer/ws` を `rewrite * /ws` して渡し、`apps/timer-web/vite.config.ts` の dev プロキシも同じ rewrite を持つ | ハブを `/ws` に置く前に、**両方の rewrite を外す**（Task 4）。順序を逆にすると timer の接続がハブ扱いになり、全員が timer の一覧から消える |
| 2 | **ハブの接続には何も配信されない。** `create-sync-server.ts` の `recipientsOf` は `connectionsIn(room, TOOL_TIMER)` で、`tool: null` の接続は全配信の宛先に入らない | R3 を満たすには**名簿の配信先を新設**する（Task 3・Task 5） |
| 3 | **timer の wire は在席で絞っていない。** `buildTimerSnapshotRoom` は名簿の全員を `presenceOf`（どこかに繋いでいれば online）で載せる。poker 側は既に `isPresentIn(p, TOOL_POKER)` で絞っている（`poker-handlers.ts:190`） | R6 は timer の wire を絞って満たす（Task 6） |
| 4 | **保護ルームの名簿がハブから読めてしまう。** `tokenStore.getPassphrase(code)` の照合は timer の `room.join` にしかない | ハブの `room.join` にも**同じ照合を置く**（Task 5）。S4a で実際に出た欠陥（合言葉を通さずに snapshot が読めた）と同型である |

**利用者の裁定（2026-09-13）。** ①`tool` は経路で分ける（`/ws`＝ハブ）②ハブ専用のメッセージ層を
新設し名簿の wire は `@tasuki/room-core` に置く ③ハブの `room.create` は今までどおり timer 状態も作る
④R6 は wire の `participants` から落として満たす。

## 指標の基準値（main `7689fb5` で実測。突合はこの値と行う）

```
SC031 | 2      | 未達（既存）
SC032 | 1446/1448（99.9%）
SC036 | 1885
SC039 | 分岐 0 / データ 0 行 / 公開記号 0 件 / 公開契約 0 件
走査対象: src 9 パッケージ / 187 件、test 10 パッケージ / 279 件
```

**SC-032 は合否の無い行なので、放っておくと後退しても CI が緑のまま通る。**
各タスクの最後ではなく、Task 10 で 1 度だけ突き合わせる（S4a・S4b で 2 度後退させている）。

## Global Constraints（全タスクの要求に暗黙に含まれる）

- **日本語**で書く。コメント・docstring・テスト名・コミットメッセージ本文。テストは
  `Given ... / When ... / Then ...` の形で名前を付け、本体が 3 行以上なら**前提と操作を空行で区切る**（SC-032）
- **生の色を書かない。** 色・間隔・角丸は `@tasuki/ui` のトークン（CSS 変数）を使う
- **`console` を書かない**（`scripts/audit-log-hygiene.mjs`。ブラウザ側も許可マーカー無しでは通らない）
- **`export *` を書かない**（`scripts/audit-public-surface.mjs`）。公開契約は `index.ts` に列挙する
- **ドメインに `Date.now` / `Math.random` を書かない**（`scripts/audit-domain-side-effects.mjs`）
- **新しいライブラリを足さない。** 使ってよいのは既にこのリポジトリにある版（valibot 1.4 / neverthrow 8 / React 19）
- **1 コミット＝1 つの論理的変更。** 型は `feat` / `fix` / `refactor` / `test` / `docs` / `chore`
- **作業ツリーが汚れていると変異検査は走らない。** コミットしてから `node scripts/mutation-check.mjs`
- **リンク検査は `git ls-files` を見る。** 新規ファイルは `git add` するまで走査されない

---

## ファイル構成（このタスク列で作る・変える場所）

### 新規

| パス | 責務 |
|---|---|
| `packages/sync-client/package.json` | 新パッケージ（`@tasuki/sync-client`） |
| `packages/sync-client/src/index.ts` | 公開契約（列挙する。`export *` を書かない） |
| `packages/sync-client/src/backoff.ts` | 指数バックオフ（timer-web から移設） |
| `packages/sync-client/src/connection.ts` | WS の保持・再接続・送信キュー・dispose。**`new WebSocket` はここだけ** |
| `packages/sync-client/src/join-retry.ts` | 入室の再試行方針（timer-web から移設） |
| `packages/sync-client/tests/*.test.ts` | 上記のテスト（移設したものを含む） |
| `packages/room-core/src/wire.ts` | 名簿の wire（`RosterRoom` / `RosterParticipant`）と valibot スキーマ |
| `apps/tasuki-sync/src/application/hub-handlers.ts` | ハブのメッセージ層（`room.create` / `room.join`） |
| `apps/tasuki-sync/src/application/save-roster.ts` | 名簿の保管と配信を束ねる唯一の経路 |
| `apps/landing/src/hub/use-hub-sync.ts` | LP の同期フック（**1 本だけ**・ADR 0015） |
| `apps/landing/src/hub/storage.ts` | 復帰の組（ルーム別）とルーム非依存の既定表示名 |
| `apps/landing/src/hub/room-param.ts` | URL の `?room=` の読み書き（純粋関数） |
| `apps/landing/src/hub/invite-url.ts` | 参加用 URL の組み立て（純粋関数） |
| `apps/landing/src/screens/CreateRoom.tsx` | 作成（ルーム名＋表示名） |
| `apps/landing/src/screens/JoinRoom.tsx` | 参加（表示名・必要なら合言葉） |
| `apps/landing/src/screens/RoomChoice.tsx` | 選択画面（ルーム名・参加者一覧・参加用 URL・ツールの札） |
| `deploy/landing/caddy/05-hub-ws.conf` | `/ws` → 8787（新設。ハブの入口） |

### 変更

| パス | 何を |
|---|---|
| `scripts/audit-web-sync-boundary.mjs` | 走査対象を名前の形から実体へ。`apps/landing` を宣言に載せる |
| `scripts/audit-web-sync-boundary.test.mjs` | 上記の自己テスト |
| `scripts/audit-log-hygiene.mjs` | `SCANNED_PACKAGES` に `packages/sync-client` |
| `scripts/audit-dependency-direction.mjs` | `ALLOWED` に `packages/sync-client` と LP の新しい依存 |
| `packages/room-core/{package.json,src/index.ts,src/room.ts}` | valibot 依存・wire の公開・`connectionsIn` の値域 |
| `apps/timer-web/src/sync/{client.ts,backoff.ts,join-retry.ts}` | sync-client を使う形へ（実体は移設） |
| `apps/timer-web/src/sync/sync-url.ts` | `/timer/ws` のまま（rewrite が無くなることを docstring に書く） |
| `apps/timer-web/vite.config.ts` | dev プロキシの rewrite を外す |
| `apps/tasuki-sync/src/adapters/ws-adapter.ts` | `/ws` → hub。`ConnectionData.protocol` に `"hub"` |
| `apps/tasuki-sync/src/create-sync-server.ts` | ハブの配信先・ハブのメッセージ層の配線 |
| `apps/tasuki-sync/src/application/{handlers.ts,presence.ts,poker-handlers.ts}` | 名簿の保管を `save-roster.ts` 経由へ |
| `apps/tasuki-sync/src/application/timer-snapshot-dto.ts` | `participants` を timer 在席者＋代理に絞る |
| `apps/landing/{package.json,vite.config.ts,src/App.tsx,index.css}` | 依存・`/ws` の dev 中継・3 状態 |
| `deploy/timer/caddy/10-timer-ws.conf` | `rewrite * /ws` を外す |
| `deploy/timer/caddy/40-timer-legacy-room.conf` | **削除**（D11） |
| `deploy/caddy/{tasuki.conf,README.md}`・`deploy/timer/NOTES.md`・`deploy/landing/NOTES.md` | 断片の顔ぶれ |
| `e2e/harness/paths.ts` | `FRAGMENT_SOURCES`（1 本増え 1 本減る） |
| `e2e/specs/{routing,landing,timer}.spec.ts`・`e2e/README.md` | 旧救済の消滅とハブの導線 |
| `apps/timer-web/test/ui/room-url.test.ts` | 旧救済断片を読むテストの置き換え |
| `apps/tasuki-sync/test/ws-routing.test.ts` | `/ws` の行き先が変わる |

---

## Task 1: 検査の走査対象を「名前の形」から「実体」へ変える（D20・地雷 9）

**なぜ最初か。** LP が同期クライアントになる**前に**済ませる。順序を逆にすると、規範の外で
同期フックが 1 本できる（設計正本 §7 既知の地雷 9）。

**Files:**
- Modify: `scripts/audit-web-sync-boundary.mjs`（`listWebAppDirs` と `WEB_APPS`）
- Modify: `scripts/audit-web-sync-boundary.test.mjs`

**Interfaces:**
- Produces: `WEB_APPS` に `apps/landing` の項目（`syncModules: []` / `allowedImporters: []` / `wsHolders: []`）。
  Task 2 と Task 7 がこの項目を埋める

- [ ] **Step 1: いまの導出が LP を落とすことを、赤で先に見る**

`scripts/audit-web-sync-boundary.test.mjs` に足す（既存の `describe` の中）。

```js
test("実体の導出は apps/landing を web アプリとして返す", () => {
  // Given: リポジトリの実体（宣言ではない）
  // When: 走査対象を導出する
  const dirs = listWebAppDirs();

  // Then: 名前が -web で終わらない LP も web アプリとして返る
  assert.ok(dirs.includes("apps/landing"), `実体: ${dirs.join(" / ")}`);
});
```

`listWebAppDirs` は現在 export されていない。**export を足すのはこのステップの一部**である
（`main()` の薄い配線と判定を分ける、という同ファイルの設計方針どおり）。

- [ ] **Step 2: 赤を確認する**

```
node --test scripts/audit-web-sync-boundary.test.mjs
```
期待: `実体の導出は apps/landing を web アプリとして返す` が失敗（`apps/poker-web / apps/timer-web`）。

- [ ] **Step 3: 導出を実体へ変える**

`apps/*-web/package.json` は**名前の綴り**に依存している。「web アプリである」ことの代理指標を
`index.html` の実在に変える（SPA は必ず持ち、`apps/tasuki-sync` は持たない）。

```js
/**
 * web アプリの実体を、宣言（`WEB_APPS`）から独立に導出する（ADR-0014 決定 1・ADR-0019）。
 *
 * **名前の綴り（`apps/*-web`）で導出してはならない。** `apps/landing` のように規約から
 * 外れた名前が現れた瞬間、検査が静かに空振りする（`docs/adr/0014`・設計正本 §3.10）。
 * 代理指標は **`index.html` の実在**にする —— vite の SPA は必ず持ち、同期サーバー
 * （`apps/tasuki-sync`）は持たない。`package.json` ではなく `index.html` を見るのは、
 * 「ブラウザで開く入口を持つか」が web 層（`docs/adr/0015`）の射程そのものだからである。
 *
 * pathspec の `*` は `/` を跨ぐため、返ってきた相対パスを 1 階層限定の正規表現で絞り込む。
 */
export function listWebAppDirs() {
  const candidates = listRepoFiles(REPO_ROOT, ["apps/*/index.html"]);
  return candidates
    .filter((rel) => /^apps\/[^/]+\/index\.html$/.test(rel))
    .map((rel) => rel.slice(0, -"/index.html".length))
    .sort();
}
```

- [ ] **Step 4: 緑を確認し、本体が「宣言と実体のずれ」で落ちることを見る**

```
node --test scripts/audit-web-sync-boundary.test.mjs   # 緑
node scripts/audit-web-sync-boundary.mjs               # 赤（apps/landing が宣言されていない）
```
**この赤が D20 の「載らない状態で赤になることを先に確かめる」である**（設計正本 §6.2）。
出力に `実在する web アプリが WEB_APPS に宣言されていません: apps/landing` が出ること。

- [ ] **Step 5: 宣言に `apps/landing` を足す**

```js
  {
    app: "apps/landing",
    // Task 2 で `@tasuki/sync-client` を切り出したので、WS を持つのはそのパッケージだけ。
    // **この 3 つが空であることが宣言である** —— LP の src に同期クライアントの実体も
    // `new WebSocket(` も無い、と言い切っている。空にしておくと検査 2 は
    // 「1 行でも書いたら違反」という最も強い形で効く。
    syncModules: [],
    allowedImporters: [],
    wsHolders: [],
  },
```

- [ ] **Step 6: 自己テストへ「宣言の顔ぶれ」を固定する**

```js
test("WEB_APPS は timer / poker / landing の 3 つである", () => {
  // Given / When: 宣言そのもの
  const apps = WEB_APPS.map((a) => a.app).sort();

  // Then: 足すときは必ずこのテストも直す（宣言を黙って増やせない）
  assert.deepEqual(apps, ["apps/landing", "apps/poker-web", "apps/timer-web"]);
});
```

- [ ] **Step 7: 破壊検証（対照実行つき）**

```
node scripts/audit-web-sync-boundary.mjs                    # 緑（対照）
# apps/landing/src/tools.ts の末尾に `// new WebSocket(` を 1 行足す
node scripts/audit-web-sync-boundary.mjs                    # 赤（WS の保持先）になること
git checkout -- apps/landing/src/tools.ts
```
**入る前に `git status --porcelain` が空であることを確かめる。**

- [ ] **Step 8: コミット**

```bash
git add scripts/audit-web-sync-boundary.mjs scripts/audit-web-sync-boundary.test.mjs
git commit -m "fix: web 層の検査の走査対象を名前の形から実体へ変える（#95 S5a・#247）

- apps/*-web という綴りに依存した導出は apps/landing を静かに落としていた（設計正本 §3.10）
- 代理指標を index.html の実在にし、LP を宣言に載せた（ADR-0019・D20）
- LP を同期クライアントにする前に済ませる（規範の外に同期フックを作らないため）"
```

---

## Task 2: `packages/sync-client` を切り出し、timer-web を移す（D18）

**抽出だけを先行させない**（設計正本 §8）。利用者は timer-web（このタスク）と LP（Task 7）の 2 つ。
**移すのは接続・指数バックオフ・再参加の 3 つだけ**で、ツール固有のコマンドと画面状態は各アプリに残す。

**Files:**
- Create: `packages/sync-client/{package.json,tsconfig.json,vitest.config.ts,README.md}`
- Create: `packages/sync-client/src/{index.ts,connection.ts,backoff.ts,join-retry.ts}`
- Create: `packages/sync-client/tests/{connection.test.ts,backoff.test.ts,join-retry.test.ts}`
- Modify: `apps/timer-web/src/sync/client.ts`（`new WebSocket` と再接続を `SyncConnection` へ）
- Delete: `apps/timer-web/src/sync/{backoff.ts,join-retry.ts}`（テストごと移設）
- Modify: `apps/timer-web/package.json`（`@tasuki/sync-client` を依存に）
- Modify: `scripts/audit-web-sync-boundary.mjs`（timer-web の `wsHolders` が空になる）
- Modify: `scripts/audit-log-hygiene.mjs`（`SCANNED_PACKAGES` に `packages/sync-client`）
- Modify: `scripts/audit-dependency-direction.mjs`（`ALLOWED`）
- Modify: `e2e/tests/join-retry-policy.test.ts`（読む先が `packages/sync-client/src/join-retry.ts` になる）

**Interfaces:**
- Produces:
  ```ts
  export interface SyncConnectionOptions {
    url: string;
    /** 受信した生テキスト。**パースも検証もしない**（境界の検証は利用側の責務）。 */
    onMessage: (raw: string) => void;
    onOpen?: () => void;
    onClose?: () => void;
    /** 切断後にスケジュールされた再接続が確立したときだけ呼ばれる（初回は呼ばれない）。 */
    onReconnected?: () => void;
    onConnectionChange?: (state: "online" | "reconnecting") => void;
  }
  export class SyncConnection {
    constructor(options: SyncConnectionOptions);
    connect(): void;
    /** OPEN 前は接続確立までキューへ退避する。 */
    send(payload: Record<string, unknown>): void;
    dispose(): void;
  }
  export class ExponentialBackoff { nextDelay(): number; reset(): void; }
  export const JOIN_RETRY_MAX_ATTEMPTS: number;
  export function joinRetryDelayMs(attempt: number, random?: () => number): number | null;
  ```
- Consumes: なし（依存を持たないパッケージにする。`@tasuki/*` を import しない）

- [ ] **Step 1: パッケージの器を作る**

`packages/sync-client/package.json`（`packages/protocol` に倣う。**依存は持たない**）:

```json
{
  "name": "@tasuki/sync-client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": { "jsdom": "^30.0.1", "vitest": "^4.1.11" }
}
```

`tsconfig.json` は `{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }`。
`vitest.config.ts` は `environment: "jsdom"`（`WebSocket` を差し替えて試すため）。
`README.md` に「何を持ち、何を持たないか」を 10 行以内で書く（ツール固有のコマンドは持たない）。

- [ ] **Step 2: 失敗するテストを書く（接続の中身）**

`packages/sync-client/tests/connection.test.ts`。**偽物の `WebSocket` を立てて観測する。**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncConnection } from "../src/connection.js";

/** 観測できる最小の WebSocket。`readyState` と送った中身を覚える。 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SyncConnection", () => {
  it("Given 未接続 / When send する / Then 確立後にまとめて送られる", () => {
    // Given
    const conn = new SyncConnection({ url: "ws://example/ws", onMessage: () => {} });
    conn.connect();

    // When
    conn.send({ command: "room.join", code: "ABC" });
    FakeWebSocket.instances[0]!.open();

    // Then
    expect(FakeWebSocket.instances[0]!.sent).toEqual([
      JSON.stringify({ command: "room.join", code: "ABC" }),
    ]);
  });

  it("Given 一度確立した接続 / When 切断される / Then 待ってから繋ぎ直し onReconnected が呼ばれる", () => {
    // Given
    const onReconnected = vi.fn();
    const conn = new SyncConnection({ url: "ws://example/ws", onMessage: () => {}, onReconnected });
    conn.connect();
    FakeWebSocket.instances[0]!.open();

    // When
    FakeWebSocket.instances[0]!.onclose?.();
    vi.advanceTimersByTime(1000);
    FakeWebSocket.instances[1]!.open();

    // Then
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it("Given dispose 済み / When 接続が閉じる / Then 繋ぎ直さない", () => {
    // Given
    const conn = new SyncConnection({ url: "ws://example/ws", onMessage: () => {} });
    conn.connect();
    FakeWebSocket.instances[0]!.open();

    // When
    conn.dispose();
    FakeWebSocket.instances[0]!.onclose?.();
    vi.advanceTimersByTime(60_000);

    // Then: こちらから閉じた結果を「切断」として扱わない（FR-086 と同じ規律）
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 赤を確認する**

```
corepack pnpm --filter @tasuki/sync-client test
```
期待: `Failed to resolve import "../src/connection.js"`。

- [ ] **Step 4: `connection.ts` を書く**

`apps/timer-web/src/sync/client.ts` の接続部分（`connect` / `send` / `dispose` /
`scheduleReconnect` / `pendingMessages` / `hasConnectedOnce`）を**そのまま**移す。
**ping ループ・`clockOffset`・`dispatchServerMessage` は移さない**（timer の語彙である）。
docstring に「何を持たないか」を書く —— 移設は削り忘れると抽象が漏れる。

- [ ] **Step 5: `backoff.ts` と `join-retry.ts` を移し、テストも移す**

`git mv` で移す（9p でディレクトリ rename が壊れるのはディレクトリの話だが、履歴を残すためにも
ファイル単位で `git mv` を使う）。移設後 `git status --porcelain` で `R` を確認する。

- [ ] **Step 6: 公開契約（`src/index.ts`）を列挙で書く**

```ts
/**
 * 同期クライアントの接続部分（#95 D18）。
 *
 * **ツール固有のコマンドと画面状態は持たない。** 持つのは WS の保持・指数バックオフ・
 * 再接続・送信キュー・入室の再試行方針だけである。利用者は `apps/landing` と
 * `apps/timer-web`（S5b で `apps/poker-web` が加わる）。
 */
export { SyncConnection, type SyncConnectionOptions } from "./connection.js";
export { ExponentialBackoff, type BackoffOptions } from "./backoff.js";
export { JOIN_RETRY_MAX_ATTEMPTS, joinRetryDelayMs } from "./join-retry.js";
```

- [ ] **Step 7: timer-web を移す**

`apps/timer-web/src/sync/client.ts` は `SyncClient` の名前と外から見える契約
（`SyncClientOptions`）を**変えない**。中身を `SyncConnection` に委ね、`new WebSocket` と
再接続の実装を消す。ping ループと `handleMessage` はそのまま残す。

```ts
import { SyncConnection } from "@tasuki/sync-client";
// ...
export class SyncClient {
  private readonly connection: SyncConnection;
  constructor(private readonly options: SyncClientOptions) {
    this.connection = new SyncConnection({
      url: options.url,
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { this.options.onConnected?.(); this.startPingLoop(); },
      onClose: () => { this.stopPingLoop(); this.options.onDisconnected?.(); },
      onReconnected: () => this.options.onReconnected?.(),
      onConnectionChange: (state) => this.options.onConnectionChange?.(state),
    });
  }
  // connect / send / dispose は connection へ委譲する
}
```

**送信キューの二重化に注意。** `SyncClient` 側にもキューを残すと同じコマンドが 2 回出る。
キューは `SyncConnection` の 1 つだけにする。

- [ ] **Step 8: timer-web の既存テストを 1 行も書き換えずに通す**

```
corepack pnpm --filter @tasuki/timer-web test
```
**ここで既存のテストを書き換えたくなったら、それは契約を変えてしまった合図である。**
`client.connection` / `client.dispose` / `client.reconnect` の 3 本のテストは
`SyncClient` を直接 import している（`audit-web-sync-boundary` の「test は対象外」の注記）。

- [ ] **Step 9: 検査の宣言を 3 つ直す**

1. `scripts/audit-web-sync-boundary.mjs`: timer-web の `wsHolders` を `[]`、
   `syncModules`/`allowedImporters` はそのまま（`client.ts` は残り、同期クライアントの実体である）。
   **`wsHolders: []` は検査 2 を「1 行でも書いたら違反」にする**ので弱くならない。
   その旨を宣言のコメントに書く
2. `scripts/audit-log-hygiene.mjs`: `SCANNED_PACKAGES` に `packages/sync-client` を足す
   （**足さないと全単射照合で落ちる。落ちたら対象表を更新するのが正しい対応**・地雷 8）
3. `scripts/audit-dependency-direction.mjs`: `ALLOWED` に
   `"packages/sync-client": []` を足し、`"apps/timer-web"` に `"@tasuki/sync-client"` を足す

- [ ] **Step 10: `e2e/tests/join-retry-policy.test.ts` の読む先を直す**

`apps/timer-web/src/sync/join-retry.ts` → `packages/sync-client/src/join-retry.ts`。
docstring も直す（**poker-web はまだ写経のままで、寄せるのは S5b** である旨を書く）。

- [ ] **Step 11: 全体を通す**

```
corepack pnpm test --force
node scripts/audit-web-sync-boundary.mjs
node scripts/audit-log-hygiene.mjs
node scripts/audit-dependency-direction.mjs
node --test scripts/*.test.mjs
```
**`pnpm test` に scripts の自己テストは入っていない。** 検査を触ったので別に回す。

- [ ] **Step 12: コミット**

```bash
git add packages/sync-client apps/timer-web scripts e2e/tests/join-retry-policy.test.ts
git commit -m "refactor: 同期クライアントの接続部分を packages/sync-client へ切り出す（#95 S5a・#247）

- 接続・指数バックオフ・再接続・送信キュー・入室の再試行方針だけを移した
- ツール固有のコマンドと画面状態は各アプリに残した（D18）
- SyncClient の外から見える契約は変えていない（timer-web のテストを 1 行も書き換えていない）
- 利用者は timer-web と LP（Task 7）の 2 つ。poker-web は S5b で寄せる"
```

---

## Task 3: 名簿の wire と、ハブへの配信先（room-core）

**Files:**
- Create: `packages/room-core/src/wire.ts`
- Create: `packages/room-core/tests/wire.test.ts`
- Modify: `packages/room-core/src/room.ts`（`connectionsIn` の値域）
- Modify: `packages/room-core/src/index.ts`（公開契約に列挙で足す）
- Modify: `packages/room-core/package.json`（`valibot` を dependencies へ）
- Modify: `packages/room-core/tests/room.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** 選択画面へ送る名簿（wire）。**timer / poker の語彙を持たない。** */
  export interface RosterParticipant {
    participantId: string;
    displayName: string;
    presence: "online" | "offline";
    /** その人がいま居るツール（宣言順・重複なし）。ハブだけに居る人は空配列。 */
    tools: string[];
  }
  export interface RosterRoom { code: string; participants: RosterParticipant[] }
  export const RosterRoomSchema: v.GenericSchema<RosterRoom>;
  export const HubServerMsgSchema: v.GenericSchema<HubServerMsg>;
  export type HubServerMsg =
    | { type: "room.created"; code: string; participantId: string; resumeToken: string }
    | { type: "room.joined"; code: string; participantId: string; resumeToken: string }
    | { type: "roster"; room: RosterRoom }
    | { type: "error"; code: string; message: string };
  export const HubCommandSchema: v.GenericSchema<HubCommand>;
  export type HubCommand =
    | { command: "room.create"; roomName: string; displayName: string }
    | { command: "room.join"; code: string; displayName: string; resumeToken?: string; passphrase?: string };
  /** ハブ（tool を宣言していない接続）を含めた配信先の導出。 */
  export function connectionsIn(room: Room, tool: ToolId | null): ConnId[];
  ```
- Consumes: `Room` / `Participant` / `presenceOf`（同パッケージ）

- [ ] **Step 1: 失敗するテストを書く（`connectionsIn` の値域）**

`packages/room-core/tests/room.test.ts` に足す。

```ts
it("Given ハブとツールの接続が混ざった名簿 / When null を指す / Then ハブの接続だけが返る", () => {
  // Given: 1 人が選択画面（宣言なし）とタイマー（timer）を別タブで開いている
  const room: Room = {
    code: "ROOM",
    createdAt: 0,
    participants: [
      { id: "p1", displayName: "あ", joinedAt: 0, connections: new Map([["c1", null], ["c2", "timer"]]) },
      { id: "p2", displayName: "い", joinedAt: 0, connections: new Map([["c3", null]]) },
    ],
  };

  // When / Then: ハブの配信先は tool を宣言していない接続である
  expect(connectionsIn(room, null)).toEqual(["c1", "c3"]);
  expect(connectionsIn(room, "timer")).toEqual(["c2"]);
});
```

- [ ] **Step 2: 赤を確認する**

```
corepack pnpm --filter @tasuki/room-core test
```
期待: 型エラー（`null` は `ToolId` に代入できない）。

- [ ] **Step 3: `connectionsIn` の値域を広げる**

```ts
/**
 * そのツールへ配信すべき接続の一覧（宣言順）。
 *
 * **`null` はハブ（どのツールも宣言していない接続）を指す**（#95 S5a）。
 * 在席の導出（{@link isPresentIn}）は `null` を「どのツールにも在席していない」と
 * 扱うのに対し、配信ではハブ自身が宛先になる。**同じ値が 2 つの意味を持つのではなく、
 * 「宣言が無い」という 1 つの事実を、在席と配信がそれぞれの向きから読んでいる。**
 */
export function connectionsIn(room: Room, tool: ToolId | null): ConnId[] {
```
本体の比較（`declared === tool`）は変えない —— `null === null` が成り立つ。

- [ ] **Step 4: 緑を確認し、名簿の wire を作る**

`packages/room-core/src/wire.ts`。**valibot スキーマも同じファイルに置く**
（timer-core は `wire.ts` と `schemas.ts` に分けているが、名簿の wire は 4 型しかない。
分けると「どちらを直せばよいか」が増えるだけである）。

```ts
/**
 * 名簿の wire（#95 S5a）。**選択画面（ハブ）とサーバーの間の言葉である。**
 *
 * ここに timer / poker の語彙を持ち込まない。ハブが知ってよいのは「誰が居て、
 * いまどのツールに居るか」だけで、タイマーの状態も票も知らない（ADR-0017 の文脈分割）。
 * ツールの識別子は不透明な文字列のままにする —— 綴りの正本は `apps/tasuki-sync` である。
 *
 * **組み立てはアプリケーション層の仕事である**（D16）。ここにあるのは型と、
 * 境界で検証するためのスキーマだけで、`Room` から `RosterRoom` を作る関数は置かない。
 */
import * as v from "valibot";
```

スキーマは**非 strict の `v.object`**（timer の `RoomSchema` と同じ規律。項目が増えても古い
クライアントが壊れない）。`presence` は `v.picklist(["online", "offline"])`。

- [ ] **Step 5: wire のテストを書く**

`packages/room-core/tests/wire.test.ts`。**通る形と落ちる形を対で置く。**

```ts
it("Given 項目が欠けた roster / When 検証する / Then 落ちる", () => {
  // Given: displayName の無い参加者
  const broken = { code: "R", participants: [{ participantId: "p1", presence: "online", tools: [] }] };

  // When / Then: 境界の検証（原則 IV）はここで効く
  expect(v.safeParse(RosterRoomSchema, broken).success).toBe(false);
});

it("Given 未知の項目を足した roster / When 検証する / Then 通る", () => {
  // Given: サーバーが将来足した項目
  const future = { code: "R", participants: [], hint: "後から足した" };

  // When / Then: 非 strict なので古いクライアントが壊れない
  expect(v.safeParse(RosterRoomSchema, future).success).toBe(true);
});
```

- [ ] **Step 6: 公開契約に列挙で足し、依存を宣言する**

`packages/room-core/src/index.ts` に `// ./wire` の節を足す（`export *` を書かない）。
`package.json` の `dependencies` に `"valibot": "^1.4.1"`（**版はリポジトリの既存と揃える。
新しいライブラリの追加には当たらない** —— 同じ版の既存ライブラリである）。
`corepack pnpm install` は `minimumReleaseAge` と `trustPolicy` を通る（既存の版なので新規取得は無い）。

- [ ] **Step 7: 検査と全体を通す**

```
corepack pnpm --filter @tasuki/room-core test
node scripts/audit-public-surface.mjs
node scripts/audit-domain-side-effects.mjs
node scripts/audit-dependency-direction.mjs
```
**room-core のカバレッジ下限は lines/branches とも 90**（`turbo.json` の `@tasuki/room-core#test`）。
wire にロジックが無いので下がらないはずだが、下がったらテストを足す。

- [ ] **Step 8: コミット**

```bash
git add packages/room-core
git commit -m "feat: 名簿の wire とハブへの配信先を room-core に足す（#95 S5a・#247）

- RosterRoom / HubCommand / HubServerMsg の型と valibot スキーマ（境界の検証・原則 IV）
- connectionsIn の値域に null（ハブ）を足した。在席の導出は変えていない
- 組み立て（DTO）はアプリケーション層に置く（D16）"
```

---

## Task 4: `/ws` をハブの入口にする（＋ timer の rewrite 撤去）

**この順序でなければならない。** 先に `/ws` をハブにすると、本番の timer 接続
（Caddy が `/ws` へ rewrite している）がハブ扱いになり、**全員が timer の一覧から消える**。

**Files:**
- Modify: `deploy/timer/caddy/10-timer-ws.conf`（`rewrite * /ws` を外す）
- Modify: `apps/timer-web/vite.config.ts`（dev プロキシの `rewrite` を外す）
- Modify: `apps/timer-web/src/sync/sync-url.ts`（docstring。`SYNC_PATH` の値は変えない）
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/tasuki-sync/test/ws-routing.test.ts`
- Modify: `apps/landing/tests/caddy-fragment-port.test.ts`（rewrite の有無を見ている箇所）
- Modify: `apps/timer-web/test/sync/sync-url.test.ts`（断片との一致の見方）

**Interfaces:**
- Produces: `ConnectionData.protocol: "timer" | "poker" | "hub"`。Task 5 が `"hub"` を受ける

- [ ] **Step 1: 先に rewrite を外す（timer は「それ以外」で届き続ける）**

`deploy/timer/caddy/10-timer-ws.conf`:

```
# ⚠ **rewrite しない**（#95 S5a）。`/ws` はハブ（選択画面）の入口になったので、
# ここで剥がすと timer の接続がハブとして扱われ、timer の一覧から全員が消える。
# 統合サーバーは `/poker/ws` を poker、`/ws` をハブ、**それ以外を timer** として扱う。
handle /timer/ws {
	reverse_proxy 127.0.0.1:8787
}
```

`apps/timer-web/vite.config.ts` の `rewrite:` 行を消す（`target` と `ws: true` は残す）。
**dev と本番で同じ経路になる**（poker が S2 でそうしたのと同じ形）。

- [ ] **Step 2: 経路のテストを赤くする**

`apps/tasuki-sync/test/ws-routing.test.ts` の
`it.each(["/ws", "/timer/ws", "/"])("%s は timer のメッセージ層へ行く")` を
`it.each(["/timer/ws", "/"])` に変え、**ハブの行を新しく足す**。

```ts
it("Given /ws への接続 / When room.create を送る / Then ハブのメッセージ層が受ける", async () => {
  // Given: ハブ（選択画面）の入口
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

  // When / Then: timer の語彙（snapshot）ではなく roster が返る
  // （実装は Task 5。ここでは protocol が "hub" に決まることだけを見る）
});
```

**この段では `protocol` の決まり方だけを固定する**（メッセージ層は Task 5）。
`WsAdapter` に `protocolOf(connId)` のような覗き窓を足さず、**`onConnect` に渡る値**で見る。

- [ ] **Step 3: 赤を確認する**

```
corepack pnpm --filter @tasuki/tasuki-sync test
```

- [ ] **Step 4: ws-adapter を直す**

```ts
/**
 * ハブ（選択画面）のメッセージ層へ振り分けるパス（#95 S5a）。
 *
 * **S4b までここは timer だった。** 本番の Caddy 断片が `/timer/ws` を `/ws` へ
 * rewrite していたためで、S5a でその rewrite を外した（`deploy/timer/caddy/10-timer-ws.conf`）。
 * 在席の宣言は**接続が来た入口**が行う（設計正本 D14 の S4b 追記・S5a の裁定）。
 * ハブの接続はどのツールも宣言しないので `tool: null` になる。
 *
 * **S5c（#249）でこの決まり方そのものが変わる** —— 入口が `/ws` 1 本に畳まれるため、
 * そのときツールの宣言は wire か接続 URL のクエリへ移る。
 */
const HUB_WS_PATH = "/ws";

const normalized = normalizeWsPath(url.pathname);
const protocol =
  normalized === POKER_WS_PATH ? "poker" : normalized === HUB_WS_PATH ? "hub" : "timer";
```

`ConnectionData.protocol` の型と、`ws.data.protocol === "poker"` で分岐している 4 箇所
（`grep -n 'data.protocol' apps/tasuki-sync/src/adapters/ws-adapter.ts`）を見直す。
**`"poker" 以外＝timer」という書き方が残っていると、ハブの接続が timer のメッセージ層へ落ちる。**
`switch` で 3 分岐に書き換え、`default` を置かない（値が増えたら型検査が落ちるようにする）。

- [ ] **Step 5: 緑を確認し、断片との一致テストを直す**

`apps/landing/tests/caddy-fragment-port.test.ts` は poker の断片が rewrite しないことを見ている。
**timer の断片も rewrite しないことを同じ形で足す**（片側だけの検査にしない）。
`apps/timer-web/test/sync/sync-url.test.ts` は `SYNC_PATH` と断片の `handle` の一致を見る形へ直す
（rewrite 先を見ていた行は、rewrite が無くなったので消す。**消したら、その値を名指ししていた
docstring も直す**）。

- [ ] **Step 6: 破壊検証**

```
corepack pnpm --filter @tasuki/tasuki-sync test    # 緑（対照）
# ws-adapter の HUB_WS_PATH を "/hub" に書き換える
corepack pnpm --filter @tasuki/tasuki-sync test    # 赤になること
git checkout -- apps/tasuki-sync/src/adapters/ws-adapter.ts
```

- [ ] **Step 7: コミット**

```bash
git add deploy/timer/caddy/10-timer-ws.conf apps/timer-web/vite.config.ts \
        apps/timer-web/src/sync/sync-url.ts apps/timer-web/test/sync/sync-url.test.ts \
        apps/tasuki-sync apps/landing/tests/caddy-fragment-port.test.ts
git commit -m "feat!: /ws をハブの入口にし、timer の rewrite を外す（#95 S5a・#247）

- Caddy 断片と dev プロキシの rewrite * /ws を外した。外さないと timer の接続が
  ハブ扱いになり、timer の一覧から全員が消える
- 振り分けは /poker/ws=poker、/ws=hub、それ以外=timer の 3 分岐になった
- S5c で入口が 1 本になるとき、この決まり方そのものが変わる（#249）"
```

---

## Task 5: ハブのメッセージ層（作成・参加・名簿の配信）

**Files:**
- Create: `apps/tasuki-sync/src/application/create-room.ts`（timer とハブが共有するルーム作成）
- Create: `apps/tasuki-sync/src/application/join-room.ts`（同・参加）
- Create: `apps/tasuki-sync/src/application/hub-handlers.ts`
- Create: `apps/tasuki-sync/src/application/roster-dto.ts`
- Create: `apps/tasuki-sync/src/application/save-roster.ts`
- Create: `apps/tasuki-sync/src/ports/hub-broadcaster.ts`
- Modify: `apps/tasuki-sync/src/application/command-handlers/{room-create.ts,room-join.ts}`（共有部分へ寄せる）
- Modify: `apps/tasuki-sync/src/application/{handlers.ts,presence.ts,poker-handlers.ts}`（名簿の保管を 1 経路へ）
- Modify: `apps/tasuki-sync/src/create-sync-server.ts`（配線）
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`（`"hub"` のメッセージ層へ渡す）
- Create: `apps/tasuki-sync/test/hub-handlers.test.ts` ほか

**Interfaces:**
- Consumes: `HubCommand` / `HubServerMsg` / `RosterRoom` / `connectionsIn`（Task 3）
- Produces:
  ```ts
  export interface HubBroadcaster {
    sendTo(connId: string, msg: HubServerMsg): void;
    /** そのルームのハブ接続（tool を宣言していない接続）全部へ名簿を配信する。 */
    broadcastRoster(roomCode: string): void;
  }
  export function buildRoster(membership: Room): RosterRoom;
  export function saveRoster(deps: { store: RoomStore; hub: HubBroadcaster }, room: Room): void;
  ```

- [ ] **Step 1: 失敗するテストを書く（名簿の配信・R3）**

`apps/tasuki-sync/test/hub-handlers.test.ts`。

```ts
it("Given ハブで作ったルーム / When 2 人目がハブから参加する / Then 全員のハブ接続へ名簿が届く", async () => {
  // Given: 作成者がハブに繋いでルームを作っている
  const { hub, sent } = makeHub();
  await hub.handle("c1", { command: "room.create", roomName: "朝会モブ", displayName: "あや" });
  const code = createdCodeOf(sent("c1"));

  // When: 別の人がハブから参加する
  await hub.handle("c2", { command: "room.join", code, displayName: "いずみ" });

  // Then: 作成者にも新しい名簿が届く（R3）
  const roster = lastRosterOf(sent("c1"));
  expect(roster.participants.map((p) => p.displayName)).toEqual(["あや", "いずみ"]);
  expect(roster.participants.every((p) => p.tools.length === 0)).toBe(true);
});
```

- [ ] **Step 2: 赤を確認する**

```
corepack pnpm --filter @tasuki/tasuki-sync test hub-handlers
```

- [ ] **Step 3: ルームの作成と参加を、wire から切り離して共有する**

**重複を書かない**（ADR-0002 の二重正本の禁止）。timer の `room.create` / `room.join` と
ハブの `room.create` / `room.join` は、**判定と名簿の更新が同じで wire の応答だけが違う**。
判定を純粋な関数へ寄せ、wire の組み立ては各メッセージ層に残す。

```ts
/** ルーム作成の判定と状態の組み立て（wire を知らない）。 */
export interface CreateRoomInput {
  connId: string;
  displayName: string;
  roomName?: string;
  config?: SessionConfig;
  /** その接続が宣言するツール。ハブは null（#95 S5a）。 */
  tool: ToolId | null;
}
export interface CreatedRoom {
  code: string;
  participantId: string;
  resumeToken: string;
  membership: MembershipRoom;
  timer: TimerState;
}
export function createRoom(deps: CreateRoomDeps, input: CreateRoomInput): Result<CreatedRoom, ErrorCode>;
```

**ハブで作ったルームにも timer の状態を作る**（2026-09-13 の裁定③）。入口の門
（`tool-gate.ts`）はそのまま効き、選択画面から timer へ入れる。
**poker のルームがハブから作れない件は S5b（#248）の「1 つのルームが両ツールを持つ」で
遅延生成として片付ける** —— この計画では触らない。**この申し送りを `tool-gate.ts` の
docstring と #248 の完了条件へ書く**（宛先を失わせない）。

`joinRoom` も同じ形にする。**合言葉の照合・レート制限・入口の門を必ず通す** ——
ハブから入れるルームは timer のルームでもあるので、ここを通さないと
**合言葉を知らない人が保護ルームの名簿を読める**（実測 4。S4a で実際に出た欠陥と同型）。

- [ ] **Step 4: 名簿の保管と配信を 1 経路へ束ねる**

`save-roster.ts`:

```ts
/**
 * 名簿を保管し、そのルームのハブ接続へ新しい名簿を配信する（#95 S5a・R3）。
 *
 * **名簿を書く経路は 3 つあった**（`handlers.ts` の `commit` / `presence.ts` の切断処理 /
 * `poker-handlers.ts`）。ハブへの配信をその 3 つに書き足すと、**次に 4 つ目を足す人が
 * 配信を忘れる**。保管と配信を対にして、`store.put` を呼ぶ場所をここ 1 つに閉じる。
 *
 * ツール側の配信（timer の snapshot・poker の round）は**ここでは行わない** ——
 * それぞれの文脈の wire を組む場所が違うからである。ここが持つのは名簿だけ。
 */
export function saveRoster(deps: SaveRosterDeps, room: MembershipRoom): void {
  deps.store.put(room);
  deps.hub.broadcastRoster(room.code);
}
```

`handlers.ts` の `commit` / `presence.ts` / `poker-handlers.ts` の `store.put(...)` を
`saveRoster(...)` へ置き換える。**`commit` の docstring にある「経路はここだけではない」の
注記を、いまの事実に合わせて書き直す**（記録が現況について嘘をつかないようにする）。

- [ ] **Step 5: 「`store.put` を直接呼ぶのは 1 箇所」を機械的に固定する**

`apps/tasuki-sync/test/save-roster.wiring.test.ts`:

```ts
it("Given 製品コード / When store.put の呼び出しを数える / Then save-roster.ts だけが呼ぶ", () => {
  // Given: src 配下の実体（git 由来ではなく、この検査はパッケージ内で閉じる）
  const hits = grepRepo("apps/tasuki-sync/src", /\bstore\.put\(/);

  // Then: 経路が増えたらここが赤くなる（配信を忘れた実装を通さない）
  expect(hits.map((h) => h.file)).toEqual(["application/save-roster.ts"]);
});
```

**単純な検査にする**（無状態・行単位）。賢くすると穴が増える。

- [ ] **Step 6: ハブの配信先を配線する**

`create-sync-server.ts` に `hubRecipientsOf` を足す。

```ts
/**
 * ハブ（選択画面）の配信先。**名簿を引いて、ツールを宣言していない接続へ送る。**
 * timer 側（`recipientsOf`）と同じく、宛先は**呼び出し時点のストア**から決まる。
 */
const hubRecipientsOf = (roomCode: string): string[] => {
  const room = store.get(roomCode);
  return room ? connectionsIn(room, null) : [];
};
```

- [ ] **Step 7: ハブのメッセージ層を書き、ws-adapter から繋ぐ**

`hub-handlers.ts` は `parseBoundaryMessage(HubCommandSchema, raw)`（`@tasuki/protocol`）で
受け、`createRoom` / `joinRoom` を呼び、`HubServerMsg` で返す。
**表示名の正規化と紛らわしさの識別子は `@tasuki/room-core` の
`normalizeDisplayName` / `conflictsWithExisting` を使う**（R13。timer と同じ規則にする。
写経しない）。**名前の上限は `MAX_DISPLAY_NAME`（40）で、poker の 24 との統合は S5b（#248）である。**

- [ ] **Step 8: ハブの参加にもレート制限が効くことをテストで固定する**

```ts
it("Given 混雑でバケツが尽きたクライアント / When ハブから join する / Then 拒まれる", async () => {
  // Given / When / Then: #103 の防御が /ws 経由で迂回できないこと
});
```
**これを置かないと、`/ws` がレート制限の抜け穴になる。** timer の入口で塞いだものが
ハブの入口で開く形は、S4a の「入口ごとの門」と同じ失敗である。

- [ ] **Step 9: 全体と検査を通す**

```
corepack pnpm test --force
node scripts/audit-structure.mjs        # SC-032 を基準値と比べる（1446/1448）
node scripts/audit-dependency-direction.mjs
node scripts/audit-log-hygiene.mjs
```

- [ ] **Step 10: コミット**

```bash
git add apps/tasuki-sync
git commit -m "feat: ハブのメッセージ層と名簿の配信を足す（#95 S5a・#247）

- /ws に来た接続は room.create / room.join と roster だけを話す（timer の wire を知らない）
- 作成と参加の判定を timer と共有し、wire の組み立てだけを各層に残した
- 合言葉・レート制限・入口の門はハブの参加にも効く（保護ルームの名簿を読ませない）
- 名簿の保管と配信を save-roster.ts に束ね、store.put の呼び出しを 1 箇所に閉じた"
```

---

## Task 6: timer の参加者一覧を在席で絞る（R6）

**Files:**
- Modify: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts`
- Modify: `apps/tasuki-sync/test/timer-snapshot-dto.test.ts`（無ければ新規）
- Modify: 影響を受ける `apps/tasuki-sync/test/*`（実測してから直す）

**Interfaces:**
- Consumes: `isPresentIn`（room-core）・`TOOL_TIMER`（`application/tool-id.ts`）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("Given 選択画面だけに居る人 / When timer の snapshot を組む / Then その人は一覧に出ない", () => {
  // Given: あやは timer、いずみはハブだけに繋いでいる
  const membership = roomWith([
    participant("p1", "あや", new Map([["c1", "timer"]])),
    participant("p2", "いずみ", new Map([["c2", null]])),
  ]);

  // When
  const wire = buildTimerSnapshotRoom(membership, timerStateOf(membership));

  // Then: R6。名簿からは消えていない（退出ではない）
  expect(wire.participants.map((p) => p.displayName)).toEqual(["あや"]);
  expect(membership.participants).toHaveLength(2);
});

it("Given 輪に席を持つ人が選択画面へ戻った / When snapshot を組む / Then 輪の表示名は残る", () => {
  // Given: いずみは輪に席を持ったままハブへ戻った
  // When / Then: R7。状態は保持される（config.members はローテーション順の表示名）
  expect(wire.config.members).toContain("いずみ");
});
```

- [ ] **Step 2: 赤を確認する**

```
corepack pnpm --filter @tasuki/tasuki-sync test timer-snapshot-dto
```

- [ ] **Step 3: `buildTimerSnapshotRoom` を直す**

```ts
  // **timer に在席している人だけを載せる**（#95 S5a・R5/R6）。名簿から消すのではない ——
  // 選択画面へ戻った人は在室のままで、輪の席も投票も残る（R7）。消えるのは
  // 「timer の画面に出ている参加者一覧」からだけである。poker 側は S4a から
  // `isPresentIn(p, TOOL_POKER)` で同じことをしている（`poker-handlers.ts` の `connected`）。
  const members: Participant[] = membership.participants
    .filter((p) => isPresentIn(p, TOOL_TIMER))
    .map((p) => { /* 以下は変えない */ });
```

**`occupants()` は絞らない。** あちらは表示名の重複判定・在室者の数え上げ・退出通知の宛先に
使われており、**ハブに居る人を落とすと同名の取り違えと通知漏れが起きる**。
この違いを両方の docstring に書く（次に読む人が片方だけ直すのを防ぐ）。

**台帳へ足す。** `timer-snapshot-dto.ts` 冒頭の「S4a / S4b で wire が変わった点」の一覧に、
**6 番目として S5a の変更**を書く（同じ内容を他所へ書き写さない）。

- [ ] **Step 4: 緑を確認し、壊れた既存テストを実測で洗う**

```
corepack pnpm --filter @tasuki/tasuki-sync test
```
**造作（fixture）が `connections: new Map([["c1", "timer"]])` を持たないテストは、
参加者が一覧から消えて落ちる。** 落ちたものを 1 件ずつ見て、
「timer に居るつもりの人」なら造作を直し、「ハブに居る人」ならその期待値が正しい。
**型検査は造作の不足を拾わない**（スプレッド入りのリテラルと戻り値型の無いヘルパは
余剰プロパティ検査に掛からない）。

- [ ] **Step 5: timer-web が壊れていないことを見る**

```
corepack pnpm --filter @tasuki/timer-web test
```
wire の**型**は変わらないので、timer-web は素通りするはずである。落ちたら、それは
「一覧に居ることを前提にした判定」が製品コードにあるということ（`App.tsx:90` の `self` と
`snapshot-intents.ts:91` の自己出現判定を先に見る）。

- [ ] **Step 6: コミット**

```bash
git add apps/tasuki-sync
git commit -m "feat!: timer の参加者一覧を timer 在席者に絞る（#95 S5a・#247・R6）

- 選択画面へ戻った人は timer の一覧から外れる。名簿からは消えない（在室のまま）
- 輪の席・投票・タイマーの状態は保持される（R7）
- occupants() は絞らない（重複判定と退出通知の宛先は名簿全体を見る）"
```

---

## Task 7: LP に 3 状態を作る（作成・参加・選択画面）

**Files:**
- Create: `apps/landing/src/hub/{use-hub-sync.ts,storage.ts,room-param.ts,invite-url.ts,hub-state.ts}`
- Create: `apps/landing/src/screens/{CreateRoom.tsx,JoinRoom.tsx,RoomChoice.tsx}`
- Modify: `apps/landing/src/App.tsx`（3 状態の分岐だけを持つ）
- Modify: `apps/landing/src/index.css`（**トークンのみ。生の色を書かない**）
- Modify: `apps/landing/{package.json,vite.config.ts}`
- Create: `apps/landing/tests/hub/*.test.ts(x)`
- Modify: `scripts/audit-web-sync-boundary.mjs`（LP の `allowedImporters` を同期フック 1 本に）
- Modify: `scripts/audit-dependency-direction.mjs`（LP の依存に room-core・sync-client）

**Interfaces:**
- Consumes: `SyncConnection`（`@tasuki/sync-client`）・`HubCommand` / `HubServerMsg` /
  `RosterRoom` / `HubServerMsgSchema`（`@tasuki/room-core`）・`parseBoundaryMessage`（`@tasuki/protocol`）
- Produces: なし（最終利用者）

**ADR-0015 の 3 責務（LP にも掛かる・ADR-0019）:**
1. 判定・計算は純粋関数へ切り出す（`hub-state.ts` / `room-param.ts` / `invite-url.ts`）
2. **同期フックは 1 本**（`use-hub-sync.ts`）。画面から `SyncConnection` を触らない
3. 画面は表示に徹する（`screens/*.tsx` は状態を持たず、props と callback だけ）

- [ ] **Step 1: 失敗するテストを書く（画面の分岐・純粋関数）**

`apps/landing/tests/hub/hub-state.test.ts`:

```ts
describe("画面の決め方", () => {
  it("Given room が無い / When 画面を決める / Then 作成になる", () => {
    expect(screenFor({ code: null, joined: false })).toBe("create");
  });

  it("Given room があり未参加 / When 画面を決める / Then 参加になる", () => {
    expect(screenFor({ code: "朝会モブ-a1b2", joined: false })).toBe("join");
  });

  it("Given room があり参加済み / When 画面を決める / Then 選択画面になる", () => {
    expect(screenFor({ code: "朝会モブ-a1b2", joined: true })).toBe("choice");
  });
});
```

`apps/landing/tests/hub/storage.test.ts`（**D12 後半＝S4b からの申し送り**）:

```ts
it("Given 前のルームで名乗った名前 / When 別のルームの参加画面を開く / Then 初期値に入る", () => {
  // Given: ルーム非依存の既定表示名（D12 後半）
  saveDefaultDisplayName("あや");

  // When / Then: 次に別のルームへ入るときの初期値になる
  expect(loadDefaultDisplayName()).toBe("あや");
});

it("Given 壊れた保存値 / When 読む / Then null を返し、その鍵を捨てる", () => {
  // Given: 誰でも書き換えられる場所なので型注釈を信じない（原則 IV）
  localStorage.setItem("tasuki:resume:R", "{壊れた");

  // When / Then
  expect(loadResumeIdentity("R")).toBeNull();
  expect(localStorage.getItem("tasuki:resume:R")).toBeNull();
});
```

**鍵は timer-web と同じ `tasuki:resume:<ルームコード>` にする**（S4b で決めた形）。
**既定表示名の鍵は `tasuki:display-name`**（ルームコードを含まない。D12 後半）。

- [ ] **Step 2: 赤を確認する**

```
corepack pnpm --filter @tasuki/landing test
```

- [ ] **Step 3: 純粋関数を書く（`hub-state.ts` / `room-param.ts` / `invite-url.ts` / `storage.ts`）**

`room-param.ts` は `readRoomParam(href): string | null` と `stripRoomParam(href)`。
**`timer-web/src/ui/room-param.ts` と同じ関心だが写経しない** —— LP は読む側も要るので
別物である。名前を同じにするなら、片方を直したときにもう片方を見る理由が無いことを
docstring に書く（将来 S5c で timer 側が消える）。

`invite-url.ts`:

```ts
/**
 * 参加用 URL（配るもの）を組み立てる（D11・ADR-0018 決定 2）。
 *
 * **ルート直下の `?room=CODE` が正しい形になった**（S5a）。LP がルームの入口を持つ
 * ようになったためで、旧救済断片（`40-timer-legacy-room.conf`）は同じ PR で撤去する。
 * ルームコードには日本語が入りうる（`朝会モブ-a1b2`）ので、クエリとして符号化する。
 */
export function buildInviteUrl(origin: string, code: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("room", code);
  return url.toString();
}
```

- [ ] **Step 4: 同期フックを 1 本書く（`use-hub-sync.ts`）**

- 受信は `parseBoundaryMessage(HubServerMsgSchema, raw)` を通す（**境界の検証**・原則 IV）。
  契約に合わないフレームは**捨てる**（timer-web の `onInvalidFrame` と同じ向き）
- `room.created` / `room.joined` を受けたら復帰の組と既定表示名を保存する
- 読み込み時、URL の `?room=` と保存済みの組が一致するなら**名乗らずに復帰する**（R16）
- 再接続後は保存済みの `resumeToken` で `room.join` を再送する
- `PASSPHRASE_REQUIRED` / `PASSPHRASE_MISMATCH` を受けたら合言葉の入力を求める
  （**保護ルームの名簿を合言葉なしで見せない**。Task 5 の Step 3 と対になる画面側）
- 入室が `JOIN_RATE_LIMITED` で弾かれたら `joinRetryDelayMs`（`@tasuki/sync-client`）で再試行する

**WS の URL は `/ws`。** `apps/landing/src/hub/sync-url.ts` は作らず、フックの中で
`buildSyncUrl(location)` を持つ（LP は base が `/` なので組み立ては 1 行である）。

- [ ] **Step 5: 画面を 3 つ書く**

- `CreateRoom.tsx`: ルーム名＋表示名 → `room.create`
- `JoinRoom.tsx`: 表示名（＋必要なら合言葉）→ `room.join`。**表示名の初期値は既定表示名**
- `RoomChoice.tsx`: ルーム名（コードから見せる）・参加者一覧・参加用 URL・**既存の `TOOLS` の札**
  （`href` に `?room=CODE` を付ける。**意匠は変えない**・設計正本 §5.7）

**見え方が紛らわしい表示名には識別子を添える**（R13）。判定は `@tasuki/room-core` の
`nameSkeleton` / `conflictsWithExisting` を使い、**timer-web の `participant-label.ts` を
写経しない**（同じ規則が 2 箇所にあると片方だけ腐る。共有するなら room-core 側へ寄せる）。

**生の色・生の間隔を書かない。** `@tasuki/ui` のトークンと既存クラス（`.card` / `.hand` /
`.page`）を使う。新しいクラスが要るなら `index.css` にトークン参照で書く。

- [ ] **Step 6: `App.tsx` は分岐だけにする**

```tsx
export function App() {
  const hub = useHubSync();
  switch (screenFor(hub)) {
    case "create": return <CreateRoom onCreate={hub.createRoom} error={hub.error} />;
    case "join": return <JoinRoom ... />;
    case "choice": return <RoomChoice ... />;
  }
}
```
**既存の LP（ツールの札だけの玄関）は `room` が無いときの姿から消える。**
`apps/landing/tests/App.test.tsx` の既存 6 件は「作成画面にも札が並ぶか」で書き直すか、
`RoomChoice` のテストへ移す。**消すのではなく、行き先を決めて移す。**

- [ ] **Step 7: dev の中継を足す（§3.13b）**

`apps/landing/vite.config.ts` の `proxy` に足す。

```ts
      // ハブ（選択画面）の WS。本番は Caddy の `/ws` 断片が同じことをする。
      // **これが無いと dev で繋がらない**（LP の SPA フォールバックが index.html を 200 で返す）。
      '/ws': { target: 'ws://127.0.0.1:8787', changeOrigin: true, ws: true },
```

- [ ] **Step 8: 検査の宣言を直す**

`scripts/audit-web-sync-boundary.mjs` の LP の項目:

```js
    syncModules: [],                                   // 実体は @tasuki/sync-client にある
    allowedImporters: [],                              // 同上（外部パッケージは行単位の検査に掛からない）
    wsHolders: [],                                     // **1 行でも new WebSocket( を書いたら違反**
```

`scripts/audit-dependency-direction.mjs` の `"apps/landing"` に
`"@tasuki/room-core"`・`"@tasuki/sync-client"`・`"@tasuki/protocol"` を足す。

- [ ] **Step 9: 通す**

```
corepack pnpm --filter @tasuki/landing test
corepack pnpm --filter @tasuki/landing typecheck
corepack pnpm --filter @tasuki/landing lint
node scripts/audit-web-sync-boundary.mjs
node scripts/audit-dependency-direction.mjs
```

- [ ] **Step 10: コミット**

```bash
git add apps/landing scripts
git commit -m "feat: LP をハブにし、作成・参加・選択画面の 3 状態を持たせる（#95 S5a・#247）

- ルーム名と表示名で作成 → 選択画面（ルーム名・参加者一覧・参加用 URL・ツールの札）
- 参加用 URL を開くと名乗りを求め、同じ端末なら名乗らずに復帰する（R16）
- 表示名はルーム非依存の既定値としても localStorage に置く（D12 後半・S4b からの申し送り）
- 同期フックは 1 本。画面は表示に徹する（ADR-0015・ADR-0019）"
```

---

## Task 8: 参加用 URL を切り替え、旧救済断片を撤去する（D11・地雷 10）

**このタスクは Task 7 と同じ PR に入る**（**先に撤去すると旧リンクの救済だけが消え、
後で撤去すると新しい招待リンクがタイマーへ飛ばされる期間ができる**）。

**Files:**
- Create: `deploy/landing/caddy/05-hub-ws.conf`
- Delete: `deploy/timer/caddy/40-timer-legacy-room.conf`
- Modify: `apps/timer-web/src/ui/room-url.ts`（招待 URL を `/?room=` へ）
- Modify: `apps/timer-web/test/ui/room-url.test.ts`（断片を読んでいたテストの置き換え）
- Modify: `e2e/harness/paths.ts`（`FRAGMENT_SOURCES`）
- Modify: `deploy/caddy/{tasuki.conf,README.md}`・`deploy/timer/NOTES.md`・`deploy/landing/NOTES.md`
- Modify: `e2e/README.md`

- [ ] **Step 1: `/ws` の断片を作る**

`deploy/landing/caddy/05-hub-ws.conf`（**LP の配下に置く。ハブの入口だからである**）:

```
# ハブ（選択画面）の WebSocket（#95 S5a）
# 設置先: /etc/caddy/tasuki/apps/05-hub-ws.conf
#
# **rewrite しない。** 統合サーバー（apps/tasuki-sync）は 1 つの待ち受けで 3 つの
# メッセージ層を捌き、**どれへ流すかをパスだけで決めている**。`/poker/ws` は poker、
# `/ws` はハブ、それ以外は timer である（apps/tasuki-sync/src/adapters/ws-adapter.ts）。
#
# **包括フォールバック（90-landing.conf）より先に評価される。** Caddy はマッチャの
# 具体性で並べるため、パス指定のあるこの handle が先に当たる（番号は人が読むための規約）。
# 一致は apps/landing/tests/caddy-fragment-{order,port}.test.ts が機械的に固定している。
handle /ws {
	reverse_proxy 127.0.0.1:8787
}
```

- [ ] **Step 2: 断片のテストが新しい顔ぶれを見ることを確かめる**

```
corepack pnpm --filter @tasuki/landing test
```
`caddy-fragment-order.test.ts` は `deploy/*/caddy/*.conf` を readdir で集めるので、
**新しい断片は自動で対象になる**。包括フォールバックが 1 本のままであることも見ている。

- [ ] **Step 3: 招待 URL を `/?room=` へ変える**

`apps/timer-web/src/ui/room-url.ts` の `buildRoomUrl` を、`PUBLIC_PATH` ではなく `/` で組む。
docstring の「ルート直下に向けてはいけない」という記述を**逆に書き直す**（前提が変わった）。
**旧救済断片を名指ししている行を消す**（消した設定を名指しする文が宙に浮く）。

- [ ] **Step 4: 旧救済断片を消し、名指ししている箇所を洗う**

```bash
git rm deploy/timer/caddy/40-timer-legacy-room.conf
grep -rn "40-timer-legacy-room\|legacy-room" --include='*.ts' --include='*.md' --include='*.conf' . | grep -v node_modules | grep -v docs/superpowers/
```
**残る名指しを 1 件ずつ片付ける**（`e2e/harness/paths.ts`・`e2e/README.md`・
`deploy/caddy/tasuki.conf` の顔ぶれ表・`deploy/caddy/README.md` の設置例・
`deploy/timer/NOTES.md` の「旧共有リンクの救済」節・`apps/timer-web/test/ui/room-url.test.ts`）。
**`docs/superpowers/` 配下の過去の計画と設計正本は記録なので書き換えない**
（済んだ記録には手を入れない）。

`deploy/timer/NOTES.md` の当該節は**削除ではなく「S5a で撤去した」と書き換える**
（ホスト上に残っている断片を消す手順が要るため）。

```markdown
### 旧共有リンクの救済（#95 S5a で撤去した）

⚠ **ホスト上の `/etc/caddy/tasuki/apps/40-timer-legacy-room.conf` を消すこと。**
残すと `/?room=CODE`（新しい参加用 URL）が 301 でタイマーへ飛ばされ、選択画面へ着地しない。
**この 301 は `permanent` なのでブラウザがキャッシュしている。** 撤去後も、以前に
旧リンクを開いた端末では飛ばされ続けることがある（利用者には再読み込みかキャッシュの
消去を案内する）。
```

- [ ] **Step 5: E2E ハーネスの断片一覧を直す**

`e2e/harness/paths.ts` の `FRAGMENT_SOURCES` から `40-timer-legacy-room.conf` を外し、
`deploy/landing/caddy/05-hub-ws.conf` を足す。**並びは設置後のファイル名順に保つ。**
`e2e/tests/fragment-sources.test.ts` が実在を見ているので、ここが食い違うと赤くなる。

- [ ] **Step 6: 通す**

```
corepack pnpm test --force
node scripts/check-links.mjs          # 新規ファイルは git add してから
```

- [ ] **Step 7: コミット**

```bash
git add -A deploy e2e apps/timer-web
git commit -m "feat!: 参加用 URL を /?room=CODE にし、旧救済断片を撤去する（#95 S5a・#247）

- ハブの入口 /ws の Caddy 断片を新設した
- 40-timer-legacy-room.conf を削除した。新しい参加用 URL と同じ形で両立しない（D11）
- timer の招待パネルが配る URL も /?room= になった（入口は LP に一本化される）
- 本番のホスト上の断片を消す手順を deploy/timer/NOTES.md に書いた（301 はキャッシュされる）"
```

---

## Task 9: E2E で導線を固定する

**Files:**
- Modify: `e2e/specs/landing.spec.ts`（ハブの往復）
- Modify: `e2e/specs/routing.spec.ts`（旧救済の消滅・`/ws` の 426）
- Modify: `e2e/specs/timer.spec.ts`（旧救済を前提にした記述）
- Modify: `e2e/specs/rate-limit.spec.ts`（`/ws` がハブになった）
- Modify: `e2e/support/*`（必要なら選択画面の補助）

**タグの規約**（`e2e/tests/spec-tags.test.ts` が固定している）に従うこと。

- [ ] **Step 1: 旧救済のテストを「LP に着地する」へ書き換える**

```ts
test.describe('@smoke 参加用 URL', () => {
  test('Given /?room=ABC123 / When GET する / Then 301 ではなく 200 で玄関が返る', async ({ request }) => {
    // Given / When: **追跡させない**（既定では追跡され、最終的な 200 を見て確認したつもりになる）
    const response = await request.get('/?room=ABC123', { maxRedirects: 0 });

    // Then: 旧救済断片を撤去したので、参加用 URL は LP に着地する（D11）
    expect(response.status()).toBe(200);
  });
});
```

- [ ] **Step 2: `/ws` が SPA に吸われていないことを足す**

既存の `@smoke WebSocket が SPA に吸われていない` の表へ `['/ws', 426]` を足す。
**これが 200 を返したら、断片が設置されていない（包括フォールバックに吸われている）。**

- [ ] **Step 3: ハブの往復を固定する（R1・R2・R3・R4・R6）**

`e2e/specs/landing.spec.ts` に `@core` で足す。**2 つのブラウザコンテキストを使う。**

```ts
test('Given 作成者と参加者 / When ハブで名乗り timer を往復する / Then 一覧が互いに見え、戻ると消える', async ({ browser }) => {
  // Given: 作成者がルームを作る（R1）
  const host = await browser.newPage();
  await host.goto('/');
  await host.getByLabel('ルーム名').fill('朝会モブ');
  await host.getByLabel('あなたの名前').fill('あや');
  await host.getByRole('button', { name: 'ルームを作る' }).click();
  const invite = await host.getByRole('textbox', { name: '参加用 URL' }).inputValue();

  // When: 別の人が参加用 URL から名乗る（R2）
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(invite);
  await guest.getByLabel('あなたの名前').fill('いずみ');
  await guest.getByRole('button', { name: '参加する' }).click();

  // Then: 双方の一覧に相手が出る（R3）
  await expect(host.getByRole('list', { name: '参加者' })).toContainText('いずみ');
  await expect(guest.getByRole('list', { name: '参加者' })).toContainText('あや');

  // When: 参加者が timer を選ぶ（R4）
  await guest.getByRole('link', { name: /TDD Mob Pro Timer/ }).click();
  await expect(guest).toHaveURL(/\/timer\/\?room=/);

  // Then: timer の一覧には timer に居る人だけが出る（R5 の timer 側）
  await expect(guest.getByRole('list', { name: /参加者/ })).not.toContainText('あや');

  // When: 選択画面へ戻る（R6）
  await guest.goBack();

  // Then: 選択画面には全員が出たままである（名簿からは消えていない）
  await expect(guest.getByRole('list', { name: '参加者' })).toContainText('あや');
});
```

**先に「探索」を 1 回走らせてからアサーションを書く**（`page.pause()` か
`--headed` で実物のラベルを見る）。**文字列一致・`toContain`・否定の空振りは、
通っていないのに緑になる。**

- [ ] **Step 4: レート制限の E2E を向け直す**

`e2e/specs/rate-limit.spec.ts:45` は `ws://127.0.0.1:${PORTS.sync}/ws` に繋いで
**timer の** レート制限を見ている。`/timer/ws` へ向け直す。
**`/ws`（ハブ）でも同じく弾かれることを 1 件足す** —— 迂回路を残さない。

- [ ] **Step 5: 通す**

```
corepack pnpm e2e
```
**`pnpm dev` と同時に走らせない**（8787 を共有する）。走らせる前に
`ss -tlnp | grep -E ':(8787|517[3-5])'` で掴んでいるプロセスを確かめる。

- [ ] **Step 6: コミット**

```bash
git add e2e
git commit -m "test: ハブの導線と旧救済の消滅を E2E で固定する（#95 S5a・#247）

- 作成 → 選択画面 → 別ブラウザで参加 → 両者の一覧（R1/R2/R3）
- ツール選択と選択画面への復帰（R4/R6）
- /?room= が LP に着地すること・/ws が 426 を返すこと
- レート制限の E2E を /timer/ws へ向け直し、ハブ側にも 1 件足した"
```

---

## Task 10: 仕上げ（指標・変異・実画面・記録）

- [ ] **Step 1: 指標を基準値と突き合わせる**

```
node scripts/audit-structure.mjs
```
**SC-032 が 1446/1448 より下がっていたら、増えた未達はこのブランチのテストである。**
main を worktree で流して並べるのが速い:

```bash
git worktree add --detach /tmp/claude-1000/.../main-baseline origin/main
（両方で同じ台帳を流して差を見る）
```

- [ ] **Step 2: 変異検査に新しい変異を足す**

```
node scripts/mutation-check.mjs
```
**実装を書き換えたので、既存のパッチが当たらなくなっていることがある**
（S4b で `computeIneligibleIndices` の m03 が `patch does not apply` で落ちた）。
当て直したうえで、**このタスク列が作った危険な場所へ 3 件足す**:

1. `buildTimerSnapshotRoom` の `isPresentIn` の絞り込みを外す（R6 が死ぬ）
2. `hubRecipientsOf` の `connectionsIn(room, null)` を `TOOL_TIMER` に変える（R3 が死ぬ）
3. ハブの `joinRoom` から合言葉の照合を外す（保護ルームの名簿が読める）

**3 件とも「検出されること」が正である。** 検出されないならテストが足りない。

- [ ] **Step 3: 実画面で全遷移を通す（原則 V・#247 の完了条件）**

```bash
ss -tlnp | grep -E ':(8787|3311|517[3-5])'   # 先に掴んでいるプロセスを確かめる
corepack pnpm dev
```
`http://localhost:5175/` を開き、**次を 1 つずつ目で見る**。

1. ルームを作る → 選択画面（ルーム名・自分の名前・参加用 URL）
2. 参加用 URL を**別のブラウザプロファイル**で開く → 名乗る → 双方の一覧に相手が出る
3. timer を選ぶ → タイマーが使える。**timer の一覧に、選択画面に居る人が出ない**
4. 選択画面へ戻る → タイマーの状態が残っている（R7）。一覧には全員が出る
5. 同じ端末でタブを閉じて参加用 URL を開き直す → **名簿の人数が増えない**（R16）
6. 合言葉つきのルーム（timer で設定）→ ハブから参加すると合言葉を求められる
7. 旧入口（`/timer/?room=CODE` を直接開く）も従来どおり動く

**終わったら dev を落とす**（掴んだままにすると利用者の `pnpm dev` が全滅する）。

- [ ] **Step 4: 記録を直す**

- `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md` の
  **D14 の S4b 追記**に、S5a の裁定（経路で分ける・`/ws` がハブ）を**追記する**。
  **節の途中に足さない**（直後の小節が親を変えてしまう。ADR で 2 度踏んでいる）
- **完了形を書かない。** 「S5a で決めた」と書き、「S5c で行う」ことは予定として書く
  （規範文書が現況について嘘をつく）
- `apps/tasuki-sync/src/application/tool-gate.ts` の docstring に、
  **poker のルームをハブから作れないこと（S5b で遅延生成に置き換える）** を書く
- **#248 の完了条件へ申し送りを 2 件足す**: ①ハブから作ったルームに poker の状態を
  遅延生成する ②poker の名前上限 24 と `MAX_DISPLAY_NAME` 40 の統合（S4a からの持ち越し）
- **#249 の完了条件へ 1 件足す**: 入口が 1 本になるとき、ツールの宣言を経路から
  wire（または接続 URL）へ移す

- [ ] **Step 5: 全部を通す**

```
corepack pnpm test --force        # Cached: 0 cached を確認する
corepack pnpm e2e
node --test scripts/*.test.mjs    # pnpm test には入っていない
corepack pnpm audit               # 同上
node scripts/audit-structure.mjs
node scripts/check-links.mjs
node scripts/mutation-check.mjs
shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh
```

- [ ] **Step 6: 分割レビューに掛ける**

**タスク単位のレビューを通ったものが、ブランチ全体のレビューで 12 件出た**（S4a）。
**文脈を共有しないレビューへ掛ける**（`/code-review` は PR 番号を明示する。
worktree で作った PR は宛先を間違える）。

- [ ] **Step 7: PR を出す**

本文に必ず書くこと:

- **利用者から見える変化**: ①ルームの作成と参加が LP でできる ②timer の参加者一覧に
  「選択画面に居る人」が出なくなる ③参加用 URL が `/?room=CODE` になる
  ④旧リンク救済の 301 が無くなる（**ブラウザにキャッシュが残っている端末がある**）
- **配備手順**: ホスト上の `40-timer-legacy-room.conf` を消す・`05-hub-ws.conf` を置く・
  `10-timer-ws.conf` を更新する（`deploy/caddy/README.md` の手順）
- **本番検証は未実施**（デプロイは全段完了後に 1 回・利用者の承認を得てから）
- DoD 8 項目（該当しない項目は「該当なし」と明記する）

---

## Self-Review（計画を書いたあとに自分で確かめた）

**#247 の完了条件との対応:**

| 完了条件 | タスク |
|---|---|
| `audit-web-sync-boundary.mjs` の走査対象を実体へ（LP の前に） | Task 1 |
| `packages/sync-client` を抽出する（抽出だけを先行させない） | Task 2（利用者は timer-web）＋ Task 7（LP） |
| LP に 3 状態を作る | Task 7 |
| 配備資材（`/ws` 断片・dev 中継・旧救済の撤去） | Task 4（rewrite）・Task 7（dev 中継）・Task 8 |
| 表示名をルーム非依存の既定値としても `localStorage` に置く | Task 7 Step 1・3 |
| ハブの `tool` の渡し方を決める | Task 4（経路で分ける。裁定済み） |
| 実画面で全遷移を通す | Task 10 Step 3 |
| DoD | Task 10 Step 5・7 |

**EARS との対応:** R1・R2＝Task 7＋Task 9 / R3＝Task 5 / R4＝Task 7＋Task 9 /
R6＝Task 6＋Task 9 / R7＝Task 6（輪の保持）＋Task 10 Step 3 / R10＝既存の
`room-reclaimer`（名簿が 1 つなので S4a から変わらない。**回帰が無いことを Task 5 の
`saveRoster` 導入後に確かめる**） / R13＝Task 5 Step 7（サーバー）＋Task 7 Step 5（画面）

**この計画が意図的に扱わないもの（スコープ外）:**

- poker のハブ経由（#248）。**ハブで作ったルームは poker の状態を持たないので、
  選択画面から poker を選ぶと「存在しないルーム」として弾かれる。** S5a の時点では
  poker の札から `?room=` が捨てられるため（`router.ts`）**どのみち TopPage に落ちる**。
  **選択画面の poker の札を無効化するかは実装時に実物を見て決め、PR 本文に書く**
- 旧入口の撤去（#249）
- 幽霊（別ブラウザ・ストレージ消去）の掃除 UI。D12 は「選択画面から手で片付けられる」と
  書いているが、`participant.remove` をハブに載せることは #247 の EARS に無い。**#249 へ送る**
