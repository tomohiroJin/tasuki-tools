# ファシリテーター・ルーレット（#94）— 実装計画

- **設計正本**: [`docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md`](../specs/2026-10-12-facilitator-roulette-design.md)（以下「spec」。決定 R・EARS E・変異 m の番号はそこにある）
- **日付**: 2026-10-12・**実測時点**: main `7d141f63`
- **型にした先例**: #91 の PR 1（`3cddcdce`）・PR 2（`42872e3d`）。迷ったら `git show <SHA> -- <ファイル>` で同じ場所の差分を読む

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。設計正本の番号（R・E・m）で根拠を指す。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが「先に書く赤いテスト」から始まる。オラクルは実装と別の計算で組む（spec §8.2 の E16） |
| II. 技術選定は ADR を通す | 通過 | 新しい文脈（`packages/roulette-core`）と乱数・時刻の扱いを ADR 0026 で決める（タスク 1.11）。外部の依存は足さない（`valibot`・`neverthrow` は既存の版の指定） |
| III. 揮発インメモリと単純運用 | 通過 | ルーレットの状態はルームの揮発メモリだけに置き、履歴を持たない（spec R8）。新しいサーバー・ユニットを立てない（spec R1）。配布は静的サイト 1 本ぶん（`STATIC_ONLY=1`） |
| IV. 境界の型安全 | 通過 | コマンドは valibot の `strictObject`、フレームは非 strict の `object`。境界の検証は同期サーバーのメッセージ層と web のフレームの見分けの 1 か所ずつ（spec §5.3） |
| V. 実画面検証 | 通過 | 2〜3 つのブラウザで同じ席に止まること・途中参加・動きを減らす設定・4 つの幅を撮る（タスク 3.5・spec §8.4）。撮影は統括 |
| VI. 依存は内向き | 通過 | `roulette-core` はどの `@tasuki/*` にも依存しない（spec R3・ADR 0026 決定 1）。`audit-dependency-direction` の `ALLOWED` に登録する（タスク 1.6・2.5） |
| VII. 検査は壊して確かめる | 通過 | 変異 m150〜m169 を足し、1 本ずつ赤を見る（§5）。全件は統括 |
| VIII. 記録が正本 | 通過 | 決定は ADR 0026、設計と実測は設計正本、PR 1 のずれは設計正本 §5.1 に戻した |
| IX. 小さく回す | 通過 | PR を 3 本に分け（spec §10）、配布は最後に 1 回 |
| X. 抽象は実需で | 通過 | timer の rotation と共通化しない（spec R12）。表示部品は `packages/ui` に置かない（spec R17） |
| XI. 秘密と個人情報を持ち込まない | 通過 | ゲストの名前・表示名をログへ出さない（spec R13・E14）。ログ衛生の検査の射程に新しいファイルを入れる |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 0. この計画の読み方と取り決め

- **PR は 3 本**（spec §10）。main へ順に入れ、本番への配布は最後に 1 回（統括が利用者の指示を待って行う）
- 各タスクは**テストファースト**: 「先に書く赤いテスト」を書き、**赤を見てから**実装し、緑にする。赤を見ずに緑にしたテストは、恒真でないことを変異で確かめるまで信じない
- **アサーションは spec §8.3 の「値が分かれる局面」に置く。** オラクル（正解の作り方）を実装と同じ計算で組まない
- 変異の ID は **150〜169 だけ**を使う（spec §8.3 の表のとおり）。パッチの 1 行目は `# 変異 150: <名前>`、ファイル名は `scripts/mutations/m150-<名前>.patch`。`scripts/mutation-check.mjs` の宣言に `{ id, label, patch, pkg, tests, note }` で足す（m96 の宣言が型）
- **自分の変異を 1 本だけ当てて赤を見る手順**（全件実行は統括）:
  ```bash
  git status --porcelain          # 空であること（未コミットの実装を壊さない）
  git apply scripts/mutations/m15X-*.patch
  pnpm --filter <pkg> test -- <テストファイル>   # 赤を見る
  git apply -R scripts/mutations/m15X-*.patch
  git status --porcelain          # 空に戻ったこと
  ```
  **`git checkout -- <file>` で戻さない**（未コミットの実装まで消える。過去に 4 度起きた）。`node scripts/mutation-check.mjs` は `--help` も含めて打たない（全件が走る）
- **E2E と変異の全件、撮影、`pnpm dev` は統括が本体側で直列に流す。** 実装役は E2E の spec を書くが、`pnpm e2e` / Playwright を打たない
- **依存の登録（新しいパッケージを足したあとの lockfile の更新）は統括が行う。** 実装役は `pnpm install` を打たない。新しい `package.json` を足したら、その時点で統括に依頼して止まる（タスク 1.1・2.1 に明記）
- 文言は**書体の base 層で実測した表（spec §6.6）からだけ**取る。足す・変えるなら `node` で `fonts.css` の範囲に当ててから（`apps/topic-web/tests/support/font-base.ts` の `outsideBase` が判定の正本）
- コミットはタスクごと。末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（実装役）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- PR を作ったら `/code-review <番号>` を必ず流す（統括）

