# 会の始まりと終わりの札（#406 第 1 段）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ルームの全員が、絞り込んだ札から 1 枚を伏せて出し、一斉に開いて「誰がどれを出したか（匿名なら分布）」を見せる 6 つ目の道具（`?tool=checkin`・Check-in Cards）を足す。

**Architecture:** 規則は新しい文脈 `packages/checkin-core`（純粋関数・どの `@tasuki/*` にも依存しない）に置く。同期サーバーは接続の種類 `?tool=checkin` とメッセージ層を持ち、**受け手ごとに投影して 1 通ずつ送る**（poker の `createSnapshotBuilder` と同じ考え方。匿名はサーバーが送らないことで守る）。名簿の変化（参加・切断・退出・ハブへの移動）は `saveRoster` → `hub.broadcastRoster` の 1 本に閉じているので、そこに口を 1 つ足して札の場を測り直す。画面 `apps/checkin-web` は roulette-web / agenda-web の骨組みを写す。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、Vite、vitest（core・web・landing）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-28-checkin-checkout-design.md`](../specs/2026-10-28-checkin-checkout-design.md)（以下「設計」。E は設計 §8、判断 N は設計 §9 の番号）。実装者は設計と本計画の両方を読むこと。見た目の正本はモックアップ `.superpowers/brainstorm/2155059-1793111181/content/{cards-v1,reveal-v1}.html`（git の対象外・札の顔は A、開いた後は B、匿名は C）。

- **日付**: 2026-10-28・**実測時点**: main `6b977cd9`・設計の枝 `docs/406-checkin-checkout-design`（`630a403d`）
- **型にした先例**: agenda（`0803a2e4`・ADR 0027・計画 [`2026-10-20-agenda-timer.md`](./2026-10-20-agenda-timer.md)）と roulette（ADR 0026）。**迷ったら現在の agenda / roulette の同じ場所を読む**（`git show` の差分は配線の顔ぶれの目安）
- **実装役**: Sonnet 5.5（変異の Task 1.6・2.5・3.6 は Opus）。統括は Task 3.0・3.7・4.4 と E2E・撮影・PR

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが赤いテストから始まる。匿名（E5・E6）は投影の性質テストで守り、オラクルは「他人の ID・名前・札が送る値に現れない」という実装と別の述語で書く |
| II. 技術選定は ADR を通す | 通過 | 新しい文脈・受け手ごとの投影・名簿の変化の口を ADR 0028 で決める（Task 1.7）。外部の依存は足さない（`valibot`・`neverthrow` は既存の版） |
| III. 揮発インメモリと単純運用 | 通過 | 札の状態はサーバーの揮発メモリだけ。ルームの破棄で消す（必須の依存）。結果を残さない。配布は静的サイト 1 本ぶん |
| IV. 境界の型安全 | 通過 | コマンドは `v.strictObject`、札はやり方の札の集合に含まれるものだけをドメインが受ける。フレームは非 strict の `v.object` |
| V. 実画面検証 | 通過 | 統括が poker と並べて撮る（Task 3.7）。利用者に実画面で見せる（Task 3.7・4.4）。E2E は 2 人のブラウザで匿名のフレームを実際に覗く |
| VI. 依存は内向き | 通過 | `checkin-core` は依存ゼロ（外部 2 つだけ）。`audit-dependency-direction` の `ALLOWED` に登録 |
| VII. 検査は壊して確かめる | 通過 | 変異 495〜518 を足し、1 本ずつ赤を見る（§変異の割り当て）。匿名をサーバーで守る経路（E5・E6・E7）を壊す変異を含める |
| VIII. 記録が正本 | 通過 | 決定は ADR 0028、データ分類は ADR 0011 の表、書体の base 層に足した字は設計正本の末尾、配布の手順は `deploy/checkin/NOTES.md` |
| IX. 小さく回す | 通過 | 1 本の枝・段ごとのコミット・PR 1 本（ADR 0013 の既定）。配布は計画の外・利用者の指示を待つ |
| X. 抽象は実需で | 通過 | 見学者を `room-core` へ移さない（判断 9）。開く動き・札の絵は poker と共通化しない（2 つ目の利用者で、形が違う） |
| XI. 秘密と個人情報を持ち込まない | 通過 | 誰がどの札を出したかは「個人に紐づく」（ADR 0011 に追記）。ハンドラはログを書かない（Task 2.3 で偽のロガーが空） |

**逸脱なし。**

## Global Constraints

- ツール ID の綴りは `checkin`（`TOOL_CHECKIN = "checkin"`）。公開パスは `/checkin/`。dev のポートは `5179`。Caddy の断片は `deploy/checkin/caddy/70-checkin.conf`、web root は `/var/www/tasuki-checkin`
- 道具名 `Check-in Cards`・札の左上の一語 `始終`。1 行の説明と画面の文言は設計のまま（足りない字は Task 3.0 で base 層に足す）
- やり方は設計 §3 の 10 種・札の並び・既定の公開の仕方のとおり。**札の名前は札の顔に出さない**（凡例・山の下・読み上げにだけ使う）
- 匿名は**サーバーが送らない**ことで守る（設計 §6）。開く前は他人の札を、匿名で開いた後は「誰がどの札か」も「自分の札がどの山か」も、どの受け手のどのフレームにも載せない
- 公開の仕方は、その回で誰かが出したら変えられない（判断 5）。新しい回（もう一回・別のやり方）は既定に戻る（判断 8）
- 「札を出す人」＝この道具に在席（`isPresentIn(p, TOOL_CHECKIN)`）し、見学でない人（判断 10）。0 人なら自動では開かない
- 回にまたがる操作の取り違えを、回の番号 `seq` で防ぐ（いまの回と違う `seq` の操作は何もしない）【統括の判断】
- 生の色を書かない。字の大きさは 5 段のトークン。札の絵の SVG は色を属性に書かず、クラスでトークン（`--ivory`・`--coal`・`--gold-*`）を当てる
- 画面の文言は書体の base 層に収める（E13）。足すときは `tests/support/font-base.ts` の `outsideBase` で実測してから
- 動きは全体で 2 秒以内。`prefers-reduced-motion` では動かさず、開いた形をすぐ出す（E12）
- ハンドラはログを書かない。表示名・札をログへ出さない
- `e2e/specs/buttons.spec.ts` には既存の test に相乗りせず、この道具の独立した `test.describe` を足す
- 変異 ID は **495〜520 だけ**。着手時に `scripts/lib/mutation-declarations.mjs` で空きを確かめる（別セッションの epic #360 と衝突させない）
- **`pnpm install` は打たない。** 新しい `package.json` を足したら統括に lockfile の更新を依頼して止まる
- コミットの末尾は **`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`**（Opus のタスクは `Claude Opus 5.5`）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない。プロセスを止めない。dev サーバー・E2E・Playwright を起動しない。ブランチを切り替えない。作業ツリーやコミットを巻き戻す git 操作（`checkout`・`switch`・`stash`・`reset`・`restore`）をしない**（戻すときは手で直すか、新しいコミット）。変異を当てて戻すのは `git apply` / `git apply -R` だけ

## Review Focus

素のテストでは突かないが、使う人に効きそうな入力（効く順）。各行のテストは担当のタスクに足してある。

1. **匿名で開く動き** → 伏せ札を**席の位置で**裏返すと、席と札の対応が画面に出てしまう。動きは山の側だけで起こし、匿名では席の伏せ札は伏せたまま消える（Task 3.5〈m517〉）
2. **「待たずに開く」と「もう一回」がほぼ同時に届く／もう一回の直後に古い回の札が届く** → 新しい回が 0 枚で開いたり、古い札が新しい回に入ったりしない（Task 1.3 の `seq`〈m503〉・Task 2.4 の実 WS）
3. **最後のまだの人がタブを閉じる・選択画面へ戻る** → 残った全員が出していれば、その場で全員の画面が開く（Task 2.3〈m507〉・Task 2.4〈m508〉）
4. **タブを再読み込みした（切断して同じ組で復帰）** → 出した札も見学も残っている（Task 1.3・Task 2.4）
5. **札を出す人が 0 人（全員が見学・誰も開いていない）** → 自動では開かない（`every` の空集合の罠。Task 1.3〈m500 の隣〉）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/checkin-core test` | 1.x | 20 秒 | 25 | 8 分 |
| `pnpm --filter @tasuki/sync test -- <ファイル>` | 2.x | 30〜60 秒 | 25 | 20 分 |
| `pnpm --filter @tasuki/sync test`（全件） | 段 2 の終わり・PR の前 | 3〜5 分 | 3 | 12 分 |
| `pnpm --filter @tasuki/checkin-web test` | 3.x | 30 秒〜1 分 | 35 | 30 分 |
| `pnpm --filter @tasuki/landing test` | 4.1 | 1 分 | 4 | 4 分 |
| `pnpm typecheck` / `pnpm lint` | 各段の終わり | 3〜5 分 | 8 | 40 分 |
| `pnpm test`（turbo の全件） | 各段の終わり | 8〜12 分 | 4 | 45 分 |
| scripts の自己テスト ＋ 全 audit | 各段の終わり・許可表を触った後 | 2〜3 分 | 6 | 15 分 |
| 変異を 1 本ずつ当てて赤を見る（`--id` か `git apply`） | 1.6・2.5・3.6・4.1 | 1〜2 分 | 24 | 40 分 |
| 変異の全件 | 宣言を足すので `--changed` は全件に倒れる → **CI に任せる** | CI 約 11 分 | 1〜2 | CI |
| E2E の変えた spec だけ（`checkin`・`buttons`・`routing`・`landing`・`landing-design`・`site-exterior`） | 統括・4.3 の後 | 5〜10 分 | 2〜3 | 25 分 |
| E2E 全件 | CI | — | — | CI |
| 文言の表を base 層で決める（統括） | 3.0 | 30 分 | 1 | 30 分 |
| 撮影して poker と並べる（統括） | 3.7 | 1〜1.5 時間 | 1 | 1.5 時間 |
| 実画面の確認（統括＋利用者） | 3.7・4.4 | 30 分〜1 時間（往復を含めない） | 2 | 1.5 時間 |
| **合計の見込み** | | | | **約 9〜10 時間**（うち統括の直列 4〜5 時間） |

