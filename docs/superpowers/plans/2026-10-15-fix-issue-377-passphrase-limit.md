# #377 room.join の合言葉の長さの上限が入口ごとに違う 実装計画

**Goal:** どの入口の `room.join` でも、同じ上限で合言葉の長さを確かめ、超えたら同じエラーコード（`INVALID_COMMAND`）で断る。上限の定数は 1 か所に置く。

**Architecture:** 上限 `MAX_PASSPHRASE`（128）を `packages/timer-core/src/aggregate.ts` から `packages/room-core/src/passphrase.ts` へ移す。玄関の `HubCommandSchema`（topic・roulette の接続も通る）はそれを `v.maxLength` で使う。timer の wire スキーマは形だけを見て、上限は合成ルートの `apps/tasuki-sync/src/application/passphrase-rule.ts` が timer の受け口（`timer-command-receiver.ts`）で当てる。

## 前提の実測

- 玄関・topic・roulette の入口は 129 字の合言葉を比べる処理まで通し、`PASSPHRASE_MISMATCH` を返していた（`test/live-ws.passphrase-limit.test.ts` の赤で再現）。timer は wire スキーマで `INVALID_COMMAND`。
- 作成時の上限: 合言葉を掛けるのは timer の `room.passphrase.set` だけで、そこは 128 の上限で確かめていた。玄関の `room.create` は合言葉を受け取らない。したがって **128 字を超える合言葉のルームは存在しえない**。上限を 128 にそろえても、入れなくなる人はいない。
- poker の `join-room` は合言葉を受け取らない（合言葉つきのルームには復帰でしか入れない）。

## 決めること

- 上限 → **128 にそろえる**（上の実測のとおり、既存のルームに影響しない）。
- 定数の置き場 → **`room-core`。** 合言葉はルームへの入室を守るもので、メンバーシップ文脈の規約である（表示名の `MAX_DISPLAY_NAME` と同じ）。
- `timer-core` がそれを使う形は **`docs/adr/0017` 決定 4 に合わない。** `timer-core` の許可表は `[]` で、`room-core` への依存は #95 S4b で期限つきの一時依存として外したもの。そこで表示名と同じく、timer の wire スキーマは形だけを見て、上限は合成ルート（`apps/tasuki-sync`。両方の文脈に依存してよい唯一の層）で当てる。超過は timer の wire スキーマが落としていたときと同じ `INVALID_COMMAND`（同じ文言）で返るので、timer の利用者が受け取るフレームは変わらない。
- `room.passphrase.set` にも同じ規則を当てる（上限の正本を動かしたので、掛けるときの上限も同じ場所から取る）。timer-web の合言葉の欄（`PassphrasePanel.tsx`）も `@tasuki/room-core` の値を使う（timer-web は room-core に依存してよい）。
- 玄関の合言葉の欄（`apps/landing/src/screens/JoinRoom.tsx`）にも同じ `maxLength` を掛ける。上限を掛けた後に欄だけ上限なしだと、長い合言葉を貼った人は「コマンドの形式が不正です」で断られ、理由を知る手段が無い（表示名の欄と同じ理由）。

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 実 WS 越しに 129 字で玄関・topic・roulette から参加すると通ってしまう赤を見てから直した |
| II. 技術選定は ADR を通す | 該当なし | 技術・依存を足さない。依存の許可表も広げない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態に触れない |
| IV. 境界の型安全 | 通過 | 同じ `room.join` の契約を入口によらず同じにする。上限ちょうどは比べる処理まで届くことも固定した |
| V. 実画面検証 | 通過 | 実プロトコル（実 WS）で 4 つの入口を確かめた。画面の欄の上限は 128 のまま |
| VI. 依存は内向き | 通過 | `audit-dependency-direction.mjs` が許可表を広げずに緑。timer-core は @tasuki/* に依存しないまま |
| VII. 検査は壊して確かめる | 通過 | 変異 m262（玄関の上限がずれる）・m263（timer の受け口が規則を当てない）・m264（掛けるときに上限を見ない）・m266（玄関の欄に上限を掛けない） |
| VIII. 記録が正本 | 通過 | 上限の正本を 1 つにし、移した理由と置き場を timer-core のコメントに残す |
| IX. 小さく回す | 通過 | #375・#378 と同じ PR だが、Issue ごとにコミットを分けた |
| X. 抽象は実需で | 通過 | 表示名と同じ置き方を踏襲し、新しい仕組みを作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | 合言葉そのものはログにもテストの出力にも出さない |

**逸脱なし。**

## 検証の実行時間の見積もり

| コマンド | 見積もり |
|---|---|
| `bun test`（tasuki-sync 全体） | 約 1〜2 分 |
| room-core・timer-core・timer-web の test・typecheck・lint | 約 2 分 |
| `node scripts/mutation-check.mjs --id 262,263,264` | 約 30 秒 |