## 1. 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数の見込み | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/roulette-core test` | 1.x の各タスク | 20 秒 | 15 | 5 分 |
| `pnpm --filter @tasuki/sync test -- <ファイル>`（1 ファイル） | 1.x の各タスク | 30〜60 秒 | 25 | 20 分 |
| `pnpm --filter @tasuki/sync test`（全件） | PR 1 の終わり・各 PR の前 | 3〜5 分 | 4 | 20 分 |
| `pnpm --filter @tasuki/roulette-web test` | 2.x・3.x の各タスク | 30 秒〜1 分 | 30 | 25 分 |
| `pnpm --filter @tasuki/landing test` | 2.4・3.x | 1 分 | 5 | 5 分 |
| `pnpm typecheck` / `pnpm lint` | 各 PR の終わり | 3〜5 分 | 6 | 30 分 |
| `pnpm test`（turbo の全件） | 各 PR の終わり | 8〜12 分 | 3 | 35 分 |
| scripts の自己テスト ＋ 全 audit | 各 PR の終わり（検査の許可表を触った後は必ず） | 2〜3 分 | 4 | 12 分 |
| 自分の変異を 1 本ずつ当てて赤を見る | 変異を足すタスク | 1〜2 分 | 20 | 40 分 |
| **変異の全件（統括）** | 各 PR の前 | 60〜90 分 | 3 | 3〜4.5 時間 |
| **E2E の全件（統括）** | PR 2・3 の前 | 25〜40 分（ルーレットの通しで約 +40 秒） | 2〜3 | 1〜2 時間 |
| **実画面検証と撮影（統括）・利用者の見た目の確認** | PR 3 | 1〜2 時間（直しの往復を含めない） | 1 | 1〜2 時間 |
| **合計の見込み** | | | | **約 9〜13 時間**（うち統括の直列の作業 5.5〜8.5 時間） |

**見た目の直しの往復は見積もりに入れていない**（#316 PR 1 では利用者の「バランスが悪い」から 1 往復した）。PR 3 は往復 1〜2 回を見込んで日程を取る。

## 2. PR 1 — roulette-core と同期サーバーの経路（変異 m150〜m161・m167・m168）

ブランチ: `feature/issue-94-facilitator-roulette`（設計と同じ枝。PR を分けるときは統括が切る）

### タスク 1.1 パッケージの骨組み

- **変えるファイル**: `packages/roulette-core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`（`packages/topic-core` の 4 つを写す。`name` は `@tasuki/roulette-core`・依存は `valibot` と `neverthrow`（topic-core と同じ版の指定）だけ）、`turbo.json`（topic-core と同じ扱いの行があれば並べる）
- **先に書く赤いテスト**: `packages/roulette-core/tests/limits.test.ts` —— `SPIN_DURATION_MS === 4000`・`MAX_GUESTS === 12`・`MAX_WHEEL === 24`・`SETTLE_MIN < SETTLE_MAX` かつ両方が `(0,1)` の中
- **止まる点**: `package.json` を足したら**統括に lockfile の更新を依頼して待つ**
- **確かめる**: `pnpm --filter @tasuki/roulette-core test`

### タスク 1.2 入る人（`poolOf`）

- **変えるファイル**: `packages/roulette-core/src/pool.ts`
- **先に書く赤いテスト**: `tests/pool.test.ts`
  - 在室の参加者だけが入る（離席中の 1 人を含む 3 人 → 2 人）〈m154〉
  - 外した参加者・外したゲストが入らない〈m155〉
  - 並びは「名簿の順 → ゲストの足した順」で、同じ入力から常に同じ並び
  - 外した ID が名簿に居なくても落ちない（全域関数）
- **確かめる**: 同上

### タスク 1.3 一周の規則（`drawWinner`）

- **変えるファイル**: `packages/roulette-core/src/draw.ts`
- **先に書く赤いテスト**: `tests/draw.test.ts`。`randomInt` は**常に 0 を返す偽物**と**記録する偽物**を使う（引数 `n` が eligible の数であることも見る）
  - 2 人 [A,B]・`drawn=[A]` → 必ず B（`randomInt` が 0 を返しても A にならない）〈m151。**1 回目ではなく 2 回目で見る**〉
  - 2 人で 3 回続けて引く（`randomInt` は常に 0）→ A, B, A。3 回目の時点で `drawn` は `[A]` だけ〈m152〉
  - 3 人 [A,B,C]・`drawn=[A,B,C]`・直前の当たり C → 新しい周の 1 回目の `randomInt` の `n` が 2 で、C は選ばれない〈m152〉
  - 周の途中で入ってきた D（`drawn` に居ない）は残りの周に入る
  - pool が 1 人のときは呼ばない前提（`startSpin` が先に拒む）を docstring に書き、テストは `startSpin` 側で見る
- **確かめる**: 同上

### タスク 1.4 回す（`startSpin` / `isSpinning` / `toView`）とほかの遷移

- **変えるファイル**: `packages/roulette-core/src/roulette.ts`（状態の型・`INITIAL_ROULETTE_STATE`・`startSpin`・`isSpinning`・`setIncluded`・`addGuest`・`removeGuest`・`resetCycle`・`prune`・`toView`）、`src/errors.ts`（`ROULETTE_ERROR_CODES` の配列と型。文言は持たない —— `scripts/audit-domain-error-shape.mjs`）
- **先に書く赤いテスト**: `tests/roulette.test.ts`
  - 回転中（`now - startedAt < SPIN_DURATION_MS`）の `startSpin` は `ROULETTE_SPINNING` で、`lastSpin` も `drawn` も変わらない。ちょうど `SPIN_DURATION_MS` 経った時点では回せる（境界）〈m153〉
  - 入る人 1 人 → `ROULETTE_TOO_FEW`・25 人 → `ROULETTE_TOO_MANY`
  - `startSpin` は `seq` を 1 ずつ増やし、`wheel` は pool の写し（後から pool を変えても `wheel` は変わらない）
  - `settle` は渡された値をそのまま持つ（範囲への丸めは同期サーバーの乱数源が持つ。範囲外を渡したら `Err`）
  - `toView(state, now)` の `spin.elapsedMs` は `now - startedAt`（途中なら途中の値・終わったら `durationMs` に丸める）。`startedAt` は出力に**無い**〈m161 の下地〉
  - `setIncluded` は冪等（同じ値を 2 回 → 1 回と同じ）
  - `addGuest`: 13 件目は `TOO_MANY_GUESTS`〈m157〉・`takenNames` に有る名前は `GUEST_NAME_TAKEN`・ID は `g-1`, `g-2` と採番
  - `removeGuest` は `excluded`・`drawn` からも落とす
  - `prune(state, known)` は `known` に無い ID を `excluded`・`drawn` から落とす（ゲストは `known` に含めて呼ぶ前提を docstring に）
