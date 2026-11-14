# ADR-0015: web 層は「純粋関数・同期フック・画面」に責務を分ける

- **ステータス**: Accepted（2026-08-17）
  - 末尾の追記（2026-11-14・#598。対応表の web の行を実体に合わせる）は **Accepted**（2026-11-14）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [`docs/adr/0004`](./0004-sync-server-ports-and-adapters.md)（同期サーバー側の対応する標準）/
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準。本 ADR の MUST 2 の可否判定）/
  [`docs/guides/architecture.md`](../guides/architecture.md)（層とディレクトリの対応の正本）

## 背景

`docs/guides/architecture.md` の層対応表は `apps/*-web` を「アダプタ」に置き、
「上のすべてに依存してよい」と定めるだけで、**内部構造を規定していない**。
その結果、2 つの web アプリが別々の形に育った（2026-08-17 実測。
**ファイル数・行数は各 `src` 配下の `.ts`/`.tsx` のみを数えたもので、`index.css` などの
非 TypeScript ファイルは含まない**）。

| | `apps/timer-web`（77 ファイル / 7,692 行） | `apps/poker-web`（12 ファイル / 784 行） |
|---|---|---|
| 分け方 | 関心事別（`ui/` `sync/` `ai/` `records/` `prefs/` `platform/`） | 役割別（`components/` `hooks/` `pages/`） |
| 純粋ロジックの切り出し | **徹底している。** `apps/timer-web/src/ui/screen.ts` `apps/timer-web/src/ui/error-action.ts` `apps/timer-web/src/ui/host-change.ts` `apps/timer-web/src/ui/problem-generation.ts` `apps/timer-web/src/ui/join-driver-intent.ts` `apps/timer-web/src/ui/connection-status.ts` `apps/timer-web/src/ui/room-param.ts` `apps/timer-web/src/sync/notice-message.ts` `apps/timer-web/src/sync/sync-url.ts` の 9 本は、いずれも 12〜63 行で副作用 0 件・React フック 0 件 | 接続の告知の当て分け（かつて poker-web の `connection-notice.ts`。#471 で `@tasuki/web-kit/room` へ寄せて撤去）と `apps/poker-web/src/router.ts` の `parseRoute` / `roomPath` / `topPath`（同ファイルで副作用を持つのは `navigate` のみ） |
| WS の配線 | **`apps/timer-web/src/App.tsx` に直書き。** `useState` 11 個・`useRef` 10 個に加え、`SyncClient` のコールバック本体（`// ─── SyncClient のコールバック本体 ───` のコメント以降）が render 本体に置かれ、`useLatestRef` で `handlersRef` へ毎レンダー同期される。`SyncClient` へ渡すコールバックは、`handlersRef.current` の同名関数への転送と、setter を直接呼ぶものが混在する。同ファイルは 848 行 | **`apps/poker-web/src/hooks/useSync.ts`（176 行）に集約。** `wsRef` と `open` / `close` / `message` の 3 リスナを 1 つの `useEffect` に閉じ込め、接続まわりの状態 7 個を保持 |

**この非対称は「片方が正しく片方が誤り」ではない。** timer-web は純粋関数の切り出しを、
poker-web は WS 配線の集約を、それぞれ現に実現している。`apps/timer-web/src/App.tsx` が 848 行あるのは、
timer-web が後者を持たないためである。

## 決定

**web 層（`apps/*-web`）の内部を、次の 3 つの責務に分ける。**

1. **副作用のない判断は、純粋関数として `.ts` に切り出す（MUST）。**
   画面遷移の決定・エラー種別からの行動決定・表示文言の組み立てなどを、
   コンポーネントやフックの中に埋め込まない。
2. **WebSocket の接続状態とメッセージ配線は、同期フック 1 本に集約する（MUST）。**
   画面コンポーネント（`apps/timer-web/src/App.tsx` を含む）が、同期クライアントのイベントハンドラを
   直接持たない（**MUST NOT**）。