**見た目の直しの往復は入れていない。** 撮影（3.7）と実画面（4.4）でそれぞれ 1〜2 往復を見込む。

## 取り決め

- **枝と PR**: 実装は `feature/406-checkin-cards`（設計と計画のコミットがある `docs/406-checkin-checkout-design` から切る）。**1 本の枝に 4 段をコミットで積み、PR は 1 本**【統括の判断: ADR 0013 の既定（1 Issue = 1 PR）に分割の理由が当たらず、agenda も 4 段を 1 本（#431）で入れた。PR の本文を段ごとの節に分ける】。段の境目で統括が全件の検査を流す
- 各タスクは**テストファースト**: 赤いテストを書き、**赤を見てから**実装し、緑にする。アサーションは値が分かれる局面に置く（例: 匿名の漏れは「開いた後」でしか分かれない）
- **自分の変異を 1 本だけ当てて赤を見る手順**（全件は統括・CI）:
  ```bash
  git status --porcelain          # 空であること
  git apply scripts/mutations/m4XX-*.patch
  pnpm --filter <pkg> test -- <テストファイル>   # 赤を見る
  git apply -R scripts/mutations/m4XX-*.patch
  git status --porcelain          # 空に戻ったこと
  ```
  パッチの 1 行目は `# 変異 4XX: <名前>`。宣言は `{ id, label, patch, pkg, tests, note }`（既存の宣言が型）
- **共有ファイルを触ったら既存の変異パッチが当たるかを確かめる**: 着手時に `grep -l '<ファイルのパス>' scripts/mutations/*.patch` で洗い、タスクの終わりに `git apply --check` で 1 本ずつ。当たらなければ文脈を直す（番号は変えない）。少なくとも `ws-adapter.ts`・`adapters/ws/*.ts`・`create-sync-server.ts`・`topic-broadcast.ts`・`destroy-room.ts`・`timer-ws-broadcaster.ts`・`apps/landing/src/**` に既存のパッチがある（agenda のときは m36・m80・m83・m96・m150・m159・m160・m169 を直した）

## ファイルの地図

| 層 | 作る | 変える |
|---|---|---|
| `packages/checkin-core` | `package.json`・`tsconfig.json`・`vitest.config.ts`（agenda-core を写す）・`src/{index,methods,types,errors,checkin,projection,schemas,error-messages}.ts`・`tests/{methods,checkin,projection,projection-invariant,schemas,error-messages}.test.ts`・`tests/support/{font-base,fixtures}.ts` | — |
| `apps/tasuki-sync` | `src/ports/{checkin-store,checkin-server-msg}.ts`・`src/adapters/in-memory-checkin-store.ts`・`src/application/{checkin-broadcast,checkin-handlers}.ts`・`test/{in-memory-checkin-store,checkin-handlers,live-ws.checkin}.test.ts` | `package.json`・`src/application/{tool-id,destroy-room,topic-broadcast}.ts`・`src/application/log/vocabulary.ts`・`src/adapters/{ws-adapter,timer-ws-broadcaster}.ts`・`src/adapters/ws/{connection-gate,tool-channel}.ts`・`src/create-sync-server.ts`・`test/support/{live-sync-server,test-ws-adapter,room-builder,spy-destroyer}.ts`・`test/{destroy-room,solo-leave,ws-adapter-tool-query,ws-adapter.message,timer-ws-broadcaster,connection-error-text,connection-error-text-sources,live-ws.join-entries,live-ws.passphrase-limit}.test.ts`・`test/ws/connection-gate.test.ts` |
| `apps/checkin-web` | agenda-web の骨組み（`index.html`・`package.json`・`tsconfig.json`・`vite.config.ts`・`vitest.config.ts`・`src/{main,App,router,copy,server-message}.ts(x)`・`src/index.css`・`src/components/LoadingView.tsx`・`src/hooks/use-reduced-motion.ts`・`tests/{setup,router.test,server-message.test,copy-fits-font-base.test,rendered-text-fits-font-base.test,screens-do-not-import-sync-client.test}.ts(x)`・`tests/support/{font-base,scripted-web-socket}.ts`）＋ 固有: `src/hooks/use-checkin-sync.ts`・`src/{method-copy,reveal-view}.ts`・`src/card-art/*.tsx`・`src/screens/CheckinRoom.tsx`・`src/components/{MethodPicker,PromptPanel,SeatRow,Hand,CardFace,RevealBoard,RoundDock}.tsx`・`src/{table,reveal}.css` と各テスト | — |
| 玄関・dev | — | `apps/landing/src/{tools.ts,ToolMark.tsx,index.css}`・`apps/landing/vite.config.ts`・`apps/landing/tests/{tool-public-paths,dev-hub-redirect-wiring,room-choice-layout,App}.test.ts(x)`・新規 `apps/landing/tests/tools-copy-fits-font-base.test.ts`・`packages/dev-hub-redirect/{src/index.ts,README.md}` |
| 配備 | `deploy/checkin/{app.env,NOTES.md,caddy/70-checkin.conf}` | `deploy/README.md`・`deploy/caddy/{README.md,tasuki.conf}` |
| 検査 | `scripts/mutations/m495〜m518-*.patch` | `scripts/audit-{dependency-direction,structure,domain-side-effects,domain-error-shape,log-hygiene,ui-components,web-sync-boundary}.mjs`（**実行して赤になったものだけ**）・`scripts/audit-web-sync-boundary.test.mjs`・`scripts/lib/mutation-declarations.mjs`・`turbo.json` |
| E2E | `e2e/specs/checkin.spec.ts`・`e2e/support/checkin.ts` | `e2e/harness/paths.ts`・`e2e/package.json`・`e2e/tests/{workspace,fragment-sources}.test.ts`・`e2e/specs/{routing,landing,landing-design,buttons,site-exterior}.spec.ts` |
| 文書 | `docs/adr/0028-checkin-cards.md`・`docs/retrospectives/2026-10-XX-issue-406-checkin-cards.md` | `docs/adr/{README,0011-threat-model-and-data-classification,0017-bounded-contexts-and-packages}.md`・`docs/guides/{architecture,development}.md`・`README.md`・`packages/ui/README.md`・設計正本の末尾 |

---

## 段 1 — checkin-core と ADR（変異 m495〜m504）

### Task 1.1: パッケージの骨組みとやり方の表

**Files:** Create `packages/checkin-core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/methods.ts}`・`tests/methods.test.ts`。Modify `turbo.json`（agenda-core と同じ行を並べる）

**Interfaces（Produces・`src/methods.ts`）:**
```ts
export const SIDES = ["checkin", "checkout"] as const;           export type Side = (typeof SIDES)[number];
export const VISIBILITIES = ["named", "anonymous"] as const;     export type Visibility = (typeof VISIBILITIES)[number];
export const METHOD_IDS = ["weather","energy","focus","takeaway-goal","role","roti","takeaway-done","best-part","mood","next-meeting"] as const;
export type MethodId = (typeof METHOD_IDS)[number];
export type CardId = string; // 1〜16 字。やり方ごとの集合は METHODS が正本
export interface MethodRule { readonly side: Side; readonly cards: readonly CardId[]; readonly defaultVisibility: Visibility }
export const METHODS: Readonly<Record<MethodId, MethodRule>>;
export function methodsOf(side: Side): readonly MethodId[]; // METHOD_IDS の並びのまま
```
札の ID（並びは設計 §3 の札の順）: weather `sunny,cloudy,rain,thunder`／energy `1..5`／focus `20,50,80,100`／takeaway-goal `decide,learn,discuss,listen`／role `listener,questioner,summarizer,energizer`／roti `1..5`／takeaway-done `yes,half,no`／best-part `decided,talked,learned,nothing`／mood `clear,foggy,tired,excited`／next-meeting `keep,shorter,fewer,skip`。既定が匿名なのは energy・roti・next-meeting だけ。**文言は持たない**（文言は画面の `method-copy.ts`。言い換えが core に波及しない）【統括の判断】