- **確かめる**: 同上

### タスク 1.5 wire のスキーマ

- **変えるファイル**: `packages/roulette-core/src/schemas.ts`（`RouletteCommandSchema`・`RouletteFrameSchema`・`RouletteErrorFrameSchema`）、`src/error-messages.ts`（`rouletteErrorMessageFor`。文言は spec §6.6 のエラーの行）、`src/index.ts`
- **先に書く赤いテスト**:
  - `tests/schemas.test.ts` —— 5 つのコマンドが通る。**余剰の項目（`{ command: "roulette.spin", x: 1 }`）が落ちる**〈m168〉・`id` の空文字と 65 字が落ちる・`name` の 65 字が落ちる。フレームは非 strict（項目を足しても通る）
  - `tests/error-messages.test.ts` —— 全コードに文言がある。**文言が書体の base 層に収まる**（`apps/topic-web/tests/support/font-base.ts` の判定を写す。topic-core の `error-messages.test.ts` が型）
- **確かめる**: 同上 ＋ `node scripts/audit-domain-error-shape.mjs`・`node scripts/audit-domain-side-effects.mjs`（新しいパッケージを射程に入れる。赤なら許可表・走査対象を足す）

### タスク 1.6 検査の登録（新しいパッケージ）

- **変えるファイル**: `scripts/audit-dependency-direction.mjs` の `ALLOWED`（`packages/roulette-core` の欄を新設。`apps/tasuki-sync` の欄へ `@tasuki/roulette-core`）、ほか**実行して赤になったもの**（#91 PR 1 の差分: `audit-structure.mjs`（と自己テスト）・`audit-domain-side-effects.mjs`・`audit-log-hygiene.mjs`）
- **先に書く赤いテスト**: 無し（既存の検査が赤になることが「赤いテスト」）。足す前に 1 度流して赤を見る
- **確かめる**:
  ```bash
  bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
  for s in audit-structure audit-dependency-direction audit-domain-side-effects audit-domain-error-shape audit-log-hygiene audit-assembly-wiring; do node scripts/$s.mjs || echo "RED $s"; done
  ```

### タスク 1.7 ツール ID と接続の振り分け

- **変えるファイル**: `apps/tasuki-sync/src/application/tool-id.ts`（`TOOL_ROULETTE`）、`src/adapters/ws-adapter.ts`（`protocolFromRequestUrl`・`ToolContext`・`onRouletteMessage`・`handleRouletteMessage`・`sendRoulette` / `broadcastRoulette` / `sendRouletteFrame`）、`src/ports/roulette-server-msg.ts`（`TopicServerMsg` / `TopicOwnFrame` を写す）、`test/support/test-ws-adapter.ts`・`test/support/live-sync-server.ts`（ルーレットの口を足す）
- **先に書く赤いテスト**:
  - `test/ws-adapter-tool-query.test.ts` に「`?tool=roulette` はルーレットの層へ届く（timer の層へもハブの層へも届かない）」
  - `test/ws-adapter.message.test.ts` に「ルーレットの層のサイズ超過は `MESSAGE_TOO_LARGE`」「ルーレットのハンドラが同期 throw しても接続もプロセスも落ちず `INTERNAL_ERROR`」（お題の同名テストを写す）
- **注意**: `handleOpen` の poker の早期 return に `roulette` を**足さない**（spec §5.2）。m167 はタスク 1.10 で固定する
- **確かめる**: `pnpm --filter @tasuki/sync test -- test/ws-adapter-tool-query.test.ts test/ws-adapter.message.test.ts`

### タスク 1.8 保管と破棄

- **変えるファイル**: `src/ports/roulette-store.ts`・`src/adapters/in-memory-roulette-store.ts`（`topic-store` を写す）、`src/application/destroy-room.ts`（`roulettes.delete(code)`）
- **先に書く赤いテスト**: `test/in-memory-roulette-store.test.ts`（写し）、`test/destroy-room.test.ts` に「破棄の後にルーレットの状態が無い」〈m160〉
- **確かめる**: `pnpm --filter @tasuki/sync test -- test/destroy-room.test.ts test/in-memory-roulette-store.test.ts`

### タスク 1.9 メッセージ層（`roulette-handlers.ts`）と配信

