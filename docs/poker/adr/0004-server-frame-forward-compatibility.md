# ADR-0004: `joined` / `room-state` も前方互換にする

- **ステータス**: Accepted（2026-08-31）
- **関連**: [#216](https://github.com/tomohiroJin/tasuki-tools/issues/216)（本 ADR の作業。
  [#214](https://github.com/tomohiroJin/tasuki-tools/issues/214) からの切り出し）/
  [`0003`](./0003-error-frame-forward-compatibility.md)（`error` 側の決定）/
  [`0002`](./0002-discarded-frame-disclosure.md)（捨てたことの告知）/
  [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界検証）

## 背景

[`0003`](./0003-error-frame-forward-compatibility.md) は `error` フレームだけを前方互換にし、
`joined` / `room-state` は「画面の描画に使う値を運ぶため、`error` とは別に計るべきもの」
として据え置いた。その判断を確かめる。

**`room-state` を捨てると、画面は生きて見えたまま古い状態で固まる**（[`0002`](./0002-discarded-frame-disclosure.md) 背景）。
投票が反映されない・他人の参加が見えない、という形で現れる。`0002` の `stale` 告知は
「黙って壊れる」のを防ぐが、**復旧はしない**。

### 実測（2026-08-31）

余剰キーを足す層を変えて、どこで捨てるかを測った。

| 余剰キーを足す層 | poker（本 ADR 以前） | timer |
|---|---|---|
| ① `room-state` 直下 | **捨てる** | 通る |
| ② `participants[]` の要素 | **捨てる** | 通る |
| ③ `round` | **捨てる** | 通る |
| ④ `round.stats` | **捨てる** | 通る |
| ⑤ `round.votes[]` の要素 | **捨てる** | 通る |
| ⑥ `card`（`yourVote`） | **捨てる** | 通る |
| ⑦ `joined` 直下 | **捨てる** | 通る |

**poker は 7 層すべてが `v.strictObject` で、timer は `v.strictObject` を 1 つも使っていない。**
トップだけを緩めても前方互換にはならない。

### #216 の本文にあった誤り

「timer の『v2 追加フィールドは `v.optional` で任意化』という前例を poker にも規約として
持たせるか」という論点を挙げていたが、**成立していない。**

**`v.optional` は前方互換を与えない。** あれは「**新しい**クライアントが**古い**サーバーの
フレームを受ける」ための後方互換の道具である。ここで要るのは逆向き
（**古い**バンドルが**新しい**フレームを受ける）で、それには非 strict しかない。

## 決定

**`card` を除くサーバー→クライアントのスキーマを `v.object` にする。**

### 1. 緩める 7 箇所

`joined` / `room-state`（`ServerMessageSchema` の枝）、`ParticipantViewSchema`、
`StatsSchema`、`RoundViewSchema` の 2 枝（`voting` と `revealed`）、`votes[]` の要素。

**`RoundViewSchema` は枝が 2 つある。** 片方だけを緩めても、もう片方が捨てる。
**ルームは公開前のほとんどの時間を `voting` で過ごす**ので、そちらを落とすと
本番では常時「画面が固まる」側になる。

**共有スキーマを分ける必要はない。** `ClientMessageSchema` が使っている入れ子は
`NameSchema` と `CardSchema` だけで、上の 4 つは**サーバー→クライアント専用**である。

### 2. `CardSchema` は `v.strictObject` のまま

**カードは値の集合そのものが契約である。** 新しい `kind`（例: T シャツサイズ。
[#92](https://github.com/tomohiroJin/tasuki-tools/issues/92)）を足しても、
`v.variant('kind', …)` が枝を知らないので落とす —— **緩めても前方互換にはならない。**
得るものが無いのに、`vote` と共有している以上、緩めれば**外部入力の検証まで緩む。**

これは `0003` 決定 1 が `code` を非空文字列にしたのとは事情が違う。あちらは
「未知の値でも `message` を出せば用が足りる」が、**カードは値を知らなければ描けない。**

> **判別子の枝は、どれも前方互換にできない。** これは `card` に限った話ではない ——
> `ServerMessageSchema` の `type`、`RoundViewSchema` の `status`、`CardSchema` の `kind` の
> **3 つとも `v.variant`** で、知らない値が来ればフレームごと捨てる（2026-08-31 に実測）。
> `v.strictObject` を緩めても、この 3 つは変わらない。**「新しい値」を足す変更は、
> 「新しいフィールド」を足す変更とは別物として設計すること。**

### 3. `ClientMessageSchema` とその枝は `v.strictObject` のまま

**外部入力である。** 受信を広げるのは古いバンドルを守るためであって、
サーバーがブラウザからの入力を広く受ける理由は無い（`0003` 決定 4 と同じ立場）。

### 4. 未知のキーは画面へ運ばない

`v.object` は宣言していないキーを**出力から落とす**。画面へ渡るのは検証済みの
フィールドだけで、`RoomStateMessage` の型も変わらない（`v.InferOutput` は宣言した
キーのみを見る）。**憲法 原則 IV の「境界で検証する」は保たれる** —— 原則 IV が
求めるのは検証の実施であって、未知キーの拒絶ではない。

**これを検査で固定する。** 「通る」だけを見て「何が通ったか」を見ないと、
将来 `v.looseObject`（未知キーを出力に残す）へ書き換えられても気づけない。

## 影響

- `packages/poker-core/src/protocol.ts` の 7 箇所が `v.strictObject` → `v.object`。
  **型は変わらない**ので、`apps/poker-web` と `apps/poker-sync` の製品コードは変わらない。
- `0003` の「残っている問題」の 1 つ目（`joined` / `room-state` は前方互換ではない）が解消する。
- `docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md` の
  「受信は広く、送信は狭く」を `joined` / `room-state` を含む形に直す。
- **`0002` 決定 2 の実測表は、サーバー→クライアントについては全行が再現しなくなる。**
  表の 3 行はいずれも「正しい `room-state` ＋ 余剰キー」で、本決定の後は棄却されない。
  `0002` に注記を入れる（**表と結論はそのまま残す** —— 当時それが判断を誤らせた事実は
  記録として要る）。
- **[`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md) の
  「poker の契約が `v.strictObject` で」という理由づけが、サーバー→クライアントについて
  成り立たなくなる。** 同 ADR に注記を入れる。**結論（poker は経路で選り分けない）は
  変わらない** —— 経路の名前空間が宣言済みの項目に閉じていないことは `v.object` でも同じで、
  そもそも捨てる場面自体が狭まったためである。
- `docs/poker/adr/README.md` の一覧に `0003`（#214 で漏れていた）と `0004` を足す。
- 公開 URL・プロトコル・正常時の画面の挙動は変えない。

## 残っている問題（本決定の範囲外）

- **判別子に新しい値が増えると、古いバンドルはフレームを捨てる。** 決定 2 のとおり
  `v.variant` の枝は前方互換にできず、対象は `card.kind` だけでなく `round.status` と
  フレームの `type` も含む。T シャツサイズ（#92）や新しいラウンド状態を入れるときは、
  **古いバンドルが何を見るか**を設計の一部として決めること（`0002` の `stale` 告知は出る）。
