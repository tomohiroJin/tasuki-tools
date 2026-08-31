# ADR-0002: 契約に合わないサーバーメッセージを捨てたことを利用者へ伝える

- **ステータス**: Accepted（2026-08-31）
- **関連**: [#212](https://github.com/tomohiroJin/tasuki-tools/issues/212)（本 ADR の作業。
  [#209](https://github.com/tomohiroJin/tasuki-tools/issues/209) からの切り出し）/
  [`docs/timer/adr/0006`](../../timer/adr/0006-result-and-boundary-validation.md)（timer 側の同じ決定）/
  [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/adr/0012`](../../adr/0012-logging-secrets-and-disclosure.md)（ログ衛生）

## 背景

`apps/poker-web/src/hooks/useSync.ts` は `parseServerMessage` に落ちたフレームを
画面へ渡さず捨てる（憲法 原則 IV）。**捨てること自体は正しいが、捨てたことが
利用者にも開発者にも一切伝わらなかった**（`return` するだけで、`console` すら無かった）。

`room-state` を捨てる状況は継続しうる。契約に合わない値はサーバー側のルームに
残り続けるため、以後すべての `room-state` が捨てられ、**画面は生きて見えたまま
古い状態で固まる**。投票したのに反映されない・他人の参加が見えない、という形で現れ、
再接続もエラー表示も起きないので、利用者には「なぜか更新されない」としか分からない。

timer 側は #181 → #209 で同じ穴を塞いだ。本 ADR はその poker 版だが、**実測した条件が
3 つ違ったので、決定も 3 つ違う**（後述）。

## 決定

**接続の告知（`connection-notice.ts`）に 3 つ目の種別 `stale` を足す。**
文言は「同期できていません。表示が最新でない可能性があります。」

### 1. 表出の面は既存の告知バナー

`App.tsx` は告知バナーを**ページの外側**に描いており、TopPage でも RoomPage でも出る。
そのため **timer で必要だった「表示する場所が無い画面での補い」は要らない**
（timer は `StatusStrip` が入室後にしか描画されず、最初の `snapshot` を捨てると
何も出せなかった）。

接続が切れているときは、そちらの告知を優先する。同期が古いのは切断の結果でもあり、
再接続すれば新しい `room-state` が届いて解消しうる。**原因の取り違えは、利用者を
無関係な対処へ誘導する。**

### 2. 立てるのは「画面を古くする棄却」だけ。判定は検証器の診断で行う

`apps/poker-web/src/sync-staleness.ts` の `indicatesStaleState` が、
`ProtocolError.paths`（落ちた項目の経路）から判定する。
**フレーム自身が名乗る `type` は使わない** —— それは契約検証に落ちた値であり信頼できない。
経路はスキーマ自身の診断なので、送り手の意図で曲げられない。

サーバー → クライアントは `joined` / `room-state` / `error` の 3 種しかなく、
**捨てて実害が出ないのは `error` だけ**である（`room-state` を捨てれば画面が固まり、
`joined` を捨てれば入室が成立しない）。そこで **`error` 固有の項目
（`code` / `message`）だけで落ちたときに限って一過性とみなし、それ以外はすべて
「古くなる」側へ倒す。** この向きにすると、知らない経路が来たときに安全側へ倒れる。

経路の実測（2026-08-31・`ServerMessageSchema`）:

| 捨てたフレーム | 経路 | 画面は古くなるか |
|---|---|---|
| 壊れた `room-state` | `participants.0.name` / `round.status` など | する |
| 壊れた `joined` | `token` / `roomId` / `participantId` | する |
| 余剰キーのあるフレーム | そのキー名（例: `evilKey`） | する（判別できない） |
| 素の数値・`null`・JSON として読めない | `<root>` | する（同上） |
| 配列・`type` 欠落・未知の `type` | `type` | する（同上） |
| 壊れた `error` | `code` / `message` | しない |

**一過性で立てないのは、一度立てると下りないからである。** `apps/poker-sync` に
定期的な `room-state` 配信は無く（`broadcastSnapshot` の呼び出しはコマンド処理と
接続の増減のみ）、次に誰かが操作するまで解除の機会が来ない。

### 3. 解除は有効な `joined` / `room-state` を受け取ったときだけ

画面が実際に新しい状態を得た瞬間に限る。**timer で必要だった点滅対策は要らない** ——
poker-sync の死活監視は **WS の制御フレーム `ping`** で、データフレームは流れない
（timer は `time.pong` がデータフレームとして 10 秒ごとに届くため、
「有効なフレームで解除」にすると必ず点滅した）。

### 4. 開発者向けの記録に、落ちた項目の経路は出さない

`console.warn` は**分類（画面が古くなる／一過性）だけ**を出す。
**poker の契約は `v.strictObject` なので、送り手が付けた未知のキー名がそのまま
経路に載る**（実測: 余剰キー `evilKey` が経路に現れる）。これはサーバー由来の
未検証テキストであり、devtools とはいえ出す理由がない。
timer は `v.object` で未知キーを捨てるため経路が必ずスキーマ由来で、そちらは経路を出している。

### 5. 再読込の導線は置かない

継続する棄却の原因はサーバー側のルームに残った契約違反の値なので、**再読込しても
直らない**。「再読み込みしてください」は嘘の導線になる。文言は起きていることだけを述べる。

## 影響

- `packages/protocol` の `BoundaryError` と `packages/poker-core` の `ProtocolError` に
  `paths` を足した（**加算のみ**。既存の消費者は `stage` / `code` / `message` しか読まない）。
  **サーバーの応答には載らない** —— `apps/poker-sync/src/adapters/ws-adapter.ts` は
  `code` と `message` だけを取り出して返す。
- `apps/poker-web/src/hooks/useSync.ts` を `scripts/audit-log-hygiene.mjs` の
  `ALLOWED_FILES` へ加えた（ブラウザの `console`。ADR 0012 D1 が対象外と決めている領域）。
- 検査は `e2e/specs/poker.spec.ts` の `local` 専用シナリオが持つ。`page.routeWebSocket()` で
  実際に壊れた `room-state` を流し、**製品コードにテスト用の経路は作らない**。
  配線を切って対照実行し、落ちることを確かめた。
- 公開 URL・プロトコル・正常時の画面の挙動は変えない。