- **変えるファイル**: `src/application/roulette-handlers.ts`、`src/application/roulette-broadcast.ts`、`src/ports/random-source.ts`（`randomInt(n)` と `randomSettle()`）、`src/adapters/crypto-random-source.ts`（`node:crypto` の `randomInt`。`settle` は `SETTLE_MIN + randomInt(1_000_001) / 1_000_000 * (SETTLE_MAX - SETTLE_MIN)`）
- **組み立ての要点**（spec §5.2）:
  - 参加は `topic-handlers.ts` の `handleJoin` と同じ組み立て（`isInAnyRoom` で 2 度目を拒む・`applyDisplayNameRule`・`joinRoom(..., tool: TOOL_ROULETTE)`・`saveRoster`）。参加の直後に `broadcaster.sendCurrent`（状態が無ければ既定を置く）
  - コマンドの受け先のルームは `roomCodeOf`（**ルーレットとして在席している**ルームだけ）
  - 各コマンドの前に `prune(state, 名簿の全参加者の ID ∪ ゲストの ID)`
  - `roulette.spin` の `Member[]` は名簿から `{ id, name: displayName, present: presenceOf(p) === "online" }`。`spunBy` は回した本人の表示名
  - `roulette.guest.add` は `applyDisplayNameRule` を通し（失敗は `INVALID_GUEST_NAME`）、`takenNames` に名簿の全参加者の表示名とゲストの名前を渡す
  - 時計は**単調時計**（`createPerformanceClock` の型を受ける）。ハンドラはログを書かない
- **先に書く赤いテスト**: `test/roulette-handlers.test.ts`（`topic-handlers.test.ts` の作りを写す。偽の時計・偽の乱数・偽の送信）
  - 「2 人で 2 回回すと 2 回目は 1 回目と違う人」（偽の乱数は常に 0）〈m151 の配線側〉
  - 「回転中の `roulette.spin` は `ROULETTE_SPINNING`、配信は増えず `lastSpin.seq` も変わらない」〈m153〉
  - 「離席中（接続 0 本）の参加者を除くと 1 人になるルームでは回せない（`ROULETTE_TOO_FEW`）」〈m154 の配線側〉
  - 「**回転の途中（偽の時計を 2000ms 進めた後）に参加した接続へ届く `elapsedMs` が 2000**」〈m161〉
  - 「`roulette.guest.add` の名前が表示名の規約で落ちる（空白だけ・不可視文字だけ）→ `INVALID_GUEST_NAME`。在室者と同じ名前 → `GUEST_NAME_TAKEN`」〈m156〉
  - 「ルーレットとして在席していない接続（ハブとして在席）の `roulette.spin` は `NOT_IN_ROOM`」（2 段目の守り）
  - 「`room.create` / `room.check` は `INVALID_COMMAND`」「2 度目の `room.join` は拒む」
  - 「ログの出口が 1 度も呼ばれない」（ゲストの名前を入れて操作した後に、偽のロガーの記録が空）
- **確かめる**: `pnpm --filter @tasuki/sync test -- test/roulette-handlers.test.ts`

### タスク 1.10 合成ルートの配線（名簿・お題の宛先・ゲート）

- **変えるファイル**: `src/create-sync-server.ts`（ストア・乱数源・ブロードキャスタ・ハンドラ・`onRouletteMessage`。名簿の宛先を `rosterRecipientsOf = ハブ ＋ ルーレット` にする）、`src/application/topic-broadcast.ts`（`TOPIC_RECIPIENT_TOOLS` に `TOOL_ROULETTE`）
- **先に書く赤いテスト**: `test/live-ws.roulette.test.ts`（**実 WS**。`live-ws.topic.test.ts` を型にする）
  - 「ルーレットの接続が参加すると、`room.joined`・`roster`・`roulette` が届く。別の人がハブで参加すると、ルーレットの接続に新しい `roster` が届く」〈m158〉
  - 「お題ツールで `topic.set` すると、ルーレットの接続にも `topic` が届く」〈m159〉
  - 「`roulette.spin` の結果が、同じルームの**2 本の**ルーレットの接続へ同じ `seq`・`winnerIndex`・`settle` で届き、**ハブ・timer・poker・お題の接続には `roulette` フレームが届かない**」
  - 「timer・poker・お題・ハブの接続から送った `roulette.spin` は不正として拒否され、ルーレットの状態が変わらない（その後のルーレットの接続の `seq` が 1 のまま）」〈m150。4 種すべてで見る〉
  - 「ルーレットの接続で `room.join` を誤った合言葉で失敗させ続け、**接続を張り直しても**枠が続く（`join-rate-limit.test.ts` の形）」〈m167〉
- **変異**: タスク 1.2〜1.10 の〈m15X〉を `scripts/mutations/` に足し、`mutation-check.mjs` に宣言する。**1 本ずつ当てて赤を見る**（手順は §0）。m150 はハブの層の `onHubMessage` からルーレットのハンドラも呼ぶ配線にする形、m167 は `handleOpen` の `if (ws.data.protocol === "poker") return;` に `|| ws.data.protocol === "roulette"` を足す形
- **確かめる**: `pnpm --filter @tasuki/sync test`（全件）・`node scripts/audit-assembly-wiring.mjs`・`node scripts/audit-log-hygiene.mjs`

### タスク 1.11 文書（PR 1）

- **変えるファイル**: `docs/adr/0026-facilitator-roulette.md`（新設。`docs/adr/template.md` の形。R1・R3・R4・R5・R6・R14・R16 と退けた案 X2〜X6。**完了形を書くのはこの PR が入れた範囲だけ**）、`docs/adr/0017-bounded-contexts-and-packages.md`（末尾に追記節「文脈を 5 つにする」）、`docs/adr/README.md`（一覧）、`docs/adr/0011-threat-model-and-data-classification.md`（末尾に追記節: S3・S7 の範囲にルーレットのコマンドが入ること）
- **確かめる**: `node scripts/check-links.mjs`
- **PR 1 の終わりに**: `pnpm test`・`pnpm typecheck`・`pnpm lint`・scripts の自己テストと全 audit。統括へ変異の全件を依頼

## 3. PR 2 — `apps/roulette-web` の機能と玄関の札（変異 m162・m165・m166・m169）

