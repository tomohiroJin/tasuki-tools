# Data Model: プランニングポーカー MVP

**Date**: 2026-07-16 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

すべて `packages/core` のインメモリ構造。永続化はない（憲法原則 III）。
ID・トークンの生成規則は [research.md R3/R4](./research.md) を参照。

## エンティティ

### Card（カード）

デッキの1枚。判別可能ユニオンで数値カードと特殊カードを区別する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| kind | `'number' \| 'question' \| 'coffee'` | 数値カード / ? / ☕ |
| value | `0 \| 1 \| 2 \| 3 \| 5 \| 8 \| 13 \| 21`（kind='number' のみ） | ストーリーポイント値 |

- **不変条件**: MVP のデッキはフィボナッチ 10 種（0, 1, 2, 3, 5, 8, 13, 21, ?, ☕）に固定（FR-005）

### Participant（参加者）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string (UUID) | 参加者 ID（配信用の公開識別子） |
| token | string (UUID) | 再接続用トークン。**本人以外へ配信してはならない** |
| name | string | 表示名。1〜24 文字、前後空白トリム後に非空（FR-001/003） |
| isHost | boolean | ホストフラグ。ルーム内で常に 1 人だけ true |
| connected | boolean | 接続状態。切断時も公開前ラウンドの票は保持（FR-013） |
| joinOrder | number | 参加順の単調連番。ホスト繰上の判定キー（FR-012, research R6） |

- **同一性**: token で識別する。名前は識別子ではない（同名参加を許容）
- **バリデーション**: name は trim 後 1〜24 文字。違反は join 拒否（エラー応答）

### Vote（投票）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| participantId | string | 投票者 |
| card | Card | 選択したカード |

- **不変条件**: 1 参加者 1 票。再投票（公開前の選び直し）は上書き（FR-007）

### Round（ラウンド）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| status | `'voting' \| 'revealed'` | 状態機械（下記） |
| votes | Map<participantId, Vote> | 投票の集合。voting 中は本人以外へ値を配信しない（FR-006） |
| spectators | Set<participantId> | 見学している人（#419）。**名簿に居て、いまの見積もりに加わっていない人**。投票を受けず、自動公開の分母から外れる。ラウンドをまたいで残る（revote・next-item で消さない） |
| coffeeArmed | boolean | 隠しモードの入口の構え（#403）。全員 ☕ の開票が 1 回あり、まだゲームが始まっていない。再投票では残し、次のアイテムへ・全員 ☕ でない開票で解く |
| game | CardGame \| null | 隠しモードのゲーム（#403）。`players`（席順・最大 10 人）・`status`（`exchanging` / `shown`）・`hands`（5 枚）・`exchanged`・`deck`・`discards`・`away`（切れた時刻）。ある間は見積もりの投票系の操作を拒む |

### Room（ルーム）— 集約ルート

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ルーム ID（8 文字英数字、招待リンクの構成要素） |
| participants | Participant[] | 参加者一覧（joinOrder 順。joinOrder は既存の最大値 +1 で採番） |
| round | Round | 現在のラウンド（常に 1 つ。履歴は保持しない） |

- **ライフサイクル**: 作成（ホスト参加と同時）→ 稼働 → 接続数 0 で即時破棄（FR-014）
- **不変条件**:
  - ホストは常に接続中の参加者から 1 人（全員切断ならルーム自体が消滅）
  - round は常に存在する（ルーム作成時に voting 状態で初期化）

### RoomSnapshot（配信用投影）— 受信者ごとに生成

Room から受信者別に生成する読み取り専用ビュー（research R1、SC-004 の実現手段）。

| フィールド | 説明 |
|-----------|------|
| roomId, participants | token を除外した参加者情報（id, name, isHost, connected） |
| round.status | そのまま |
| round.votes | **voting 中**: 各参加者の hasVoted のみ + 受信者本人の選択カード / **revealed 後**: 全票 + 集計（stats） |
| stats | revealed 後のみ。average（数値票の平均、数値票 0 件なら null）+ modes（最頻値の配列、同数複数可）（FR-010） |
| you | 受信者自身の participantId（画面の「自分」表示用） |

## 状態遷移

### Round 状態機械

```
                 ┌──────────┐  全員投票（接続中全員, FR-008)   ┌───────────┐
 create/next --> │  voting  │ ────────────────────────────> │ revealed  │
                 └──────────┘  or 公開操作（FR-009）            └───────────┘
                      ↑                                           │
                      └────────── revote / next-item（FR-011・#93, 在室者なら誰でも）
```

- **見積もりの記録（#93）**: `Round` は `item`（いま見積もっているアイテム名）と `log`（束の配列。`packages/poker-core/src/estimate-log.ts`）を持つ。開票（手動・自動）の瞬間にだけ `log` へ 1 行（時刻・N 回め・アイテム名・カードの枚数。参加者は持たない）が足される
  - **revote**（revealed → voting）: 票を消す。`item` と開いた束は残る（次の開票は同じ束の N 回め）
  - **next-item**（revealed → voting）: 開いた束を閉じてポイントを付け（任意）、`item` を空にする
  - 閉じた束のポイントは `set-points` で状態遷移と無関係にいつでも直せる（開いた束は不可）
  - **記録の切り替え（#427）**: `Round` は `recording`（記録するか）を持つ。新しいルームは `false`。`set-recording` で切り替わり、切り替えると開いた束をポイントなしで閉じる。開票が `log` へ行を足すのは `recording` が真で票が 1 つ以上あるときだけ
  - 閉じた束のアイテム名は `set-group-item` で直せる（開いた束は不可）。束の中の全部の行の `item` を書き換える
