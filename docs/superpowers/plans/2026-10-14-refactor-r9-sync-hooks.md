# R9 web の同期フックの共通部品化と use-timer-sync の分割（#369）— 実装計画

- **Issue**: [#369](https://github.com/tomohiroJin/tasuki-tools/issues/369)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)・波 2）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.8
- **日付**: 2026-10-14
- **実測時点**: main `c4a512d`（#94 PR 3（#383・#384）と #379 の後）
- **ルーレットの扱い**: 含める（2026-10-14 の利用者の判断）。振る舞いと見た目を変えない範囲で、他のアプリと同じ共通部品へ寄せる

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各アプリの同期フックのテスト（`renderHook` と偽の WS）を先に表にし、欠けを特性テストで足してから寄せる（Task 1）。共通の部品は単体テストを先に書く |
| II. 技術選定は ADR を通す | 該当なし | 外部の依存を足さない（React は各 web アプリの既存の依存。新しいパッケージは peer で受ける） |
| III. 揮発インメモリと単純運用 | 該当なし | 端末に置く同一性（`resume-identity`）の読み書きは変えない |
| IV. 境界の型安全 | 通過 | 接続状態の型（`ConnectionStatus`）を `sync-client` の 1 つにし、写しの宣言を無くす |
| V. 実画面検証 | 通過 | `pnpm e2e`（CI）。参加のやり直しは `e2e/specs/rate-limit.spec.ts` が実経路で見る |
| VI. 依存は内向き | 通過 | 新しいパッケージの依存の向きを `audit-dependency-direction.mjs` の許可表で固定する。画面がこのパッケージの同期フックを直接読まないことを、各アプリの `screens-do-not-import-sync-client` のテストで固定する |
| VII. 検査は壊して確かめる | 通過 | 足すテスト・検査は壊して赤を見る。同期フックに掛かる変異のパッチ（29 本）を ID と意味を変えずに当て直す |
| VIII. 記録が正本 | 通過 | `docs/adr/0015`（同期フック 1 本・純粋判断）・`docs/adr/0020`（`invite-ui` は同期に依存しない）に従う |
| IX. 小さく回す | 通過 | 2 つの PR に分ける（§2）。コミットはタスクごと |
| X. 抽象は実需で | 通過 | 共通の部品は、同じ形が実際に 3 つ以上あるもの（URL 5・やり直し 5・接続状態の型 4）と、写しの組（お題・ルーレットのフック）だけにする |
| XI. 秘密と個人情報を持ち込まない | 該当なし | ログの形を変えない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文の前提との差）

| Issue の項目 | 実測（main `c4a512d`） | 確かめた場所 |
|---|---|---|
| 接続の知らせの判断（`connectionNotice` 3 つ） | **#94 PR 2 で寄せ終わっていた。** `sync-client` の `connectionNoticeKind` を poker・お題・ルーレットが使う。残っているのは、各アプリの知らせの文言（同じ文の写し） | `packages/sync-client/src/connection-notice.ts` |
| 参加の失敗の仕分け（3 通り） | `planForJoinError` は `sync-client` にあり、お題・ルーレットが使う（#94 PR 2）。玄関はその場の `msg.code` の判定、timer は `ui/error-action.ts`、poker は `join-retry-plan.ts` のまま | `grep` |
| WS の URL の組み立て | Issue のとおり 5 つ。書き方は 2 通り（`'wss'` + `://` と `'wss:'` + `//`）だが、出来る文字列は同じ | 各フック・`timer-web/src/sync/sync-url.ts` |
| `ConnectionStatus` の宣言 | `sync-client` が `connection-notice.ts` で宣言しているが、**`index.ts` から公開していない**。poker・お題・ルーレットが同じ 3 値を写している。timer の `StatusStrip.tsx` のものは**別の型**（5 値の表示の状態）で名前だけが同じ | `grep` |
| お題・ルーレットのフック | 288 行と 329 行。コメントを除いて比べると、違いは型・URL のツール名・ツール固有のフレーム（ルーレットの `roulette`・`roster`）・ツールのコマンドだけ。**接続・参加・やり直し・失敗の扱い・接続状態は同じ** | `diff` |
| 参加のやり直しのタイマー | お題・ルーレット・玄関・timer はフックの中に、poker は画面（`RoomPage.tsx` の 6 つの `useEffect`）の中にある。文言は、poker・timer が「混み合っています…」、お題・ルーレットが「参加を待っています…」（漢字の層の都合で写さない、と `roulette-web/src/copy.ts` にある） | `grep` |
| 置き場の候補 | `packages/invite-ui` は React の共有パッケージだが、**同期に依存しない**と決めてある（`docs/adr/0020`・`audit-dependency-direction.mjs` の許可表が空） | 同左 |
| 同期フックのテスト | お題 16・ルーレット 16・timer 35（ほかに `sync/` の単体 11 ファイル）・poker の画面の再参加 4・URL 1。玄関は `apps/landing/tests/hub/` にある | `grep -c` |
| この範囲に掛かる変異 | 29 本（m17〜m19・m34・m35・m60〜m68・m70・m88・m89・m92・m93・m100・m143・m144・m162・m164〜m166・m173・m180〜m182・m184） | `scripts/mutations/*.patch` |

## 2. この Issue でやること・やらないこと

**2 つの PR に分ける**（どちらもこのブランチから。1 つ目のマージの後に main から作り直す）。

### PR A: 共通の部品と、お題・ルーレットの載せ替え

1. **型と URL**: `sync-client` から `ConnectionStatus` を公開し、poker・お題・ルーレットの写しを外す。URL は `sync-client` の `buildSyncUrl(location, tool)` 1 つにし、5 つの組み立てを置き換える（出来る文字列は同じ）
2. **新しい React の共有パッケージ**（名前は下の判断 1）を作る。依存してよいのは `react`（peer）・`@tasuki/sync-client`。`audit-dependency-direction.mjs` の許可表に 1 行足す
3. **参加のやり直しのフック `useJoinRetry`**: 回数・タイマー・取り消し・送り直し・知らせの文言（引数で受ける）を 1 つに持つ。計画（`joinRetryDelayMs`）は `sync-client` に残す
4. **ツールの部屋のフック `useToolRoomSync`**: お題・ルーレットの共通部分（接続・接続状態・参加・失敗の扱い・やり直し・離脱・同一性の保存）を持ち、ツール固有のフレームとコマンドは引数で受ける。お題・ルーレットのフックはこの上に作り直し、**返す値の形（`TopicSync`・`RouletteSync`）は変えない**
5. **画面がこのパッケージの同期フックを直接読まない**ことを、各アプリの `screens-do-not-import-sync-client` のテストに足して固定する

### PR B: 玄関・poker・timer

6. 玄関（`use-hub-sync.ts`）のやり直しのタイマーを `useJoinRetry` に載せ替える。**失敗の仕分けは玄関のまま残す**（玄関はまだ部屋に居ないので、`planForJoinError` の `gone`・`left` と意味が合わない。仕分けを変えると振る舞いが変わる）
7. poker の `RoomPage.tsx` にある参加・やり直し・入口の振り分けの `useEffect` を、同期フック（`useSync.ts`）へ移す。やり直しは `useJoinRetry`、計画は今の `join-retry-plan.ts` のまま
8. `use-timer-sync.ts`（835 行）を、参加のやり直しと期限（`useJoinRetry` を使う）・入口の振り分け・コマンドの窓口のサブフックに分ける。失敗の仕分け（`ui/error-action.ts`）は timer のまま残す

### やらないこと

- 文言の統一（「混み合っています…」と「参加を待っています…」をそろえる）。振る舞いが変わる（Issue のスコープ外）
- poker の再接続の間隔（`{500, 5000}`）をそろえること（意図した違い）
- 知らせの**文言**を共通にすること。文は各アプリの `copy.ts` に残し、判断（`connectionNoticeKind`）だけを共有する（#94 PR 2 の形のまま）
- timer の `StatusStrip.tsx` の表示の状態の型を、`sync-client` の `ConnectionStatus` に寄せること（別の意味の型）。名前のぶつかりだけを解く（下の判断 3）
- `docs/guides/architecture.md` の更新は PR B の最後に行う（#94 PR 3 はマージ済みなので、もう触ってよい）

### 判断していただきたいこと

| # | 論点 | 推す案 | 理由 | 退ける案 |
|---|---|---|---|---|
| 1 | 新しいパッケージの名前と分け方 | **`@tasuki/web-kit`**。同期のフックは `@tasuki/web-kit/sync` という入口に分け、#371 の Markdown の描画などは別の入口に置く | 設計正本 §5.8 の例の名前。同期のフックだけを別の入口にすると、「画面は同期フックを直接読まない」をその入口の名前でテストできる（Markdown の描画は画面から読んでよい） | 1 つの入口にまとめる（画面が Markdown を読むと、同期フックの禁止とぶつかる）・同期だけの別パッケージ（`@tasuki/sync-react`。#371 で 2 つ目のパッケージが要る） |
| 2 | PR の分け方 | **2 つ**（PR A: 共通の部品とお題・ルーレット／PR B: 玄関・poker・timer） | 変異のパッチ 29 本と 5 アプリにまたがる。PR A で共通の部品の形を確かめてから、形の違う 3 つを載せる方が、戻すときの単位も小さい | 1 つの PR |
| 3 | timer の `StatusStrip.tsx` の `ConnectionStatus` | **`StatusStripState` に改名する**（中身は変えない） | 5 値の表示の状態で、`sync-client` の 3 値の接続状態とは別物。同じ名前のままだと、写しを外す検査（下の Task 2）が拾ってしまう | そのまま残す |
| 4 | スクリーンショットの比較（Issue の完了条件） | **この Issue では、画面のテスト・`pnpm e2e`（CI）で代える** | 変えるのはフックと型だけで、マークアップと CSS には触らない。比較の仕組みは #372（トークン）で用意する（あちらは見た目そのものを触る） | 比較の仕組みをこの Issue で用意する |

## 3. 振る舞いを保つ方法

- **フックの返す値の形を変えない。** 画面のテストと各フックのテスト（`renderHook` と偽の WS）を、期待値を変えずに通す
- **やり直しの回数・間隔・あきらめるとき・知らせの文言**を、アプリごとに表で固定する（Task 1）。共通のフックに載せ替えた後も同じ表で通す
- **URL**: 5 つのアプリの URL を、共通の関数に置き換える前に文字列で固定する（http / https の両方）
- **実経路**: `pnpm e2e`（CI。`rate-limit.spec.ts`・`roulette.spec.ts`・`topic.spec.ts`・`poker.spec.ts`・`timer.spec.ts`）
- **変異**: 29 本を ID と意味を変えずに当て直し、`node scripts/mutation-check.mjs` で全件の検出を確かめる

## 4. タスク（PR A）

### Task 1: 特性テストの表を作り、欠けを足す

各アプリについて、次の振る舞いがテストで固定されているかを表にし、欠けを足す（緑で入れて、壊して赤を見る）。

| 振る舞い | 玄関 | お題 | ルーレット | poker | timer |
|---|---|---|---|---|---|
| URL（http / https） | 着手時に確かめる | 〃 | 〃 | `ws-url.test.ts` | `sync-url.test.ts` |
| やり直しの間隔と回数 | 〃 | 〃 | 〃 | `room-page-join-retry` | 〃 |
| 使い切ったときの知らせ | 〃 | 〃 | 〃 | 〃 | 〃 |
| 再接続でやり直しの回数が戻る | 〃 | 〃 | 〃 | 〃 | 〃 |
| 閉じたときにやり直しを取り消す（m92） | 〃 | 〃 | 〃 | 〃 | 〃 |
| 部屋が消えた・抜けた・外された・合言葉 | 〃 | 〃 | 〃 | 〃 | 〃 |

PR A で載せ替えるのはお題・ルーレットなので、その 2 列は PR A の中で埋める。残りの 3 列は PR B の最初に埋める。

### Task 2: `ConnectionStatus` と URL を `sync-client` の 1 つにする

- `sync-client` の `index.ts` から `ConnectionStatus` を公開する。poker・お題・ルーレットの宣言を外して取り込む
- **写しの宣言を拒むテスト**を `sync-client` に足す（各 web アプリの `src` に `type ConnectionStatus =` が無いこと。先に赤を見る）。timer の表示の状態は判断 3 のとおり改名する
- `buildSyncUrl(location, tool?)` を足し、単体テストを先に書く。5 つの組み立てを置き換え、各アプリの URL の名前（`rouletteSyncUrl` など）は今の呼び出し元のテストのために残すかを着手時に決める（残すなら 1 行で委ねる）

### Task 3: `@tasuki/web-kit` を作る

- `packages/web-kit`（`src/sync/index.ts` を `./sync` の入口に）。`package.json`・`tsconfig`・`vitest`・README は `invite-ui` に倣う
- `audit-dependency-direction.mjs` の許可表に足す（`@tasuki/sync-client` だけ）。使うアプリの行にも足す
- `audit-structure.mjs` の `PACKAGES` に足す

### Task 4: `useJoinRetry`

- 単体テストを先に書く（偽のタイマー）: 回数を数える・間隔は `joinRetryDelayMs`・使い切ったら知らせを替えて送らない・取り消し・成功で回数を戻す
- 知らせの文言（待っている・使い切った）は引数で受ける

### Task 5: `useToolRoomSync` と、お題・ルーレットの載せ替え

- お題・ルーレットのフックの共通部分を `useToolRoomSync` に移す。ツール固有のフレーム（ルーレットの `roulette`・`roster`・`selfId`）とコマンドは引数で受ける
- お題・ルーレットのフックは、返す値の形を変えずにこの上で作り直す。各 16 件のテストを期待値を変えずに通す
- ルーレットの `receivedAt` の扱い（同じ回の `spin` を保つ。m162・m180）は、ルーレットのフレームの扱いとしてルーレット側に残す

### Task 6: 画面が同期フックを直接読まないことを固定する

- 各アプリの `screens-do-not-import-sync-client` のテストに `@tasuki/web-kit/sync` を足す（足す前に、画面から読む形を書いて赤を見る）

### Task 7: 変異のパッチを当て直し、通して確かめる

- 掛かるパッチを ID と意味を変えずに当て直す。`pnpm test`・`typecheck`・`lint`・構造監査・スクリプトの自己テスト・変異検査
- `/security-review`・`/code-review` を流す
- 計画の末尾に実施の記録を残す

## 5. タスク（PR B）

PR A のマージの後に、この節を実測で書き足す（玄関・poker・timer の振る舞いの表を Task 1 の残りの列で埋めてから）。

- Task 8: 玄関のやり直しを `useJoinRetry` へ
- Task 9: poker の `RoomPage.tsx` の参加・やり直し・入口の振り分けを `useSync.ts` へ
- Task 10: `use-timer-sync.ts` をサブフックに分ける
- Task 11: `docs/guides/architecture.md`・設計正本 §5.8 の追記・実施の記録

## 6. 変異の ID

**新しい ID は足さない。** 当て直すパッチは ID・名前・検出を期待するテストを変えない。

## 7. 完了条件（#369 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] 各アプリの再接続・参加のやり直し・知らせの振る舞いが変更前と同じ（フックのテスト・画面のテストを期待値を変えずに通す・`pnpm e2e` が緑）
- [ ] 見た目: マークアップと CSS に触らないので、画面のテストと `pnpm e2e` で代える（判断 4）
- [ ] `audit-web-sync-boundary.mjs` が緑。画面が `@tasuki/web-kit/sync` を直接読まないことをテストで固定した
- [ ] WS の URL の組み立てと `ConnectionStatus` の宣言が `sync-client` の 1 つ（写しの宣言はテストが拒む）
- [ ] 変異検査が全件検出。`pnpm test`・`typecheck`・`lint`・構造監査が緑
- [ ] #360 の共通の守りを満たす
