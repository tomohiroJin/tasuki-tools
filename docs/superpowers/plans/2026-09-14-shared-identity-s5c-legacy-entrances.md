# #95 S5c（#249）ツール側の旧入口を撤去する — 実装計画

> **作業する人へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` でタスク単位に実施すること。手順はチェックボックス（`- [ ]`）で追う。

**目的:** 二重になっていた入口を畳み、**Tasuki の入口を玄関（`/`）1 つにする**。あわせて、
撤去によって消える導線（ツールから選択画面へ戻る／完了後の行き先／端末の記録への入口）を
同じ段で手当てし、WS の入口も `/ws` 1 本へ畳む。

**設計:** ツールの宣言を**経路から接続 URL のクエリへ移す**（`/ws?tool=timer|poker`・無しはハブ）。
画面側は「ルームコードを伴わないツールの URL」をすべて玄関へ送り、名乗りと合言葉の入力を
ハブ 1 箇所に集約する。`ConnectionData` は文脈ごとの判別可能ユニオンへ割る。

**技術:** TypeScript 6 / React 19 / Vite 8 / Vitest 4 / Bun（sync）/ valibot / Playwright / Caddy。

**設計正本:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`
（R9・D10・D11・D14・§3.13b の dev 中継・§7 の段階表の S5c 行）
**要求の正本:** [#249](https://github.com/tomohiroJin/tasuki-tools/issues/249)（EARS: R9 と利用者の申し送り 3 件）
**決定の正本:** `docs/adr/0011`（合言葉の関門）・`0015`（web 層の 3 責務）・`0017`（文脈とパッケージ）・
`0018`（参加用 URL）・`0019`

---

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを失敗するテストから始める。行き先の判定は純粋関数へ切り出す（`decideEntry` / `parseRoute` / `protocolFromUrl`） |
| II. 技術選定は ADR を通す | 該当なし | ライブラリを足さない |
| III. 揮発インメモリと単純運用 | 通過 | ルームの寿命・保管・回収を変えない。**配備資材はむしろ 2 本減る** |
| IV. 境界の型安全 | 通過 | `?tool=` は許可リストで判定し、外れた値は接続を拒否する（1008）。`ConnectionData` を判別可能ユニオンにして、timer の接続が poker の項目を持てないことを型で示す |
| V. 実画面検証 | 通過 | Task 10 で `http://localhost:5175/` の全遷移を目で通す |
| VI. 依存は内向き | 通過 | LP は timer のドメイン（完了記録の形）を知らないまま。**入口だけを置き、描画は timer 側に残す** |
| VII. 検査は壊して確かめる | 通過 | 変異を 3 件足す（m34〜m36）。旧 WS パスの撤去は対照実行つきで確かめる |
| VIII. 記録が正本 | 通過 | 設計正本へ「S5c 実施時の訂正」を追記し、`deploy/timer/NOTES.md` に断片の撤去手順を足す |
| IX. 小さく回す | 通過 | PR 1 本。**デプロイは伴わない**（全段完了後に 1 回・利用者の承認を得てから） |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない。`decideEntry` は timer 固有、`parseRoute` は poker 固有のまま |
| XI. 秘密と個人情報を持ち込まない | 通過 | 拒否理由のログは列挙値のみ（`CONN_REJECT_REASONS` に `tool` を足す）。`?tool=` の値そのものはログへ出さない |

**逸脱なし。**

---

## 着手前に読むもの

1. `docs/guides/definition-of-done.md`（DoD 8 項目。該当しない項目は「該当なし」と明記する）
2. `apps/tasuki-sync/src/adapters/ws-adapter.ts` の冒頭 docstring と `HUB_WS_PATH` / `ConnectionData` の docstring
   （**この段で決まり方そのものが変わる、と当人が予告している**）
3. `docs/adr/0015`（web 層の 3 責務。画面は同期クライアントを import しない）
4. `docs/adr/0017`（文脈分割。LP が timer のドメインを知らない理由）

---

## この計画が前提を実測した結果（2026-09-14・main `daa98f5`）

**Issue 本文の前提が 5 つ外れている。** どれも実装の形を変える。

| # | 実測した事実 | 帰結 |
|---|---|---|
| 1 | **`NameForm.tsx` は `TopPage` だけのものではない。** `apps/poker-web/src/pages/RoomPage.tsx:6,37` の `JoinForm` も使っている | 「`NameForm.tsx` を削除する」だけでは通らない。**`JoinForm` ごと畳む**（Task 9）。利用者の裁定は「撤去して `/?room=CODE` へ送る」 |
| 2 | **`Join.tsx` は「ドライバーとして参加／見学で参加」の必須選択を持つ。** ハブの `JoinRoom.tsx` にこれは無い | **廃止し、輪へはロビー／セッションの「交代の輪に入る」で加入する**（利用者の裁定）。機能は失われない（`onJoinRotation` は残る） |
| 3 | **完了記録は `localStorage` ではなく IndexedDB にある**（`apps/timer-web/src/records/indexeddb.ts`）。Issue 本文の「端末内 localStorage」は誤り。**LP と timer は同一オリジンなので、技術的には LP からも読める** | 「入口だけを置き、描画は timer 側に残す」という結論は変わらないが、**理由はオリジンではなく文脈分割（ADR 0017）である**。計画とコメントはその理由で書く |
| 4 | **玄関（`CreateRoom` / `JoinRoom`）には「同期サーバーに接続できません」の告知が無い。** 出しているのは `RoomChoice` の再接続表示だけ | poker の `TopPage` を撤去すると、**#76 で直した「繋がらないことと押せない理由を伝える」振る舞いが消える**。撤去の前に玄関へ置く（Task 1） |
| 5 | **ルーム名の入力は失われない。** ハブの `CreateRoom` が既に受けている。timer の `savePreferences` が保存していた名前も `tasuki:display-name`（`packages/sync-client/src/resume-identity.ts`）が引き継ぐ | `Setup.tsx` の撤去で失われるのは「記録を見る」導線だけ（Task 6 で手当て） |

**利用者の裁定（2026-09-14）。** ①**参加方法の必須選択は廃止**し、輪はロビーで入る
②**poker の参加フォームは撤去し `/?room=CODE` へ送る** ③**記録の入口は玄関と選択画面の両方**に置く。

**この計画が置く前提（実装中に覆ったら止めて報告する）。**
**ツールの宣言は wire には載せられない。** メッセージ層はパーサ自体が別で
（timer は `CommandSchema`、poker は `parseClientMessage`、ハブは `parseBoundaryMessage`）、
**最初のフレームを読む前に層を決める必要がある**。したがって宣言は接続 URL のクエリに置く。
宣言が 1 箇所だけになるので、Issue 本文が求めた「入口と wire の突き合わせ検査」は不要になる
（**矛盾しうる形を作らない**のが、突き合わせるより安い）。

---

## 指標の基準値（main `daa98f5` で実測。突合は Task 10 でこの値と行う）

```
SC031 | 2      | 未達（既存）
SC032 | 1493/1495（99.9%）
SC036 | 1953
SC039 | 分岐 0 / データ 0 行 / 公開記号 0 件 / 公開契約 0 件
走査対象: src 10 パッケージ / 203 件、test 11 パッケージ / 284 件
```

**SC-032 は合否の無い行なので、放っておくと後退しても CI が緑のまま通る。**

---

## Global Constraints（全タスクの要求に暗黙に含まれる）

- **日本語**で書く。テストは `Given ... / When ... / Then ...`、本体が 3 行以上なら**前提と操作を空行で区切る**（SC-032）
- **生の色を書かない**（`@tasuki/ui` のトークン）／**`console` を書かない**／**`export *` を書かない**
- **ドメインに `Date.now` / `Math.random` を書かない**
- **新しいライブラリを足さない**
- **UI 文言は自己ホスト書体の base 層に収まる字だけで書く**（`packages/ui/README.md`。外れる字 1 つで ext 層 約 210KB を引く）
- 画面は同期クライアントを直接 import しない（ADR 0015 MUST 2）。**判定は純粋関数、適用だけを画面／フックが行う**

---

## ファイル構成（この段で触るもの）

**新規**

| パス | 責務 |
|---|---|
| `apps/timer-web/src/ui/entry.ts` | `?view=` / `?room=` から「履歴／ルーム／玄関へ送る」を決める純粋関数 |
| `apps/timer-web/test/ui/entry.test.ts` | 同上のテスト |
| `apps/landing/src/screens/HistoryLink.tsx` | 玄関と選択画面が共有する「記録を見る」の札（行き先の組み立てを 1 箇所に持つ） |
| `apps/landing/tests/history-link.test.tsx` | 同上のテスト |
| `scripts/mutations/m34-tool-query-ignored.patch` 他 2 件 | 変異 3 件 |

**変更**

| パス | 何が変わるか |
|---|---|
| `apps/tasuki-sync/src/adapters/ws-adapter.ts` | `?tool=` で層を決める／`ConnectionData` を判別可能ユニオンへ／旧パスの撤去 |
| `apps/tasuki-sync/src/application/log/vocabulary.ts` | `CONN_REJECT_REASONS.tool` を足す |
| `apps/timer-web/src/sync/sync-url.ts` | `SYNC_PATH` を `/ws?tool=timer` へ |
| `apps/poker-web/src/hooks/useSync.ts` | `wsUrl()` を `/ws?tool=poker` へ／`createRoom` の撤去 |
| `apps/timer-web/src/App.tsx` `src/sync/use-timer-sync.ts` | `Setup` / `Join` の撤去・`AppMode` の縮小・行き先の付け替え |
| `apps/poker-web/src/App.tsx` `src/router.ts` `src/pages/RoomPage.tsx` | `TopPage` / `JoinForm` の撤去・ルートの付け替え |
| `apps/landing/src/screens/CreateRoom.tsx` `JoinRoom.tsx` `RoomChoice.tsx` | 接続の告知／記録の入口 |
| `apps/landing/src/hub/use-hub-sync.ts` | 接続状態を作成・参加画面へも渡す |
| `deploy/timer/caddy/10-timer-ws.conf`（削除）・`deploy/poker/caddy/20-poker.conf`・`deploy/timer/NOTES.md` | 配備資材 |
| `apps/timer-web/vite.config.ts` `apps/poker-web/vite.config.ts` | dev 中継を `/ws` へ |
| `e2e/specs/*.spec.ts`・`apps/landing/tests/caddy-fragment-port.test.ts`・`apps/timer-web/test/sync/sync-url.test.ts` | 検査の更新 |

**削除**

`apps/timer-web/src/ui/Setup.tsx` / `Join.tsx` と そのテスト 3 本（`Setup.onboarding.test.tsx` /
`Join.test.tsx` / `Join.participation-mode.test.tsx`）、`apps/poker-web/src/pages/TopPage.tsx` /
`src/components/NameForm.tsx`、`deploy/timer/caddy/10-timer-ws.conf`。

---

## Task 1: 玄関に接続の告知を置く

**なぜ最初か:** poker の `TopPage` を撤去すると、#76 で直した「繋がらないことと押せない理由を
伝える」振る舞いが**玄関には無いまま消える**（前提の実測 4）。撤去より先に置く。

**Files:**
- Modify: `apps/landing/src/hub/use-hub-sync.ts`（`connection` を作成・参加画面へも出す）
- Modify: `apps/landing/src/screens/CreateRoom.tsx`, `apps/landing/src/screens/JoinRoom.tsx`
- Modify: `apps/landing/src/App.tsx`
- Test: `apps/landing/tests/App.test.tsx`

**Interfaces:**
- Consumes: `useHubSync()` の既存の戻り値（`connection: 'online' | 'reconnecting'`・`error`）
- Produces: `CreateRoomProps` / `JoinRoomProps` に `readonly connection: 'online' | 'reconnecting'` が加わる

- [ ] **Step 1: 失敗するテストを書く**

`apps/landing/tests/App.test.tsx` に足す。既存のテストが `useHubSync` をどうモックしているかに
合わせること（ファイル冒頭の `vi.mock` を読む）。

```tsx
it("Given 同期サーバーへ繋がっていない / When 玄関を開く / Then 繋がらないことと押せない理由が読み上げに乗る", () => {
  // Given: 接続が確立していない
  mockHub({ connection: "reconnecting", code: null, joined: false });

  render(<App />);

  // Then: 告知が role="alert" で出ており、いま何ができないかまで書いてある
  const notice = screen.getByRole("alert");
  expect(notice).toHaveTextContent("同期サーバーに接続できません");
  expect(notice).toHaveTextContent("ルームの作成と参加はできません");

  // Then: 実際に押せない（告知と画面の状態が食い違わない）
  expect(screen.getByRole("button", { name: "ルームを作る" })).toBeDisabled();
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/landing && corepack pnpm exec vitest run tests/App.test.tsx`
Expected: FAIL（`role="alert"` が見つからない）

- [ ] **Step 3: 最小の実装**

`CreateRoom.tsx`（`JoinRoom.tsx` も同じ形で）:

```tsx
export interface CreateRoomProps {
  readonly defaultDisplayName: string;
  readonly error: string | null;
  /** 同期サーバーへ繋がっているか。繋がっていなければ作成も参加もできない（#76 の回帰防止）。 */
  readonly connection: 'online' | 'reconnecting';
  onCreate(roomName: string, displayName: string): void;
}
```

フォームの上に置く。**文言は base 層に収まる字だけで書く**（`packages/ui/README.md`）。

```tsx
{connection === 'reconnecting' && (
  <p className="hub-error" role="alert">
    同期サーバーに接続できません。復旧するまで、ルームの作成と参加はできません。
  </p>
)}
```

送信ボタンに `disabled={connection !== 'online'}` を付ける。`App.tsx` は `connection={hub.connection}`
を両画面へ渡す。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/landing && corepack pnpm exec vitest run tests/App.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/landing/src apps/landing/tests
git commit -m "feat: 玄関に同期サーバー未接続の告知を置く（#249）

- poker の旧入口（TopPage）が持っていた #76 の振る舞いを、撤去より先に玄関へ移す
- 作成・参加の両画面で、繋がらないことと押せない理由を role=\"alert\" で伝える"
```

---

## Task 2: サーバーが `?tool=` を読む（旧パスと併存させる）

**なぜ併存か:** クライアントを切り替える前にサーバーが受けられる必要がある。**この段階では
旧パスも受け続ける**（Task 5 で落とす）。常に動く状態を保つ。

**Files:**
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/tasuki-sync/src/application/log/vocabulary.ts`
- Test: `apps/tasuki-sync/test/ws-adapter-tool-query.test.ts`（新規）

**Interfaces:**
- Produces: `protocolFromRequestUrl(url: URL): "timer" | "poker" | "hub" | "unknown"`（同ファイル内の非公開関数）

- [ ] **Step 1: 失敗するテストを書く**

`apps/tasuki-sync/test/ws-adapter-tool-query.test.ts`（`bun test`）。既存の
`test/ws-adapter-*.test.ts` の起動ヘルパ（`PORT=0` で起動して `adapter.port` を読む作法）に合わせる。

```ts
import { describe, expect, it } from "bun:test";

describe("接続 URL のクエリでツールを宣言する", () => {
  it("Given ?tool=poker で繋ぐ / When poker のコマンドを送る / Then poker の層が受ける", async () => {
    // Given: `/ws?tool=poker` で接続する
    const { adapter, port } = await startAdapter();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tool=poker`);

    // When / Then: poker のメッセージ層が受け、INVALID_COMMAND にならない
    await expectPokerLayerReceives(ws);

    adapter.close();
  });

  it("Given ?tool=unknown-tool で繋ぐ / When 接続が開く / Then 1008 で閉じられる", async () => {
    // Given: 許可リストに無いツール名
    const { adapter, port } = await startAdapter();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tool=unknown-tool`);

    // Then: 受け入れず、理由つきで閉じる（timer へもハブへも落とさない）
    const code = await closeCodeOf(ws);
    expect(code).toBe(1008);

    adapter.close();
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/tasuki-sync && corepack pnpm exec bun test test/ws-adapter-tool-query.test.ts`
Expected: FAIL（`?tool=poker` が timer 層へ落ちる／未知の値でも接続が開いたまま）

- [ ] **Step 3: 最小の実装**

`ws-adapter.ts` に足す。

```ts
/**
 * 接続 URL が宣言するツール。**許可リストで判定する**（#95 S5c）。
 *
 * S5b まではパスが宣言だった（`/poker/ws`・`/ws`・それ以外は timer）。入口を `/ws` 1 本へ
 * 畳んだこの段では、経路だけではツールを決められない。**wire には載せられない** ——
 * メッセージ層はパーサ自体が別（`CommandSchema` / `parseClientMessage` /
 * `parseBoundaryMessage`）で、最初のフレームを読む前に層を決める必要があるためである。
 *
 * **許可リストに無い値は `"unknown"` にして接続を拒否する。** timer へもハブへも落とさない ——
 * 落とすと、綴りを間違えたクライアントが「繋がるのにコマンドが通らない」という
 * 静かな壊れ方をする（S5a の rewrite で実際に起きた型）。
 */
const TOOL_QUERY_KEY = "tool";

function protocolFromRequestUrl(url: URL): "timer" | "poker" | "hub" | "unknown" {
  const declared = url.searchParams.get(TOOL_QUERY_KEY);
  if (declared === null) return "hub";
  if (declared === "timer") return "timer";
  if (declared === "poker") return "poker";
  return "unknown";
}
```

`handleFetchUnsafe` の `protocol` の決め方を差し替える。**この段では旧パスも受ける**:

```ts
// 移行中（この段の Task 5 まで）は旧パスも受ける。クエリでの宣言が優先される。
const path = normalizeWsPath(url.pathname);
const declared = protocolFromRequestUrl(url);
const protocol =
  url.searchParams.has(TOOL_QUERY_KEY) || path === HUB_WS_PATH
    ? declared
    : path === POKER_WS_PATH
      ? "poker"
      : "timer";
```

`handleOpen` の先頭（クライアント鍵の検査の**前**）に拒否を足す:

```ts
// 宣言されたツールが許可リストに無い。受け入れると「繋がるのにコマンドが通らない」
// 静かな壊れ方になるので、理由つきで閉じる。
if (ws.data.protocol === "unknown") {
  // 列挙値だけを出す（P-2）。`?tool=` の値そのものは利用者由来なので載せない（ADR 0012 D3）。
  this.options.logger.warn("conn-rejected", { reason: CONN_REJECT_REASONS.tool });
  ws.close(1008, "Unknown tool");
  return;
}
```

`vocabulary.ts` に足す:

```ts
tool: publicText("tool"), // log-hygiene:allow 語彙定義
```

`ConnectionData.protocol` の型に `"unknown"` を足す（Task 3 でユニオンへ割り直す）。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/tasuki-sync && corepack pnpm exec bun test test/ws-adapter-tool-query.test.ts`
Expected: PASS

Run: `cd apps/tasuki-sync && corepack pnpm test`
Expected: 既存テストも全部 PASS（旧パスを残したので落ちない）

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync
git commit -m "feat: ツールの宣言を接続 URL のクエリで受ける（#249）

- /ws?tool=timer|poker を許可リストで判定し、外れた値は 1008 で閉じる
- wire には載せない（メッセージ層のパーサを最初のフレームより前に決める必要がある）
- 旧パス（/timer/ws・/poker/ws）は移行のため併存させる"
```

---

## Task 3: `ConnectionData` を文脈ごとに分ける

**これは S4b からの申し送り。** 宛先は S4a → S4b → この段と 2 度動いている。
**割り方が決まるこの段が最も安い**（`ConnectionData` の docstring に経緯がある）。

**Files:**
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`
- Test: `apps/tasuki-sync/test/ws-adapter-connection-data.test.ts`（新規・型の検査）

**Interfaces:**
- Produces: `ConnectionData = ConnectionBase & ToolContext`。`poker` の枝だけが
  `participantId: string | null` / `roomId: string | null` を持つ

- [ ] **Step 1: 失敗するテストを書く**

型の性質は実行時テストでは掴めない。**型検査に落ちることを確かめるテスト**を書く
（`apps/tasuki-sync/tsconfig.json` の `include` は `["src/**/*"]` でテストを型検査しないので、
実行時に確かめられる形にする）。

```ts
import { describe, expect, it } from "bun:test";

describe("接続ごとに持ち回る値は文脈ごとに分かれている", () => {
  it("Given timer の接続 / When 受理される / Then poker 専用の項目を持たない", async () => {
    // Given: `?tool=timer` で繋ぐ
    const { adapter, port, sockets } = await startAdapterCapturingSockets();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tool=timer`);
    await opened(ws);

    // Then: timer の接続データに poker の 3 項目のうち 2 つ（participantId / roomId）が無い
    const data = sockets.at(-1)!.data;
    expect(Object.hasOwn(data, "participantId")).toBe(false);
    expect(Object.hasOwn(data, "roomId")).toBe(false);

    adapter.close();
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/tasuki-sync && corepack pnpm exec bun test test/ws-adapter-connection-data.test.ts`
Expected: FAIL（timer の接続も `participantId: null` / `roomId: null` を持っている）

- [ ] **Step 3: 最小の実装**

```ts
/**
 * すべての接続が持つ値。
 * `connId` は Origin / 接続数の検査を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので onDisconnect を呼ばない。
 */
interface ConnectionBase {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。受理まで空文字。 */
  rateKey: string;
}

/**
 * どのメッセージ層へ渡すかと、その層だけが持つ値（#95 S5c）。
 *
 * **S4b までは 3 つの項目（`rateKey` / `participantId` / `roomId`）を全接続が持ち回っていた。**
 * 統合前の poker が同じ 3 つを持っており、`HandlerConnection`
 * （`application/poker-handlers.ts`）が構造的にこれを要求するためである。timer 側は
 * `participantId` / `roomId` を読み書きしない。**この段で入口が `/ws` 1 本になり、
 * `protocol` の決まり方そのものが変わったので、割り方もここで決めた。**
 *
 * `"hub"` は選択画面（#95 S5a）。**在席の宣言もここで決まる** —— ハブの接続はどのツールも
 * 宣言しない（`tool: null`）ので、ツールの参加者一覧には出ない。
 * `"unknown"` は許可リストに無い `?tool=` の値。`handleOpen` が 1008 で閉じる。
 */
type ToolContext =
  | { readonly protocol: "timer" }
  | { readonly protocol: "hub" }
  | { readonly protocol: "unknown" }
  | { readonly protocol: "poker"; participantId: string | null; roomId: string | null };

type ConnectionData = ConnectionBase & ToolContext;
```

`handleFetchUnsafe` の `server.upgrade` に渡す `data` を、宣言ごとに作り分ける:

```ts
const base = { connId: "", origin, clientKey, rateKey: "" };
const data: ConnectionData =
  protocol === "poker"
    ? { ...base, protocol, participantId: null, roomId: null }
    : { ...base, protocol };
```

`poker-handlers.ts` 側で `ws.data.participantId` を読み書きしている箇所は、
**`ws.data.protocol === "poker"` で絞ってから触る**。型が通らない箇所は narrowing を足す。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/tasuki-sync && corepack pnpm exec bun test test/ws-adapter-connection-data.test.ts`
Expected: PASS

Run: `cd apps/tasuki-sync && corepack pnpm test && corepack pnpm typecheck`
Expected: 全部 PASS

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync
git commit -m "refactor: ConnectionData を文脈ごとに分ける（#249・S4b からの申し送り）

- poker の枝だけが participantId / roomId を持つ判別可能ユニオンにする
- timer の接続が poker 専用の項目を持てないことを型で示す"
```

---

## Task 4: 3 つのクライアントを `/ws?tool=` へ切り替える

**Files:**
- Modify: `apps/timer-web/src/sync/sync-url.ts`, `apps/timer-web/test/sync/sync-url.test.ts`
- Modify: `apps/poker-web/src/hooks/useSync.ts`
- Modify: `apps/timer-web/vite.config.ts`, `apps/poker-web/vite.config.ts`
- Test: `apps/poker-web/tests/ws-url.test.ts`（新規）

**Interfaces:**
- Produces: `SYNC_PATH = "/ws?tool=timer"`（`apps/timer-web/src/sync/sync-url.ts`）

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-web/test/sync/sync-url.test.ts` の既存の期待値を書き換える。
**Caddy 断片との一致を見ている検査なので、断片側（Task 5）と綴りを揃えること。**

```ts
it("パスはハブと同じ /ws で、ツールはクエリが宣言する", () => {
  // Caddy 断片は `/ws` だけを受け、クエリはそのまま上流へ渡る（#95 S5c）。
  expect(SYNC_PATH).toBe("/ws?tool=timer");
});

it("Given https の玄関 / When URL を組み立てる / Then wss でツールを宣言する", () => {
  expect(buildSyncUrl({ protocol: "https:", host: "tasuki.example" })).toBe(
    "wss://tasuki.example/ws?tool=timer",
  );
});
```

`apps/poker-web/tests/ws-url.test.ts`（新規）:

```ts
import { describe, expect, it } from "vitest";
import { wsUrl } from "../src/hooks/useSync";

describe("poker の接続先", () => {
  it("Given 玄関と同じホスト / When URL を組み立てる / Then /ws で poker を宣言する", () => {
    // Given: location を差し替えずに読めるよう、テストは jsdom の既定ホストで判定する
    expect(new URL(wsUrl()).pathname).toBe("/ws");
    expect(new URL(wsUrl()).searchParams.get("tool")).toBe("poker");
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/sync/sync-url.test.ts`
Run: `cd apps/poker-web && corepack pnpm exec vitest run tests/ws-url.test.ts`
Expected: どちらも FAIL

- [ ] **Step 3: 最小の実装**

`apps/timer-web/src/sync/sync-url.ts`:

```ts
/**
 * 同期サーバーへの WebSocket URL を組み立てる（S4 / #19・#95 S5c）。
 *
 * **入口は玄関と同じ `/ws` 1 本で、ツールはクエリが宣言する**（#95 S5c）。
 * S5b までは `/timer/ws` という経路そのものが宣言だった。入口を畳んだ以上、
 * 経路ではツールを決められない。
 *
 * ここで組み立てるパスは Caddy 断片（`deploy/landing/caddy/05-hub-ws.conf`）が受ける
 * `/ws` と一致していること。食い違うと WS が繋がらないのに、どちらのファイルも
 * 正しく見える。`test/sync/sync-url.test.ts` と
 * `apps/landing/tests/caddy-fragment-port.test.ts` がこの一致を機械的に固定している。
 */
export const SYNC_PATH = "/ws?tool=timer";
```

`PUBLIC_PATH` を使わなくなるので、import が宙に浮いていないか確認する
（設定を消したら、その設定を名指しする文を grep する。#173 で 4 箇所が宙に浮いた）。

`apps/poker-web/src/hooks/useSync.ts`:

```ts
export function wsUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  // **入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**（#95 S5c）。
  return `${scheme}://${location.host}/ws?tool=poker`;
}
```

dev 中継。`apps/timer-web/vite.config.ts` の `"/timer/ws"` を `"/ws"` へ、
`apps/poker-web/vite.config.ts` の `'/poker/ws'` を `'/ws'` へ。コメントも直す
（「rewrite しない」の理由が変わった。**いまは剥がす対象のパスが無い**）。

```ts
      // 開発時も本番と同じ `/ws` で繋ぐ（本番は Caddy の 05-hub-ws.conf が担う）。
      // ツールの宣言はクエリ（`?tool=timer`）が持つので、パスを触る必要はない。
      // 入口は玄関（5175）なので普段この中継は通らないが、5173 を直接開いたときに要る。
      "/ws": {
        // sync サーバーは IPv4 で確実に解決する 127.0.0.1 を指定（localhost の IPv6 解決差を回避）
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
```

- [ ] **Step 4: 通ることを確かめる**

Run: `corepack pnpm test --force --filter @tasuki/timer-web --filter @tasuki/poker-web`
Expected: PASS

- [ ] **Step 5: 実経路で 1 度だけ目で見る**

`pnpm dev` を起動し `http://localhost:5175/` でルームを作り、timer と poker の両方へ入って
**参加者一覧に自分が出る**ことを確かめる（WS が繋がっていなければ出ない）。
確認したら **dev サーバーを落とす**（掴んだままにすると利用者の `pnpm dev` を全滅させる）。

- [ ] **Step 6: コミット**

```bash
git add apps/timer-web apps/poker-web
git commit -m "feat: timer と poker の接続先を /ws?tool= へ移す（#249）

- 入口を玄関と同じ /ws 1 本にし、ツールはクエリで宣言する
- dev の vite 中継も /ws へ揃える"
```

---

## Task 5: 旧 WS パスを撤去する

**Files:**
- Modify: `apps/tasuki-sync/src/adapters/ws-adapter.ts`（`POKER_WS_PATH` / `HUB_WS_PATH` / `normalizeWsPath` の撤去）
- Delete: `deploy/timer/caddy/10-timer-ws.conf`
- Modify: `deploy/poker/caddy/20-poker.conf`（WS の handle を削る）
- Modify: `apps/landing/tests/caddy-fragment-port.test.ts`
- Modify: `e2e/specs/routing.spec.ts`, `e2e/specs/rate-limit.spec.ts`
- Modify: `deploy/timer/NOTES.md`

- [ ] **Step 1: 失敗するテストを書く**

`apps/landing/tests/caddy-fragment-port.test.ts` の期待を「WS の断片はちょうど 1 本」にする。

```ts
it("WS を受ける断片は /ws の 1 本だけである", () => {
  // #95 S5c で入口を 1 本に畳んだ。2 本以上あるなら、どれかが死んだ設定として残っている。
  const wsHandles = allFragments().flatMap(handledWsPathsOf);

  expect(wsHandles).toEqual(["/ws"]);
});
```

`e2e/specs/routing.spec.ts` の 426 の表を書き換える。**旧パスは断片が無くなるので、
`handle_path /timer/*` の SPA フォールバックに吸われて 200 が返る**。
「もう WS の入口ではない」ことを具体値で固定する（否定で書かない・空振りする）。

```ts
  for (const [wsPath, expectedStatus] of [
    // `/ws` だけが WS の入口である（#95 S5c）。**200 が返るなら断片が設置されておらず、
    // 包括フォールバック（LP の index.html）に吸われている**という意味になる。
    ['/ws', 426],
    // 旧入口。断片を撤去したので、いまは timer / poker の SPA フォールバックが返る。
    // **426 が返るなら断片が残っている。**
    ['/timer/ws', 200],
    ['/poker/ws', 200],
  ] as const) {
```

`e2e/specs/rate-limit.spec.ts:56` の直結先を `/ws?tool=poker` へ。

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/landing && corepack pnpm exec vitest run tests/caddy-fragment-port.test.ts`
Expected: FAIL（WS の断片が 3 本ある）

- [ ] **Step 3: 最小の実装**

`ws-adapter.ts` から `POKER_WS_PATH` / `HUB_WS_PATH` / `normalizeWsPath` と、その呼び出しを消す。
**冒頭 docstring の「振り分けはパスだけで行う」の節を書き換える**
（**消した記号は宣言の側に生き残る**。
`grep -rn "POKER_WS_PATH\|HUB_WS_PATH\|normalizeWsPath\|/timer/ws\|/poker/ws" --include='*.ts' --include='*.md' .`
を走らせて、散文・コメント・断片のすべてから消す）。

`protocol` の決め方は Task 2 の併存分岐を落として素直にする:

```ts
const protocol = protocolFromRequestUrl(url);
```

`deploy/timer/caddy/10-timer-ws.conf` を削除。`deploy/poker/caddy/20-poker.conf` から
`handle /poker/ws { ... }` のブロックとその上のコメントを削除する（静的配信と redir は残す）。

`deploy/timer/NOTES.md` に配布時の手順を足す（**3 つとも必要**）:

```markdown
### #95 S5c（旧 WS 入口の撤去）

1. ホスト上の `/etc/caddy/tasuki/apps/10-timer-ws.conf` を**削除する**
2. `deploy/poker/caddy/20-poker.conf` を**更新して設置し直す**（`/poker/ws` の handle が消えた）
3. `05-hub-ws.conf`（S5a で新設）が設置済みであることを確かめる —— これが無いと**すべての
   ツールが繋がらない**。S5c 以降、WS の入口はこの 1 本だけである

⚠ **旧 WS パスへ繋いだままのタブは静かに壊れる。** 断片を消すと `/timer/ws` は
`handle_path /timer/*` の SPA フォールバックに吸われ、WebSocket にならずに index.html が
200 で返る。エラーにならないので気づきにくい（強制再読み込みで直る。新しいタブでは起きない）。
```

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/landing && corepack pnpm exec vitest run tests/caddy-fragment-port.test.ts`
Run: `cd apps/tasuki-sync && corepack pnpm test`
Run: `corepack pnpm e2e`
Expected: すべて PASS

- [ ] **Step 5: 壊して確かめる（対照実行つき）**

**先に `git status --porcelain` が空であることを見る**（
`git checkout --` で未コミットの実装を消したのは 4 度目）。

`05-hub-ws.conf` を一時的に退避して `pnpm e2e` を流し、**赤になること**を確かめる。
戻して緑になることも確かめる（対照実行）。

- [ ] **Step 6: コミット**

```bash
git add -A apps/tasuki-sync apps/landing deploy e2e
git commit -m "feat!: WS の入口を /ws 1 本に畳む（#249）

- /timer/ws と /poker/ws の断片を撤去し、サーバーからもパスでの振り分けを落とす
- 配布時の手順を deploy/timer/NOTES.md に足す（断片の削除 2 件＋ /ws の存在確認）"
```

---

## Task 6: 端末の記録への入口を玄関と選択画面に置く

**撤去すると記録は「ルームが消えたときにしか見られないもの」になる**（いまの入口は
`Setup.tsx` ＝撤去対象と、ルーム消滅時だけ出る `SessionLost.tsx` の 2 つ）。

**入口だけを置き、描画は timer 側に残す。** LP と timer は**同一オリジンなので技術的には
LP からも IndexedDB を読めるが、読まない** —— 完了記録の形は timer のドメインであり、
LP がそれを知ると文脈の境界が消える（ADR 0017）。

**Files:**
- Create: `apps/landing/src/screens/HistoryLink.tsx`, `apps/landing/tests/history-link.test.tsx`
- Create: `apps/timer-web/src/ui/entry.ts`, `apps/timer-web/test/ui/entry.test.ts`
- Modify: `apps/landing/src/screens/CreateRoom.tsx`, `JoinRoom.tsx`, `RoomChoice.tsx`
- Modify: `apps/timer-web/src/App.tsx`, `apps/timer-web/src/ui/History.tsx`

**Interfaces:**
- Produces: `decideEntry(search: string): Entry`（`apps/timer-web/src/ui/entry.ts`）

```ts
export type Entry =
  | { kind: "history"; backTo: string }
  | { kind: "room"; code: string }
  | { kind: "redirect"; to: string };
```

- Produces: `<HistoryLink roomCode={string | null} />`（`apps/landing`）

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-web/test/ui/entry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideEntry } from "../../src/ui/entry.js";

describe("timer をどの入口で開いたかを決める", () => {
  it("Given ルームコードが無い / When timer を開く / Then 玄関へ送る", () => {
    expect(decideEntry("")).toEqual({ kind: "redirect", to: "/" });
  });

  it("Given 空の room だけが付いている / When timer を開く / Then 玄関へ送る", () => {
    // `?room=` だけの URL は入口のまま（poker の parseRoute と同じ扱い）
    expect(decideEntry("?room=")).toEqual({ kind: "redirect", to: "/" });
  });

  it("Given ルームコードがある / When timer を開く / Then そのルームへ入る", () => {
    expect(decideEntry("?room=朝会モブ-a1b2")).toEqual({ kind: "room", code: "朝会モブ-a1b2" });
  });

  it("Given 玄関から記録を開いた / When timer を開く / Then 履歴を出し、戻り先は玄関になる", () => {
    // 記録は端末に閉じるので、ルームに入っていなくても見られる（Setup が持っていた性質）
    expect(decideEntry("?view=history")).toEqual({ kind: "history", backTo: "/" });
  });

  it("Given 選択画面から記録を開いた / When timer を開く / Then 戻り先は同じルームの選択画面になる", () => {
    // **`?view=` の判定は `?room=` より先に来る。** 逆だとルームへ入ってしまい、履歴に着けない
    expect(decideEntry("?view=history&room=朝会モブ-a1b2")).toEqual({
      kind: "history",
      backTo: "/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2",
    });
  });
});
```

`apps/landing/tests/history-link.test.tsx`:

```tsx
it("Given ルームに入っていない / When 記録の入口を描く / Then room の付かない履歴 URL を指す", () => {
  render(<HistoryLink roomCode={null} />);

  expect(screen.getByRole("link", { name: "記録を見る" })).toHaveAttribute(
    "href",
    "/timer/?view=history",
  );
});

it("Given ルームに入っている / When 記録の入口を描く / Then 戻ってこられるよう room を持たせる", () => {
  render(<HistoryLink roomCode="朝会モブ-a1b2" />);

  expect(screen.getByRole("link", { name: "記録を見る" })).toHaveAttribute(
    "href",
    "/timer/?view=history&room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2",
  );
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/ui/entry.test.ts`
Run: `cd apps/landing && corepack pnpm exec vitest run tests/history-link.test.tsx`
Expected: どちらも FAIL（モジュールが無い）

- [ ] **Step 3: 最小の実装**

`apps/timer-web/src/ui/entry.ts`:

```ts
/**
 * timer をどの入口で開いたかを決める純粋関数（#95 S5c・R9）。
 *
 * **旧入口（`Setup` / `Join`）を撤去したので、ルームコードを伴わない URL には
 * 行き先が無い。** 玄関（`/`）へ送る。名乗りと合言葉の入力はそこに 1 つだけある。
 *
 * **`?view=history` は `?room=` より先に見る。** 端末に残った完了記録は
 * ルームと無関係に見られるもので（`Setup` が持っていた性質）、順序を逆にすると
 * ルームへ入ってしまい履歴へ着けない。戻り先は開いた元 —— 玄関から来たなら `/`、
 * 選択画面から来たなら `/?room=CODE` —— を URL 自身が運ぶ。
 */
export type Entry =
  | { kind: "history"; backTo: string }
  | { kind: "room"; code: string }
  | { kind: "redirect"; to: string };

export function decideEntry(search: string): Entry {
  const params = new URLSearchParams(search);
  const code = params.get("room");
  if (params.get("view") === "history") {
    return { kind: "history", backTo: code ? `/?room=${encodeURIComponent(code)}` : "/" };
  }
  if (code) return { kind: "room", code };
  return { kind: "redirect", to: "/" };
}
```

`apps/landing/src/screens/HistoryLink.tsx`:

```tsx
/**
 * 端末に残った完了記録への入口（#95 S5c・利用者の申し送り 2026-09-14）。
 *
 * **入口だけを置き、描画は timer 側に残す。** LP と timer は同一オリジンなので
 * 技術的には LP からも IndexedDB を読めるが、**読まない** —— 完了記録の形は timer の
 * ドメインであり、LP がそれを知ると文脈の境界が消える（`docs/adr/0017`）。
 *
 * 撤去前の入口は `apps/timer-web/src/ui/Setup.tsx` にあり、**ルームに入っていなくても
 * 見られた**。その性質を保つため、玄関（作成・参加画面）にも置く。
 */
export interface HistoryLinkProps {
  /** いま居るルーム。入っていなければ null（戻り先が玄関になる）。 */
  readonly roomCode: string | null;
}

export function HistoryLink({ roomCode }: HistoryLinkProps) {
  const href =
    roomCode === null
      ? '/timer/?view=history'
      : `/timer/?view=history&room=${encodeURIComponent(roomCode)}`;

  return (
    <a className="hub-secondary" href={href}>
      記録を見る
    </a>
  );
}
```

`CreateRoom` / `JoinRoom` はフォームの下に `<HistoryLink roomCode={null} />`、
`RoomChoice` は札の下に `<HistoryLink roomCode={code} />` を置く。

`App.tsx`（timer）は mount 時に `decideEntry(window.location.search)` を見る。
**`kind: "redirect"` なら `window.location.replace(to)`**（`assign` にすると戻るで往復する）。
`kind: "history"` なら `History` を出し、`onBack` は `window.location.assign(backTo)`。
`History.tsx` の `onBack` の docstring（「元の画面（Setup）へ戻る」）を直す。

- [ ] **Step 4: 通ることを確かめる**

Run: `corepack pnpm test --force --filter @tasuki/timer-web --filter @tasuki/landing`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/timer-web apps/landing
git commit -m "feat: 端末の記録への入口を玄関と選択画面に置く（#249）

- 入口だけをハブに置き、描画は timer 側に残す（ADR 0017 の文脈分割）
- 撤去する Setup が持っていた「ルームに入っていなくても見られる」性質を保つ"
```

---

## Task 7: ツールから選択画面へ戻る導線を置く

**いま timer にも poker にも戻る道が無く、ブラウザの戻るか URL の手入力しかない**
（利用者の申し送り・2026-09-14）。旧入口を畳むこの段で置かないと、ツールへ入った人が
行き止まりになる。

**Files:**
- Modify: `apps/timer-web/src/ui/components/StatusStrip.tsx`, `apps/timer-web/src/App.tsx`
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`
- Test: `apps/timer-web/test/ui/StatusStrip.test.tsx`（既存に足す）, `apps/poker-web/tests/room-page-back.test.tsx`（新規）

**Interfaces:**
- Consumes: `StatusStripProps` に `readonly roomCode?: string | undefined`（既存）
- Produces: `StatusStripProps` に変更なし（`roomCode` から行き先を組み立てる）

- [ ] **Step 1: 失敗するテストを書く**

```tsx
it("Given ルームに入っている / When ステータスを描く / Then 選択画面へ戻る道がある", () => {
  render(
    <StatusStrip phase="lobby" displayName="あや" connectionStatus="online" roomCode="朝会モブ-a1b2" />,
  );

  // 行き先は**同じルームの選択画面**。玄関まで戻すと、ルームから出たことになる
  expect(screen.getByRole("link", { name: "選択画面へ戻る" })).toHaveAttribute(
    "href",
    "/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2",
  );
});
```

poker 側（`apps/poker-web/tests/room-page-back.test.tsx`）も同じ性質を、`RoomPage` の
ヘッダについて書く。

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/ui/StatusStrip.test.tsx`
Expected: FAIL

- [ ] **Step 3: 最小の実装**

両方に同じ形のリンクを置く。**文言は base 層に収まる字で**（「選択画面へ戻る」は
既存の UI 文言に使われている字で構成されていることを確かめてから使う。外れる字があれば
「もどる」など収まる語へ替える）。

```tsx
{roomCode !== undefined && (
  <a className="..." href={`/?room=${encodeURIComponent(roomCode)}`}>
    選択画面へ戻る
  </a>
)}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `corepack pnpm test --force --filter @tasuki/timer-web --filter @tasuki/poker-web`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/timer-web apps/poker-web
git commit -m "feat: ツールから選択画面へ戻る導線を置く（#249）

- timer は StatusStrip、poker は RoomPage のヘッダに置く
- 行き先は同じルームの選択画面（/?room=CODE）。玄関まで戻さない"
```

---

## Task 8: timer の旧入口を撤去する

**Files:**
- Delete: `apps/timer-web/src/ui/Setup.tsx`, `apps/timer-web/src/ui/Join.tsx`
- Delete: `apps/timer-web/test/ui/Setup.onboarding.test.tsx`, `Join.test.tsx`, `Join.participation-mode.test.tsx`
- Modify: `apps/timer-web/src/App.tsx`, `apps/timer-web/src/sync/use-timer-sync.ts`
- Modify: `apps/timer-web/test/ui/App.snapshot-intents.test.tsx`, `App.state-ref.test.tsx`, `App.sync-handlers.test.tsx`

**Interfaces:**
- Produces: `AppMode = "lobby" | "session" | "celebration" | "history"`（`setup` と `join` が落ちる）
- Produces: `useTimerSync()` の戻り値から `showHistory` / `backToSetup` / `joinCode` が落ち、
  `newSession()` の意味が「同じルームの選択画面へ戻る」に変わる

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-web/test/ui/App.entry.test.tsx`（新規）:

```tsx
it("Given ルームコードが無い / When timer を開く / Then 玄関へ送られる", () => {
  // Given: `/timer/` を素で開いた（旧入口の Setup はもう無い）
  const replace = vi.fn();
  withLocation({ search: "", replace });

  render(<App />);

  // Then: 画面を描かずに玄関へ送る。**replace で送る**（戻るで往復しないため）
  expect(replace).toHaveBeenCalledWith("/");
});

it("Given ルームコードはあるが端末に同一性が無い / When timer を開く / Then 玄関の参加画面へ送られる", () => {
  // Given: ハブを通らずに `/timer/?room=CODE` を直接開いた
  const replace = vi.fn();
  withLocation({ search: "?room=朝会モブ-a1b2", replace });
  localStorage.clear();

  render(<App />);

  // Then: 名乗りはハブに 1 つだけある。コードは落とさずに運ぶ
  expect(replace).toHaveBeenCalledWith("/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");
});

it("Given セッションを終えた / When 新しいセッションを選ぶ / Then 同じルームの選択画面へ戻る", () => {
  // 撤去前は `setMode("setup")` で**撤去する旧入口へ戻していた**（到達不能になる）
  const assign = vi.fn();
  withLocation({ search: "?room=朝会モブ-a1b2", assign });

  renderAtCelebration();
  screen.getByRole("button", { name: "新しいセッション" }).click();

  expect(assign).toHaveBeenCalledWith("/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/ui/App.entry.test.tsx`
Expected: FAIL（いまは `Setup` が描画される）

- [ ] **Step 3: 最小の実装**

1. `Setup.tsx` / `Join.tsx` とそのテスト 3 本を削除する
2. `AppMode` から `"setup"` / `"join"` を落とす。`useState<AppMode>("setup")` の初期値は
   **`"lobby"` にしない** —— ルームが無い状態で `mode === "lobby" && room` は偽なので描画されないが、
   意味が嘘になる。`AppMode | null` にして「まだどの画面でもない」を表す
3. `use-timer-sync.ts`:
   - `showHistory` / `backToSetup` / `joinCode` / `setJoinCode` を落とす
   - mount 時 effect を `decideEntry`（Task 6）に基づいて書き直す。
     `kind: "redirect"` は `window.location.replace(to)`、`kind: "room"` は
     保存済み同一性があれば `room.join` を送り、**無ければ `/?room=CODE` へ replace**
   - `newSession()` は client を畳んだうえで `window.location.assign("/?room=CODE")`
   - `LEFT_ROOM` の `destination`（`error-action.ts`）は値をそのまま使い、行き先だけ
     URL へ替える: `"join"` → `/?room=CODE`、`"setup"` → `/`（`?room=` は落とす・FR-127）
4. `App.tsx` から `Setup` / `Join` の import と分岐を落とす。`StatusStrip` を出さない条件
   （`mode !== "setup" && mode !== "join"`）も直す

**`window.location` を直接触らない。** 判定は `entry.ts` の純粋関数、適用は 1 箇所の薄い
ラッパ（`src/platform/navigate.ts` に `replaceTo` / `assignTo` を置き、テストで差し替える）
に閉じる（ADR 0015）。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/timer-web && corepack pnpm test`
Expected: PASS

- [ ] **Step 5: 消した記号が宣言の側に残っていないか grep する**

```bash
grep -rn "Setup\b\|ui/Join\|backToSetup\|showHistory\|joinCode\|AppMode" \
  --include='*.ts' --include='*.tsx' --include='*.md' apps/timer-web docs scripts
```

**使う側が 0 件でも、検査の対象宣言・例外表・日本語の散文が名指ししている**
（使う側が消えても、検査の対象宣言・例外表・散文が名指ししている）。`PHASE_LABEL` の `setup`（`StatusStrip.tsx`）は
**`RoomPhase` の値であって `AppMode` ではない**ので残す。

- [ ] **Step 6: コミット**

```bash
git add -A apps/timer-web
git commit -m "feat!: timer の旧入口（Setup / Join）を撤去する（#249・R9）

- ルームコードを伴わない URL は玄関へ送る。名乗りと合言葉はハブに 1 つだけ置く
- 参加方法（ドライバー / 見学）の必須選択は廃止し、輪へはロビーで加入する
- 完了後の「新しいセッション」は同じルームの選択画面へ戻す（撤去する画面へ送らない）"
```

---

## Task 9: poker の旧入口を撤去する

**Files:**
- Delete: `apps/poker-web/src/pages/TopPage.tsx`, `apps/poker-web/src/components/NameForm.tsx`
- Modify: `apps/poker-web/src/router.ts`, `src/App.tsx`, `src/pages/RoomPage.tsx`, `src/hooks/useSync.ts`
- Modify: `apps/poker-web/tests/router.test.ts` ほか関連テスト

**Interfaces:**
- Produces: `Route = { name: 'room'; roomId: string } | { name: 'redirect'; to: string }`
- Produces: `usePokerSync()` から `createRoom` が落ちる（呼び出し元が消えるため）

- [ ] **Step 1: 失敗するテストを書く**

`apps/poker-web/tests/router.test.ts` に足す:

```ts
it("Given ルームコードが無い / When /poker/ を開く / Then 玄関へ送る", () => {
  expect(parseRoute('/poker/', '')).toEqual({ name: 'redirect', to: '/' });
});

it("Given 旧リンク / When /poker/room/<id> を開く / Then コードを保ったまま玄関へ送る", () => {
  // 旧リンクはもう配られないが、ブックマークと履歴からは来る。**コードを落とさない**
  expect(parseRoute('/poker/room/朝会モブ-a1b2', '')).toEqual({
    name: 'redirect',
    to: '/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2',
  });
});

it("Given ハブの札から来た / When /poker/?room=CODE を開く / Then そのルームへ入る", () => {
  expect(parseRoute('/poker/', '?room=朝会モブ-a1b2')).toEqual({
    name: 'room',
    roomId: '朝会モブ-a1b2',
  });
});
```

`apps/poker-web/tests/room-page-redirect.test.tsx`（新規）:

```tsx
it("Given 端末に同一性が無い / When ルーム画面を開く / Then 玄関の参加画面へ送られる", () => {
  // 名乗りはハブに 1 つだけある（撤去前は RoomPage の JoinForm がここで聞いていた）
  const replace = vi.fn();
  localStorage.clear();

  render(<RoomPage roomId="朝会モブ-a1b2" sync={openSync()} navigate={{ replace }} />);

  expect(replace).toHaveBeenCalledWith("/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2");
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd apps/poker-web && corepack pnpm exec vitest run tests/router.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小の実装**

1. `router.ts`:

```ts
/**
 * URL からルートを決める（#95 S5c）。
 *
 * **旧入口（`TopPage`）を撤去したので、ルームコードを伴わない URL には行き先が無い。**
 * 玄関（`/`）へ送る。名乗りと合言葉の入力はそこに 1 つだけある。
 *
 * 旧リンク（`/poker/room/<id>`）も玄関へ送るが、**コードは落とさない** ——
 * 落とすと、ブックマークから来た人が入りたかったルームを失う。
 *
 * ルームコードには**ルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）ので、
 * 素の文字列操作ではなく `URLSearchParams` に復号を任せる。
 */
export type Route = { name: 'room'; roomId: string } | { name: 'redirect'; to: string };

const BASE = '/poker';

export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest === null) return { name: 'redirect', to: '/' };

  const match = /^\/room\/([^/]+)\/?$/.exec(rest);
  if (match?.[1]) return { name: 'redirect', to: hubPathFor(match[1]) };

  if (rest === '' || rest === '/') {
    const code = new URLSearchParams(search).get('room');
    return code ? { name: 'room', roomId: code } : { name: 'redirect', to: '/' };
  }

  return { name: 'redirect', to: '/' };
}

/** 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。 */
export function hubPathFor(roomId: string): string {
  return `/?room=${encodeURIComponent(roomId)}`;
}
```

`roomPath` と `topPath` は呼び出し元ごと消える（`navigate` も使われなくなるなら消す）。
**消す前に grep する**。

2. `TopPage.tsx` / `NameForm.tsx` を削除し、`App.tsx` から `top` の分岐・`navigatedRoomRef` の
   effect（ルーム作成後の遷移。作成はハブがやる）を落とす。`not-found` の分岐は `redirect` に
   吸収される
3. `RoomPage.tsx` の `JoinForm` を削除。保存済み同一性が無い場合は `checkRoom` ではなく
   `hubPathFor(roomId)` へ replace する。`room-not-found` の画面（同一性はあるがルームが
   消えている場合）と `forgetIdentity` は**残す**
4. `useSync.ts` から `createRoom` を落とす（**サーバー側の `create-room` は残る** —— ハブが使う）

- [ ] **Step 4: 通ることを確かめる**

Run: `cd apps/poker-web && corepack pnpm test`
Expected: PASS

- [ ] **Step 5: 消した記号が宣言の側に残っていないか grep する**

```bash
grep -rn "TopPage\|NameForm\|roomPath\|topPath\|createRoom" \
  --include='*.ts' --include='*.tsx' --include='*.md' apps/poker-web docs e2e
```

- [ ] **Step 6: コミット**

```bash
git add -A apps/poker-web
git commit -m "feat!: poker の旧入口（TopPage / NameForm / 参加フォーム）を撤去する（#249・R9）

- ルームコードを伴わない URL は玄関へ送る。旧リンクはコードを保ったまま /?room= へ
- 名乗りはハブに 1 つだけ置く（撤去前は RoomPage の JoinForm が二重に聞いていた）"
```

---

## Task 10: 仕上げ（E2E・変異・記録・指標）

**Files:**
- Modify: `e2e/specs/landing.spec.ts`, `timer.spec.ts`, `poker.spec.ts`, `timer-a11y.spec.ts`
- Create: `scripts/mutations/m34-tool-query-ignored.patch`, `m35-timer-entry-no-redirect.patch`, `m36-poker-legacy-path-drops-code.patch`
- Modify: `scripts/mutation-check.mjs`
- Modify: `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`
- Modify: `docs/adr/0011` または `0018`（旧入口の撤去が完了した旨。**完了形を書く場所を間違えない**）

- [ ] **Step 1: E2E を実状へ合わせる**

| ファイル | 直すこと |
|---|---|
| `timer-a11y.spec.ts:68` | `page.goto('/timer/')` → `page.goto('/')`。**リダイレクト任せにしない** —— 玄関にも「ルームを作る」があるので、壊れていても緑になる |
| `poker.spec.ts:442` | `/poker/` を開いて「ルームを作成」が disabled、を**玄関（`/`）の「ルームを作る」が disabled** へ移す（Task 1 で置いた告知を突く） |
| `poker.spec.ts:466` | `/poker/room/e2e-unreachable` → 玄関の参加画面での告知を見る |
| `poker.spec.ts:198-202, 334` | `/poker/room/<存在しない id>` の経路は玄関経由へ。ルームの不在はハブの `error` で伝わる |
| `landing.spec.ts:54-55` | 札の目印（`セッションを開始` / `票を公開する`）はそのまま使える（ルームの中のものを選んである） |

- [ ] **Step 2: E2E を走らせる**

Run: `corepack pnpm e2e`
Expected: 全件 PASS。**件数は数えない**（数えるなら実行する）

- [ ] **Step 3: 変異を 3 件足す**

`git status --porcelain` が空であることを先に見る（変異パッチを作る手順は、未コミットの実装を消す危険を持つ）。

| id | 変異 | 検出を期待するテスト |
|---|---|---|
| 34 | `protocolFromRequestUrl` が `?tool=` を無視して常に `"timer"` を返す | `apps/tasuki-sync/test/ws-adapter-tool-query.test.ts` |
| 35 | `decideEntry` がコード無しでも `{kind:"room"}` を返す（玄関へ送らない） | `apps/timer-web/test/ui/entry.test.ts` |
| 36 | `parseRoute` の旧パス分岐が `to: '/'` を返す（コードを落とす） | `apps/poker-web/tests/router.test.ts` |

`scripts/mutation-check.mjs` の `MUTATIONS` に 3 件足す（`id` は詰めない）。

Run: `node scripts/mutation-check.mjs`
Expected: **全件検出**（対照実行も通ること）

- [ ] **Step 4: 記録を更新する**

- 設計正本に「**【S5c（#249）実施時の訂正・2026-09-14】**」を足す。書くのは
  **実測で覆った 5 件**と、**ツールの宣言を wire に載せられなかった理由**、
  **利用者から見える変化**（入口が 1 つになる／参加方法の必須選択が消える／記録の入口が
  玄関と選択画面に出る／ツールから戻れる）
- **節の追記は末尾へ**（節を途中に挿すと、直後の小節が親を変える。ADR で 2 回踏んだ）
- **完了形を現況として書かない**（規範文書が現況について嘘をつく。1 つの PR で 3 回踏んだ）

- [ ] **Step 5: 指標を突き合わせる**

Run: `node scripts/audit-structure.mjs`
Expected: 冒頭の基準値と比較して**後退していないこと**。SC-032 は合否が出ないので目で見る

- [ ] **Step 6: 全体を回す**

```bash
corepack pnpm test --force        # 12 タスク・Cached 0 を確認する
corepack pnpm e2e
node scripts/check-links.mjs      # 新規ファイルは git add してから
node scripts/audit-structure.mjs
node --test scripts/*.test.mjs    # 手元の全緑は CI の緑ではない
corepack pnpm audit
```

- [ ] **Step 7: 実画面で通す（憲法 原則 V）**

`pnpm dev` → `http://localhost:5175/` で、**2 つの文脈**（作成者と参加者）で次を目で見る。

1. 玄関でルームを作る → 選択画面 → timer へ → **戻る導線で選択画面へ戻れる**
2. 参加用 URL を別の文脈で開く → 名乗る → poker へ → 戻る
3. `/timer/` を素で開く → **玄関へ送られる**
4. `/poker/room/<いま居るルーム>` を開く → **玄関のそのルームへ送られる**
5. 玄関と選択画面の「記録を見る」→ 履歴が出る → 戻ると**開いた元へ戻る**
6. timer でセッションを完了 → 「新しいセッション」→ **同じルームの選択画面**

**アサーションを書く前に 1 回「探索」を走らせる**（実画面の検証は、見るものを決めてから探すと見落とす）。
終わったら **dev サーバーを落とす**。

- [ ] **Step 8: PR を出し、分割レビューを掛ける**

DoD 8 項目を本文に書く（該当しない項目は「該当なし」と明記）。
`/code-review` を掛ける。**worktree で作った PR は番号を明示する**
（`/code-review` はカレントブランチを見るため、宛先を取り違える）。

---

## 自己レビュー（この計画を書いたあとに確かめたこと）

- **要求の網羅**: R9 → Task 8 / 9。戻る導線 → Task 7。完了後の行き先 → Task 8。記録の入口 →
  Task 6。`ConnectionData` → Task 3。ツールの宣言 → Task 2。配備資材 → Task 5。**漏れなし**
- **プレースホルダ**: 無し。文言・型・パスはすべて実物を書いた
- **型の一貫性**: `Entry`（Task 6）を Task 8 が消費、`Route`（Task 9）は poker に閉じる、
  `ToolContext`（Task 3）は Task 2 の `protocolFromRequestUrl` の戻り値と綴りが揃っている
- **積み残し**: S5b からの申し送り 2 件（**輪に 1 人だけの timer 参加者が poker 在席者の残る
  ルームから退出できない `BelowMinMembers`** ／ **poker と timer で再接続の待ち時間が違う**）は
  **この計画に入れていない**。どちらも入口の撤去とは独立で、根拠を測ってから決める性質のもの。
  **Task 10 の PR 本文で S6（#250）へ送る**
