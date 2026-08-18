# 設計: web 層を「純粋関数・同期フック・画面」の 3 責務へ再編する（#72 E4 / #167）

- **日付**: 2026-08-19
- **Issue**: [#167](https://github.com/tomohiroJin/tasuki-tools/issues/167)（親: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の **E4**）
- **前提**: E1（[`docs/adr/0015`](../../adr/0015-web-layer-structure.md) の新設）・E2（#165）・E3（#166）が完了済み
- **危険度**: **高**（`apps/timer-web/src/App.tsx` の全面再編。振る舞いは 1 つも変えない）

## 概要

`docs/adr/0015` の MUST 2「WebSocket の接続状態とメッセージ配線は同期フック 1 本に集約する」を
`apps/timer-web` へ適用する。`App.tsx`（849 行）から `SyncClient` の配線とルーム由来の状態を
`src/sync/use-timer-sync.ts` へ移し、判断は純粋関数へ、送信ラッパーは純粋ファクトリへ出す。
`App.tsx` は表示に徹する（MUST 3）。あわせて MUST 2 の機械検査を新設し、
`docs/timer/adr/0003`（時刻系）の実態一致を検証する。

**利用者から見える振る舞い・公開 URL・WS プロトコルは 1 文字も変えない。**

### ファイルの割り付け

```
apps/timer-web/src/
  App.tsx                     849 行 → 表示のみ（D1・D9）
  sync/
    use-timer-sync.ts   新設  唯一の同期フック。SyncClient の生成・接続状態・
                              メッセージ配線・ルーム由来 state（D1・D2）
    snapshot-intents.ts 新設  純粋。(prev, next, ctx) → 意図[]（D3）
    commands.ts         新設  純粋。createCommands(send) → 送信 27 箇所（D4）
    client.ts                 変更なし
  ui/
    use-banner.ts       新設  バナー文言と自動消去（D5。WS 配線ではない）
apps/timer-web/test/ui/
  App.commands.test.tsx   新設  **再編前**に足す特性テスト（D9b）
  App.connection.test.tsx 新設  **再編前**に足す特性テスト（D9b）
scripts/
  audit-web-sync-boundary.mjs 新設  許可リスト方式の機械検査（D6・D7）
```

## 背景

### 現状（2026-08-19 実測）

| 項目 | 実測値 | 測り方 |
|---|---|---|
| `apps/timer-web/src/App.tsx` の行数 | **849** | `wc -l`。`docs/adr/0015` は 848 と書くが、これは 2026-08-17 の測定値で、その後 E1 の `49fdac7`（docstring 修正）が 1 行増やした |
| `useState` | **11** | `grep -c "useState<\|useState("` |
| `useRef` | **10** | `grep -c "useRef<\|useRef("` |
| WS 送信の呼び出し | **35 箇所** | `grep -c "\.send({"`。内訳は `client?.send` 27・`syncClient.send` 5・`c.send` 3 |
| 名前付き `SyncClient` コールバック | **6 本** | `handleRoom` `handleIdentity` `handleNeedProblem` `handleError` `handleReconnected` `handleNotice` |
| setter 直呼びのコールバック | **3 本** | `onConnected` `onDisconnected` `onConnectionChange` |
| `src` 配下で `sync/client` を import するファイル | **`App.tsx` の 1 本のみ** | `grep -rln` |
| `test` 配下で `sync/client` を import するファイル | **3 本** | `client.connection` / `client.dispose` / `client.reconnect` |

`test/support/fakes.ts` も `grep` に掛かるが、**当たるのはコメント行だけ**で import はしていない。
これは D7（コメント行も読む）の代償が実物で起きる例であり、検査の対象から test を外す
根拠にもなっている（`docs/adr/0015` 影響節）。

### MUST 1 は既に満たされている

`docs/adr/0015` の MUST 1（副作用のない判断を `.ts` へ切り出す）について、timer-web は
`ui/screen.ts` `ui/error-action.ts` `ui/host-change.ts` `ui/problem-generation.ts`
`ui/join-driver-intent.ts` `ui/connection-status.ts` `ui/room-param.ts`
`sync/notice-message.ts` `sync/sync-url.ts` の 9 本を**現に持っている**。
**E4 の実質は MUST 2（配線の集約）と MUST 3（画面は表示に徹する）である。**

### ガイドの置き場の表は既に E4 後の形を書いている

`docs/guides/architecture.md` の層対応表（24〜29 行目）は、web の画面について
**「同期フックと純粋判断のみ（同期クライアントを直接 import しない）」**と既に書いている。
`apps/timer-web/src/App.tsx` はこれに反しており、**規範の側は E4 を待たずに揃っていた。**
E4 が足すのはコードの側と、それを守る機械検査である。

### 既存の安全網が振る舞い不変の証拠になる

`App` を mount するテストが 5 ファイルある。

`test/ui/App.sync-handlers.test.tsx` / `App.state-ref.test.tsx` / `App.resume-on-load.test.tsx` /
`App.session-lost.test.tsx` / `App.solo-leave.test.tsx`

**5 本はいずれも `FakeWS` を `globalThis.WebSocket` へ差し込み、本物の `SyncClient` を
WS 境界越しに動かして DOM を見る**作りである。内部構造をどう組み替えても、
**送ったフレームと見える画面が同じなら緑になる。** これが E4 の主たる証拠であり、
D9 で「書き換えない」ことを決定として固定する。

## 決定

### D1: ルーム由来の状態は同期フックが持つ（`useEffect` で反応させない）

`useState` 11 個の行き先を次のとおりにする。

| 現在の state | 行き先 | 理由 |
|---|---|---|
| `room` `participantId` `client` `connState` `sessionLost` | 同期フック | WS メッセージ由来 |
| `mode` `joinCode` `record` `generatingProblem` | **同期フック** | WS ハンドラが**読み書きする** |
| `endType` | **同期フック** | `handleRoom` が**読むだけ**（`setEndType` は `handleComplete` / `handleAbort` / `handleNewSession` の 3 箇所で、いずれも WS ハンドラではない）。読み手と書き手を離すと `useLatestRef` をもう 1 本足すことになるので同居させる |
| `banner` | `ui/use-banner.ts`（D5） | WS 配線ではない |

`mode` 以下の 5 つは「画面の状態」に見えるが、**いずれも WS ハンドラの closure に入っている**
（4 つは読み書き、`endType` は読みのみ）。
これを `App.tsx` に残して `useEffect` で `room` の変化に反応させる形は採らない。
**差し替えが 1 レンダー遅れ、その隙間に届いたメッセージを古いハンドラが処理する**からである
（Issue #46 REQ-3 が明示的に避けた形。`App.tsx` の `useLatestRef` 呼び出し箇所のコメントが
同じ理由を記録している）。

**この決定の帰結として、同期フックは「WS 配線のフック」でありながらアプリ状態のほぼ全部を持つ。**
それだけでは `App.tsx` の質量が移動するだけなので、D3・D4・D5 で中身を減らす。

### D2: `handlersRef` の作法を維持する

`SyncClient` のコールバックは生成時の値で固定される closure なので、`handlersRef` へ毎レンダー
同期し、`SyncClient` へ渡すのは転送関数だけにする。この形は Issue #41 → #46 で
**2 度の試行を経て選ばれたもの**であり、E4 で作法自体を変えると #46 が解いた問題が戻る。
移すのは置き場所だけである。

### D3: `handleRoom` の判断を意図リストへ切り出す（純粋・`now` 注入）

`handleRoom` は **88 行**（`App.tsx:148〜235`）あり、**分岐 7 個**と副作用 3 種
（sessionStorage・WS 送信・IndexedDB）が混ざっている。判断だけを純粋関数へ出す。

```ts
// apps/timer-web/src/sync/snapshot-intents.ts（純粋・React 非依存）
export type SnapshotIntent =
  | { kind: "save-resume"; code: string; participantId: string; resumeToken: string; displayName: string }
  | { kind: "consume-driver-join" }
  | { kind: "join-rotation"; participantId: string }
  | { kind: "clear-generating" }
  | { kind: "set-screen"; screen: Screen }
  | { kind: "request-problem"; requestId: string }
  | { kind: "regenerate-problem"; requestId: string }
  | { kind: "persist-completion"; record: CompletionRecord };
// consume-driver-join が独立した8種目として要るのは、輪に入れたか（join-rotation が
// 立つか）に関わらず「参加時ドライバー宣言を降ろす」こと自体が別の副作用だからである。

export function decideSnapshotIntents(
  prev: Room | null,
  next: Room,
  ctx: SnapshotContext,
): SnapshotIntent[];
```

- **順序は配列の順で保存する。** 現在の実行順（resume 保存 → rotation 加入 → 生成中解除 →
  画面遷移 → お題依頼 → 設定変更の再生成 → 完成記録）と 1 対 1 に対応させ、テストで順序を固定する。
  順序を変えると、同じ snapshot に対する送信の並びが変わる（＝振る舞いの変化）。
- **`requestId` に混ざる現在時刻は `ctx.now: number` で注入する。** `Date.now()` を純粋関数の中で
  呼ばない。これは #166（E3）が `pickFallback` に対して採った作法と同じで、`docs/adr/0016` に沿う。
- **意図リストは 7 つの分岐すべてを含む。** 内訳は次のとおり。
  - **既存の純粋関数をそのまま呼ぶのが 4 つ** — `shouldAutoJoinRotation` / `shouldClearGenerating` /
    `screenForPhase` / `shouldAutoRequestProblem`
  - **新たに述語として名前を与えるのが 2 つ** — 難易度・言語の変更でお題を作り直すか
    （現行の `cfgChanged` の条件式）、完成記録を作って永続化するか
    （`phase === "celebration" && problem && endType !== "abort" && !recordSaved`）
  - **残り 1 つは `ctx.pendingResume` の有無**（判断ではなく null 判定）

**`handleError` は意図リスト化しない。** 既存の `errorAction()` が既に判断を担っており、
その戻り値の `kind` で分岐する形は変えない。ただし `leave-room` ケースの 15 行の setter 列は、
ルーム由来の状態を 1 つのオブジェクトにまとめることで**初期値への差し替え 1 行**にする
（後始末の抜けを構造で防ぐ。現行は setter を 1 つ足し忘れても型検査が通る）。

### D4: 送信ラッパー 27 箇所を `createCommands(send)` へ出す

```ts
// apps/timer-web/src/sync/commands.ts（純粋・React 非依存）
export function createCommands(send: (cmd: ClientCommand) => void): TimerCommands;
```

**35 箇所すべてを `commands.ts` へ出すのではない。**

| 内訳 | 箇所 | 行き先 |
|---|---|---|
| 名前付きラッパー（`client?.send` 1 行関数） | 21 | `commands.ts` |
| JSX インラインの送信（`onStartSession` の 3 つ・`onConfigSet` `onReset` `onHandoffNoteSet`） | 6 | `commands.ts`（名前を与える） |
| WS ハンドラ・接続経路の中（`syncClient.send` 5・`c.send` 3） | 8 | **同期フックに残す**（`room.create` / `room.join` / `problem.submit` / `member.add` / `problem.request`） |

前 2 つの **27 箇所**が `App.tsx` から消える。

**この 27 箇所に単体テストは 1 件も無い。** 既存の App テスト 5 本が観測している送信コマンドは
**`problem.request` の 1 種だけ**である（`App.state-ref.test.tsx:112`）。
子コンポーネントのテスト（`Session.roster.test.tsx` 等）は **props のスパイ**を見ているので、
**App がどのラッパーをどの prop へ渡すかは守っていない。**
したがって `driver.skip` と `driver.resume` を取り違えても、現在のテストは 1 件も落ちない。
`send` のスパイで全数を固定する（D10）。

`leaveRotation` のように「送信時の最新 snapshot から index を解決する」ものは、
`send` に加えて `getRoom: () => Room | null` を受け取る形にする。
**描画時ではなく送信時に解決する**という現行の性質を保つ（`App.tsx` の当該コメントが
その理由を記録している）。

### D5: バナーを `ui/use-banner.ts` へ出す

バナーは `handleError`（3 経路）・`handleNotice`・ホスト交代の effect・`Summary` の保存失敗の
**計 6 箇所**から設定され、`bannerTimerRef` の解除と張り直しがそのたびに手書きされている。
`show(text, kind, { autoDismiss })` / `clear()` の 2 操作へまとめる。

**これは MUST 2 に触れない。** MUST 2 が 1 本に集約せよと言っているのは
**WS の接続状態とメッセージ配線**であって、バナーの表示制御はそれではない。
「同期フック 1 本」を「フックを 1 本しか作ってはならない」と読み替えない。

### D6: 機械検査 `scripts/audit-web-sync-boundary.mjs` を新設する

**無状態・行単位・許可リスト方式**にする。手書きの字句解析は採らない
（3 度続けて検出漏れを作った実績がある）。既存 3 本
（`audit-assembly-wiring` / `audit-domain-error-shape` / `audit-domain-side-effects`）と同じ型に揃える。

```js
const WEB_APPS = [
  {
    app: "apps/timer-web",
    syncModules:      ["src/sync/client.ts"],           // これを import してよいのは
    allowedImporters: ["src/sync/use-timer-sync.ts"],   // この 1 本だけ
    wsHolders:        ["src/sync/client.ts"],           // new WebSocket( を持てるのは
  },
  {
    app: "apps/poker-web",
    syncModules: [],
    allowedImporters: [],
    wsHolders:   ["src/hooks/useSync.ts"],
  },
];
```

見るのは 3 つ。

1. **許可リスト**: `syncModules` を import する `src` 配下のファイルが `allowedImporters` に限られる
2. **WS の保持先**: `new WebSocket(` を含む `src` 配下のファイルが `wsHolders` に限られる
3. **宣言の実在**: `WEB_APPS` に書いたすべてのパスが実在する（`docs/adr/0014`）

**timer と poker の両方を宣言する。** poker-web には `sync/client` に相当するモジュールが無く、
`hooks/useSync.ts` が `new WebSocket` を直接持つ。検査 1 だけだと poker 側は
**宣言が空でも通る**（片側検査）。検査 2 が両アプリに効く形なので、これで poker 側も縛られる。

**走査対象は `apps/*-web/src` 配下のみで、`test` は対象外**（`docs/adr/0015` 影響節。
`client.connection` / `client.dispose` / `client.reconnect` の 3 本が `SyncClient` を
直接 import しているため）。走査量のどの内訳も 0 件でないことを見る（`docs/adr/0014` 決定 8）。

### D7: コメント行も読む

検査 1・2 はどちらも「**無いこと**」を求めるので、コメント行を読み飛ばすと緑に倒れる。
既存 3 本と同じ向きに倒し、コメント行も読む。

**代償**: 許可されていないファイルのコメントに `sync/client` や `new WebSocket(` と書けない。
この代償は**既に実物で起きている** — `test/support/fakes.ts` は import していないのに
コメントだけで `grep` に掛かる。test を対象外にする決定がこれを回避しているが、
`src` 側の docstring でこの語を使うときは言い換える（「同期クライアント」と書く）。

### D8: `docs/timer/adr/0003` の実態検証と影響節の訂正

E1 の設計正本が `docs/timer/adr/0003` を「未検証（E4 が触る領域）」として残している。
#72 の完了条件（現在も有効な ADR の決定と実装の一致）を満たすため、E4 で検証する。

**決定は一致している**（2026-08-19 実測）。

- `apps/timer-web/src/ui/Session.tsx:137` が `useNowTick` で再描画のみを起こす
- 残り時間は `secondsLeft(room.clock, now, clockOffset)`、経過時間は `elapsedMs(room.clock, now, clockOffset)`
  で、どちらも `@tasuki/timer-core/aggregate` の導出関数
- **`apps/timer-web/src` の `Date.now()` を全量で見ても、残り時間・経過時間を進めるものは無い** —
  `use-now-tick.ts`（再描画のトリガ）・`App.tsx` の `requestId` 2 箇所と完成記録の生成時刻・
  `ai/no-ai.ts` のお題選択がすべてである。`setTimeout` は一時表示の消去のみ
  （`InvitePanel` `RosterPanel` `SharedMemo` `use-switch-alert` `App.tsx` のバナーと安全弁）

**影響節に食い違いが 1 件ある。** ADR-0003 は「本実装では 250ms ごとの再レンダリング」と書くが、
実装は `apps/timer-web/src/ui/use-now-tick.ts:10` の **`TICK_MS = 200`** である。
`git log -S` で追うと**このファイルは初出（`26adc5c`）から 200 で、250 だった時期は無い。**
決定ではなく影響節の記述なので、**ADR へ追記して経緯を残す**（ADR は追記のみで直す）。

## 触れる外部配線

| 配線 | 変更 |
|---|---|
| `.github/workflows/ci.yml` | `quality` ジョブへ `node scripts/audit-web-sync-boundary.mjs` を 1 行追加 |
| `docs/adr/0015` | 影響節へ「MUST 2 の機械検査は E4 が置いた」旨を追記（検査名を名指し） |
| `docs/adr/0016` | 変更しない（`now` 注入の作法は既に定めている） |
| `docs/timer/adr/0003` | 影響節の 250ms を実測値へ追記訂正（D8） |
| `docs/guides/architecture.md` | 「`apps/timer-web` の再編は #72 の E4 で行います」（同ファイル 34〜35 行目）を、**再編済みの実態**へ書き換える。置き場の表（同 24〜29 行目）が既に「同期クライアントを直接 import しない」と書いているので、そちらは変えない |
| `scripts/lib/scan-targets.mjs` | 新検査が導出に乗るなら登録（`docs/adr/0014`） |

## 振る舞い不変をどう示すか

### D9: 既存 App テスト 5 ファイルは 1 行も書き換えない

**書き換えたら証拠が消える。** 「実装が正しいから緑」なのか「テストを直したから緑」なのかが
切り分けられなくなる（`App.sync-handlers.test.tsx` の冒頭がこの理屈を Issue #46 の文脈で
既に記録している）。

**5 本は内部実装名に一切触れていない**ことを確認した（`useLatestRef` / `handlersRef` /
`makeClient` を参照するテストは `use-latest-ref.test.tsx` だけで、これは `App` を mount しない）。
**成立条件は、`src/records/indexeddb.js` と `src/ai/no-ai.js` のパスを動かさないこと**である
（5 本がこの 2 つを `vi.mock` でパス指定している）。本設計はどちらも動かさない。

**ただし 5 本だけでは足りない。** 下記 D9b の穴があるので、証拠は「5 本の無改造」ではなく
「5 本の無改造 ＋ 再編前に足す特性テスト」の組にする。

### D9b: 既存テストが守っていない 2 つの面を、再編**前**に埋める

敵対的検証で、既存テストが振る舞いの証拠として**空いている面**が 2 つ見つかった。

| 空いている面 | 実態 | 埋め方 |
|---|---|---|
| **送信の配線** | 既存 App テストが観測する送信コマンドは `problem.request` の**1 種のみ**。子コンポーネントのテストは props スパイなので、App がどのラッパーをどの prop へ渡すかを守っていない | `test/ui/App.commands.test.tsx` を新設し、**27 箇所の操作が期待する `command` を送ることを FakeWS 越しに全数固定する** |
| **接続状態の表示** | `StatusStrip` 単体・`deriveConnectionStatus` 単体・`connection-status` の表示テストはあるが、**App を通した「WS が切れたら再接続中が出る」経路のテストが無い**。EARS 2 は部品だけが緑で配線は死んでいる | `test/ui/App.connection.test.tsx` を新設し、FakeWS を close して `StatusStrip` の表示が変わることを固定する |

**この 2 本は再編に着手する前に、現行の `App.tsx` に対して書いて緑を確認する。**
再編後に書くと「新しい実装に合わせて書いたテスト」になり、退行を検出できない。
**緑を見たらコミットし、そこから再編を始める。**

**import の形だけは変わりうる**（`App` の default export は変えないので、変わらない見込み）。
もし書き換えが必要になったら、それは振る舞いか公開面が変わった兆候なので、**先に立ち止まる。**

### D10: 追加するテスト

**再編前**（D9b）: `test/ui/App.commands.test.tsx` / `test/ui/App.connection.test.tsx`

**再編後**:

| 対象 | 何を固定するか |
|---|---|
| `sync/commands.test.ts` | 27 本すべてが、期待する `command` を 1 回だけ送ること。`leaveRotation` が送信時の snapshot から index を解決すること |
| `sync/snapshot-intents.test.ts` | 意図の**内容と順序**。EARS 1・3 に対応 |
| `sync/use-timer-sync.test.tsx` | `FakeWS` 越しの接続・切断・再接続・`dispose`。`docs/adr/0007` の追記が**同じ PR で要求する**同期フックの単体テスト |
| `ui/use-banner.test.tsx` | 自動消去する経路と、しない経路（退出バナー）の区別 |

### D11: 破壊検証の順序

破壊検証は「壊し方自体を確かめる」手順に従う。**壊したつもりで壊れていない**ことが
#70 で 3 件・#119 で 2 件・#158 で 1 件・#166 で 2 件起きている。

1. **壊す前に数える** — `grep -cF` で対象行が存在することを確認する
2. 壊す（`sed` 等）
3. **壊れたことを数えて確認する** — `grep -cF` で 0 になったことを見る（BRE の `grep -c` は
   実在する行に 0 を返すことがあるため `-F` を使う）
4. 検査を実行して**赤を見る**
5. 戻す。**壊した状態はコミットしない**

壊す対象は少なくとも次の 3 つ。

- `App.tsx` に `sync/client` の import を戻す → 検査 1 が赤
- `src/ui/` の適当なファイルへ `new WebSocket(` を置く → 検査 2 が赤（陽性対照。**コミットしない**）
- `WEB_APPS` の宣言パスを実在しない値にする → 検査 3 が赤
- `WEB_APPS` を空配列にする → 0 件ガードが赤

さらに **検査を無力化する最短経路**を実測して文書化する（#166 で
「パッケージを除外リストへ 1 行移す」が全部素通りした前例がある）。

## 完了条件（EARS と検査の対応表）

**主張と手段を突き合わせる。** 設計正本が主張だけを書くと、実装は別の手段で「主張は満たす」形へ
倒れる（#73 で「実 WebSocket 越し」と書いた要件が in-process 実装のまま緑になった）。

| # | Issue の EARS | これを守る検査 |
|---|---|---|
| 1 | ルームへ参加したとき、再編前と同一の画面へ遷移する | `snapshot-intents.test.ts` の `set-screen` 意図（純粋）＋ 既存 `App.sync-handlers.test.tsx`（無改造）＋ `e2e/specs/timer.spec.ts` |
| 2 | 接続が切れている間、同一の接続状態表示を出す | **`App.connection.test.tsx`（D9b で再編前に新設）**＋ `use-timer-sync.test.tsx`。**既存の `connection-status` / `StatusStrip` のテストは部品だけを見ており、配線の証拠にはならない**（敵対的検証で判明） |
| 3 | 交代が起きたとき、同一の通知を表示する | 既存 `sync/notice-message.test.ts`（**文言のみ**）＋ `use-timer-sync.test.tsx`（配線）＋ `ui/use-banner.test.tsx`（自動消去） |
| 4 | セッションを失った場合、同一の復帰導線を示す | 既存 `App.session-lost.test.tsx`（**無改造**） |

| # | Issue の完了条件 | 満たし方 |
|---|---|---|
| 1 | `App.tsx` が `sync/client` を直接 import していない | `audit-web-sync-boundary.mjs` の検査 1（CI） |
| 2 | WS の接続状態とメッセージ配線が同期フック 1 本に集約 | 同 検査 1・2（CI）＋ D1 の状態配置 |
| 3 | `e2e/specs/timer.spec.ts` と `timer-a11y.spec.ts` が全緑 | `pnpm e2e` |
| 4 | 変異検査で既存テストが恒真化していない | `node scripts/mutation-check.mjs`（作業ツリーが clean でないと動かない）。**`scripts/` は射程外**（#174）なので、新検査の恒真化は D11 の破壊検証だけが守る |

DoD は [`docs/guides/definition-of-done.md`](../../guides/definition-of-done.md) の 8 項目に従う
（本書に転記しない。転記すると版が食い違う）。

## 何を見ていないか

**この検査で「足りる」とは言わない。**

- **re-export はすり抜ける。** `src/sync/index.ts` が `client.ts` を re-export し、別のファイルが
  そこから import すると検査 1 は当たらない。**これは実在する穴**であり、
  「まだ見ていないだけ」ではない。re-export を作ったら `syncModules` へ足す運用に依存する
- **動的 import**（`await import("./client.js")`）は行単位の許可リストに当たらない形にできる
- **`.mts` / `.cts` / `src/dist/*.ts`** は収集の拡張子・走査根から外れる（#166 と同型の穴）
- **状態の配置は機械で見ていない。** 「`mode` が同期フックにある」ことを縛る検査は置かない。
  MUST 3 の遵守はレビューに依存する
- **`handlersRef` の作法が保たれていることも機械で見ていない**（D2 は設計の決定であって検査ではない）
- **無力化の最短経路は `allowedImporters` に 1 行足すこと。** 全単射照合も 0 件ガードも自己テストも
  素通りする。#166 の `EXCLUDED_PACKAGES` と同型で、`docs/adr/0014` の構えが**人手のレビューに
  依存している**部分である。新しいファイルを許可リストへ足す差分は、レビューで必ず理由を問う
- **新検査そのものは変異検査の射程外である。** `scripts/mutation-check.mjs` は `scripts/` を
  変異対象にできない（#174）。完了条件 4 が守るのは `apps/` `packages/` 側だけで、
  `audit-web-sync-boundary.mjs` の恒真化は D11 の破壊検証**だけ**が守る

## 作業手順

1. **基準を取る** — overlay（`/home/vscode/tasuki-work`）で `corepack pnpm test --force` を流し
   `Cached: 0` を確認する。**件数は本書へ転記しない**（腐る。数えるなら実行する）
2. **再編前の特性テストを 2 本足す**（D9b）。`App.commands.test.tsx` と
   `App.connection.test.tsx` を**現行の `App.tsx` に対して**書き、緑を確認してコミットする。
   **ここで赤が出たら、それは再編前から壊れている箇所なので先に切り分ける**
3. `sync/commands.ts` を切り出し、テストを足す（`App.tsx` からは呼び出しを差し替えるだけ）
4. `ui/use-banner.ts` を切り出し、テストを足す
5. `sync/snapshot-intents.ts` を切り出し、テストを足す（`handleRoom` はまだ `App.tsx` にあり、
   意図リストを適用する形へ書き換える）
6. `sync/use-timer-sync.ts` を新設し、配線と状態を移す。`App.tsx` は表示のみになる
7. `use-timer-sync` の単体テストを足す
8. `scripts/audit-web-sync-boundary.mjs` を新設し、CI へ登録する
9. **破壊検証**（D11）
10. `docs/timer/adr/0003` と `docs/adr/0015` へ追記（D8）
11. `pnpm test --force` / `pnpm e2e` / `mutation-check` / `check-links` / `audit-*` を通す
12. 振り返り（[`docs/guides/retrospective.md`](../../guides/retrospective.md)）

各段でコミットする。**PR は 1 本。**

`docs/guides/pr-granularity.md` の分割理由のうち、**3「危険度の異なる変更が混ざっている」に
当たるように見える**（高リスクの `App.tsx` 再編・低リスクの文書追記・新設の検査）。
当たらないと判断する理由は次のとおり。

- **検査は同じ PR でなければ置けない。** 先に置けば CI が赤のままになり、後に置けば
  「検査の無い期間」ができる。`docs/adr/0015` 影響節が「MUST 2 の機械検査は E4 が置く」と
  この理由を明記している
- **文書の追記も同じ PR でなければ嘘になる。** `architecture.md` は「再編は E4 で行います」と
  書いており、コードが変わった瞬間にこの記述が誤りになる
- 危険度が違うのは**工程**であって revert 単位ではない。分けても片方だけを revert できない

## スコープ外

- **AI 経路は戻さない。** `App.tsx` の `hasAiKey: false`（`:361` `:448` `:579`）は**振る舞い**なので
  E4 では変えない。`src/ai/no-ai.ts` は到達不能のままである。
  **#166 の申し送り「E4 で AI 経路が戻ると生きた経路になる」は前提が誤っていた**
  （E4 は振る舞い不変のリファクタである）。#167 へコメントで訂正する
- **`apps/poker-web` の再編はしない。** MUST 2 に既に準拠している（`docs/adr/0015` 影響節）
- **#173**（テストが型検査の射程外）は **timer-web には該当しない** —
  `apps/timer-web/tsconfig.json` の `include` は `["src/**/*", "test/**/*"]` で test も見ている
- **#171**（poker-sync の join-room 再送）・**#174**（`mutation-check` が `scripts/` を見られない）・
  **#175**（CI ジョブ表の腐り）は別の宛先を持つ
- **本番デプロイはしない**（#66。#72 の全段が終わってから）

## 敵対的検証で見つけた欠陥（2026-08-19）

設計をコミットしたあと、自分で潰しにいって見つけたもの。**11 件のうち 2 件は重大で、
作業手順そのものを変えた。** 本文は訂正済みで、この節は経緯の記録である。

### 重大 1 — 既存テストは送信の配線をほとんど守っていない

初版は「既存 App テスト 5 本が振る舞い不変の**主たる**証拠になる」と書いた。実測すると、
**5 本が観測している送信コマンドは `problem.request` の 1 種だけ**である
（`App.state-ref.test.tsx:112`）。子コンポーネントのテストは props のスパイなので、
**App がどのラッパーをどの prop へ渡すかは誰も守っていない。**
`driver.skip` と `driver.resume` を取り違えても 1 件も落ちない。

**「テストがあること」を「その面が守られていること」の証拠に数えていた。** D9b を新設し、
再編**前**に `App.commands.test.tsx` を足す段を作業手順へ入れた。

### 重大 2 — EARS 2 は部品だけが緑で、配線が死んでいる

初版の EARS 対応表は、要件 2（接続が切れている間の表示）を「既存 `ui/connection-status` の
テスト」で守るとした。実測すると、`deriveConnectionStatus` の単体テストと `StatusStrip` の
表示テストはあるが、**App を通して「WS が切れたら再接続中が出る」経路のテストは無い。**
純粋関数と表示部品が緑でも、その間の配線が切れていれば誰も気づかない。

D9b で `App.connection.test.tsx` を再編前に足す。

### 中 3 — 送信箇所の数え違い（32 → 35）

初版は `grep -c "client?.send\|client.send\|syncClient.send"` で 32 と数えた。
**`c.send(` の 3 箇所を拾えていない**（`client\.send` は `c.send` にマッチしない）。
実測は `.send({` で **35**。さらに「32 **本**の送信関数」と本数のように書いていたが、
32 は**行数**だった。正しい内訳は名前付きラッパー 21・JSX インライン 6・ハンドラ内 8。

**数える鍵が壊れていたのであって、数が違っただけではない。**

### 中 4 — `endType` は WS ハンドラが書かない

初版は `mode` 以下の 5 つを「**いずれも** WS ハンドラが読み書きしている」と書いた。
`setEndType` は `handleComplete` / `handleAbort` / `handleNewSession` の 3 箇所にあり、
**WS ハンドラは 1 つも無い**（`handleRoom` は読むだけ）。量化の言葉を書いたときに
列を壊して確かめていなかった。

### 中 5 — `handleRoom` の規模（80 行・判断 6 → 88 行・分岐 7）

`App.tsx:148〜235` を数え直した。意図リストが覆う範囲の記述も、
「新しく純粋化するのは 2 つ」から「7 つの分岐すべてを含み、うち既存関数 4・新規述語 2・null 判定 1」へ改めた。

### 小 6〜11

| # | 欠陥 | 対応 |
|---|---|---|
| 6 | D9 の成立条件（`records/indexeddb.js` と `ai/no-ai.js` のパスを動かさない）が未記載 | D9 へ明記。5 本が内部実装名に触れていないことも実測で確認 |
| 7 | ADR-0003 の根拠が「`setInterval` は 2 箇所」と狭かった | `Date.now()` の全量で言い直した。主張は生き残った |
| 8 | 検査の無力化最短経路（`allowedImporters` に 1 行足す）が未記載 | 「何を見ていないか」へ追加 |
| 9 | 行数が ADR-0015 の 848 と食い違う | 由来（E1 の `49fdac7`）を脚注に |
| 10 | 「PR 1 本」が分割理由 3 への反論を持っていなかった | 3 つの理由を明示 |
| 11 | 新検査が変異検査の射程外（#174）である旨が未記載 | 完了条件 4 と「何を見ていないか」へ追加 |

### 壊せなかった主張（生き残ったもの）

- **`src` 配下で `sync/client` を import しているのは `App.tsx` の 1 本だけ**（`grep -rln` で再確認）
- **`docs/timer/adr/0003` の決定は実装と一致している。** `Date.now()` の全量を見ても、
  残り時間・経過時間を進めるものは無い
- **既存 App テスト 5 本は内部実装名に触れていない**ので、無改造で通る見込みは高い
- **`test/support/fakes.ts` が `sync/client` の `grep` に掛かるのはコメント行だけ**で、
  import はしていない（D7 の代償が実物で起きている例）

## 関連

- [`docs/adr/0015`](../../adr/0015-web-layer-structure.md) — 本 PR が適用する MUST
- [`docs/adr/0016`](../../adr/0016-core-domain-representation.md) — `now` 注入の作法（D3）
- [`docs/adr/0014`](../../adr/0014-scan-target-integrity.md) — 走査対象の実在確認と 0 件ガード（D6）
- [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md) — 同期フックの単体テストを同じ PR で要求（D10）
- [`docs/adr/0013`](../../adr/0013-pr-granularity.md) / [`docs/guides/pr-granularity.md`](../../guides/pr-granularity.md) — PR は 1 本
- [`docs/timer/adr/0003`](../../timer/adr/0003-server-authoritative-clock.md) — D8 で検証・追記
- [2026-08-17-adr-alignment-e1-design.md](./2026-08-17-adr-alignment-e1-design.md) — #72 の分解と E4 への申し送り
- [2026-08-18-domain-side-effect-removal-design.md](./2026-08-18-domain-side-effect-removal-design.md) — E3。検査の型と `now` 注入の先例