3. **画面コンポーネントは表示に徹する。** 状態は同期フックまたは純粋関数から受け取る。

**ディレクトリの対応は本 ADR では定めない。** 層とディレクトリの対応表の正本は
[`docs/guides/architecture.md`](../guides/architecture.md) であり、そちらで扱う
（`docs/adr/0002` の三層構造・書き分け規則）。

**根拠**: 1 は timer-web の 9 本が、2 は poker-web の `apps/poker-web/src/hooks/useSync.ts` が、それぞれ
**現に動いている実装として存在する**。どちらも「将来こうなるかもしれない」という
予測ではない。

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の E4 で行う。
- **`apps/poker-web` は本 ADR の MUST 2 に既に準拠している**（`apps/poker-web/src/App.tsx` が
  `usePokerSync` を経由し、`.tsx` に `WebSocket` の直接使用が無い。2026-08-17 実測）。
  E4 で再編するのは `apps/timer-web` 側である。
- MUST 2 の機械検査は **E4 が置く**。E1 で先に置くと、E1 はコードを直さないため
  CI が赤になるからである。検査は**無状態の許可リスト方式**（`apps/timer-web/src/sync/client.ts` を
  import してよいのは同期フック 1 本だけ）で書く。手書きの字句解析は採らない。
  **対象は `apps/*-web/src` 配下のみとし、テストは対象外とする** — `apps/timer-web/test/sync/client.dispose.test.ts` を含む 3 本が
  `apps/timer-web/src/sync/client.ts` を直接 import しているため（2026-08-17 実測）。
- MUST 2 を適用する E4 は、同期フックの単体テストを同じ PR で追加する
  （[`docs/adr/0007`](./0007-abstraction-criteria.md) 追記の条件）。現状 `apps/poker-web/tests/` に
  `usePokerSync` の単体テストは無い。
- 利用者から見える振る舞い（公開 URL・プロトコル・画面の挙動）は変えない。

> **追記（2026-08-19・#167 / #72 E4）**: MUST 2 の機械検査を
> `scripts/audit-web-sync-boundary.mjs` として置いた（CI の `quality` ジョブ）。
> 許可リスト方式で、`apps/timer-web` は同期クライアントの import 元を
> `src/sync/use-timer-sync.ts` と `src/sync/dispatch.ts` の 2 本に、`apps/poker-web` は
> `new WebSocket(` の保持先を `src/hooks/useSync.ts` の 1 本に縛る。timer-web が 2 本
> なのは、`dispatch.ts` が同期クライアント自身の実装の一部（`client.ts` が `dispatch.ts`
> を import する側であり消費者ではない）で、しかも import しているのは型のみ
> （`import type`）だからである。**検査が見ていないもの**（re-export・動的 import・
> `.mts`・`src/dist`・`allowedImporters` への追記による無力化）は検査の docstring に
> 書いてある。

> **追記（2026-09-06・#95）**: 本 ADR の適用範囲を「`apps/*-web`」という名前の形で
> 書いていたため、`apps/landing` が漏れていた。適用範囲の現行の正本は
> [`docs/adr/0019`](./0019-web-layer-scope-includes-landing.md) である。

