# ADR-0015: web 層は「純粋関数・同期フック・画面」に責務を分ける

- **ステータス**: Accepted（2026-08-17）
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
| 純粋ロジックの切り出し | **徹底している。** `apps/timer-web/src/ui/screen.ts` `apps/timer-web/src/ui/error-action.ts` `apps/timer-web/src/ui/host-change.ts` `apps/timer-web/src/ui/problem-generation.ts` `apps/timer-web/src/ui/join-driver-intent.ts` `apps/timer-web/src/ui/connection-status.ts` `apps/timer-web/src/ui/room-param.ts` `apps/timer-web/src/sync/notice-message.ts` `apps/timer-web/src/sync/sync-url.ts` の 9 本は、いずれも 12〜63 行で副作用 0 件・React フック 0 件 | `apps/poker-web/src/connection-notice.ts` と `apps/poker-web/src/router.ts` の `parseRoute` / `roomPath` / `topPath`（同ファイルで副作用を持つのは `navigate` のみ） |
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