- [ ] **Step 1:** `package.json` は agenda-core を写し、`name` を `@tasuki/checkin-core`、依存を `valibot` と `neverthrow` だけにする。**足したら統括に lockfile の更新を依頼して止まる**
- [ ] **Step 2: 赤いテスト** `tests/methods.test.ts` —— 10 種の `side`・札の並び・既定を表どおりに固定する。`methodsOf("checkin")` が 5 つ（weather〜role）、`methodsOf("checkout")` が 5 つ。全札 ID が 1〜16 字で、やり方の中で重複しない。札の枚数は 3〜5
- [ ] **Step 3:** 赤を見る → 実装 → `pnpm --filter @tasuki/checkin-core test` で緑 → コミット `feat(checkin-core): パッケージの骨組みとやり方の表を足す（#406）`

### Task 1.2: 型とエラーコード

**Files:** Create `src/types.ts`・`src/errors.ts`

**Interfaces（Produces）:**
```ts
export interface Round {
  readonly seq: number;                       // 1 から。新しい回ごとに +1
  readonly method: MethodId;
  readonly visibility: Visibility;
  readonly status: "open" | "revealed";
  readonly cards: ReadonlyMap<string, CardId>; // participantId → 札（最後に出したもの）
}
export interface CheckinState { readonly round: Round | null; readonly lastSeq: number; readonly spectators: ReadonlySet<string> }
export const INITIAL_CHECKIN_STATE: CheckinState; // round: null・lastSeq: 0・spectators 空
```
- `src/errors.ts`: `CHECKIN_DOMAIN_ERROR_CODES = ["CHECKIN_NO_ROUND","CHECKIN_REVEALED","CHECKIN_SPECTATING","CHECKIN_CARD_UNKNOWN","CHECKIN_VISIBILITY_LOCKED","CHECKIN_INVALID_RANDOM"] as const`・`type CheckinDomainErrorCode`・`interface CheckinError<C extends CheckinDomainErrorCode = CheckinDomainErrorCode> { readonly code: C }`。**文言を持たない**（`audit-domain-error-shape`）

- [ ] **Step 1:** 型だけ。赤いテストは 1.3〜1.5 が兼ねる。`pnpm --filter @tasuki/checkin-core typecheck` → コミット

### Task 1.3: 回の遷移

**Files:** Create `src/checkin.ts`・`tests/checkin.test.ts`・`tests/support/fixtures.ts`（3 人の場: `a`・`b`・`c`）

**Interfaces（Produces）:** 状態が変わらないときは**同じ参照**を返す（ハンドラが参照の比較で「配らない」を決める）。
- `chooseMethod(s, method: MethodId): CheckinState` —— 新しい回（`seq = s.lastSeq + 1`・既定の公開の仕方・open・札なし）。いつでも受ける（開く前でも前の回を捨てる）
- `drawMethod(s, side: Side, randomInt: (n: number) => number): Result<CheckinState, CheckinError<"CHECKIN_INVALID_RANDOM">>` —— 候補は `methodsOf(side)` から**いまの回のやり方を除いたもの**（いまのやり方が反対側なら 5 つ全部）。`randomInt(候補数)` が `[0, n)` の整数でなければ `CHECKIN_INVALID_RANDOM`
- `playCard(s, { participantId, seq, card }): Result<CheckinState, CheckinError<"CHECKIN_NO_ROUND"|"CHECKIN_REVEALED"|"CHECKIN_SPECTATING"|"CHECKIN_CARD_UNKNOWN">>` —— 上書き（E10）。同じ札の出し直しは同じ参照
- `setVisibility(s, { seq, visibility }): Result<…, "CHECKIN_NO_ROUND"|"CHECKIN_VISIBILITY_LOCKED">` —— その回に札が 1 枚でもあれば `LOCKED`（開いた後も含む。E7）
- `reveal(s, { seq }): Result<…, "CHECKIN_NO_ROUND">` —— open → revealed。revealed なら同じ参照
- `playAgain(s, { seq }): Result<…, "CHECKIN_NO_ROUND">` —— 同じやり方の新しい回（既定の公開の仕方・札なし。E11・判断 8）
- `setSpectator(s, participantId, spectator: boolean): CheckinState` —— poker の `setSpectator` と同じ規則（open で見学へ移ると札を捨てる。開いた後は札を動かさない）
- `prune(s, knownIds: ReadonlySet<string>): CheckinState` —— 名簿に居ない人の札と見学を落とす（何も落ちなければ同じ参照）
- `applyAutoReveal(s, players: readonly string[]): CheckinState` —— open で、`players` が 1 人以上かつ全員が札を持つときだけ revealed
- **`seq` がいまの回と違う操作は、何もせず同じ参照を `ok` で返す**（`playCard`・`setVisibility`・`reveal`・`playAgain`）

- [ ] **Step 1: 赤いテスト**（各遷移の正常・拒否・同じ参照を `toBe` で）
  - 出し直すと最後の札だけが残る（E10）〈m502〉
  - 1 人が出した後の `setVisibility` は `CHECKIN_VISIBILITY_LOCKED`、出す前は通る（E7）〈m498〉
  - 既定が匿名の roti で名前つきに切り替えて 1 枚出し、`playAgain` → 新しい回は匿名・札なし（判断 8）。`chooseMethod` でも同じ〈m499〉
  - `drawMethod` に「常に 0 を返す」「常に n-1 を返す」の 2 つの乱数を与え、いまのやり方が weather のとき checkin 側から **weather が選ばれない**・候補が 4 つ（引数 `n === 4` を記録して見る）（E2）〈m501〉。いまのやり方が roti のときの checkin 側は `n === 5`。`randomInt` が 4 や 1.5 を返せば `CHECKIN_INVALID_RANDOM`
  - `applyAutoReveal`: 見学者は分母に入らない（a・b が出し c が見学 → 開く。E9）〈m500〉／`players` が空なら開かない（Review Focus 5）／1 人でもまだなら開かない
  - **古い `seq` の `reveal`・`playAgain`・`playCard`・`setVisibility` は同じ参照**（Review Focus 2）〈m503〉
  - 見学者の `playCard` は `CHECKIN_SPECTATING`。やり方に無い札は `CHECKIN_CARD_UNKNOWN`。開いた後の `playCard` は `CHECKIN_REVEALED`。回が無いときは `CHECKIN_NO_ROUND`
  - open で見学へ移ると札が消える／開いた後に見学へ移っても札は残る
  - `prune` で名簿に居ない人の札と見学が落ちる。切断（名簿に残る）では落ちない（Review Focus 4 の core 側）
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 1.4: 受け手ごとの投影（匿名の本体）

**Files:** Create `src/projection.ts`・`tests/projection.test.ts`・`tests/projection-invariant.test.ts`

**Interfaces（Produces）:**
```ts
export interface SeatInput { readonly id: string; readonly name: string; readonly present: boolean } // present = この道具に在席
export interface SeatView { readonly id: string; readonly name: string; readonly played: boolean }
export interface PileView { readonly card: CardId; readonly count: number; readonly names?: readonly string[] } // names は名前つきの開いた後だけ
interface RoundHead { readonly seq: number; readonly method: MethodId; readonly visibility: Visibility; readonly locked: boolean; readonly seats: readonly SeatView[] }
export type RoundView =
  | (RoundHead & { readonly status: "open"; readonly playedCount: number; readonly playerCount: number; readonly yourCard: CardId | null })
  | (RoundHead & { readonly status: "revealed"; readonly piles: readonly PileView[] });
export interface CheckinView { readonly you: string; readonly spectating: boolean; readonly spectatorCount: number; readonly round: RoundView | null }
export function playersOf(s: CheckinState, seats: readonly SeatInput[]): string[]; // present かつ見学でない ID（seats の並び）
export function toView(s: CheckinState, viewerId: string, seats: readonly SeatInput[]): CheckinView;
```
- `seats`（席）は「札を出す人」∪「札を持つ人（名簿に居る）」を `seats` の並びで。`played` は札を持つか
- `playedCount` は札を出す人のうち出した人の数、`playerCount` は札を出す人の数（画面の「6 / 8 人が出しました」）
- 開いた後の `piles` は**やり方の札の並びで全種**（0 枚も残す）。`names` は名前つきのときだけ、席の並びで。**匿名では `names` の鍵ごと持たない**
- **開いた後は `yourCard` を持たない**（判断 7。名前つきでも持たない ―― 型で匿名の取りこぼしを無くす）【統括の判断】
- 開く前の `yourCard` は**見る人自身の札だけ**

- [ ] **Step 1: 赤いテスト** `tests/projection.test.ts`
  - 開く前、a に向けた投影を `JSON.stringify` した文字列に、b・c の札の ID が**どこにも現れない**（`yourCard` は a の札・b の席は `played: true` だけ）（E5）〈m495〉
  - 匿名で開いた後、どの受け手への投影にも `names` の鍵が無く、`JSON.stringify(view.round.piles)` に a・b・c の ID と名前が現れない（E6）〈m496〉。`yourCard` の鍵も無い（判断 7）〈m497〉
  - 名前つきで開いた後、`sunny` の山の `names` が出した人の名前を席の並びで持つ（E8）
  - 0 枚の札も `count: 0` で残り、並びはやり方の札の順
  - 見学者に向けた投影は `spectating: true`・`yourCard: null`。`spectatorCount` が数える
