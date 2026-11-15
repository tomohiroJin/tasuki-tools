# #596 補遺: 前提 9 件の移し先と `as T` 23 件・`!` 17 件の仕分け

[`2026-11-13-architecture-review-survey.md`](2026-11-13-architecture-review-survey.md) の節 4.2・4.4 の補遺である（#482-7）。
測ったのは `2026-11-13-architecture-review-survey/c-contracts.mjs`（直す前と後で同じスクリプトを流した）。
**仕分けだけで、ガードを足して振る舞いを変えていない**（ISSUE #596 のとおり）。未検証のものをガードにするかは別に起こす。

## 1. 前提をコメントだけで守っていた 9 件の移し先

| # | 場所 | 前提 | 移し先 | 守るもの |
|---|---|---|---|---|
| 1 | `rate-limit-gate.ts`・`poker-rate-limit-gate.ts` | `now` は単調時計 | **テスト** `test/rate-limit-monotonic-clock.test.ts`（変異 1760・1761） | 壁時計と単調時計は同じ `number` で、ブランド型（ID の型を入れない方針。ADR 0016 の追記は Rejected）は使わない。ゲートへ届く `now` が単調時計の値であること、poker のゲートが時計を 1 判定 1 度だけ読むこと |
| 2 | `room-entry.ts` | 復帰が成立した人を先に通す | **型** `ResumeMiss`（`checkPassphrase` が第 3 引数に要求）＋ `test/room-entry.test.ts`（変異 1762） | `apply-room-level-event.ts` の `StateWithAggregate` と同じ手。復帰の判定を経ずに関門だけを呼ぶ配線は型で止まる（`@ts-expect-error` で見張る） |
| 3 | `poker-handlers.ts` `completeJoin` | socket 登録 → 接続状態 → joined 送信 → 保管と配信 | **テスト** `test/poker/handler-order-contracts.test.ts`（変異 1763・1764） | create・新規 join・復帰の 3 経路で、`joined` が最初の `room-state` より先に届き、その `room-state` が本人を在席で載せる |
| 4 | `poker-handlers.ts` `handleParticipantRemoved` | 名簿を更新し終えた後に呼ぶ | **テスト** 同上（変異 1765） | 幽霊を外した後の `room-state` が幽霊を載せず、保管の名簿へ書き戻さない |
| 5 | `topic-generation.ts` `cancel` | 帳簿を触らない | **テスト** `test/topic-generation.test.ts`（変異 1766） | cancel の前後で保管の値と publish の回数が同じ |
| 6 | `normalize-command-names.ts` | 一覧の正本・失敗は呼び出し側が `INVALID_COMMAND` へ | **テスト** `test/normalize-command-names.test.ts`（一覧と `CommandSchema` の突き合わせ・変異 1767）。失敗の合流は既存の `test/timer-command-receiver.test.ts`・`live-ws.display-name.test.ts` が見ている | 一覧の足し忘れ・腐り |
| 7 | `display-name.ts` | 正規化後は空がありうる。空の可否は呼び出し側で判定する | **テスト** `test/display-name-rule-sources.test.ts`（変異 1768）。空文字になること自体は既存の `packages/room-core/tests/display-name.test.ts` | 判定を持つ `applyDisplayNameRule` が唯一の呼び出し元であること（型は `string` のまま。非空の型は全入口の書き換えが要るので入れない） |
| 8 | `room-removal.ts` | 名簿に人が残るなら輪を空にしない | **テスト** `test/room-removal.test.ts` の全組の数え上げ（名簿 1〜4 人 × 輪の部分集合 × 対象。変異 1769） | 非空の配列型は `timer-core` の全体に及ぶので入れない（`git grep NonEmpty` は 0 件） |
| 9 | `room.ts` | presence の値域に `idle` は無いが wire には残る | **テスト** `packages/timer-core/test/schemas.test.ts`（変異 1770） | ドメインの型の値域は既に狭い（`"online" \| "offline"`）。wire が広いままであること |

## 2. `as T` 23 件の仕分け

走査範囲は `c-contracts.mjs` の `SCAN_PREFIXES`（`packages/*-core`・`protocol`・`sync-client`・`apps/tasuki-sync/src/application`・`ports`）。
**`apps/*-web/src` は範囲外**で、数えていない（#592 の範囲）。件数は ISSUE と一致した（23・17）。
区分: **A 検証済みの付け替え**（直前で検証した・構築した値の型を読み替える）／**B 安全な広げ**（型を広げるだけで実行時の値は変わらない）／**C 未検証**。

