# Contract: WebSocket メッセージプロトコル

**Date**: 2026-07-16 | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

唯一の外部インターフェース。エンドポイントは `wss://<host>/poker/ws`（開発時は Vite proxy 経由、
[research.md R5](../research.md) 参照）。メッセージは JSON テキストフレーム。
**すべての受信メッセージは境界で Valibot スキーマ検証し（憲法原則 IV）、検証失敗は
`error` 応答（code: `invalid-message`）を返して接続は維持する。**

スキーマの実装は `packages/poker-core/src/protocol.ts` に置き、web / sync 双方が import する
（契約の単一情報源）。本書はその仕様定義である。

## 共通事項

- 方向: C→S（クライアント→サーバー）/ S→C（サーバー→クライアント）
- 全メッセージは `{ "type": string, ... }` 形式の判別可能ユニオン
- カード表現: `{ "kind": "number", "value": 0|1|2|3|5|8|13|21 }` または `{ "kind": "question" }` / `{ "kind": "coffee" }`
- サーバーは状態が変わるたびに、ルーム内の各接続へ受信者別の `room-state` を送る（全量スナップショット、差分なし）

## C→S メッセージ

### create-room — ルーム作成（FR-001, FR-002）

```json
{ "type": "create-room", "name": "たろう" }
```

- `name`: string、trim 後 1〜24 文字
- 成功: `joined`（作成者がホスト）→ 続けて `room-state`
- 失敗: `error` (`invalid-message`)

### join-room — ルーム参加・再接続（FR-003, FR-013）

```json
{ "type": "join-room", "roomId": "a1b2c3d4", "name": "はなこ", "token": "<uuid> | 省略可" }
```