- [ ] **Step 2: 赤いテスト** `tests/projection-invariant.test.ts`（性質テスト。乱数は種つきの自前の LCG で 500 通り。依存を足さない）—— 任意の操作の列（やり方・出す・出し直す・見学・切り替え・開く）の後で、**受け手 X への投影の文字列に、X 以外の人の札が「その人の ID・名前と結びついて」現れるのは、名前つきで開いた後の `names` だけ**。オラクルは projection を使わず、状態から「現れてはいけない (ID, 札) の組」を列挙して、投影を JSON にしたものに両方が同じ山・同じ席の要素に入っていないかを走査する
- [ ] **Step 3:** 赤を見る → 実装 → 緑。`index.ts` は公開記号を列挙する（`export *` を書かない・`audit-public-surface`）→ コミット

### Task 1.5: 境界のスキーマと文言

**Files:** Create `src/schemas.ts`・`src/error-messages.ts`・`tests/{schemas,error-messages}.test.ts`・`tests/support/font-base.ts`（agenda-core を写す）

**Interfaces（Produces）:**
- コマンド（すべて `v.strictObject`。`seq` は 1 以上の整数・`card` は 1〜16 字の文字列）:
  `checkin.method.choose { method }`・`checkin.method.draw { side }`・`checkin.card.play { seq, card }`・`checkin.visibility.set { seq, visibility }`・`checkin.reveal { seq }`・`checkin.again { seq }`・`checkin.spectator.set { spectator: boolean }`
- `CheckinCommandSchema`・`type CheckinCommand`・`CheckinFrameSchema`（非 strict の `v.object`: `{ type: "checkin", state: CheckinView }`）・`CheckinErrorFrameSchema`・`CHECKIN_ERROR_CODES`（ドメインのコード ＋ `INVALID_JSON`・`INVALID_COMMAND`・`NOT_IN_ROOM`・`RATE_LIMITED`・`MESSAGE_TOO_LARGE`・`INTERNAL_ERROR`。agenda の共通部分と同じ並び）・`type CheckinErrorCode`
- `checkinErrorMessageFor(code: CheckinErrorCode): string`。共通のコードの文は既存の正本と同じ文（`apps/tasuki-sync/test/connection-error-text-sources.test.ts` が突き合わせる）

- [ ] **Step 1: 赤いテスト** `tests/schemas.test.ts` —— 7 つのコマンドが通る。**余剰の項目（`{ command: "checkin.reveal", seq: 1, x: 1 }`）が落ちる**〈m504〉。`seq: 0`・`1.5`・`"1"`、`card: ""`・17 字、`method: "weather2"`、`visibility: "secret"` が落ちる。フレームは項目を足しても通る
- [ ] **Step 2: 赤いテスト** `tests/error-messages.test.ts` —— 全コードに文言があり、**base 層に収まる**
- [ ] **Step 3:** 赤を見る → 実装 → 緑 → `node scripts/audit-domain-error-shape.mjs`・`node scripts/audit-domain-side-effects.mjs`（赤なら 1.6 で宣言を足す）→ コミット

### Task 1.6: 検査の登録と変異 m495〜m504（Opus）

**Files:** Modify `scripts/audit-dependency-direction.mjs`（`"packages/checkin-core": []`）・`scripts/audit-structure.mjs`（`{ pkg: "packages/checkin-core", src: "src", test: "tests", entry: "index.ts" }`）・`scripts/audit-domain-error-shape.mjs`（`{ file: "packages/checkin-core/src/errors.ts", type: "CheckinError" }`）・`scripts/audit-domain-side-effects.mjs`・`scripts/audit-log-hygiene.mjs` —— **実行して赤になったものだけ**。`scripts/lib/mutation-declarations.mjs`・`scripts/mutations/m495〜m504-*.patch`

- [ ] **Step 1:** 足す前に流して赤を見る:
  ```bash
  bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
  for s in audit-structure audit-dependency-direction audit-domain-side-effects audit-domain-error-shape audit-log-hygiene audit-assembly-wiring audit-public-surface; do node scripts/$s.mjs || echo "RED $s"; done
  ```
- [ ] **Step 2:** 赤になったものだけ足す → 同じコマンドで全部緑
- [ ] **Step 3:** 変異 m495〜m504 を書き、1 本ずつ当てて赤・戻して緑を見る（§変異の割り当て）→ コミット

### Task 1.7: ADR 0028 と分類

**Files:** Create `docs/adr/0028-checkin-cards.md`（`docs/adr/template.md` の形・ADR 0027 の構成を型にする）。Modify `docs/adr/README.md`・`docs/adr/0017-bounded-contexts-and-packages.md`（**末尾**に追記節「文脈を 7 つにする」）・`docs/adr/0011-threat-model-and-data-classification.md`（決定 1 の「個人に紐づく」の行に「チェックインの札（誰がどの札を出したか）（#406）」、**末尾**に #406 の追記節: S3・S7 の範囲に checkin のコマンドが入る・頻度の上限は設けない）

- ADR 0028 の決定: ①独立の文脈と `?tool=checkin`（設計 §7）②匿名はサーバーが送らない・受け手ごとの投影（設計 §6）③公開の仕方の鍵と回かぎり（判断 5・8）④回の番号で操作を指し、違う回の操作は何もしない ⑤見学者を自前で持つ（判断 9）⑥「全員」はこの道具に在席する人（判断 10）⑦名簿の変化を `hub.broadcastRoster` の口で受けて測り直す ⑧checkin のコマンドは checkin の接続だけ（ADR 0026 決定 7 と同じ）⑨お題を checkin の接続にも配る（ADR 0021 決定 2）⑩直接遷移関数 ＋ `Result`（ADR 0016 決定 1）
- 退けた案: 見学者を `room-core` へ移す／全員に同じフレームを配り画面で隠す／名簿の変化を各経路（切断・退出・参加）に書き足す（`saveRoster` の deps を広げる）／時間の制限
- **完了形を書くのは段 1 が入れた範囲だけ**（core と wire）。サーバー・画面は「段 2・3 で入れる」と書く

- [ ] **Step 1:** 書く → `node scripts/check-links.mjs`
- [ ] **Step 2: 段 1 の終わり**: `pnpm test`・`pnpm typecheck`・`pnpm lint`・scripts の自己テストと全 audit → コミット。統括へ報告

---

## 段 2 — 同期サーバーの経路（変異 m505〜m512）

### Task 2.1: ツール ID・接続の振り分け・送り口

**Files:** Modify `apps/tasuki-sync/package.json`（`@tasuki/checkin-core`。**足したら統括に lockfile を依頼して止まる**）・`src/application/tool-id.ts`（`TOOL_CHECKIN = "checkin"`）・`src/adapters/ws/connection-gate.ts`（`Protocol` に `"checkin"`・`?tool=checkin` を振り分ける）・`src/adapters/ws/tool-channel.ts`（checkin の受け口。**`notifiesConnect` を false にしない**・注記の列挙に checkin を足す）・`src/adapters/ws-adapter.ts`（`options.checkin`・`sendCheckin(connId, msg)`。全員へ同じものを送る口は作らない）・`src/application/log/vocabulary.ts`（`PROTOCOL_LOG_NAMES.checkin`）・Create `src/ports/checkin-server-msg.ts`（`CheckinServerMsg = { type: "checkin"; state: CheckinView } | { type: "error"; code: CheckinErrorCode; message: string }`）・`test/support/{test-ws-adapter,live-sync-server}.ts`（`connectCheckin()`）