円盤はまだ描かない。**入る人の一覧・回す・結果の一言・一周の行**で「回して決まる」を通す。見た目の CSS は器・区画・部品だけ（PR 3 で円盤と札を足す）。

### タスク 2.1 アプリの骨組み

- **変えるファイル**: `apps/roulette-web/{index.html,package.json,tsconfig.json,vite.config.ts,vitest.config.ts,src/main.tsx,src/App.tsx,src/router.ts,src/join-error-plan.ts,src/copy.ts,src/index.css,src/components/LoadingView.tsx,src/components/InviteLink.tsx}`（`apps/topic-web` の同名を写し、`/topic` → `/roulette`。`vite.config.ts` の `base: '/roulette/'`・dev のポートは空き番号を `docs/guides/development.md` で確かめて決める）、`tests/{setup.ts,support/font-base.ts,support/scripted-web-socket.ts,router.test.ts,join-error-plan.test.ts}`（写し）
- **`index.css` の先頭**: `@import '@tasuki/ui';`（3 層とも。Tailwind は使わない —— #297）
- **止まる点**: `package.json` を足したら**統括に lockfile の更新を依頼して待つ**
- **先に書く赤いテスト**: `tests/router.test.ts`（`/roulette/?room=X` → room・それ以外 → 玄関）
- **確かめる**: `pnpm --filter @tasuki/roulette-web test`・`pnpm --filter @tasuki/roulette-web typecheck`

### タスク 2.2 フレームの見分けと同期フック

- **変えるファイル**: `src/server-message.ts`（`topic` → `roulette` → ハブの順に見分ける）、`src/hooks/use-roulette-sync.ts`（`use-topic-sync.ts` を写し、状態に `roulette: RouletteView | null`・`roster: RosterRoom | null`・`topic: TopicState | null`・`receivedAt`（`seq` ごとに受け取った時点の `performance.now()`）を持つ。操作は `spin` / `setIncluded` / `addGuest` / `removeGuest` / `resetCycle`）
- **先に書く赤いテスト**:
  - `tests/server-message.test.ts` —— 3 種を見分ける・どれにも合わないものは `null`
  - `tests/use-roulette-sync.test.tsx` —— 参加・告知・抜けたとき玄関へ（写し）。**同じ `seq` の状態を 2 度受けても `receivedAt` が変わらない**〈m162 の下地〉
- **確かめる**: 同上

### タスク 2.3 見え方の純粋関数と画面（円盤なし）

- **変えるファイル**: `src/roulette-view.ts`（`poolOf` を roulette-core から呼んで一覧の行を作る・`phaseOf(view, nowMs)` で「回す前 / 回っている / 止まった」・**回っている間は今回の当たりを `drawn` から除いた一覧と数**・結果の一言・主ボタンの文言と押せるか）、`src/screens/RouletteRoom.tsx`、`src/components/{PeoplePanel,GuestForm,SpinControls}.tsx`
- **段組み**: `<main className="ui-page ui-page--wide">` → 見出し（h1 と戻る）→ `<div className="ui-workspace ui-workspace--side-end">`（main: お題の添え書き・結果の一言・回す / side: `.ui-panel` の入る人と、2 つ目の `.ui-panel`「仲間を招く」（`InviteLink`））。**招待は見出しの下に置かない**（spec §6.7 の 3 版・利用者が承認）。「一周をやり直す」は `.ui-button--secondary --sm`（状態を変える操作。控えの下線の字にしない）。spec §6.7
- **先に書く赤いテスト**: `tests/roulette-view.test.ts` と `tests/roulette-room.test.tsx`（偽の WebSocket と偽の時計）
  - 回り始めてから止まるまで、`role="status"` の領域に**当たりの名前が無い**。止まった後に「次の進行役は {名前} さんです」〈m165。**回っている間に見る**〉
  - 回っている間、一覧の当たりの行に「選ばれた」が無く、一周の数も今回を数えない。止まった後に出る〈m166〉
  - 動きを減らす設定（`matchMedia` の差し替え）では、受け取った直後に結果の一言が出る（PR 3 の円盤でも同じ経路を通す）
  - 入る人 1 人なら主ボタンが押せず、「2 人から回せます」
  - お題があれば「お題「{タイトル}」の進行役を決めます」、無ければ出さない（E20）
  - 「名前を消す」の `aria-label` が名前で区別できる
- **確かめる**: 同上 ＋ `tests/copy-fits-font-base.test.ts`・`tests/rendered-text-fits-font-base.test.tsx`・`tests/screens-do-not-import-sync-client.test.ts`（topic-web の 3 本を写す）

### タスク 2.4 玄関の 4 枚目の札

- **変えるファイル**: `apps/landing/src/tools.ts`（`id` に `"roulette"`・pip「進行」・名前「Facilitator Roulette」・一行「その場で進行役を決める」・`href: "/roulette/"`・`mark: "wheel"`）、`apps/landing/src/ToolMark.tsx`（`wheel`: 円・6 本の仕切り・上の小さな三角の指し針。線の太さは 2.5 で既存の 3 つと揃える）、`apps/landing/src/index.css`（4 枚で崩れる箇所だけ）、`apps/landing/vite.config.ts`（dev の中継）、`packages/dev-hub-redirect`（同）、`apps/landing/package.json`（必要なら）
- **先に書く赤いテスト**: `apps/landing/tests/tool-public-paths.test.ts`（4 か所の公開パスの突き合わせが `/roulette/` も見る —— `deploy/roulette` が無いので赤）、`room-choice` の居場所の表示のテストに「ルーレットに居る人は Facilitator Roulette と出る」〈m169〉
- **確かめる**: `pnpm --filter @tasuki/landing test`