- `token` あり・照合一致 → 同一参加者として復帰（票・joinOrder 引き継ぎ。`name` は無視）
- `token` なし・不一致 → 新規参加者として追加（voting 中なら未投票扱い、自動公開の分母に入る）
- **既にその `roomId` に居る接続からの再送は冪等**（[#171](https://github.com/tomohiroJin/tasuki-tools/issues/171)）。
  切り離しも新規参加者の追加も行わず、同じ `participantId` / `token` で `joined` を返して
  最新の `room-state` を配信する。`name` と `token` はこの場合いずれも無視する
  （既に居る接続の identity はソケット側が正）。他の参加者から見て切断は起きない
- 失敗: `error`（`room-not-found`）

### vote — 投票・票の変更（FR-005〜007）

```json
{ "type": "vote", "card": { "kind": "number", "value": 5 } }
```

- 前提: join 済み・round.status = `voting`
- revealed 中は `error`（`not-voting`）

### reveal — ホストによる一斉公開（FR-009）

```json
{ "type": "reveal" }
```

- 前提: ホストのみ。非ホストは `error`（`not-host`）、revealed 中は `error`（`not-voting`）

### next-round — 再投票／次ラウンド開始（FR-011）

```json
{ "type": "next-round" }
```

- 前提: ホストのみ・round.status = `revealed`。全票をリセットし voting へ
  （再投票と次ラウンドはドメイン上同一操作。ラベルは UI の責務）
- 違反: `error`（`not-host` / `not-revealed`）

## S→C メッセージ

### joined — 参加確定（本人のみへ送信）

```json
{ "type": "joined", "roomId": "a1b2c3d4", "participantId": "<uuid>", "token": "<uuid>" }
```

- `token` は**このメッセージ以外で配信してはならない**（本人の再接続用。localStorage に保存）

### room-state — ルーム状態スナップショット（受信者別に秘匿処理済み）

voting 中の例（受信者 = p1、p2 は投票済み）:

```json
{
  "type": "room-state",
  "roomId": "a1b2c3d4",
  "you": "p1",
  "participants": [
    { "id": "p1", "name": "たろう", "isHost": true,  "connected": true, "hasVoted": true },
    { "id": "p2", "name": "はなこ", "isHost": false, "connected": true, "hasVoted": true }
  ],
  "round": { "status": "voting" },
  "yourVote": { "kind": "number", "value": 5 }
}
```

revealed 後の例:

```json
{
  "type": "room-state",
  "roomId": "a1b2c3d4",
  "you": "p1",
  "participants": [
    { "id": "p1", "name": "たろう", "isHost": true,  "connected": true, "hasVoted": true },
    { "id": "p2", "name": "はなこ", "isHost": false, "connected": true, "hasVoted": false }
  ],
  "round": {
    "status": "revealed",
    "votes": [ { "participantId": "p1", "card": { "kind": "number", "value": 5 } } ],
    "stats": { "average": 5, "modes": [ { "kind": "number", "value": 5 } ] }
  },
  "yourVote": { "kind": "number", "value": 5 }
}
```

- **秘匿保証（SC-004）**: `round.status = "voting"` の間、他者の選択値はいかなる
  フィールドにも含めない（`hasVoted` のみ）。`yourVote` は受信者本人の票のみ
- `stats.average`: 数値票の算術平均（生値）。数値票 0 件なら `null`
- `stats.modes`: 最頻カードの配列（同数複数可、?・☕ 含む）

### error — エラー応答

```json
{ "type": "error", "code": "room-not-found", "message": "ルームが見つかりません" }
```

| code | 意味 | 対応する要求 |
|------|------|-------------|
| `invalid-message` | スキーマ検証失敗 | 全 C→S（FR-015） |
| `room-not-found` | ルーム不存在・破棄済み | join-room（FR-015, US1-AS3）、vote / reveal / next-round（破棄済みルームを指したままの接続。[#171](https://github.com/tomohiroJin/tasuki-tools/issues/171)） |
| `not-host` | ホスト専用操作 | reveal, next-round |
| `not-voting` | voting 中でない | vote, reveal |
| `not-revealed` | revealed 中でない | next-round |
| `not-joined` | join 前の操作 | vote, reveal, next-round |
| `message-too-large` | メッセージのバイト数が上限超過 | 全 C→S（[#63](https://github.com/tomohiroJin/tasuki-tools/issues/63)） |
| `server-busy` | ルーム数が上限に達している | create-room（#63） |

`message-too-large` と `server-busy` は**利用者の入力の誤りではなくサーバー側の事情**を表す。
`invalid-message` に畳むと画面の案内が誤りになるため分けている。いずれも接続は維持する。

## 公開に耐えるための防御（#63）

**設定値は環境変数が単一の入口**で、既定値と解釈は `apps/poker-sync/src/config.ts` にまとまっている。
効く位置が層ごとに違うので、下表は**どの段で効くか**を分けて示す。

### スキーマ検証より手前

受信メッセージが `parseClientMessage` に届く前、あるいは接続が成立する時点で効く。

| 防御 | 挙動 |
|------|------|
| Origin 検査 | `ALLOWED_ORIGINS` 以外からの接続を **close 1008**（`Origin not allowed`）。本番で未設定なら起動しない |
| 待ち受けアドレス | 既定 `127.0.0.1` のみ。リバースプロキシを迂回した直接接続は届かない |
| 同時接続数 | 上限超過を **close 1013**（`Server connection limit reached`） |
| フレームサイズ | メッセージ上限の 2 倍を超えるフレームは WebSocket プロトコル層で切断（**1006**。アプリに届かず応答の余地が無い帯域） |
| メッセージサイズ | 上限超過は `message-too-large` を返し**接続は維持**。バイト数で測る |

Origin と接続数の検査は **upgrade を通してから close する**。ハンドシェイクを拒否すると
クライアントには接続失敗としか見えず、理由を表す close コードが届かないため。

### スキーマ検証より後

検証済みのコマンドを処理する段で効く。

| 防御 | 挙動 |
|------|------|
| ルーム数 | 上限超過時は `create-room` に `server-busy`。止めるのは**新規作成のみ**で、既存ルームへの参加は妨げない |

### 受信とは独立

| 防御 | 挙動 |
|------|------|
| 死活監視 | 受信の有無によらず一定間隔で ping を送り、連続で pong が確認できない接続を切断する。切断後は下記「WS 切断」と同じ経路をたどる |

## サーバー内部イベント（メッセージ以外の契約）

| イベント | 挙動 |
|---------|------|
| WS 切断 | participant.connected=false → 全員へ `room-state`。ホストなら繰上（joinOrder 最小の接続中参加者、FR-012）。voting 中は自動公開を再評価（US4-AS1） |
| 接続数 0 | ルームを即時破棄。以後の join-room は `room-not-found`（FR-014） |
| 全員投票成立 | 自動で revealed へ遷移し全員へ `room-state`（FR-008。分母は接続中の全参加者） |
| 死活監視での切断 | 上記「WS 切断」と同じ扱い。半開き接続の参加者が connected のまま残らないようにする（#63） |

## 結合テスト観点（apps/sync, research R7）

契約シナリオの最小セット:

1. create-room → joined + room-state（ホスト 1 人）
2. join-room（2人目）→ 双方に room-state 配信
3. vote（1人）→ 他者の room-state に hasVoted のみ（**生値が含まれないことを検証**）
4. 全員 vote → 自動 revealed + stats
5. reveal（ホスト・投票途中）→ revealed、未投票者は votes に含まれない
6. next-round → voting に戻り票がリセットされる
7. ホスト切断 → 繰上した room-state が配信される
8. token 付き join-room → 票を保持したまま復帰
9. 全員切断 → 再 join が room-not-found
10. 不正メッセージ / 非ホストの reveal → error 応答（接続維持）