- [ ] **Step 1: 赤いテスト** `test/ws-adapter-tool-query.test.ts`「`?tool=checkin` は checkin の層へ届く（timer・ハブ・roulette・agenda の層へ届かない）」〈m509〉。`test/ws-adapter.message.test.ts`「checkin の層のサイズ超過は `MESSAGE_TOO_LARGE`」「checkin のハンドラが同期 throw しても接続もプロセスも落ちず `INTERNAL_ERROR`」（agenda の同名テストを写す）。`test/ws/connection-gate.test.ts` に 1 行
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test -- test/ws-adapter-tool-query.test.ts test/ws-adapter.message.test.ts test/ws/connection-gate.test.ts` → コミット

### Task 2.2: 保管と破棄

**Files:** Create `src/ports/checkin-store.ts`・`src/adapters/in-memory-checkin-store.ts`（agenda-store を写す: `get`・`put`・`delete`）・`test/in-memory-checkin-store.test.ts`。Modify `src/application/destroy-room.ts`（`RoomDestroyerDeps` に `checkins: Pick<CheckinStore, "delete">` を**必須**で。`agendas` と同じ「optional にしてはならない」の注記）・`test/destroy-room.test.ts`・`test/solo-leave.test.ts`・`test/support/{room-builder,spy-destroyer}.ts`

- [ ] **Step 1: 赤いテスト** `test/destroy-room.test.ts`「破棄の後に checkin の状態が無い」〈m510〉
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 2.3: 配信とメッセージ層

**Files:** Create `src/application/checkin-broadcast.ts`・`src/application/checkin-handlers.ts`・`test/checkin-handlers.test.ts`（`roulette-handlers.test.ts` の作りを写す。偽の送信・偽の乱数・偽のロガー）

**Interfaces（Produces）:**
```ts
// checkin-broadcast.ts
export interface CheckinBroadcasterDeps { store: Pick<RoomStore, "get">; checkins: CheckinStore; send: (connId: string, msg: CheckinServerMsg) => void }
export interface CheckinBroadcaster {
  publish(roomCode: string): void;                   // checkin の接続 1 本ずつへ、その接続の参加者に向けた投影を送る
  sendCurrent(connId: string, roomCode: string): void; // 無ければ INITIAL_CHECKIN_STATE を置いてから送る（ルームが消えていたら置かない）
}
export function makeCheckinBroadcaster(deps: CheckinBroadcasterDeps): CheckinBroadcaster;
export function seatsOf(room: Room): SeatInput[]; // 名簿の並び・present = isPresentIn(p, TOOL_CHECKIN)
// checkin-handlers.ts
export interface CheckinHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  checkins: CheckinStore; broadcaster: CheckinBroadcaster;
  send: (connId: string, msg: CheckinServerMsg) => void;
  random: Pick<RandomSource, "randomInt">; logger: Logger;
}
export interface CheckinHandlers {
  handleMessage(connId: string, raw: string): Promise<void>;
  /** 名簿が変わった（参加・切断・退出・ハブへの移動）。状態が無ければ何もしない */
  rosterChanged(roomCode: string): void;
}
export function makeCheckinHandlers(deps: CheckinHandlerDeps): CheckinHandlers;
```
組み立て（`roulette-handlers.ts` と同じ骨）:
- 受ける言葉は `v.union([HubCommandSchema, CheckinCommandSchema])`。`room.join` は `joinToolRoom(…, tool: TOOL_CHECKIN, afterJoin: sendCurrent)`。`room.create`・`room.check` は `INVALID_COMMAND`
- ルームは `findRoomByToolConnection(store, connId, TOOL_CHECKIN)`。無ければ `NOT_IN_ROOM`
- 各コマンド: `prune`（名簿の ID）→ 遷移 → `applyAutoReveal(playersOf(state, seatsOf(room)))` → 保管して `publish`。`Err` は送り主へエラー（`CHECKIN_INVALID_RANDOM` は `INTERNAL_ERROR`）。**同じ参照なら送り主にだけ `sendCurrent`**
- 参加者 ID は `findParticipantByConnId(room, connId)` から取る（wire から受けない）
- **見学者も操作できる**（判断 4。poker の「票を公開する」の帯は見学中も押せる。`apps/poker-web/src/pages/RoomPage.tsx` の `VotingDock` を 2026-10-28 に確認）。拒むのは見学者の `checkin.card.play` だけ
- `rosterChanged(roomCode)`: 状態があれば `prune` → `applyAutoReveal` → 変わったら保管し、**変わらなくても `publish`**（席は名簿から導くので、状態が同じでも画面が変わる）
- ハンドラはログを書かない

- [ ] **Step 1: 赤いテスト**
  - 参加すると本人に `checkin` フレームが 1 通（状態が無ければ既定を置く）
  - **a と b の接続に届いたフレームが別物**: a が出した後、b に届いたフレームに a の札が無く、a に届いたフレームの `yourCard` が a の札（E5 のサーバー側）〈m505〉
  - **選択画面（ハブ）だけに居る c は札を出す人に数えない**: a・b が出すと開く（判断 10）〈m506〉
  - b がまだのまま切断 → `rosterChanged` で a だけが出していれば開き、a に開いたフレームが届く（Review Focus 3）〈m507〉
  - 開く前に途中で参加した c は札を出す人に入り、a・b が出しても c が出すまで開かない（設計 §7「開く前に入ってきた人は出せる」）
  - 見学中の c が送った `checkin.reveal` で開く（判断 4）。見学中の c の `checkin.card.play` は `CHECKIN_SPECTATING`
  - 古い `seq` の `checkin.reveal` は全員へは配らず、送り主にだけ 1 通
  - 匿名で開いた後に届いたすべてのフレームを JSON にして、他人の ID と札の組が同じ山に無い（E6 のサーバー側）
  - 開いた後の `checkin.visibility.set` は `CHECKIN_VISIBILITY_LOCKED`（E7）
  - ハブとして在席している接続の `checkin.reveal` は `NOT_IN_ROOM`
  - 一通り操作した後、偽のロガーの記録が空
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test -- test/checkin-handlers.test.ts` → コミット

### Task 2.4: 合成ルートの配線と実 WS の検査

**Files:** Modify `src/create-sync-server.ts`（ストア・配信・ハンドラ〔`random` は既存の `createCryptoRandomSource()`〕・`options.checkin`・破棄の依存）・`src/adapters/timer-ws-broadcaster.ts`（`TimerWsBroadcasterDeps` に**必須**の `onRosterBroadcast: (roomCode: string) => void`。`broadcastRoster` の最後に呼ぶ。前方参照で `checkinHandlers.rosterChanged` を渡す）・`test/timer-ws-broadcaster.test.ts`・`src/application/topic-broadcast.ts`（`TOPIC_RECIPIENT_TOOLS` に `TOOL_CHECKIN`）・`test/live-ws.join-entries.test.ts`・`test/live-ws.passphrase-limit.test.ts`（`Entry` と `ENTRIES` に `checkin`。**同じ表から漏れている `agenda` も足す**【統括の判断: 別 Issue にしない。赤なら統括へ報告】）・`test/connection-error-text{,-sources}.test.ts`（checkin-core の表を並べる）。Create `test/live-ws.checkin.test.ts`（`live-ws.agenda.test.ts` を型にする）

**口の置き場所【統括の判断】**: 名簿を書く経路は `saveRoster` に閉じ、`saveRoster` は必ず `hub.broadcastRoster` を呼ぶ（`test/save-roster.wiring.test.ts`）。その最後に口を 1 つ置けば、参加・切断・退出・ハブへの移動のすべてで測り直せる。`saveRoster` の deps を広げると呼び出し 6 か所が変わり、poker のような自前の切断処理（`closed`）は接続層の `onDisconnect` を奪う

- [ ] **Step 1: 赤いテスト** `test/live-ws.checkin.test.ts`
  - checkin の接続 2 本（a・b）が同じルームに参加し、a が weather を選ぶと両方に同じ `method`・`seq` が届く（E1）。ハブ・timer・poker・お題・roulette・agenda の接続には `checkin` フレームが届かない
  - a・b が出すと、両方に `revealed` が届く（E3）。名前つきの `sunny` の山の `names` に a の名前（E8）
  - roti（匿名）で a・b が出して開いた後、**a の受信したすべての `checkin` フレームの JSON に b の参加者 ID と札の組が同じ山に無く、`yourCard` の鍵も無い**（E6）
  - **b が出さずに接続を閉じると、a だけで開く**（Review Focus 3・配線側）〈m508〉
  - b が出した後に接続を閉じ、同じ組（`resumeToken`）で張り直すと、b に届く `yourCard` が b の札のまま（Review Focus 4）
  - ほぼ同時に `checkin.reveal { seq: 1 }` と `checkin.again { seq: 1 }` を送っても、`seq: 2` の回が開いた状態にならない（Review Focus 2）
  - ハブ・timer・poker・お題・roulette・agenda の接続から送った `checkin.reveal` は拒まれ、状態が変わらない〈m509 の配線側〉
  - お題ツールで `topic.set` すると checkin の接続にも `topic` が届く〈m511〉
  - checkin の接続で誤った合言葉の `room.join` を続け、**接続を張り直しても**枠が続く〈m512〉
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test`（全件）・`node scripts/audit-assembly-wiring.mjs`・`node scripts/audit-log-hygiene.mjs` → コミット

### Task 2.5: 変異 m505〜m512（Opus）と段 2 の終わり

- [ ] **Step 1:** 変異 m505〜m512 を足して 1 本ずつ赤を見る。触った共有ファイルの既存パッチが当たるか（取り決め）
- [ ] **Step 2:** ADR 0028 の「段 2 で入れる」を完了形に（入れた範囲だけ）。`pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit → コミット。統括へ報告

---

## 段 3 — 画面 `apps/checkin-web`（変異 m513〜m517）

### Task 3.0: 書体の base 層を作り直して、設計の文言を収める（統括・利用者 2026-10-28 に「2」を選んだ）

設計の文言は base 層に無い字を約 30 字含む（下の「設計と食い違っていた点」1）。**言い換えず、base 層に字を足す**（利用者の決定）。作り直しの `build-fonts.py` はリポジトリに無かったので、**作り直しのスクリプトをリポジトリに入れる**（同じ問題に次に当たった人が直せるように）。