### タスク 2.5 配備資材と検査の登録

- **変えるファイル**: `deploy/roulette/{app.env,NOTES.md,caddy/50-roulette.conf}`（spec §7。`deploy/topic` を写す）、`deploy/README.md`・`deploy/caddy/README.md`・`deploy/caddy/tasuki.conf`（断片の顔ぶれ）、`scripts/audit-dependency-direction.mjs`（`apps/roulette-web` の欄・`apps/landing` に必要なら）、`scripts/audit-web-sync-boundary.mjs`、`scripts/check-links.mjs`・`scripts/list-scan-targets.mjs`（**実行して赤になったものだけ**）、`turbo.json`、`e2e/harness/paths.ts`・`e2e/package.json`・`e2e/tests/workspace.test.ts`・`e2e/tests/fragment-sources.test.ts`
- **確かめる**: scripts の自己テスト＋全 audit（タスク 1.6 のコマンド）・`pnpm --filter @tasuki/e2e test`（E2E のハーネスの単体。ブラウザは起動しない）

### タスク 2.6 E2E（経路と通し）—— **新しいルームは 1 つだけ**

- **変えるファイル**:
  - `e2e/support/roulette.ts`（`openRouletteTool(page, name)`・`joinRouletteTool(page, url, name)`。`support/topic.ts` を写す）
  - `e2e/specs/roulette.spec.ts`（新設・**ルーム 1 つ**）: `test.describe('@core ルーレットは全員の画面で同じ人に止まる')` の 1 本
    - A が玄関でルームを作りルーレットを開く。B（別の文脈・`emulateMedia({ reducedMotion: 'reduce' })`）が招待 URL で参加してルーレットを開く
    - 3 回回す（A が押す・各回は前の回転の `durationMs` が過ぎてから）。**毎回、A と B の結果の一言が同じ名前**で、**名前の並びが X → Y → X**（入る人は A と B の 2 人。spec §5.1）
    - B は回転を待たずに結果が出る（押してから 1 秒以内に B の一言が結果になる・A はまだ「回しました」）
    - コンソールのエラーが 0
  - `e2e/specs/routing.spec.ts` の `@smoke` に `/roulette/` の配信と `/roulette` → `/roulette/` の転送（ルーム 0）
  - `e2e/specs/landing.spec.ts` の札の遷移の検査（タグ無しの describe）に 4 枚目を足す（**既存のテストの中で足す・ルーム 0**）
  - `e2e/specs/landing-design.spec.ts` の札の枚数 3 → 4（行箱の検査が 4 枚目の文字も見る）
- **ルームの増分**: **+1**（`roulette.spec.ts` の 1 本だけ）。spec の見た目・a11y の検査は PR 3 で既存のテストへ相乗りさせる
- **`@core` の注意**: 配布前の本番へ `e2e:prod` を当てると落ちる（`/roulette/` が無い）。`deploy/roulette/NOTES.md` に書く（#91 と同じ）。`@core` は describe の先頭に置く（`e2e/tests/spec-tags.test.ts`）
- **確かめる**: `pnpm --filter @tasuki/e2e test`（タグと配線の単体）。**E2E の実行は統括**

### タスク 2.7 PR 2 の終わり

- `pnpm test`・`pnpm typecheck`・`pnpm lint`・scripts の自己テストと全 audit・`node scripts/audit-ui-components.mjs`・`pnpm --filter @tasuki/ui test`
- 変異 m162・m165・m166・m169 を足して 1 本ずつ赤を見る
- 統括へ: 変異の全件・E2E の全件・**この段の画面を 1 度撮って利用者に見せるか**の判断

## 4. PR 3 — 円盤と演出（見た目）（変異 m163・m164）

**モック**（統括の作業領域 `scratchpad/roulette-mock/`。`src/roulette.css` が CSS の下書き、`src/index.src.html` の JS が純粋関数の下書き）を出発点にする。モックの値を写すときも、生の色を書かない・字の大きさは 5 段か `scale-exempt`（理由つき）を守る。

### タスク 3.1 円盤の幾何（純粋関数）

- **変えるファイル**: `apps/roulette-web/src/wheel-motion.ts`（`TURNS = 4`・`stageLayoutFor(widthPx)`・`pointerDegFor(layout)`・`finalAngle(n, winnerIndex, settle, pointerDeg, startDeg)`・`easeOutCubic`・`angleAt(elapsedMs, durationMs, n, winnerIndex, settle, pointerDeg, startDeg)`・`segmentBoundaryIndex(angle, n, pointerDeg)`（指し針の弾みに使う））、`src/wheel-geometry.ts`（`polar`・`arcPath`・`toneOf(i, n)`・`labelPlacement(mid, rotorDeg)`・`fitLabel(name, maxEm)`）。spec §6.3・§6.4・§6.7（2 版）
- **先に書く赤いテスト**: `tests/wheel-motion.test.ts`
  - **オラクルは別の計算で組む**: 止まった角度 θ で回転子を回したとき、指し針の先（下なら `(0, 60)`・右なら `(60, 0)`）を回転子の座標へ戻し（`(x, y)` を `-θ` 回す）、`Math.atan2` で出した角が席 `winnerIndex` の扇形 `[i·s, (i+1)·s)` に**入っていて、境目から `0.2·s` 以上離れている**ことを、n = 2〜24・全席・`settle` ∈ {0.2, 0.5, 0.8}・指し針 2 か所・`startDeg` ∈ {0, 37.5, 123, 359} で見る。`finalAngle` を逆算して比べない〈m163〉（モックの下書きでこのオラクルを流し、食い違い 0 を確かめてある）
  - `angleAt(0) === startDeg`・`angleAt(durationMs) === finalAngle(...)`・`angleAt` が単調に増える（100 点で見る）・`finalAngle − startDeg ≥ 360·TURNS`
  - `toneOf`: n = 2〜24 で、隣り合う席（最後と最初を含む）が同じ色にならない
  - `labelPlacement`（spec §6.3 の 3 版）: 回転子の角度 0〜359 と席の位置の全組で、画面上の字の傾き（`rotate + rotorDeg` を −180〜180 に畳んだ値）が ±45° 以内で、行の向き（横書きは傾きそのもの・縦書きは 90° ＋ 傾き）が半径に沿う（外向きの半径との差が 0° か 180°）。横書きと縦書きの切り替えを具体値で固定する: 画面上 150° の席は縦書き・傾き −30°、真右（90°）と真左（270°）は横書き・傾き 0°、真下（180°）は縦書き・傾き 0°。行が外へ進むなら `text-anchor: end`、内へ進むなら `start`
  - `stageLayoutFor(719) === 'stack'`・`stageLayoutFor(720) === 'row'`、`pointerDegFor` が stack→180・row→90
  - `fitLabel`: 全角 6 字で切って `…`・半角は 0.6 で数える・ちょうど収まる名前は切らない
