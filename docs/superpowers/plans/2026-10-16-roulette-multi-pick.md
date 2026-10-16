# ルーレットで 2 人以上を選ぶ（#401 のうち複数人決定）— 実装計画

- **設計正本**: [`docs/superpowers/specs/2026-10-16-roulette-multi-pick-design.md`](../specs/2026-10-16-roulette-multi-pick-design.md)（以下「spec」。決定 M・EARS E・質問 Q の番号はそこにある）
- **日付**: 2026-10-16・**実測時点**: main `0b9680f8`
- **型にした先例**: [#94 の実装計画](./2026-10-12-facilitator-roulette.md)（タスクの書き方・変異の当て方・統括と実装役の分担）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。設計正本の番号（M・E）で根拠を指す。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが「先に書く赤いテスト」から始まる。角度のオラクルは実装と別の計算（`atan2` で席を引く）で組む（spec §8.2 の E8） |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存・文脈・技術を足さない。決定は ADR 0026 への追記に留める（spec §9） |
| III. 揮発インメモリと単純運用 | 通過 | 選ぶ人数はルームの揮発メモリに置き、再起動で 1 に戻る。回転をまたぐ途中経過を持たない（spec §5.4） |
| IV. 境界の型安全 | 通過 | 新しいコマンドは `v.strictObject`・整数 1〜4。フレームの新しい項目は `v.optional` で非 strict（spec §5.3） |
| V. 実画面検証 | 通過 | k = 1 の撮影の前後比較と、k = 2〜4 を 4 つの幅で撮る（タスク 2.8・spec §8.4）。撮影は統括 |
| VI. 依存は内向き | 通過 | `roulette-core` の依存は変えない。web は今と同じく core の純粋関数に聞く |
| VII. 検査は壊して確かめる | 通過 | spec §8.3 の 9 本の変異を 1 本ずつ当てて赤を見る。全件は統括 |
| VIII. 記録が正本 | 通過 | 決定は ADR 0026 の追記、設計と実測は設計正本、実装で外したことは設計正本へ戻す |
| IX. 小さく回す | 通過 | PR を 2 本に分け（下の §0）、配布は最後に 1 回 |
| X. 抽象は実需で | 通過 | 「モード」の列挙を作らず、選ぶ人数 1 つの値で表す（spec M1）。新しい UI 部品を作らず、既存の副のボタン ＋ `aria-pressed` を使う（spec §6.4） |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しいログを足さない。結果の名前をログへ出さない（#94 spec R13 のまま） |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 0. この計画の読み方と取り決め

- **着手の前提**: spec §10 の Q1〜Q6 に利用者の答えがあること。推奨と違う答えなら、spec を直してからこの計画を直す
- **PR は 2 本**（`docs/guides/pr-granularity.md` の「危険度の異なる変更が混ざっている」）
  1. **PR 1 — core ＋ 同期サーバー ＋ wire**（spec §5）。web は古いまま動く（spec §5.3 の窓 1）。利用者に見える変化は無い
  2. **PR 2 — 画面と演出**（spec §6）。**モックの承認（タスク 2.0）の後に着手する**。見た目の判断と往復をこの PR に集める
- 各タスクは**テストファースト**: 赤を見てから実装し、緑にする
- **k = 1 の回帰を最優先で守る**（spec M11・E7）: #94 の単体・E2E のテストファイルは**期待値を書き換えない**。書き換えが要るなら、それは k = 1 の振る舞いを変えたということなので、手を止めて統括に報告する
- 変異の ID は**統括が割り当てる**（現在の最大は 282）。パッチの 1 行目・ファイル名・宣言の形は #94 の計画 §0 と同じ。**`git checkout -- <file>` で戻さない**（`git apply -R` で戻す）
- **E2E と変異の全件、撮影、`pnpm dev` は統括が直列に流す。** 実装役は E2E の spec を書くが打たない
- 文言は **spec §6.5 の表からだけ**取る。足す・変えるなら `outsideBase`（`apps/topic-web/tests/support/font-base.ts`）に当ててから
- コミットはタスクごと。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない（#401 は他の候補が残る）
- PR を作ったら `/code-review <番号>` を流す（統括）

## 1. 検証の実行時間の見積もり

**見込みである。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回 | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/roulette-core test` | 1.x の各タスク | 20 秒 | 10 | 4 分 |
| `pnpm --filter @tasuki/sync test -- <ファイル>` | 1.4・1.5 | 30〜60 秒 | 8 | 6 分 |
| `pnpm --filter @tasuki/roulette-web test` | 2.x の各タスク | 30 秒〜1 分 | 25 | 20 分 |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | 各 PR の終わり | 10〜15 分 | 2 | 30 分 |
| scripts の自己テスト ＋ 全 audit | 各 PR の終わり | 2〜3 分 | 2 | 6 分 |
| 自分の変異を 1 本ずつ当てて赤を見る | 変異を足すタスク | 1〜2 分 | 9 | 15 分 |
| **モックと利用者の承認（統括）** | 2.0 | 1〜2 時間 | 1〜2 往復 | 2〜4 時間 |
| **変異の全件（統括）** | 各 PR の前 | 60〜90 分 | 2 | 2〜3 時間 |
| **E2E の全件（統括）** | PR 2 の前 | 25〜40 分 | 2 | 1〜1.5 時間 |
| **実画面検証と撮影（統括）** | PR 2 | 1.5〜2 時間（k = 1 の前後比較を含む） | 1 | 2 時間 |
| **合計の見込み** | | | | **約 8〜11 時間**（見た目の直しの往復は含めない） |

## 2. PR 1 — core ＋ 同期サーバー ＋ wire

### タスク 1.1 定数と長さ

- **変えるファイル**: `packages/roulette-core/src/limits.ts`（`MAX_PICK`・`STOP_HOLD_MS`・`NEXT_MOVE_MS`・`spinDurationMs`）
- **先に書く赤いテスト**: `tests/limits.test.ts` に —— `spinDurationMs(1) === SPIN_DURATION_MS`（**k = 1 で今と同じ**）・`spinDurationMs(4) === 4000 + 3 * (STOP_HOLD_MS + NEXT_MOVE_MS)`・`MAX_PICK === 4`
- **確かめる**: `pnpm --filter @tasuki/roulette-core test`

### タスク 1.2 k 人の抽選（`drawPicks`）

- **変えるファイル**: `packages/roulette-core/src/draw.ts`
- **先に書く赤いテスト**: `tests/draw-picks.test.ts`（**`draw.test.ts` は触らない**）。`randomInt` は常に 0 を返す偽物と記録する偽物
  - 入る人 [A,B,C,D]・k = 2・`drawn = []` → 2 人は互いに異なる。`drawn` は 2 人
  - 入る人 [A,B,C]・k = 2・`drawn = [A]` → B, C（周の残りでちょうど足りる）
  - 入る人 [A,B,C]・k = 2・`drawn = [A,B]` → 1 人目 C。2 人目は周を閉じて引き、C ではない。`drawn` は新しい周の 1 件だけ〈変異: 周を閉じた後に今回の人を除かない〉
  - 入る人 [A,B,C]・k = 2・`drawn = [A,B,C]`・直前の picks [A,B] → 1 人目は C（直前の 2 人を除く）。2 人目は A か B（**除くと足りないので今回の人だけを除く**・spec M8）〈変異: M8 の落とし先を外す〉
  - 同じ回転の中で同じ人が 2 度出ない（`randomInt` が常に 0 でも）〈変異: 今回の人を候補から除かない〉
  - **k = 1 の一致**: 入る人 2〜6 人・`drawn` の全部分集合・直前の当たりの全通りで、`drawPicks(…, 1, …)` と `drawWinner` の結果が同じ（表で回す）
- **確かめる**: 同上

### タスク 1.3 状態と遷移（`pickCount`・`setPickCount`・`startSpin`・`toView`）

- **変えるファイル**: `packages/roulette-core/src/{types.ts,roulette.ts,errors.ts,error-messages.ts}`
- **先に書く赤いテスト**: `tests/roulette-multi-pick.test.ts`（**`roulette.test.ts` は触らない**）
  - `INITIAL_ROULETTE_STATE.pickCount === 1`・凍結されている
  - `setPickCount`: 0・5・1.5 は `INVALID_PICK_COUNT`・1 と 4 は通る・同じ値は同じ参照〈変異: 5 を通す〉
  - `startSpin`（k = 3）: 入る人 3 → `ROULETTE_TOO_FEW_FOR_PICK`・4 → 通る〈変異: 下限を 2 にする〉。k = 1 で入る人 1 → 今と同じ `ROULETTE_TOO_FEW`
  - `picks.length === pickCount`・`winnerIndex === picks[0].index`・`settle === picks[0].settle`・各 `settle` が範囲内（`randomSettle` が k 回呼ばれる）
  - 回転中の判定: k = 3 の回転の `spinDurationMs(3) − 1` ms 時点は `ROULETTE_SPINNING`、ちょうどの時点は回せる〈変異: 4000 で切る〉
  - 回転中に `setPickCount` しても `lastSpin` は変わらない（spec E6）
  - `toView`: `pickCount` と `spin.picks` が載る・`durationMs === spinDurationMs(k)`
  - 文言: 新しい 2 つのコードに文言があり、base 層に収まる（既存の `error-messages.test.ts` が全コードを回すので、コードを足すだけで赤になることを先に見る）
- **確かめる**: 同上 ＋ `node scripts/audit-domain-error-shape.mjs`・`node scripts/audit-domain-side-effects.mjs`

### タスク 1.4 wire のスキーマ

- **変えるファイル**: `packages/roulette-core/src/schemas.ts`・`src/index.ts`
- **先に書く赤いテスト**: `tests/schemas.test.ts` に足す —— `roulette.pick.set` の 1・4 が通り、0・5・1.5・`"2"`・余剰の項目が落ちる。フレームは `pickCount`・`picks` が**無くても**通る（古いサーバー）・あっても通る
- **確かめる**: 同上

### タスク 1.5 同期サーバー

- **変えるファイル**: `apps/tasuki-sync/src/application/roulette-handlers.ts`（`roulette.pick.set` の分岐）
- **先に書く赤いテスト**: 同期サーバーのルーレットの単体（#94 のファイルに並べる）
  - `pick.set` が全接続へ配られる・途中参加の接続に `pickCount` が届く
  - 範囲外は `INVALID_PICK_COUNT` のエラーフレームで、状態が変わらない
  - k = 3 で回し、偽の単調時計で 5000ms 進めても次の `spin` は `ROULETTE_SPINNING`。`spinDurationMs(3)` 進めると回せる
  - ルーレット以外の接続から `pick.set` を送ると拒否される（#94 E9 の表に 1 行足す）
- **確かめる**: `pnpm --filter @tasuki/sync test -- <ファイル>` ＋ 全 audit

### タスク 1.6 文書（PR 1 の分）

- ADR 0026 に追記（spec M1〜M9。**PR 1 が入れたのは core と同期サーバーまで**と書く）
- `deploy/roulette/NOTES.md` に配布の窓 1・2（spec §5.3）
- **PR 1 の終わりに**: `pnpm typecheck`・`pnpm lint`・`pnpm test`・scripts の自己テスト・全 audit。統括が変異の全件

## 3. PR 2 — 画面と演出

### タスク 2.0 モック（統括・コミットしない）

- `scratchpad/roulette-mock/` の 3 版を写し、k = 2・3・4 を足す。**k = 1 はモックの中でも 3 版と並べて差が無いことを見せる**
- 見せるもの: 脇の「選ぶ人数」・組の札（4 行ぶんの背）・続けて止まる動き（`STOP_HOLD_MS`・`NEXT_MOVE_MS` をモックの上で調整できるようにする）・320×640 と 1440×900
- **利用者の承認を得てから 2.1 に入る**。承認で変わった値は spec §6 に戻す

### タスク 2.1 フレームの読み取り

- **変えるファイル**: `apps/roulette-web/src/server-message.ts`・`roulette-view.ts`
- **先に書く赤いテスト**: `picks` の無いフレームを `[{ index: winnerIndex, settle }]` として読む・`pickCount` が無ければ 1
- **確かめる**: `pnpm --filter @tasuki/roulette-web test`

### タスク 2.2 止まる時刻と角度（純粋関数）

- **変えるファイル**: `apps/roulette-web/src/wheel-motion.ts`（`stopsOf`・区間ごとの `angleAt`）
- **先に書く赤いテスト**: `tests/wheel-motion.test.ts` に足す（**今の行は変えない**）
  - k = 1: 新しい `angleAt` の値が今の `angleAt` と全経過で一致（0〜4000ms を 50ms 刻み）
  - k = 2〜4: 各止まる時刻で、指し針の下の席が `picks[i].index` で、席の中の位置が `settle`。**オラクルは指し針の点を回転子の座標へ戻して `atan2` で引く**（#94 spec §6.9 の別の計算）
  - 開始角 4 点・指し針 2 か所で、止まる席が開始角に依らない
  - 区間の境目で角度が跳ばない（境目の前後 1ms の差が小さい）
- **確かめる**: 同上

### タスク 2.3 局面（`revealedCountOf`）

- **変えるファイル**: `apps/roulette-web/src/roulette-view.ts`（`revealedCountOf`・`phaseOf`・`peopleOf`・`captionOf`・`winnerOf` → `revealedPicksOf`）
- **先に書く赤いテスト**: `tests/roulette-view.test.ts` に足す
  - 各止まる時刻の前後 10ms を刻み、`revealedCount`・一言・一覧の「選ばれた」・一周の数が**毎回同じ局面**（spec E9）〈変異: 1 区間ずれる〉
  - 回っている間、まだ止まっていない人は「選ばれた」に出ない・一言に名前が出ない
  - 結果の一言は最後の人が止まってから「選ばれたのは A さん、B さんです」
  - 動きを減らす設定で `revealedCount === k`（spec E10）
  - 入る人が足りない k: 一言が「{k+1} 人から回せます」・回すが `disabled`
- **確かめる**: 同上

### タスク 2.4 文言

- **変えるファイル**: `apps/roulette-web/src/copy.ts`（spec §6.5 の表の k ≥ 2 の列）
- **先に書く赤いテスト**: 既存の `copy-fits-font-base.test.ts` が新しい文言を拾うこと（関数は仮の名前と k = 2・4 で呼ぶ）
- **確かめる**: 同上

### タスク 2.5 選ぶ人数の切り替え（脇）

- **変えるファイル**: `apps/roulette-web/src/components/PeoplePanel.tsx`（または新しい `PickCountPicker.tsx` を `PeoplePanel` の見出しの直下に置く）・`hooks/use-roulette-sync.ts`（`setPickCount`）・`index.css`
- **先に書く赤いテスト**: `tests/roulette-room.test.tsx` に足す
  - 4 つのボタンがあり、いまの値だけ `aria-pressed="true"`・並びに「選ぶ人数」の名前
  - 押すと `roulette.pick.set` が送られる
  - 回っている間・切断中は `disabled`（spec E12）
- **CSS の約束**: 1 行目にラベル、2 行目にボタンの並び（常に 2 行・spec §6.4）。色・枠は部品が持ち、画面は並びだけを書く
- **確かめる**: 同上 ＋ `node scripts/audit-ui-components.mjs`

### タスク 2.6 円盤と札

- **変えるファイル**: `components/Wheel.tsx`（`winnerIndex` → 決まった席の集合）・`wheel-view.ts`・`components/Stage.tsx`（`data-pick`）・`components/ResultCard.tsx`（組の札の分岐）・`hooks/use-wheel-rotation.ts`（寄せるのは最後の人が止まったとき）・`index.css`
- **先に書く赤いテスト**:
  - `tests/wheel.test.tsx`: 決まった席だけが `wheel-segment--winner`。送っている間も前の人の席は真鍮のまま
  - `tests/result-card.test.tsx`: **k = 1 の DOM が今と同じ**（スナップショットではなく、要素とクラスの列を今の値で書く）。k ≥ 2 は見出し「選ばれた {k} 人」・行が k・まだ決まっていない行は空・1 人目が止まった時点でめくれる
  - 寄せる処理は k 回ではなく 1 回（最後の人が止まったとき）
- **CSS の約束**: 組の札は**背を 4 行ぶんに固定**（spec Y6）。各行 1 行で …。`--card-extra` は組の札のときだけ足す。**k = 1 の規則に手を入れない**（組の札の規則は `[data-pick='group']` の下にだけ書く）
- **確かめる**: 同上

### タスク 2.7 E2E（書くのは実装役・流すのは統括）

- **変えるファイル**: `e2e/specs/roulette.spec.ts`・`e2e/support/roulette.ts`
- 足す場面:
  - 2 つのブラウザで k = 2 に切り替え（片方で押して、もう片方に届く）→ 回す → 両方で 1 人目・2 人目が同じ名前で、同じ順に札へ入る
  - 2 人目へ送っている途中で 3 つ目のブラウザが開く → 同じ 2 人で止まる
  - `expectScreenAcrossWidths` に k = 2・4 の「止まった後」を足す（320・768・1280・1920）
  - 320×640 で k = 4・40 字の名前 × 4: 札の下端が下端の帯より上・札の行が溢れない（`scrollWidth` と `clientWidth`）〈変異: `--card-extra` を 0〉
  - **#94 の既存の場面は変えない**（k = 1 の回帰）

### タスク 2.8 実画面検証と撮影（統括）

- spec §8.4 のとおり。**最初に k = 1 の前後比較**を撮り、差が出たら先へ進まない
- 利用者に実物を見てもらい、直しの往復（1〜2 回）を受ける

### タスク 2.9 文書（PR 2 の分）

- ADR 0026 の追記に PR 2 の分（画面）を足す
- 実装で外したこと・測った値（`STOP_HOLD_MS`・`NEXT_MOVE_MS`・`--card-extra`）を spec に「実装で実測して外したこと」として戻す
- 振り返りを 1 本書く（`docs/retrospectives/`）
- **PR 2 の終わりに**: `pnpm typecheck`・`pnpm lint`・`pnpm test`・全 audit・`node scripts/check-links.mjs`。統括が変異の全件と E2E の全件

## 4. 崩れの点検表（PR 2 のレビューで必ず見る）

| 点検 | どこで見るか |
|---|---|
| k = 1 の画面が前後で同じ | タスク 2.8 の撮影の比較・`result-card.test.tsx` の k = 1 の行 |
| 320×640 で円盤・札・下端の帯が 1 画面（k = 1〜4） | E2E（タスク 2.7） |
| 人数を変えても回っている間に段組みが動かない | `data-pick` が凍結した k から決まること（単体）・撮影（2 人目へ送っている途中） |
| 脇の切り替えが 320px で溢れない・44px 以上 | `expectScreenAcrossWidths` |
| 最長の名前 × 4 で札が溢れない | E2E（タスク 2.7） |
| 生の色・直値の字の大きさを書いていない | `node scripts/audit-ui-components.mjs` |
| 新しい文言が base 層に収まる | `copy-fits-font-base`・`rendered-text-fits-font-base` |