**Files:** Create `scripts/fonts/build-base-fonts.py`（運用者が手で流す。CI では流さない）・Modify `packages/ui/src/fonts/zkgn-{400,500,700}-base.woff2`・`packages/ui/src/tokens/fonts.css`（base 層の 3 面の `unicode-range` だけ）・`packages/ui/README.md`（作り直しの手順。`#78` の作業メモへの参照を置き換える）・Create `apps/checkin-web/src/base-font-chars.ts` は作らない（字の集合はスクリプトの引数で渡す）

**作り方（統括の判断）:**
- 字の集合 = **いまの base 層の cmap に入っている字（woff2 から fontTools で読む）∪ 足す字**。いまの字を 1 字も落とさない（各アプリの文言を走査し直さない。走査し直すと、過去に足した字の出どころを取りこぼす）
- 足す字 = 設計 §3・§5 の文言・凡例の候補・固定文言・玄関の札の説明に出る字のうち、base 層に無いもの（`outsideBase` で数える）。実装中に足りない字が出たら、同じスクリプトで足し直す
- 元の書体は Google Fonts の Zen Kaku Gothic New（OFL・`github.com/google/fonts/ofl/zenkakugothicnew` の Regular / Medium / Bold）。取得した版（コミット）をスクリプトの既定値と README に書く
- `pyftsubset` の既定に揃える（woff2・`--layout-features='*'`・ヒント無し）。ext 層は作り直さない（重なる字は base 層が先に当たるので害は無い。base の `@font-face` が ext より前に宣言されている順を保つ）
- `fonts.css` の 3 面の `unicode-range` は、新しい base の cmap から作る（手で書かない）。先頭の「自動生成: build-fonts.py」の注記は新しいスクリプト名に直す

- [ ] **Step 1:** 足す前に、いまの base 層の字数と 3 つのファイルの大きさを記録する
- [ ] **Step 2:** スクリプトを書いて流す。新しい base の cmap ⊇ 古い base の cmap（1 字も落ちていない）を、スクリプトの最後で確かめて落とす（fail-closed）
- [ ] **Step 3:** 増えた大きさを記録する（3 面の合計）。合計で 100KB を超えたら止めて利用者に見せる
- [ ] **Step 4:** 既存の全アプリの `copy-fits-font-base`・`rendered-text-fits-font-base` の試験と `packages/ui` の試験が緑のまま。E2E の書体ドリフト検査（`e2e/specs/` の書体の検査）は統括が流す
- [ ] **Step 5:** コミット（`chore: 書体の base 層を作り直し、#406 の文言の字を足す`）。設計正本の末尾に、足した字と大きさの増分を 1 行で記録する

設計の文言は**そのまま使う**（言い換えの候補表は撤回）。固定文言: `名前つき`・`匿名`・`別のやり方`・`ランダム`・`待たずに開く`・`もう一回`・`見学する`・`投票に加わる`・`見学中`・`チェックイン`・`チェックアウト`。画面の見出しは `チェックイン・チェックアウト`【統括の判断: agenda の見出し「進行タイマー」と同じく日本語。玄関の札の英名とは分ける】

### Task 3.1: アプリの骨組みと同期フック

**Files:** agenda-web から写す（ファイルの地図の「骨組み」）。`vite.config.ts` は `base: '/checkin/'`・`port: 5179`。`index.css` の先頭は `@import '@tasuki/ui';`。`package.json` の依存は agenda-web の `@tasuki/agenda-core` を `@tasuki/checkin-core` に替える。**足したら統括に lockfile を依頼して止まる**。`index.html` の紹介（OG）は agenda-web を写し、説明は Task 3.0 の 1 行（`apps/landing/tests/index-html-exterior.test.ts` が `tools.ts` と突き合わせる。4.1 で揃う）。Create `src/hooks/use-checkin-sync.ts`・`tests/use-checkin-sync.test.tsx`

**Interfaces（Produces）:**
- `router.ts`: `/checkin/?room=X` → `{ name: 'room', roomCode }`・それ以外 → 玄関（`hubPathFor`）
- `server-message.ts`: `topic` → `checkin` → ハブの順に見分ける（**`topic` を先に**・ADR 0021 決定 2 の MUST）
- `useCheckinSync(roomCode: string): CheckinSync` —— `useToolRoomSync` の項目 ＋ `checkin: CheckinView | null`・`chooseMethod(method)`・`drawMethod(side)`・`playCard(seq, card)`・`setVisibility(seq, visibility)`・`reveal(seq)`・`playAgain(seq)`・`setSpectator(spectator)`。見学は poker と同じく**ルームの中の切り替えだけ**（`setSpectator`）。入るときの指定は持たない（利用者 2026-10-28・poker の「見学する」#419 に揃える）

- [ ] **Step 1: 赤いテスト** `router.test.ts`・`server-message.test.ts`（topic を先に・どれでもなければ `null`）・`use-checkin-sync.test.tsx`（参加・告知・抜けたら玄関へは写し）
- [ ] **Step 2:** 赤を見る → 写す・実装 → `pnpm --filter @tasuki/checkin-web test`・`typecheck` → コミット

### Task 3.2: 文言と札の絵

**Files:** Create `src/copy.ts`（固定文言・`PAGE_HEADING`）・`src/method-copy.ts`・`src/card-art/{weather,takeaway-goal,role,takeaway-done,best-part,mood,next-meeting}.tsx`・`src/components/CardFace.tsx`・`tests/{method-copy,card-face,copy-fits-font-base,rendered-text-fits-font-base}.test.ts(x)`

**Interfaces（Produces）:**
- `METHOD_COPY: Readonly<Record<MethodId, { title: string; prompt: string; cards: Readonly<Record<CardId, { name: string; meaning: string }>> }>>`
- `CardFace({ method, card }: { method: MethodId; card: CardId }): JSX.Element` —— 絵だけ（`aria-hidden`）。**数のやり方（energy・focus・roti）は数字を Fraunces のイタリックで**（focus は `2`・`5`・`8`・`10`）【統括の判断: 設計 §5 の「数のやり方は数字」に focus も入れる。食い違い 4】。残りは細い墨の線に金を一点差す線画（モックアップの天気の 4 枚の作り）。色はクラスで当てる
- 札の名前は `aria-label` と凡例・山の下で使う（顔には出さない）

- [ ] **Step 1: 赤いテスト**
  - `METHOD_COPY` の鍵が `METHOD_IDS` と一致し、各やり方の `cards` の鍵が `METHODS[m].cards` と一致する（足し忘れ・余り）
  - 全 10 種 × 全札で `CardFace` が描けて、文字（テキストノード）を持たない（数のやり方は数字だけ）
  - `copy-fits-font-base`: `copy.ts`・`METHOD_COPY` の全文が base 層に収まる（E13）。`rendered-text-fits-font-base` は agenda-web を写す
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → `node scripts/audit-ui-components.mjs` → コミット

### Task 3.3: 卓の画面（選ぶ・出す）

**Files:** Create `src/screens/CheckinRoom.tsx`・`src/components/{MethodPicker,PromptPanel,SeatRow,Hand,RoundDock}.tsx`・`src/table.css`・`tests/{checkin-room,method-picker,prompt-panel,hand}.test.tsx`

振る舞い（設計 §4・§5）:
- 見出しは `RoomHeader`（`title={PAGE_HEADING}`・`backHref={hubPathFor(roomCode)}`・通常の見た目）
- 回が無いとき、または「別のやり方」を押したとき（**手元だけの状態**。押しても他の人の回は変わらない）は `MethodPicker`: チェックイン／チェックアウトの切り替えと 5 つのやり方・「ランダム」
- `PromptPanel`: 小見出し（`CHECK-IN`／`CHECK-OUT` とやり方の名前）・問い・凡例の 1 行。右上に公開の仕方の切り替え（`aria-pressed` の 2 つ。`locked` なら両方 `disabled`）と「別のやり方」
- `SeatRow`: 席ごとの伏せ札と名前・まだの席は点線の枠・「6 / 8 人が出しました」（`playedCount / playerCount`）
- `Hand`: 札のボタン（`aria-label` は札の名前・選んだ札は `aria-pressed="true"`・当たり 44px 以上・折り返す）。選んだ札は浮き上がり金の縁と淡い光。**見学中は出さず、「見学中」と「見学をやめる」**（E9）
- `RoundDock`: open なら「待たずに開く」、開いた後は「もう一回」と「別のやり方」。どれも `seq` を載せて送る

- [ ] **Step 1: 赤いテスト**
  - 回が無いとき、やり方を押すと `checkin.method.choose` が 1 通・「ランダム」で `checkin.method.draw { side }`
  - 札を押すと、いまの `seq` を載せた `checkin.card.play` が送られる（古い `seq` を送らない）
  - **見学中は手札のボタンが 0 個**（E9）〈m513〉
  - **`locked` のとき公開の仕方のボタンが `disabled`**（E7 の画面側）〈m515〉
  - 「別のやり方」を押しても何も送らず、`MethodPicker` が出る
  - 開く前は、自分以外の席に札の名前・絵が無い
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → `screens-do-not-import-sync-client.test.ts`・`node scripts/audit-web-sync-boundary.mjs` → コミット