> **追記（2026-09-08・#95 S3）**: 背景の表が挙げる純粋ロジック 9 本のうち、
> `apps/timer-web/src/ui/host-change.ts` は**役割とホストの廃止に伴い削除した**
> （[#244](https://github.com/tomohiroJin/tasuki-tools/issues/244)）。ホスト移譲の導線が
> 無くなり、その判定を持つ関数の呼び手が消えたためである。**表は 2026-08-17 時点の
> 実測なのでそのまま残す**（`docs/adr/0002` の「ADR は追記のみ」）。現時点で
> 残っているのは残り 8 本であり、**背景の観察（timer-web は純粋関数の切り出しを
> 徹底している）も決定の MUST 1 も変わっていない。**

> **追記（2026-09-14・#95 S5c）**: 同じ表の `apps/timer-web/src/ui/room-param.ts` も
> **旧入口（`Setup` / `Join`）の撤去に伴い削除した**
> （[#249](https://github.com/tomohiroJin/tasuki-tools/issues/249)）。自己退出の行き先が
> 玄関（`/`）そのものになり、いま居る URL から `?room=` を落とす関数の呼び手が消えたためである。
> **表は 2026-08-17 時点の実測なのでそのまま残す**（`docs/adr/0002` の「ADR は追記のみ」）。
> 現時点で残っているのは 7 本であり、**背景の観察も決定の MUST 1 も変わっていない。**
> なお同じ段で `apps/timer-web/src/ui/entry.ts`（入口の判定）を足しており、MUST 1 の
> 「副作用のない判断は純粋関数へ」はいまも守られている。

> **追記（2026-09-14・#95 S5c・2 件目）**: 同じ表の `apps/poker-web` 側の記述
> —— 「`apps/poker-web/src/router.ts` の `parseRoute` / `roomPath` / `topPath`
> （同ファイルで副作用を持つのは `navigate` のみ）」—— は、**名指ししている記号のうち
> 3 つが現存しない**（[#249](https://github.com/tomohiroJin/tasuki-tools/issues/249)）。
> 旧入口（`TopPage` / `NameForm`）の撤去で行き先が変わったためである。
>
> | 表の記号 | 現況 |
> |---|---|
> | `parseRoute` | 現存（戻り値が `{name:'room'}` と `{name:'redirect'}` の 2 枝になった） |
> | `roomPath` | **削除。** 参加用 URL は玄関の `/?room=CODE` になり、poker が自分のパスを組む必要が消えた。玄関の URL を組む `hubPathFor` がその位置にある |
> | `topPath` | **削除。** `/poker/` の旧入口そのものが無くなった |
> | `navigate`（唯一の副作用） | **改名して `redirectTo`。** 行き場の無い URL へ `assign` で送ると、戻るボタンがその URL へ戻ってまた送り返される往復になるため、`location.replace` へ替えた。**同ファイルで副作用を持つのがこれ 1 つだけである点は変わっていない** |
>
> **表は 2026-08-17 時点の実測なのでそのまま残す**（`docs/adr/0002` の「ADR は追記のみ」）。
> 記号の綴りは変わったが、**背景の観察（poker-web は純粋ロジックを `.ts` に切り出している）も
> 決定の MUST 1 も変わっていない。**

> **追記（2026-09-17・#272）**: 同じ表の `apps/timer-web/src/ui/join-driver-intent.ts` も
> **到達不能になったので削除した**
> （[#272](https://github.com/tomohiroJin/tasuki-tools/issues/272)）。参加時にドライバーを
> 宣言する導線は旧入口（`Join`）にしか無く、#95 S5c（#249）の撤去で宣言を立てる者が
> 消えたためである（名乗りは玄関に 1 つ）。同じ段で
> `apps/timer-web/src/sync/snapshot-intents.ts` の `consume-driver-join` /
> `join-rotation` の意図と、`apps/timer-web/src/sync/use-timer-sync.ts` の
> `pendingDriverJoinRef` も畳んでいる。
> **表は 2026-08-17 時点の実測なのでそのまま残す**（`docs/adr/0002` の「ADR は追記のみ」）。
> 現時点で残っているのは 6 本であり、**背景の観察も決定の MUST 1 も変わっていない。**

> **追記（2026-09-25・#91 PR 3）**: 同じ表の `apps/timer-web/src/ui/problem-generation.ts` も
> **timer のお題作成の撤去に伴い削除した**
> （[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91)）。お題はルームの持ち物になり、
> 作成・生成はお題ツール（`apps/topic-web`）へ移った（[`docs/adr/0021`](./0021-topic-as-shared-context.md)）。
> timer は `topic` フレームのお題を読んで表示するだけで、生成中や定型へ落ちた知らせを判断する相手が
> 画面から消えたためである。
> **表は 2026-08-17 時点の実測なのでそのまま残す**（`docs/adr/0002` の「ADR は追記のみ」）。
> 現時点で残っているのは 5 本であり、**背景の観察も決定の MUST 1 も変わっていない。**

## 追記（2026-11-14・#598）: 対応表の web の行を実体に合わせる（画面→ドメイン、純粋判断→protocol を許す）

- **ステータス**: **Accepted**（2026-11-14 起案・同日に利用者が採択。冒頭のステータス「Accepted（2026-08-17）」は、この追記より前の決定を指す）
- **関連**: [#598](https://github.com/tomohiroJin/tasuki-tools/issues/598)（#482-9）/
  [#592](https://github.com/tomohiroJin/tasuki-tools/issues/592)（#482-3。層の向きの監査）/
  [`docs/superpowers/specs/2026-11-13-architecture-review-survey.md`](../superpowers/specs/2026-11-13-architecture-review-survey.md)（#587 の調査。節 1.2・1.3・1.4・節 8 #1）/
  [`docs/guides/architecture.md`](../guides/architecture.md)（層とディレクトリの対応表の正本）

この追記で「ドメインの値」と書くときは、core が `export` する関数・定数・スキーマのすべてを指す
（例: 画面が読む `FIBONACCI_DECK`・`MAX_DISPLAY_NAME`、純粋判断が読む `HubServerMsgSchema`・`AgendaFrameSchema`）。

### 背景

本 ADR の決定は「web 層を純粋判断・同期フック・画面に分ける」で、置き場と依存してよいものは
`docs/guides/architecture.md` の対応表が持つ。#587 の調査で、その表と実体が食い違い、表の中でも行どうしが食い違うと分かった。

1. **「web の画面」行は、依存してよいものにドメインを挙げていない。** 実体は全アプリの画面（`.tsx`）がドメインの型と値（関数・定数・スキーマ）を読む
2. **「web の純粋判断」行は「ドメインの型のみ」とする。** 実体はお題・ルーレット・進行タイマー・チェックインの `src/server-message.ts` が `@tasuki/protocol` を読む。
   また、純粋判断はドメインの型だけでなく値（関数・定数・スキーマ）も読んでいる。調査のスクリプトは型と値を分けずに「ドメインへの依存」として許していたので、
   この食い違いは違反の数に出ていない（数は下の「実測」）
3. **「アダプタ」行は、置き場に `apps/*-sync/src/adapters` と並べて「web アプリ」を挙げ、依存してよいものを「上のすべて」（ドメインを含む）とする。**
   web アプリのファイルに、この行と上の 2 行で別の答えが出る

どちらの行が正しいかを決めないと、層の向きの監査（#592）の物差しが決まらない。決まりを変える話なので ADR を通す（憲法 原則 II）。
件数は下の「実測」にまとめる。

### 選択肢

- **(a) 表を実体に合わせる。** 「web の画面」行にドメインの型と値（関数・定数・スキーマ）を、「web の純粋判断」行に `packages/protocol` を足す。
  「web の純粋判断」行の「ドメインの型のみ」も「ドメインの型と値（関数・定数・スキーマ）」に広げる（実体が値を読んでおり、ドメインの値は純粋なので、純粋判断が読んでも React・I/O に依存しない点は崩れない）。
  「アダプタ」行の置き場から「web アプリ」を外し、web アプリの中は「web の…」の行だけで決める（行どうしの食い違いを消す）。
  外したことで行の無くなる「web アプリの中で I/O に触る `.ts`」には、「web の端末 I/O」の行を新しく置く（下の「決定（案）」）
- **(b) 実体を表に合わせる。** 画面が読むドメインの型と値を、アプリごとの純粋判断へ写すか包み直し、画面はそれだけを読む。
  `server-message.ts` の protocol の読み込みは同期フックへ移す
- **(c) 「アダプタ」行の読みに揃える。** 置き場の「web アプリ」を残し、web アプリのファイル全体が「上のすべて」に依存してよいとする。
  web の 3 行は責務の分け方だけを示し、依存の制限は持たない

### 決定（案）

**(a) を採る。**

- **(b) を採らない理由**: 画面が読んでいるのはドメインの語彙そのもの（参加者・札・ステップ・お題などの型と、それを表示用に引く関数・上限の定数）で、
  包み直しても同じ知識の写しが増えるだけになる。写しは揃え続ける手間と食い違いの元を足し、得るものが無い（憲法 原則 X「抽象は実需で」）。
  ドメインは純粋関数と型だけで I/O を持たない（対応表の「ドメイン」行）ので、画面が直接読んでも内向きの依存（憲法 原則 VI）は崩れない
- **(c) を採らない理由**: web アプリのファイル全体が 1 つの層になるので、web 層どうしの向きの制限が消える。
  その結果、#592 が直す A1 の 4 辺（純粋判断・同期フック→画面の型の参照）まで違反でなくしてしまう（下の「実測」）。
  さらに「上のすべて」（アダプタ行より上の行。ドメイン・プロトコル契約・`packages/rate-limit`・アプリケーション・ポート）には同期サーバーのアプリケーションとポートも入り、
  画面や純粋判断がそれらを読むことまで許す。
  実体が要るのはドメインと protocol だけなので、許す範囲を実需に絞る (a) を採る。行どうしの食い違いは、(a) でアダプタ行から「web アプリ」を外して消す

(a) で直す対応表の行（正本は `docs/guides/architecture.md`。ここは決めた中身だけを書く）:

| 行 | 前の表 | (a) で直した後 |
|---|---|---|
| アダプタ | 置き場「`apps/*-sync/src/adapters`・web アプリ」 | 置き場「`apps/*-sync/src/adapters`」。web アプリの中は「web の…」の行で決める |
| web の純粋判断 | ドメインの型のみ | ドメインの型と値（関数・定数・スキーマ）・`packages/protocol`（React・I/O に依存しない点は変えない。下の「web の端末 I/O」も読まない） |
| web の端末 I/O（新しい行。純粋判断の行の下・同期フックの行の上に置く） | （無かった。前の表ではアダプタ行の「web アプリ」に入っていた） | 置き場: web アプリの `src` の `.ts` で、同期フックでも画面でもなく、ブラウザの I/O（`localStorage`・IndexedDB・音・`location`・`document` など）・時計・乱数に触るもの（例: `apps/timer-web/src/platform/sound.ts`・`apps/roulette-web/src/storage/regulars.ts`・`apps/timer-web/src/prefs/local-prefs.ts`・各アプリの `router.ts`）。純粋な関数と I/O が同じファイルにあるとき（`router.ts` の `parseRoute` と `redirectTo`）は、ファイルとしてはこの行に置く。依存してよいもの: ドメインの型と値・純粋判断（React と WebSocket は持たない。WebSocket は同期フックの持ち物） |
| web の同期フック | 上のすべて ＋ WebSocket | 文言は変えない。ただし「上のすべて」の中身が変わる（下） |
| web の画面 | 同期フック・純粋判断・`@tasuki/web-kit/reader`・`@tasuki/web-kit/room`・`packages/invite-ui`・`packages/ui` のみ | 左に加えて、ドメインの型と値（関数・定数・スキーマ）と「web の端末 I/O」（同期クライアントと `@tasuki/web-kit/sync` を直接読まない点は変えない） |

**同期フック行の「上のすべて」の意味が変わる。** 前の表では、上の行にアダプタ行（置き場に「web アプリ」）があったので、
「上のすべて」は web アプリのファイル全体、つまり画面にまで届いていた。(a) でアダプタ行から「web アプリ」を外すと、同期フックは画面を読めなくなる。
**このため、同期フック→画面の 2 辺（A1 のうち `web/hook -> web/screen`（型）2）は、新しい表では違反と読む。**
調査の判定（節 1.2）はもともと同期フックに画面を許していなかったので、下の「実測」の数（79→13）はこの読みで数えたものになっている。
新しく置く「web の端末 I/O」は同期フック行より上にあるので、同期フックはそれを読んでよい。

**この追記で決めないこと**

- 同期フック行の「上のすべて」が、同期サーバーのポート・アプリケーション・`packages/rate-limit` まで含むか。調査の判定（節 1.2）の読み
  （ドメイン・protocol・純粋判断・同期クライアント・web-kit・markdown・invite-ui）はそのまま。画面に届かなくなる点だけは上のとおり変わる
- 純粋判断の `.ts` が `@tasuki/protocol` を読むときの、型だけか値もかの区別。いまの 4 本は値を読んでおり、両方を許す
- 調査で見つけた他の違反（下の「実測」で残る辺）と、「web の端末 I/O」の行で新しく見える辺。直すのは #592 である

### 実測（`layerOf` の許可表を (a) に合わせたとき）

ISSUE #598 の完了条件「許可表を新しい対応表に合わせると、62 辺・4 辺が違反から消える」を確かめた。
測ったのは 2026-11-14・main `882f7954` の作業ツリー。どの写しも作業ツリーの外に置き、スクリプト本体は変えていない。

- **今の許可表**: `node docs/superpowers/specs/2026-11-13-architecture-review-survey/a-dependency-edges.mjs .` を流した。
  違反（`violations`）は 79 辺（監査の外。`covered: true` は 0）。そのうち
  - 画面→ドメイン（`web/screen -> domain`）: 62 辺（値 29・型 33）。読む側は 54 ファイル。
    アプリ別は agenda-web 10・checkin-web 7・landing 3・poker-web 14・roulette-web 8・timer-web 17・topic-web 3
  - 純粋判断→protocol（`web/pure -> protocol`）: 4 辺。`apps/agenda-web/src/server-message.ts:9`・`apps/checkin-web/src/server-message.ts:12`・
    `apps/roulette-web/src/server-message.ts:9`・`apps/topic-web/src/server-message.ts:9`

  調査（節 1.3。測ったのは `f4ffbb96`）と同じ数だった。辺の総数は調査の 5,242 から 5,251 に増えたが、違反の数と内訳は変わっていない
- **(a) に合わせた許可表**: スクリプトを写し、`RULES` の 2 行だけを書き換えて同じ引数で流した。

  ```js
  "web/pure": [...DOMAIN_LIKE, "protocol"],
  "web/screen": [...DOMAIN_LIKE, "web/hook", "web/pure", "web-kit/reader", "web-kit/room", "invite-ui", "ui"],
  ```

  違反は 13 辺になった。前後の違反を（規則・ファイル・行・読む先）の組で突き合わせると、**消えたのは 66 辺で、内訳は画面→ドメイン 62・純粋判断→protocol 4。
  スクリプトの層の分け方の中では、新しく出た違反は 0**。辺の総数（5,251）は変わらない。
  ただしスクリプトの `layerOf` は、同期フック以外の `.ts` をすべて純粋判断（`web/pure`）に入れるので、「web の端末 I/O」の行は見えていない（次の項目）
- **「web の端末 I/O」の行を足した許可表**: web アプリの `src` の `.ts`（テスト・`.d.ts` を除く）のうち、コメントを除いた本文に
  `localStorage`・`sessionStorage`・`indexedDB`・`window.`・`document.`・`location.`・`navigator.`・`history.`・`matchMedia`・`AudioContext`・`new Audio`・`fetch(`・
  `new WebSocket`・`requestAnimationFrame`・`setTimeout`・`setInterval`・`Date.now`・`Math.random`・`crypto.` のどれかが出るものを数えると 41 本で、
  名前の規則で同期フックに入るものが 27 本、**純粋判断に入っていたものが 14 本**だった（`agenda-web` の `platform/sound.ts`・`router.ts`・`storage/saved-scenarios.ts`、
  `checkin-web`・`poker-web`・`roulette-web`・`topic-web` の `router.ts`、`roulette-web` の `storage/regulars.ts`、`landing` の `hub/departure.ts`、
  `timer-web` の `platform/location.ts`・`platform/notify.ts`・`platform/sound.ts`・`prefs/local-prefs.ts`・`records/indexeddb.ts`）。
  字面で拾ったので、引数で受けた `Storage` を触る `saved-scenarios.ts` は `Date.now` の字面で拾われた。字面に出ない I/O は数えていない。
  この 14 本を `web/io` の層に分け、(a) の写しに `"web/io": [...DOMAIN_LIKE, "web/pure"]` と、同期フック・画面が `web/io` を読んでよいことを足して流すと、
  違反は 15 辺になった。(a) の 13 辺から消えたものは 0 で、**新しく出たのは 2 辺**（`web/pure -> web/io`。
  `apps/roulette-web/src/copy.ts:2` と `apps/roulette-web/src/regulars-view.ts:22` が `storage/regulars.ts` の値（`MAX_GROUPS`・`parseMemberLines`・`sameMemberName`）を読む）。
  `storage/regulars.ts` に純粋な値と I/O が同じファイルにあるためで、直すのは #592 である
- **残る 13 辺**（(a) の写し）は #592 が直す側の辺である（`deep-import` 4・`sync/application -> sync/adapters`（型）1・
  `web/pure -> sync-client` 4（値 1・型 3）・`web/hook -> web/screen`（型）2・`web/pure -> web/screen`（型）2）。
  なお `@tasuki/timer-core/aggregate` を読む画面 3 辺は、層の対では画面→ドメインだが、入口外の参照（`deep-import`）として数えられており、(a) でも違反のまま残る
- **純粋判断→ドメイン（違反に出ない辺）**: 今の許可表の出力の `edges` から `web/pure -> domain` を引くと 64 辺（48 ファイル）で、
  うち値の import が 44 辺（30 ファイル）・型だけが 20 辺。スクリプトの許可表（`"web/pure": [...DOMAIN_LIKE]`）は型と値を分けないので、
  表の「ドメインの型のみ」に反する値の 44 辺は、上の 66 辺には入っていない。(a) で「ドメインの型と値（関数・定数・スキーマ）」に広げるのはこのためである
- **(c) の読みに合わせた許可表（比べるため）**: 同じく写しで、`web/pure`・`web/hook`・`web/screen` の 3 層に、アダプタ行の「上のすべて」
  （アダプタ行より上の行。ドメイン・protocol・`packages/rate-limit`・同期サーバーのアプリケーション・ポート）と web の 3 層どうしの参照を足して流した。
  違反は 79 から 9 になり、消えたのは 70 辺（画面→ドメイン 62・純粋判断→protocol 4・`web/pure -> web/screen`（型）2・`web/hook -> web/screen`（型）2）。
  新しく出た違反は 0。同期サーバーのアダプタ（`sync/adapters`）を許す側に足しても足さなくても、数は同じ 79→9 だった（web から同期サーバーのアダプタを読む辺が無いため）。
  (a) との差の 4 辺は #592 が直す A1 の辺で、調査の節 1.2 の「その読みでは A1 の 4 辺も違反でなくなる」と合う

### 影響

- **コード（`apps/` `packages/` `scripts/`）は変えない。** この追記と同じ PR で、対応表（`docs/guides/architecture.md`）の行を上の表のとおりに直した
  （アダプタ・web の純粋判断・web の画面の 3 行を書き換え、web の端末 I/O の行を足した。表の下に、この追記で書き換えたことを注記した）
- **#592 の監査への反映**: #592 が層の向きの監査を作るときに、画面→ドメインの型と値と、純粋判断→`packages/protocol` を許す側に入れる。
  上の 66 辺は違反に数えない。あわせて、「web の端末 I/O」の行を `layerOf` で分ける（名前の規則では分けられないので、許可リストで倒す）。
  そのとき上の 2 辺（`web/pure -> web/io`）が違反として見える。反映は #592 側で行う（この追記では監査を置かない）
- 採択されなかったとき（Rejected）は、`docs/guides/architecture.md` で直した行を元に戻し、(b) か (c) を別に決める