- **確かめる**: `pnpm --filter @tasuki/roulette-web test -- tests/wheel-motion.test.ts`

### タスク 3.2 円盤の部品と回転

- **変えるファイル**: `src/components/Wheel.tsx`（SVG。spec §6.3。`aria-hidden`・`focusable="false"`。名前は `<text>` の子に文字列）、`src/hooks/use-wheel-rotation.ts`（`seq` が変わったときだけ rAF を始める・`receivedAt` と `elapsedMs` から経過を出す・**毎フレーム名前の向きを決め直す**・**残り時間の `setTimeout` で終わりを保証する（rAF に頼らない）・止める処理は二重に効かない・前の回転の timer と rAF を消す**・止まったら札が見えていなければ `scrollIntoView({ block: 'nearest' })` で寄せる（動きを減らす設定では `behavior: 'auto'`）・動きを減らす設定では最終の角度へ置くだけ・アンマウントで rAF と timer を止める）、`src/components/ResultCard.tsx`（伏せ札とめくり。表は「次の進行役」と名前だけ・隅のピップは置かない）、`src/hooks/use-stage-layout.ts`（`ResizeObserver` で舞台の幅を読み `stageLayoutFor` を返す。回っている間は変えない）、`src/index.css`（spec §6.2・§6.7。モックの `roulette.css` を写す）
- **先に書く赤いテスト**: `tests/wheel.test.tsx`（偽の rAF と偽の時計）
  - 新しい `seq` を受けると、**その画面がいま見せている角度から**角度が増えていき（0° へ跳ばない）、`durationMs` の後に `finalAngle` で止まり、当たりの席に `--winner` のクラスが付き、名前が止まった角度の向きで描き直される
  - **外す操作で同じ `seq` の状態が配り直された直後も、角度が巻き戻らない**（直前の角度以上）〈m162 の画面側〉
  - 動きを減らす設定では、受け取った直後の最初の描画で角度が `finalAngle`・当たりの席が付く・rAF を 1 度も呼ばない〈m164〉
  - 途中から合流（`elapsedMs = 3000`）した画面の最初の角度が `angleAt(3000)` 付近（0 ではない）
  - **rAF を 1 度も呼ばない偽物でも、`durationMs` の後に当たりの席と札の表が出る**（timer で止まる）〈m164 の広げた説明〉
  - 前の回転の timer が、次の回転を途中で止めない（2 回続けて回し、1 回目の timer の時刻で 2 回目がまだ回っている）
  - 札が見えているときは `scrollIntoView` を呼ばず、見えていないときだけ `block: 'nearest'` で呼ぶ（`getBoundingClientRect` を差し替える）〈spec E22〉
- **確かめる**: 同上 ＋ `node scripts/audit-ui-components.mjs`（生の色・字の大きさ・`ui-exempt`）・`pnpm --filter @tasuki/ui test`
- **SVG の `<stop>` の色**: JSX の `style={{ stopColor: 'var(--gold)' }}` が検査に掛かるかを先に実測する（spec §11）。掛かるなら CSS のクラスで当てる

### タスク 3.3 トークン（足すときだけ）

- 実装で語彙に無い色が要ったら `packages/ui/src/tokens/palette.css` に**役割名で**足し、比の実測を注記に書く。`packages/ui/tests/tokens.test.mjs` が求める形に従う。**モックの段では足す必要が無かった**（spec §6.2）
- **確かめる**: `pnpm --filter @tasuki/ui test`・`pnpm --filter @tasuki/ui lint`

### タスク 3.4 見た目の E2E と a11y —— **既存のテストに相乗り（ルーム 0）**

- **変えるファイル**:
  - `e2e/specs/roulette.spec.ts`（PR 2 の 1 本の中に足す）: 止まった後の画面に `scanContrast` と `expectReadable`（a11y の走査）・`document.fonts` の各面の `status` が `loaded`（`landing-design.spec.ts` の形）・`expectFocusVisibleOnTab`・`expectFieldsAtLeast16px`（名前の欄）。**アサーションを書く前に 1 回「探索」を走らせて、SVG の `<text>` が走査に入るかを見る**（統括に依頼）
  - `e2e/specs/buttons.spec.ts` の「お題ツールのボタンは…」のテストの**同じルームの中で**、お題ツールから玄関へ戻ってルーレットの札を開き、`expectScreenAcrossWidths(page, 'ルーレット（回す前）', …)` と、回して止まった後の `expectScreenAcrossWidths(page, 'ルーレット（止まった後）', …)` を足す（320・768・1280・1920）。入る人を 2 人にするには名前を 1 つ追加する（別の文脈を開かない）。さらに **320×640 で回して止まった後、札の名前の中心を `elementFromPoint` で突いて、下端の帯ではなく札の要素が返る**ことを見る（spec E22。ルームは 0 のまま）