### Task 3.4: 開いた後の見え方（純粋関数）

**Files:** Create `src/reveal-view.ts`・`tests/reveal-view.test.ts`

**Interfaces（Produces）:**
- `topCards(piles: readonly PileView[]): ReadonlySet<CardId>` —— 枚数が最大（1 以上）の札を**全部**（同数なら全部・全部 0 なら空）
- `summaryLine(method: MethodId, piles: readonly PileView[]): string` —— 例「晴れが 3 人」。同数は `・` で並べて「晴れ・くもりが 2 人ずつ」。0 枚なら「出した人はいません」
- `REVEAL_STAGGER_MS = 90`・`REVEAL_TOTAL_MAX_MS = 2000`・`revealSchedule(cardCount: number, reducedMotion: boolean): { delaysMs: readonly number[]; totalMs: number }` —— 動きを減らす設定では全部 0。札が多いときは間隔を縮めて `totalMs <= 2000`

- [ ] **Step 1: 赤いテスト** —— 同数の山が 2 つなら 2 つとも〈m516〉・全部 0 なら空・`summaryLine` の 3 通り・`revealSchedule(4, false)` の間隔が 90ms・`revealSchedule(30, false).totalMs <= 2000`・**`revealSchedule(n, true)` は全部 0**（E12）〈m514〉
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 3.5: 開いた後の画面と開く動き

**Files:** Create `src/components/RevealBoard.tsx`・`src/reveal.css`・`tests/reveal-board.test.tsx`。Modify `src/screens/CheckinRoom.tsx`

振る舞い（設計 §5 の B と C）: 札の種類ごとの山（やり方の札の順・0 枚も点線の枠と 0）。山の下に大きな数字（Fraunces）・札の名前・名前つきなら名前の小札。一番多い山は金の縁と淡い光（`topCards`）。下に 1 行の要約（`summaryLine`）。狭い幅では山を 2 列に折り返す。**開く動きは山の側だけで起こす**（各山の札が伏せた姿から `revealSchedule` の遅れで Y 軸に裏返り、最後に数字と名前が出る）。**席の伏せ札は裏返さない**（匿名で席と札が結びついて見えるのを防ぐ・Review Focus 1）【統括の判断: 名前つきも同じ動きにして、匿名だけの分岐を作らない】。動きを減らす設定では開いた形をすぐ出す

- [ ] **Step 1: 赤いテスト**
  - 名前つき: `sunny` の山の下に出した人の名前（E8）。匿名: 山の中にも外にも参加者の名前が無い（席の行を除く）
  - **開いた後、席の行（`SeatRow`）に札の絵・札の名前が無い**（Review Focus 1）〈m517〉
  - 一番多い山が 2 つあれば 2 つとも強調のクラス
  - `matchMedia('(prefers-reduced-motion: reduce)')` が真なら、山の札の `style` に遅れも動きのクラスも無い（E12）
  - 「もう一回」で `checkin.again { seq }`（E11 の画面側）
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → `rendered-text-fits-font-base`・`node scripts/audit-ui-components.mjs`・`pnpm --filter @tasuki/ui test` → コミット

### Task 3.6: 検査の登録と変異 m513〜m517（Opus）

**Files:** Modify `scripts/audit-dependency-direction.mjs`（`apps/checkin-web` の欄・`apps/tasuki-sync` に `@tasuki/checkin-core`）・`scripts/audit-structure.mjs`（`{ pkg: "apps/checkin-web", src: "src", test: "tests", entry: "main.tsx" }`）・`scripts/audit-domain-side-effects.mjs`・`scripts/audit-log-hygiene.mjs`・`scripts/audit-ui-components.mjs`（`WEB_APPS`）・`scripts/audit-web-sync-boundary.mjs` と自己テスト —— **実行して赤になったものだけ**（Task 1.6 のコマンド）

- [ ] **Step 1:** 赤を見る → 足す → 緑。変異 m513〜m517 を足して 1 本ずつ赤を見る
- [ ] **Step 2: 段 3 の終わり**: `pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit・`pnpm --filter @tasuki/ui test` → コミット。統括へ報告

### Task 3.7: 撮影と利用者への見せ（統括）

- 統括が手元のビルドで撮る（dev は利用者が `! pnpm dev` で立てる。実装役は起動しない）: 選ぶ画面・出す途中（6 人・名前 30 字を含む）・名前つきで開いた後・匿名で開いた後・見学中 × 320・768・1280・1920。**同じ幅の poker の投票中と開票後を並べ**、羅紗・象牙・金の言葉遣いと密度で見劣りしないかを見る（設計 §2 の失敗の形「poker より見劣りする」）
- 開く動きを 1 度だけ録り（2 秒以内・90ms ずつ・山の側だけ）、動きを減らす設定でも撮る
- **利用者に見せる**: 撮影とモックアップ（A・B・C）との差。直しは同じ枝で（Issue を増やさない）

---

## 段 4 — 玄関・配備・E2E・文書（変異 m518）

### Task 4.1: 玄関の 6 枚目と dev の中継

**Files:** Modify `apps/landing/src/tools.ts`（`id` に `"checkin"`・`pip: "始終"`・`name: "Check-in Cards"`・`summary` は Task 3.0 の 1 行・`href: "/checkin/"`・`mark: "cards"`。並びの末尾）・`src/ToolMark.tsx`（`cards`: 少しずらして重ねた 2 枚の札。線の太さは既存と同じ）・`src/index.css`（6 枚で崩れる箇所だけ）・`vite.config.ts`（`'/checkin': { target: 'http://127.0.0.1:5179', changeOrigin: true, ws: true }`）・`packages/dev-hub-redirect/{src/index.ts,README.md}`（列挙の注記に checkin）。Create `apps/landing/tests/tools-copy-fits-font-base.test.ts`【統括の判断: 玄関の札の文言は今まで base 層の検査が無く、「札を出し合う」がそのまま緑になる。`TOOLS` の `pip`・`name`・`summary` を測る】

- [ ] **Step 1: 赤いテスト** `tool-public-paths.test.ts`（`/checkin/`。`deploy/checkin` が無いので赤）・`room-choice-layout.test.tsx`「checkin に居る人は Check-in Cards と出る」〈m518〉・`dev-hub-redirect-wiring.test.ts`・`App.test.tsx`（並びと公開パスに checkin）・`tools-copy-fits-font-base.test.ts`・`index-html-exterior.test.ts` が `apps/checkin-web/index.html` を拾うこと
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/landing test` → 変異 m518 → コミット

### Task 4.2: 配備資材と検査の登録

**Files:** Create `deploy/checkin/{app.env,NOTES.md,caddy/70-checkin.conf}`（`deploy/agenda` の**今の姿**を写す。#434 で入ったサイトの外側の見出しを含む）。`NOTES.md` に「配布前の本番へ `e2e:prod` の `@core` を当てると落ちる」「初回の root 作業（web root `/var/www/tasuki-checkin` の作成・断片の配置・Caddy の検証と reload）」「配布の順序（checkin → landing）」を書く（**配布はしない**）。Modify `deploy/README.md`（表に 1 行・状態は「未配布」）・`deploy/caddy/{README.md,tasuki.conf}`・`e2e/harness/paths.ts`・`e2e/package.json`・`e2e/tests/{workspace,fragment-sources}.test.ts`

- [ ] **Step 1:** scripts の自己テスト＋全 audit・`pnpm --filter @tasuki/e2e test`（ハーネスの単体。ブラウザは起動しない）・`pnpm --filter @tasuki/landing test`（`caddy-fragment-order`・`caddy-fragment-port`）で赤を見る → 足す → 緑 → コミット

### Task 4.3: E2E

**Files:** Create `e2e/support/checkin.ts`（`openCheckinTool(page, name)`・`joinCheckinTool(page, url, name)`・`openCheckinFromHub(page)`。`support/agenda.ts` を写す）・`e2e/specs/checkin.spec.ts`。Modify `e2e/specs/{routing,landing,landing-design,buttons,site-exterior}.spec.ts`

- `checkin.spec.ts`: `test.describe('@core 札を伏せて出し、全員の画面で一斉に開く')` の 1 本・**ルーム 1 つ**
  - A がルームを作って checkin を開き、B が招待 URL で参加して checkin を開く。A が「今日のてんき」を選ぶ → B にも同じ問いと手札（E1）
  - A と B が出す → 両方の画面で開き、晴れの山の下に A の名前（E3・E8）
  - 「もう一回」→ 両方の手札が選ばれていない（E11）
  - 別のやり方で roti（名前なし）。**B の受けた WS のフレーム（`watchWebSocketFrames`）を開く前と開いた後で読み、A の札が開く前に無く、開いた後も A の参加者 ID と札が同じ山に無い**（E5・E6）。A が出した後、A・B の公開の仕方のボタンが押せない（E7）。A が「待たずに開く」→ 両方開く（E4）
  - B が「見学する」→ B の手札が消え、A の「n / m 人」の分母が減る（E9）
  - コンソールのエラーが 0