- **見学の切り替え（#419・`setSpectator`）**: 見学と投票への復帰は**いつでも本人が切り替えられる**。
  - **見学へ（voting 中）**: その人の票を捨てる。捨てた結果で自動公開が立つかは `applyAutoReveal` が続けて判定する（status は `setSpectator` では変えない）
  - **見学へ（revealed 後）**: 票は残す。開票済みの結果を変えない
  - **投票へ戻る**: `spectators` から外すだけ。票は持たない状態で戻る
  - 見学中の `vote` は `spectating` で拒む。退出（`discardVote`）は票と見学の両方を捨てる
- **隠しモードのゲーム（#403・`settleRound` / `exchangeHand` / `dealAgain` / `closeGame`）**:
  - **後処理（`settleRound`）**: 開票・切断・退出のあと必ず通す。自動公開 → 入口の判定 → 全員チェンジ済みの判定の順
  - **入口**: その操作で開票が起きたとき、投票者（接続中で見学でない人）の全員が ☕ なら、構えていれば配って始め、構えていなければ構える。全員 ☕ でなければ構えを解く。次のアイテムへも構えを解く
  - **配る**: 52 枚を注入された乱数で切り、投票者の先頭 10 人へ席順に 5 枚ずつ。残りは山
  - **チェンジ**（`exchanging` の間・1 人 1 回）: 選んだ位置を捨て、同じ位置へ山から引く。山が足りなければ捨て札を切り直して足す
  - **開く**（`exchanging` → `shown`）: 待っているプレイヤーが全員済んだら。接続の切れた人は切れた時刻（`away`）から 20 秒だけ待つ。サーバーは猶予の切れる時刻（`gameDeadline`）に判定を予約する
  - **もう一度**（`shown` → `exchanging`）: いまの投票者で配り直す。**見積もりに戻る**: ゲームを消し、票の無い投票中へ（誰でも・最中でも）
  - **退出**（`discardVote`）: プレイヤーから外し手を捨て札へ。最後のプレイヤーが外れたら見積もりへ戻す
  - 最中は vote / reveal / revote / next-item を `table-in-play` で拒む（サーバーの振り分けが、受けてよい操作の一覧で 1 か所で拒む）
  - 投影: `exchanging` の間、手は受信者本人の分だけを `yourHand` に載せ、他の人は `exchanged` だけ。`shown` で全員の手と役。ゲームが無ければ `table` を載せない
- **voting 中に許可される操作**: vote（上書き可）, join, leave, reveal（在室者なら誰でも）
- **revealed 中に許可される操作**: join（閲覧）, leave, revote / next-item（在室者なら誰でも。古い `next-round` は revote として受ける）
- **revealed 中の vote は拒否**（エラー応答）
- 自動公開判定は「接続中で見学でない全参加者が投票済み」（見学者は分母から外れる。#419）（途中参加者を含む。Clarification Q3）。
  voting 中の join / leave / 切断のたびに再評価する（切断で全員投票が成立するケースを含む、US4-AS1）

### Participant 接続ライフサイクル

```
 join ──> connected ──切断──> disconnected ──同一 token で再接続──> connected
                                   │
                                   └── (接続数 0 になった時点でルームごと消滅)
```

- 切断時: connected=false。voting 中の票は保持。ホストなら繰上（joinOrder 最小の接続中参加者へ）
- 再接続時: token 照合で同一 Participant に復帰、票・joinOrder を引き継ぐ（FR-013）。
  ホスト権限は自動では戻らない（Edge Case）

## 集計ルール（stats.ts）

- **average**: kind='number' の票のみで算術平均。数値票が 0 件なら null（「算出不能」表示）
- **modes**: 全票（?・☕ 含む）のカード別得票数の最大値を取るカードの配列。同数最頻は全件返す
- 表示上の丸め（小数 1 桁）は web 側の責務とし、core は生の数値を返す

---

## 追記（2026-09-10・#95 S4a） — 本書は 2026-07 時点の記録である

本書は MVP 実施時点のデータモデルの記録であり、**本文は当時のまま残す**。
[#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) の S3 と S4a で構造が変わったので、
現在地との差だけをここに置く。

- **`Participant.isHost` と `joinOrder` は無い**（S3 でホストの概念を廃止し、
  S4a の名簿統合で `joinOrder` も消えた）。したがって「ホストは常に接続中の参加者から 1 人」も
  「ホストなら繰上（joinOrder 最小の接続中参加者へ）」も成立しない。
- **`Room` は poker の集約ルートではない**（S4a）。集約ルートは `Round` で、名簿（参加者・
  接続状態・トークン）は timer と共有の `RoomStore` が持つ
  （`packages/room-core` と `apps/tasuki-sync/src/application/`）。
- **「接続数 0 で即時破棄（FR-014）」は撤去した**（S4a）。全員が接続を閉じてもルームは残り、
  戻れば票も残っている。消える契機はアイドル回収（`ROOM_IDLE_TTL_MS`。既定 30 分）と
  在室者 0 人になる退出の 2 つだけである。
- **接続ライフサイクルの図の「(接続数 0 になった時点でルームごと消滅)」も同じ理由で成立しない。**

変わっていないもの: 同一性を token で識別すること（名前は識別子ではない）、
1 参加者 1 票と公開前の上書き、`RoomSnapshot` を受信者ごとに生成して voting 中は他人の票を
配信しないこと（SC-004）、集計ルール（average / modes）。

**現在の正本**: [`contracts/ws-protocol.md`](./contracts/ws-protocol.md) の 2 つの改定節と
`packages/poker-core/src/round.ts` / `packages/room-core/src/`。