| 場所 | 区分 | 理由 |
|---|---|---|
| `apply-room-level-event.ts` 75・84・190 | A | 目印型 `StateWithAggregate` を付ける場所。型の上にしか無い目印で、付けてよいのは `applyEvents` と同じファイルの 3 か所だけ |
| `build-domain-command.ts` 32・37・55 | B | `undefined as X \| undefined`・`null as string \| null`。値は変わらず、後で埋める欄の型を広げる |
| `checkin-handlers.ts` 71 | C | `clear(h)` の `h`（`TimerPort` では `unknown`）を `setTimeout` の戻りの型へ読み替える。`set` が返したものを `clear` へ返す対だが、型に無い。`clearTimeout` は未知の値を黙って無視するので壊れ方は無害。直すなら `TimerPort` を総称にする（別に起こす） |
| `initial-timer-state.ts` 51 | （直した） | `5 as IntervalMinutes` → 型の注釈 `: IntervalMinutes = 5`。リテラル型の和なので `as` は要らず、注釈のほうが 5 が有効値から外れたときに落ちる |
| `log/log-safe.ts` 34・`log/ref-encoder.ts` 34・35 | A | `LogSafe` を付ける場所。`log-hygiene:allow` の宣言つきで、`audit-log-hygiene` が付ける場所を限っている |
| `normalize-command-names.ts` 73（旧 70） | B | `readonly [...] as readonly string[]` で `includes` を呼ぶ |
| `timer-command-receiver.ts` 50 | A | ブランド `TimerCommandReceiver` を付けるのはここだけ（コメントで宣言） |
| `wire-config.ts` 22・27 | A | wire の設定をドメインの設定へ。境界（`CommandSchema`）が検証済みで、型の差は `timer-core/test/wire-types.test.ts` が見る |
| `room-entry.ts` 72（新） | A | `ResumeMiss` の目印を付ける場所（上の #2）。直前の分岐で「成立しなかった」と決まった値にだけ付ける |
| `poker-core/hand-rank.ts` 57 | A | 直前の `ranks.length !== 5` で 5 要素と確かめた |
| `poker-core/protocol.ts` 135 | B | 許可リストの `readonly` 配列を `string[]` として `includes` |
| `roulette-core/limits.ts` 53 | B | 同上 |
| `sync-client/resume-identity.ts` 120 | A | 直前に `typeof value === "object" && value !== null` を確かめ、以降の項目も 1 つずつ型を確かめる |
| `timer-core/break-policy.ts` 34・36 | B | 許可リストの `includes` |
| `timer-core/decide.ts` 411 | B | 許可リストの `includes` |
| `topic-core/fallback.ts` 42 | B | 許可リストの `includes` |

合計: A 11（`room-entry.ts` の新しい 1 件を含む）・B 10・C 1・直した 1 件（`initial-timer-state.ts`）。
**未検証（C）は 1 件**で、`TimerPort` の型消去である。ISSUE の予想より少ない。

## 3. `!` 17 件の仕分け

| 場所 | 区分 | 理由 |
|---|---|---|
| `room-commands/shuffle-order.ts` 17（2 件）・`poker-core/card-game.ts` 171（2 件） | A | Fisher–Yates。`i` は `arr.length - 1` から 1、`j = randomInt(i + 1)` で 0〜i。添字は必ず範囲内 |
| `room-commands/shuffle-order.ts` 46 | A | `others` は現在位置を除いた添字の列で、`order` を組む位置の数と同じだけ引く（現在位置の分は引かない） |
| `agenda-core/agenda.ts` 90 | A | 直前に `nextIdx === -1` を返しているので、ここの `nextIdx` は範囲内 |
| `agenda-core/agenda.ts` 170 | A | 直前に `idx === -1` を返している |
| `poker-core/card-game.ts` 90 | A | 山札が足りなければ捨てた札を混ぜて、`deck.length >= drop.size` にしてから引く |
| `poker-core/estimate-log.ts` 68・69 | A | `while (... && rest.length > 0)` の中 |
| `poker-core/spread.ts` 35・36 | A | `highStep`・`lowStep` は `NUMBER_CARD_VALUES.indexOf(値)` で、値は型が `NumberCardValue`（その表の要素）。境界の検証（札の型）に依る |
| `room-core/display-name.ts` 218・219 | A | `from`・`to` は `view` の UTF-16 単位ごとに 1 つずつ積む。コメントに根拠（#364） |
| `room-core/participant-label.ts` 50 | A | `lookAlike.length === 1` の直後 |
| `timer-core/evolve.ts` 503 | A | 直前に `isPermutation(order, oldRotation.length)` を確かめた |
| `topic-core/fallback.ts` 36 | A | `pool` は `remaining` が空なら `candidates`、`candidates` は絞った結果が空でなければそれ、空なら `TOPIC_BANK`（非空の定数）。`pool.length > 0` |

合計: A 17・C 0。**`!` に未検証は無かった。**

## 4. 検査の強化（#587 節 8 の 5）

`scripts/audit-domain-side-effects.mjs` に「最上位の `const` の可変な `Map` / `Set`」を足した（`ReadonlyMap`・`ReadonlySet` の型の定数の表は対象外）。
例外は `ALLOWED_TOP_LEVEL_MUTABLE` に理由つきで持つ。いまの例外は `packages/room-core/src/display-name.ts` の `skeletonCache` の 1 件だけで、
実物から宣言が消えたら検査が赤くなる（腐った例外を残さない）。変異 1771〜1774 が検査の性質を守る。