- `buttons.spec.ts`: **独立した `test.describe('チェックインのカードのボタンは部品で、押せる大きさがあり、帯が留まる')`**（既存の test に相乗りしない）。選ぶ・出す途中・開いた後を 320・768・1280・1920 で（`expectScreenAcrossWidths`）。止まった画面に `scanContrast`・`expectReadable`・`expectFocusVisibleOnTab`。手札の当たりが 44px 以上
- `routing.spec.ts` の `@smoke` に `/checkin/` の配信と `/checkin` → `/checkin/` の転送。`landing.spec.ts` の札の遷移に 6 枚目（既存のテストの中で）。`landing-design.spec.ts` の札の枚数 5 → 6。`site-exterior.spec.ts` の `PAGES` に `/checkin/`
- **ルームの増分は +2**（`checkin.spec` と `buttons.spec` の新しい test）。`@core` は describe の先頭（`e2e/tests/spec-tags.test.ts`）。E2E に新しいタグを足さない

- [ ] **Step 1:** `pnpm --filter @tasuki/e2e test`（タグと配線の単体）→ コミット。**E2E の実行は統括**（変えた spec だけ手元で・全件は CI）

### Task 4.4: 実画面検証（統括と利用者）

- 統括: 2 つのブラウザ（片方はシークレットウィンドウで入って「見学する」を押して映す運用）で、8 人ぶんの席は E2E のフィクスチャで代える。最後の人がタブを閉じて開く・タブの再読み込みで札が残る・幅 320 と 1920・動きを減らす設定
- **利用者に見せる**: 実画面と Task 3.7 の撮影との差。直しは同じ枝で

### Task 4.5: 文書の残り

**Files:** Modify `README.md`（ツールの一覧・dev のポート `:5179` の注意）・`docs/guides/{architecture,development}.md`（`5179`・`/checkin/`・個別起動の表）・`packages/ui/README.md`（利用側の表）・設計正本の末尾に「実装で実測して外したこと」・ADR 0028 の残りを完了形に。Create `docs/retrospectives/2026-10-XX-issue-406-checkin-cards.md`

- [ ] **Step 1:** `node scripts/check-links.mjs`・`pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit → コミット。統括が push・PR 作成・CI（変異の全件・E2E 全件）・**`/code-review <番号>`**

---

## 変異の割り当て

**ID の帯は 495〜520**（519・520 は予備。使わなければ使わない）。

| ID | 名前（パッチのファイル名の後半） | タスク | パッケージ | 赤になるテスト |
|---|---|---|---|---|
| m495 | view-leaks-others-card-before-reveal | 1.6 | checkin-core | `tests/projection.test.ts`・`projection-invariant.test.ts` |
| m496 | anonymous-piles-carry-names | 1.6 | checkin-core | `tests/projection.test.ts` |
| m497 | anonymous-reveal-keeps-your-card | 1.6 | checkin-core | `tests/projection.test.ts` |
| m498 | visibility-unlocked-after-play | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m499 | again-keeps-visibility | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m500 | auto-reveal-counts-spectators | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m501 | draw-includes-current-method | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m502 | replay-keeps-first-card | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m503 | stale-seq-applies | 1.6 | checkin-core | `tests/checkin.test.ts` |
| m504 | command-schema-loosened | 1.6 | checkin-core | `tests/schemas.test.ts` |
| m505 | broadcast-one-view-to-all | 2.5 | tasuki-sync | `test/checkin-handlers.test.ts` |
| m506 | players-by-presence-not-tool | 2.5 | tasuki-sync | `test/checkin-handlers.test.ts` |
| m507 | roster-change-skips-auto-reveal | 2.5 | tasuki-sync | `test/checkin-handlers.test.ts` |
| m508 | roster-hook-unwired | 2.5 | tasuki-sync | `test/live-ws.checkin.test.ts` |
| m509 | hub-message-reaches-checkin | 2.5 | tasuki-sync | `test/ws-adapter-tool-query.test.ts`・`live-ws.checkin.test.ts` |
| m510 | destroy-keeps-checkin | 2.5 | tasuki-sync | `test/destroy-room.test.ts` |
| m511 | topic-excludes-checkin | 2.5 | tasuki-sync | `test/live-ws.checkin.test.ts` |
| m512 | checkin-skips-on-connect | 2.5 | tasuki-sync | `test/live-ws.checkin.test.ts` |
| m513 | spectator-sees-hand | 3.6 | checkin-web | `tests/checkin-room.test.tsx` |
| m514 | reduced-motion-still-staggers | 3.6 | checkin-web | `tests/reveal-view.test.ts` |
| m515 | visibility-toggle-enabled-when-locked | 3.6 | checkin-web | `tests/prompt-panel.test.tsx` |
| m516 | top-pile-first-only | 3.6 | checkin-web | `tests/reveal-view.test.ts` |
| m517 | flip-at-seats | 3.6 | checkin-web | `tests/reveal-board.test.tsx` |
| m518 | hub-tool-id-mismatch-checkin | 4.1 | landing | `tests/room-choice-layout.test.tsx` |

**匿名をサーバーで守る変異**は m495・m496・m497（投影）・m498（鍵）・m505（受け手ごとの送信）・m506（数える人）。赤にならない変異は試験を足すか、変異を捨てて理由を報告に書く。

## 統括の判断（この計画で決めたこと・設計が実装に任せた所）

1. PR は 1 本・段ごとのコミット（取り決め。ADR 0013 の既定・agenda の先例）
2. 回の番号 `seq` で回にまたがる操作の取り違えを防ぐ（同時押しで新しい回が 0 枚で開くのを防ぐ）
3. やり方の表（札の ID・既定）は core、文言は画面（言い換えが core に波及しない）
4. 開いた後の投影は `yourCard` を持たない（名前つきでも。判断 7 を型で守る）
5. 名簿の変化を `hub.broadcastRoster` の最後の口（`onRosterBroadcast`）で受け、状態が同じでも配り直す（名簿を書く経路が 1 本に閉じているため）
6. 切断では札を残し、名簿から外れたら落とす（poker と同じ。再読み込みで札が消えない）
7. 開く動きは山の側だけで起こし、名前つきも同じ動き（匿名で席と札が結びついて見えない）
8. 「別のやり方」は手元で選ぶ画面を開くだけ（選ぶまで他の人の回を変えない）
9. （撤回）入るときの見学の指定は持たない。見学は poker と同じくルームの中の「見学する／投票に加わる」の切り替えだけ（利用者 2026-10-28）
10. 数のやり方は energy・focus・roti の 3 つ（絵を描くのは 7 種のうち天気を除く 6 種・23 枚）
11. 画面の見出しは「チェックイン・チェックアウト」・玄関の印は重ねた 2 枚の札（`cards`）・dev のポート 5179・Caddy の断片 70
12. お題を checkin の接続にも配るが、画面には出さない（agenda と同じ）
13. 玄関の札の文言に base 層の検査を足す
14. `live-ws.join-entries` と `live-ws.passphrase-limit` の表に、漏れていた agenda も足す（別 Issue にしない）

## 設計と食い違っていた点（現物で確かめた）

1. **設計の文言の多くが書体の base 層に無い**（E13 と衝突）。`札`・`匿`・`天`・`気`・`晴`・`雨`・`雷`・`何`・`打`・`相`・`談`・`聞`・`質`・`問`・`盛`・`半`・`特`・`絞`・`無`・`価`・`来`・`模`・`様`・`余`・`裕`・`好`・`沈`・`味`・`荒` が無い（2026-10-28 に `packages/ui/src/tokens/fonts.css` の `zkgn-*-base` の範囲で実測）。道具の説明「札を出し合う」と切り替えの「匿名」も当たる。base 層は #78 から作り直されておらず（`build-fonts.py` はリポジトリに無い）、言い換えで収める → Task 3.0
2. **poker の `join-room` には `spectator` の項目が無い**（`packages/poker-core/src/protocol.ts` の `join-room` は `roomId`・`name`・`token` だけ。129 行の `spectator` はサーバー → 画面の `ParticipantView` の項目）。設計 §7 の「poker の `join-room` の `spectator` と同じ形」は存在しない。checkin の参加はハブの `room.join`（`room-core` の共有スキーマ）を使うので項目を足せない → 利用者の指摘（2026-10-28）で、poker の見学は**ルームの中の「見学する」の切り替え**（#419・`set-spectator`）で選ぶ作りと確かめた。checkin もそれに揃え、入るときの指定は作らない（判断 9 を撤回）
3. **共通の受け口には道具ごとの切断の後始末が無い**（poker だけが自前の `closed` を持つ）。設計 §7 の「抜けた人は数から外す」を自動で開くまで効かせるには口が要る → 判断 5
4. 設計 §5「数のやり方は数字」と §10「残り 8 種の絵柄」の数が合わない（天気以外の 9 種のうち数字は energy・roti、focus も数と読めば 6 種）→ 判断 10
5. 玄関の札（`apps/landing/src/tools.ts`）の文言を base 層で測る検査が無い（設計 §3 の MUST が玄関では守られていない）→ 判断 13