- **ルームの増分**: **0**
- **確かめる**: `pnpm --filter @tasuki/e2e test`。実行は統括

### タスク 3.5 実画面検証（統括と利用者）

- spec §8.4 を統括が流す: 2〜3 つのブラウザで同時に止まる・途中参加・再読込・動きを減らす設定・320 / 768 / 1280 / 1920 の撮影・入る人 2・6・15 人
- **利用者に見せる**: 撮影と、`scratchpad/roulette-mock/index.html` との差。直しが出たら同じ PR の中で直す（Issue を増やさない）

### タスク 3.6 文書の残りと振り返り

- **変えるファイル**: `packages/ui/README.md`（利用側の表・「4 アプリすべて」の数を書かない形へ）、`README.md`（ツールの一覧）、`docs/guides/architecture.md`・`docs/guides/development.md`、`docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md` の末尾に「実装で実測して外したこと」（§11 の答え）、`docs/retrospectives/2026-10-XX-issue-94-facilitator-roulette.md`
- **確かめる**: `node scripts/check-links.mjs`・`pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit
- 統括へ: 変異の全件・E2E の全件・`/code-review`

## 5. 変異の割り当て（spec §8.3 の写しではなく、置き場所の対応）

| ID | 足すタスク | パッケージ | 赤になるテストのファイル |
|---|---|---|---|
| m150 | 1.10 | `apps/tasuki-sync` | `test/live-ws.roulette.test.ts` |
| m151 | 1.3（1.9 でも赤） | `packages/roulette-core` | `tests/draw.test.ts` |
| m152 | 1.3 | `packages/roulette-core` | `tests/draw.test.ts` |
| m153 | 1.4（1.9 でも赤） | `packages/roulette-core` | `tests/roulette.test.ts` |
| m154 | 1.2（1.9 でも赤） | `packages/roulette-core` | `tests/pool.test.ts` |
| m155 | 1.2 | `packages/roulette-core` | `tests/pool.test.ts` |
| m156 | 1.9 | `apps/tasuki-sync` | `test/roulette-handlers.test.ts` |
| m157 | 1.4 | `packages/roulette-core` | `tests/roulette.test.ts` |
| m158 | 1.10 | `apps/tasuki-sync` | `test/live-ws.roulette.test.ts` |
| m159 | 1.10 | `apps/tasuki-sync` | `test/live-ws.roulette.test.ts` |
| m160 | 1.8 | `apps/tasuki-sync` | `test/destroy-room.test.ts` |
| m161 | 1.9 | `apps/tasuki-sync` | `test/roulette-handlers.test.ts` |
| m162 | 2.2 / 3.2 | `apps/roulette-web` | `tests/use-roulette-sync.test.tsx`・`tests/wheel.test.tsx` |
| m163 | 3.1 | `apps/roulette-web` | `tests/wheel-motion.test.ts` |
| m164 | 3.2 | `apps/roulette-web` | `tests/wheel.test.tsx` |
| m165 | 2.3 | `apps/roulette-web` | `tests/roulette-room.test.tsx` |
| m166 | 2.3 | `apps/roulette-web` | `tests/roulette-room.test.tsx` |
| m167 | 1.10 | `apps/tasuki-sync` | `test/live-ws.roulette.test.ts` |
| m168 | 1.5 | `packages/roulette-core` | `tests/schemas.test.ts` |
| m169 | 2.4 | `apps/landing` | `tests/room-choice-*.test.tsx`（居場所の表示） |

**既存の変異が当たらなくなる恐れ**（製品コードを触るとパッチの文脈がずれ、`mutation-check` がそこで止まる）: 触るファイルに当たる既存のパッチは次のとおり（2026-10-12 に `grep -l` で洗った）。**触ったタスクの終わりに `git apply --check` で 1 本ずつ当たることを確かめ**、当たらなければパッチの文脈を直す（番号は変えない）。

| 触るファイル | 当たる既存のパッチ |
|---|---|
| `apps/tasuki-sync/src/adapters/ws-adapter.ts` | m13・m36・m82・m83 |
| `apps/tasuki-sync/src/create-sync-server.ts` | m28・m81 |
| `apps/tasuki-sync/src/application/topic-broadcast.ts` | m85・m96 |
| `apps/tasuki-sync/src/application/destroy-room.ts` | m80 |
| `apps/landing/src/screens/RoomChoice.tsx` | m87 |

```bash
for p in m13 m36 m82 m83 m28 m81 m85 m96 m80 m87; do git apply --check scripts/mutations/$p-*.patch 2>/dev/null && echo "ok $p" || echo "NG $p"; done
```

## 6. 利用者の決定と、統括が判断すること

**2026-10-12 利用者が推奨のまま承認**（spec §11.1）: 見た目はモック 3 版のとおり・招待は脇の「仲間を招く」・離席中は自動で外す・新しい一周の最初は直前の当たりを外す・名前 12 件／席 24・他の人が回したときも札が見えなければ寄せる・玄関の札の名前は「Facilitator Roulette」（1 行に収まらなければ「Roulette」）。

統括が判断すること:

- PR 2 の段（円盤の無い画面）を利用者に見せるか
