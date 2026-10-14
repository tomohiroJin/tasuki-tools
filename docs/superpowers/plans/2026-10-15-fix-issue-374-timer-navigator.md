# timer のナビを「直前に実際に運転した人」にする（#374）実装計画

**Goal:** timer のセッション画面のナビ（⑦）が、輪の上で 1 つ前の席ではなく、**直前に実際に運転した人**を指すようにする。

**Architecture:** 直前のドライバーは timer-core の集約が持つ（`SessionState.previousDriverId`）。書き手は `evolve` の `DriverSwitched` だけで、
イベントの形は変えない（交代前の `currentIndex` は evolve が知っている）。同期サーバーの snapshot DTO が席の添字へ投影し
（`session.previousDriverIndex`）、画面の純粋関数 `driverNames`（`apps/timer-web/src/ui/session-view.ts`）がナビを決める。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 画面・ドメイン・同期サーバーの 3 層それぞれで再現テストを先に書き、赤を見てから直す |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 通過 | 集約に 1 項目足すだけ。永続化は無いので移行も無い |
| IV. 境界の型安全 | 通過 | wire に任意項目を 1 つ足し、`RoomSchema` で整数・0 以上・null を検証する |
| V. 実画面検証 | 通過 | 見送りを挟んだ交代の後のナビを実画面で確かめる手順を報告に書く（実行は統括） |
| VI. 依存は内向き | 通過 | ドメインは識別子だけを持ち、添字への投影はアプリ層（DTO）、表示の判断は画面が持つ |
| VII. 検査は壊して確かめる | 通過 | 書き手（evolve）・投影（DTO）・表示（driverNames）に変異を足す（m210〜） |
| VIII. 記録が正本 | 通過 | wire の変更は DTO の台帳（項目 10）と `wire.ts` の注記に書く |
| IX. 小さく回す | 通過 | PR 1 本。配布は統括の指示待ち |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない（項目 1 つと純粋関数の引数だけ） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 識別子と添字だけ。ログに触れない |

**逸脱なし。**

## 決めたこと

### 1. 直前のドライバーは集約が持つ（画面の逆向きの推定は採らない）

統括の目安は「推定で EARS を満たせるなら推定」。実測では、席の状態だけを見る推定は次の 3 つで「直前に実際に運転した人」を外す。

| 場面 | 推定が出す人 | 実際の直前のドライバー | 起きやすさ |
|---|---|---|---|
| A→C と交代（B は不在で飛ばされた）後、B が戻る | B（運転していない） | A | 高い。ハブや poker のタブへ移るだけで `away` になる（`seatSkipReason`） |
| 強制指名（`driver.assign`・#13）で A→C と飛ぶ | B（運転していない） | A | 機能として常にある |
| 交代の後に並べ替え（shuffle / move） | 新しい並びで 1 つ前の人 | 元の人 | 中 |

いずれも EARS 1（実際に運転した人を出す）を満たさない。席の状態は「いま」しか持たず、交代の時点で誰が飛ばされたかは画面から復元できない。
`DriverSwitched` を適用する evolve は交代前の席を知っているので、**イベントの形を変えずに**集約へ残せる。

**識別子で持つ**（添字で持たない）。並べ替え・削除で添字は動くが、識別子は人に付く。添字への投影は DTO が毎回行う（`nextIndex` と同じ置き場）。

### 2. 分からないとき・務められないときはナビを出さない（null）

既存の作法（輪が 1 人ならナビを出さない＝null）にそろえる。null になるのは:

- まだ交代が起きていない（開始直後・リセット直後）
- 直前のドライバーが輪から外れた
- 直前のドライバーがいまの運転者と同じ席（削除で添字が詰まったとき）
- **直前のドライバーの席がいま飛ばされる状態（見送り・不在・切断）**。EARS 2 の文面（1 つ前の席が見送り中・不在なら出さない）と、
  運転した後に見送りへ切り替えた人の扱いがここで重なる。その場に居ない人はナビを務められないので、出さない側にそろえる
- 古い同期サーバーが項目を送ってこない（配布の窓）

### 3. プロトコル互換と配布順序

- wire: `Room.session.previousDriverIndex?: number | null` を**任意項目**で足す。`deploy.sh timer` は画面を先に配るので、
  「新しい画面 × 旧サーバー」の窓では項目が無い → ナビが出ないだけ（snapshot は捨てない）。必須にすると窓の間 snapshot 全体が落ちる
- 「旧画面 × 新サーバー」: `RoomSchema` は非 strict の `v.object` なので余分な項目は通る（旧画面は 1 つ前の席を出し続ける）
- 集約は揮発インメモリなので、配布でルームが消える。集約側の移行は無い

## 変異（ID 210〜）

| ID | 壊し方 | 殺すテスト |
|---|---|---|
| 210 | evolve が `previousDriverId` を書かない | `packages/timer-core/test/evolve.test.ts` |
| 211 | DTO が `previousDriverIndex` を null 固定にする | `apps/tasuki-sync/test/timer-snapshot-dto.test.ts` |
| 212 | `driverNames` が直前のドライバーの席の飛ばされる状態を見ない | `apps/timer-web/test/ui/session-view.test.ts` |
| 213 | `driverNames` を輪の上の 1 つ前の席へ戻す（欠陥そのもの） | `apps/timer-web/test/ui/session-view.test.ts`・`Session.derived.test.tsx` |

## 検証の実行時間の見積もり

| コマンド | 見積もり |
|---|---|
| `pnpm --filter @tasuki/timer-core test` | 30 秒 |
| `pnpm --filter @tasuki/tasuki-sync test` | 1 分 |
| `pnpm --filter @tasuki/timer-web test` | 1〜2 分 |
| 各パッケージの型検査・lint | 各 30 秒〜1 分 |
| `pnpm test`（全体・キャッシュ可） | 3〜5 分 |
| `node scripts/mutation-check.mjs --changed` | 5〜10 分（背景で流す） |
| scripts の自己テスト | 1〜2 分 |

見積もりの 2 倍を超えたら報告する。
