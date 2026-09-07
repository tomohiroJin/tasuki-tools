# ADR-0004: 同期サーバーはポート/アダプタ構成を標準とする

- **ステータス**: Accepted（2026-08-10）
- **関連**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（本 ADR の適用先、poker-sync の再編）/
  [#80](https://github.com/tomohiroJin/tasuki-tools/issues/80)（実 WS 越しの業務プロトコル層の新設、
  本 ADR の根拠となった実測）/
  `docs/constitution.md` 原則 VI（依存は内向き）/
  [`docs/guides/architecture.md`](../guides/architecture.md)（層とディレクトリの対応・判断フローの正本）

## 背景

Tasuki には同期サーバーが 2 つある。2026-08-09〜10 時点で `apps/tasuki-sync/src` と
`apps/tasuki-sync/src/poker` を実際に確かめると、構成が非対称であることが分かる。

- **`apps/tasuki-sync/src`** は `adapters/`（`ws-adapter.ts` `in-memory-room-store.ts`
  `system-clock.ts` `nanoid-code-gen.ts` `claude-cli-problem-provider.ts`）、
  `application/`（`handlers.ts` `presence.ts` `schedule.ts` 等のユースケース）、
  `ports/`（`broadcaster.ts` `clock.ts` `code-gen.ts` `room-store.ts`
  `server-problem-provider.ts` のインターフェース）に分かれたポート/アダプタ構成を
  取っている。組み立て（store・clock・codeGen・scheduler・broadcaster・handlers 等の
  相互配線）は `create-sync-server.ts` の 1 ファイルに閉じ込められており、
  同ファイルの冒頭コメントは「本番（`server.ts`）とテストが必ずこの関数を通ることが
  要点である」「組み立ての知識はこのファイルだけが持つ」と明記している。
- **poker-sync の `src/`** は `config.ts` / `rooms.ts` / `server.ts` の
  モジュール関数のみで構成されており、ポートに相当する抽象境界も、組み立てを
  1 箇所へ集約する層も無い。

この非対称は、Issue #80（実 WS 越しの業務プロトコル層の新設）で顕在化した。
timer-sync 側はテスト用アダプタ（インメモリの store・固定 clock 等）に
差し替えるだけで、本番と同じ配線（`create-sync-server.ts`）を通した実 WS 試験を
組めた。ポート/アダプタ構成を持たない poker-sync では、同種の試験を組むために
`config.ts` / `rooms.ts` / `server.ts` を横断した個別の差し替えが要る。

## 決定

**同期サーバーの標準構成として timer-sync 型（ポート/アダプタ）を採る（MUST）。**
新規に同期サーバーを作る場合、および既存の同期サーバーを再編する場合は、
次の形に従う。

1. ドメインへの依存を **ポート**（インターフェース）として境界に定義する
   （`ports/`）。
2. I/O・時計・乱数などの副作用を **アダプタ**として実装し、ポートの型で
   注入する（`adapters/`）。
3. ユースケースは **アプリケーション層**（`application/`）に置き、ポートにのみ
   依存する。
4. サーバーの組み立て（アダプタの生成・相互配線）は `create-sync-server.ts`
   のような **1 つの関数に集約する（MUST）。** 本番のエントリポイント（`server.ts`）と
   テストの両方が、この関数を経由して組み立てる。組み立てを個別に書き写さない
   （書き写しは本番からずれた瞬間に「配線が繋がっているか」の検査を殺す）。

**根拠:** テスト時にアダプタを差し替えられる構成が、実 WS 越しの業務プロトコル試験
（#80）で実際に効いた。ポート/アダプタと配線の一元化が無ければ、同水準の試験を
poker-sync で組むにはより大きな作業が要る。

本決定は `docs/constitution.md` 原則 VI「依存は内向き」の箇条書き
「同期サーバーはポート/アダプタ構成を標準とする」の根拠を記録するものである。
（#165 で訂正: もとの本文は箇条書きの文言を原則そのものの表題として引用していた。
決定内容は変えていない。原則 VI という指し先も変えていない。）

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用（poker-sync の再編）は #72 で行う。
- #72 では `apps/tasuki-sync/src/poker` を `ports/` `adapters/` `application/` へ再編し、
  組み立てを `create-sync-server.ts` 相当の 1 関数へ集約する。利用者から見える
  振る舞い（公開 URL・プロトコル・画面の挙動）は変えない。
- timer-sync 側の既存構成は変更しない（本 ADR が既に体現している標準そのもの）。

## 追記（2026-09-08・#95 S2）

**同期サーバーは 2 本から 1 本になった。** timer-sync を `apps/tasuki-sync` へ改名して
合成ルートにし、poker の実装（ハンドラ・ストア・アダプタ・ポート）を
`apps/tasuki-sync/src/poker/` へ移設した。poker-sync は退役した。
決定の正本は [`docs/adr/0017`](0017-bounded-contexts-and-packages.md)（文脈分割とパッケージ構成）と
[`docs/adr/0018`](0018-single-entry-and-url-scheme.md)（入口一本化と URL 体系）である。

**本 ADR の決定（ポート/アダプタ構成と組み立ての一元化）は変えていない。** 変わったのは
適用先の数だけで、統合サーバーも `create-sync-server.ts` 1 本で組み立てる
（`scripts/audit-assembly-wiring.mjs` の検査対象も 2 組から 1 組になった）。

統合で 2 つの文脈が共有するのは**接続層だけ**である。保管・時計・ID 生成・配信は
timer と poker で別のままで、単一の巨大ストアにはしていない。この境界は
`apps/tasuki-sync/src/create-sync-server.ts` と
`apps/tasuki-sync/src/adapters/ws-adapter.ts` の docstring に書いてある。

**上限とレート制限の値の見直し**（設計正本 D22）もこの段で行った。

| 設定 | 統合前 | 統合後 | 根拠 |
|---|---|---|---|
| `MAX_CONNECTIONS` | 200 × 2 プロセス（実効 400） | 400（プロセス全体で 1 つ） | 接続レジストリが 1 つになるため。実効枠を変えない値を選んだ |
| `MAX_ROOMS` | 50 × 2 プロセス（実効 100） | 50（**文脈ごと**に効く。実効 100） | timer と poker のルーム保管が別のままなので枠も別。名簿の統合は S4a |
| レート制限のバケツ | 1 IP につき文脈ごとに 1 つ | 同じ（据え置き） | 統合しても自動的には 1 つにならない。束ねるのは join の経路が 1 本になる S4a |

