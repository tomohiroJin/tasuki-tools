# ADR-0001: poker のドメインは直接遷移関数 ＋ Result を採る

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング）/
  [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（ドメインの表現は選択制とし、揃える点を定める。本 ADR はその決定 1 に基づく記録）/
  [`docs/adr/0005`](../../adr/0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準）

## 背景

`docs/adr/0016` の決定 1 は、ドメインの表現として Decider（`decide` / `evolve`）と
直接遷移関数 ＋ `Result` のどちらを採ったかを、アプリ固有の ADR へ記録することを
MUST としている。poker はこれまで ADR を 1 本も持っていなかった。

## 決定

**poker のドメイン（`packages/poker-core`）は、直接遷移関数 ＋ `Result` を採る。**

`castVote(room, participantId, card): Result<Room, RoundError>` のように、
現在の状態と入力から次の状態を直接返す。イベント型を挟まない。

**根拠**（2026-08-17 実測）:

- ドメインは 462 行 / 7 ファイルで、状態遷移関数は 8 つである（`round.ts` の `castVote`
  `applyAutoReveal` `revealBy` `nextRound`、`room.ts` の `createRoom` `joinRoom`
  `markDisconnected` `markConnected`。`shouldAutoReveal` `isValidName` は判定述語、
  `findParticipantByToken` は問い合わせで、いずれも状態を返さない）。
- **イベントの履歴・再生・段階適用の要求が現に無い。** 状態同期は
  スナップショット方式で、サーバーはルーム全体を配信して受信側が丸ごと置き換える。
- したがって Decider の導入は `docs/adr/0007` の基準 3（デザインパターンは、
  変更が現に困難になっている実需があるときに限る）を満たさない。

## 影響

- `docs/adr/0016` の決定 2（どちらを採っても必ず揃える点）は本 ADR とは独立に効く。
  poker が未達の項目（`index.ts` の `export *`、エラー型が文言を同梱している点）は
  [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の E6・E2 で解消する。
- **将来、イベントの履歴・再生が要るようになったら本 ADR を `Superseded` にする。**
  そのときは Decider への移行を新しい ADR で決める。
- 本 ADR の時点ではコードを変更しない。
