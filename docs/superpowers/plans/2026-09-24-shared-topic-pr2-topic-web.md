# お題ツールと玄関の札（#91 PR 2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** お題ツール `apps/topic-web`（公開パス `/topic/`）を新設し、玄関に 3 枚目の札と「いまのお題」の 1 行を足し、`deploy/topic` で配れるようにする。

**Architecture:** topic-web は poker-web と同じ形の静的アプリ（素の CSS＋`@import '@tasuki/ui'`・同期フック 1 本・純粋判断は `.ts`）。同期サーバーへは `?tool=topic` で繋ぎ、玄関と同じ復帰の組で `room.join` を送る。サーバー側の契約は PR 1（main `3cddcdc`）でできており、**この PR は同期サーバーを 1 行も変えない**。玄関は、PR 1 から届いていた `topic` フレームを読んでタイトルだけを出す。

**Tech Stack:** TypeScript / React 19 / Vite 8 / vitest 4（jsdom）/ Playwright（E2E）/ Caddy の断片

**Spec:** `docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§9 の PR 2。§5.4・§5.5 の玄関・§5.6・§7.4）。**計画と spec が食い違ったら spec が正本。** 実装者は両方を読むこと。例外は下の「実測で spec から外したこと」に挙げたものだけで、Task 11 で spec §10 へ記録する。

**前の PR の計画:** `docs/superpowers/plans/2026-09-23-shared-topic-pr1-topic-context.md`（サーバー側の契約・変異 m76〜m86）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクを Red → Green で書く。変異検査を Task 10 で足す |
| II. 技術選定は ADR を通す | 通過 | 新しい外部依存は足さない（React・Vite・vitest・testing-library・jest-dom はどれも既存と同じ版）。ADR 0021 は PR 3 で書く（spec §8） |
| III. 揮発インメモリと単純運用 | 通過 | 静的サイトを 1 本足すだけ。同期サーバーは増えない（`STATIC_ONLY=1`） |
| IV. 境界の型安全 | 通過 | 受信は topic-core / room-core の valibot スキーマで検める（`src/server-message.ts`）。合わないフレームは捨てて利用者へ知らせる |
| V. 実画面検証 | 通過 | Task 9 の E2E と Task 11 の実画面検証（2 つのブラウザで掲げ・書き換え・下ろす） |
| VI. 依存は内向き | 通過 | topic-web は timer-core・poker-core を知らない。依存方向の許可表を Task 1・6・8 で更新する |
| VII. 検査は壊して確かめる | 通過 | 新しいガードに変異を足す（Task 10） |
| VIII. 記録が正本 | 通過 | 書体の実測で UI の言葉を変えたことを spec §10 へ記録する（Task 11） |
| IX. 小さく回す | 通過 | PR 1 本。**デプロイは伴わない**（配布は PR 3 の後に 1 回。PR 2 と PR 3 の間は main を配らない） |
| X. 抽象は実需で | 通過 | 新しいポートは作らない |
| XI. 秘密と個人情報を持ち込まない | 通過 | お題の本文・合言葉をログへ出さない。合言葉は送ったら画面の状態から消す |

**逸脱なし。**

## Global Constraints

- 公開パスは `/topic/`。**`apps/landing/src/tools.ts`・`apps/topic-web/vite.config.ts` の `base`・`deploy/topic/app.env` の `PUBLIC_PATH`・Caddy 断片の 4 か所を揃える**（1 つでも取り残すと白画面か 404）
- 同期の入口は `/ws?tool=topic` の 1 本。**同期サーバー（`apps/tasuki-sync`）のコードは変えない**
- お題のタイトルは 1〜200 字、説明は 0〜4000 字（`MAX_TOPIC_TITLE` / `MAX_TOPIC_BODY` を topic-core から引く。**数値を直書きしない**）
- 言語・難易度の選択肢は topic-core の `LANGUAGES` / `DIFFICULTIES` から引く（画面と境界で別の一覧を持たない）
- **UI の文言は書体の base 層に収める**（`packages/ui/src/tokens/fonts.css` の `zkgn-*-base` の `unicode-range`）。文言は `apps/topic-web/src/copy.ts` に集め、Task 2 の検査が機械的に守る
- 画面（`.tsx`）は `@tasuki/sync-client` を直接 import しない。同期フックは `src/hooks/use-topic-sync.ts` の 1 本だけ（`docs/adr/0015` MUST 2・`docs/adr/0019`）
- **Tailwind は使わない。** スタイルは素の CSS で、先頭で `@import '@tasuki/ui';`（#297：Tailwind と `@import` の併用で書体が全滅した）
- **テスト名は利用者から見た結果を述べ、仕様の識別番号（E1・T4・Review Focus など）を入れない**（`docs/adr/0006` 決定 5・MUST。SC-029 は `\bE\d+\b` を拾う）。追跡は `describe` の直上の JSDoc `@requirements #91 E…` に書く
- テスト名の形は既存に揃える: `Given … / When … / Then …`
- **本文が 3 行以上のテストには `// Given` / `// When` / `// Then` の区切りを置く**（`docs/adr/0006` 決定 2・SC-032）。**この計画のテストコードには区切りを持たないものがある**（1〜2 行の短いテスト・表を回すテスト）。写すとき、本文が 3 行以上なら区切りを足す。SC-032 は合否の出ない指標で、後退しても CI は緑のまま（Task 11 Step 0 で main と数値で比べる）
- **`@requirements` はそのテストが実際に確かめる EARS だけを、最も狭い `describe` に付ける**（`docs/adr/0006` 決定 5）。画面の判断など EARS に当たらないものは `spec §5.4` のように節で指す
- **push・PR の作成・`/code-review` の起動・マージはオーケストレーター（この会話の主）だけが行う。** サブエージェントへ渡すときは、dispatch の本文に「commit はしてよい。push・merge・PR 作成・`git reset --hard`・`git checkout -- <path>` は禁止」と書き、戻ってきたら `git log origin/feature/issue-91-topic-web` が動いていないことを見る（#91 PR 1 の Task 12 で、共通制約の禁止が破られた）
- **字の大きさの検査（`packages/ui/tests/typography-scale.test.mjs`）はアプリの CSS を見ない**（`packages/ui/src` だけ）。topic-web と玄関の CSS は、`font-size` を `--font-size-*` の 5 段で書き、入力欄だけ玄関の `.hub-input` と同じく `font-size: 1rem`（iOS の自動拡大対策）にする。確かめは Task 5・6 の grep で行う
- **E2E に新しいタグを足さない**（`e2e/tests/spec-tags.test.ts` の `PRODUCTION_TAGS` は `@smoke` / `@core` だけ）。この PR の E2E は**タグ無し（local 専用）**にする。本番にはまだ `/topic/` が無いので、`@core` を付けると `pnpm e2e:prod` が現行の本番に対して落ちる
- dev のポートは topic-web が **5176**（玄関 5175・timer 5173・poker 5174・同期 8787 は既存）
- 作業は `/workspaces/claym/local/Tasuki` の `feature/issue-91-topic-web` ブランチで行う。テストは `pnpm --filter <pkg> test`。**同期サーバーのフィルタ名は `@tasuki/sync`**（`@tasuki/tasuki-sync` は 0 件実行で exit 0 の偽の緑）
- PR は `Refs #91`（**`Closes` を書かない**。地の文に「closes #91」と書くのも禁止 —— squash マージで閉じる）
- **本番へデプロイしない**

## 実測で spec から外したこと（2026-09-24・計画を書く段で測った）

spec は UI の動詞に「掲げる」、欄に「本文」を使っている。**書体の base 層の `unicode-range` に当てると、「掲」「本」「文」が外れる**（3 つの太さすべて）。このまま画面に出すと、お題ツールを開くたびに ext 層（約 210KB）を取りに行く。PR 1 で入れた topic-core の文言も 3 件外れていた。

| 場所 | spec / 現行の言葉 | 外れる字 | この計画で使う言葉 |
|---|---|---|---|
| 主操作のボタン | 掲げる | 掲 | **このお題にする** |
| 下ろすボタン | 下ろす | （収まる） | **お題を下ろす** |
| 説明の欄 | 本文 | 本・文 | **説明（なくてもよい）** |
| 定型へ落ちた知らせ | —（新設） | — | AI で作れなかったため、定型のお題にしました。 |
| topic-core `GENERATION_COOLDOWN` | 少し待ってから、もう一度作ってください。 | 少 | **しばらく待ってから、もう一度作ってください。** |
| topic-core `AI_UNLOCK_FAILED` | 合言葉が違います。 | 違 | **合言葉が正しくありません。** |
| topic-core `RATE_LIMITED` | 試行が多すぎます。しばらく待ってから再試行してください。 | 多 | **続けて失敗しました。しばらく待ってから再試行してください。** |
| 混雑の再試行（poker の文を写さない） | 混み合っています。… | 混・雑 | 参加を待っています。自動で入り直しています… |

- 置き換えた言葉と、この計画に出てくる UI 文言 28 件は、**すべて 3 つの太さの base 層に収まることを実測済み**（スクリプトは Task 2 のテストがそのまま引き継ぐ）
- spec の EARS（E2・E3 など）の「掲げる／下ろす」は振る舞いの名前なので書き換えない。**変わるのは画面の言葉だけ**である
- ⚠ **topic-core の 3 件は、PR 1 のテスト `timer と共通のコードは timer と同じ文を返す` が固定していた「timer と同じ文」をやめる判断になる。** timer 側（`packages/timer-core/src/error-messages.ts`）の同じコードは、timer のお題の経路ごと PR 3 で消える。この PR から topic-web がこの文言を画面に出す唯一の場所になるので、base 層に収めるほうを取る（Task 2）。**利用者が承認した（2026-09-24）。**
- **spec §5.4 の「`packages/invite-ui`」**: お題ツールにも招待リンク（コピー）を置く（poker の `InviteLink` と同じ形・Task 5）。QR は置かない —— 招待の主な置き場は玄関の「仲間を招く」で、QR はそこにある
- **spec §7.4 の「a11y の 4 走査」のうち reduced-motion は置かない。** お題ツールは演出を持たないので、「演出が止まる」を見ると 0 件で恒真になる（timer-a11y は「animation を持つ要素が 1 つ以上ある」を先に固定して避けている）。演出を足すときに、その固定と一緒に足す
- **spec §7.4 の「生成中の表示と定型に落ちたときの知らせを、実際の AI 無しの構成で見る」はできない。** `CLAUDE_CODE_OAUTH_TOKEN` が無いと AI は無効（`create-sync-server.ts` の `aiReady`）で、`TopicGenerator#request` は生成中を立てずにその場で定型へ落とし、クールダウンも判定しない（`topic-generation.ts`）。合言葉も機能の存在を隠すため必ず失敗する。**生成中・定型への縮退・クールダウンの表示は、フェイクの WebSocket を使う画面の単体テストが受け持つ**（Task 5）。偽のトークンで CLI を失敗させる案は、手元の `HOME` の資格情報で認証してしまわないかが未確認なので採らない
- **参加の返事が来ないまま待ち続ける場合の期限は置かない。** timer は 10 秒の期限を持つ（#292）が、poker にも無い。お題ツールは「ルームに参加しています」と接続の告知を出し続ける。受容として spec §10 に記録する（Task 11）
- お題の**タイトル・説明そのもの**（手入力・AI・定型バンク）は利用者の内容であり、base 層に収まらない字を含みうる。表示名と同じ扱いで受け入れる（ext 層を引くのはその字が画面に出たときだけ）。E2E で書体を検査するときは base 層に収まる文面を使う（`3 のときは Fizz を出す` は実測で収まる。`3 の倍数で Fizz を返す` は「倍」「返」が外れる）

## Review Focus

spec が求めるが、どのタスクのテストも踏まないと利用者に最も当たりやすい入力（上ほど当たりやすい。2026-09-24 の敵対的検証で 6 件になった）:

1. **切断中・入り直しの途中に「このお題にする」を押す** → `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に流す**ので、サーバーは `NOT_IN_ROOM` で拒む。**未参加・切断中は操作ボタンを押せなくする**。Task 5 のテスト「再接続して参加の返事を待つ間…どの操作も押せず、返事が来たら押せる」（**切断中だけを見ると、切断で `joined` が下りるので参加の判定が壊れていても隠れる**・検出力の検証で実測）
2. **別のタブで「ルームを抜ける」・他の人に外される** → サーバーはその人の**全接続**へ `LEFT_ROOM` / `REMOVED_FROM_ROOM` を送る（`command-handlers/participant-remove.ts` の `notifyRemovedTarget`）。お題ツールも timer と同じく、復帰の組を捨てて玄関の `/?room=CODE&left=<理由>` へ送る（#290）。放っておくと「押せるのに効かない」画面が残る。Task 4 のテスト「抜けた知らせが届いたら…玄関へ送る」
3. **下書きを書いている途中に、別の人がお題を変える** → 届いたお題で下書きを上書きしない（入力が消える）。Task 5 のテスト「下書きの途中で別の人のお題が届いても、下書きは残る」
4. **タイトルが空白だけ／201 字を貼り付ける** → 空白だけは押せない。欄は `maxLength` で 200 字に止める（サーバーも拒むが、押してから拒まれるより押せないほうがよい）。Task 5 のテスト「タイトルが空白だけなら『このお題にする』は押せない」と「タイトルと説明の欄は topic-core の上限で止まる」
5. **玄関で名乗らずに `/topic/?room=CODE` を開く・同じ端末の別タブが組を捨てた** → 繋がずに玄関のそのルームへ送り返す（コードを落とさない）。Task 4 のテスト「復帰の組が無ければ、繋がずに玄関のそのルームへ送り返す」
6. **札が 3 枚になった玄関を 320・768・1024・1280px で見る** → 札の名前・一行説明が 1 行に収まり、横にはみ出さない。**CSS からの概算では、いまの組み方のままだと 1280px で一行説明（約 171px）が文字の入る幅（約 147px）を超え、721〜1100px では既存の説明も折り返す。** Task 6 で選択画面の組み方を変え、Task 9 で `landing-design.spec.ts` に 768・1024 を足し、`checkCardText` に**札の枚数の固定**を足す（いまは札が 0 枚でも黙って通る）

---

## ファイル構成

**新規（`apps/topic-web`）**

| ファイル | 責務 |
|---|---|
| `package.json` / `tsconfig.json` / `vite.config.ts` / `vitest.config.ts` / `index.html` | 雛形（poker-web と landing の形） |
| `src/main.tsx` / `src/index.css` | 起動と見た目（`@import '@tasuki/ui'`） |
| `src/router.ts` | URL → ルート（`/topic/?room=CODE` だけが有効）と玄関への送り返し |
| `src/copy.ts` | **UI 文言のすべて**（base 層の検査の対象） |
| `src/server-message.ts` | 受信の境界検証（`topic` フレーム＋ハブの形） |
| `src/join-error-plan.ts` | 参加の失敗から次の一手を決める純粋関数 |
| `src/topic-view.ts` | 操作可否・生成の知らせ・接続の告知の純粋関数 |
| `src/hooks/use-topic-sync.ts` | 同期フック（唯一） |
| `src/App.tsx` / `src/screens/TopicRoom.tsx` | ルートの分岐と、ルームの画面 |
| `src/components/CurrentTopic.tsx` / `TopicEditor.tsx` / `TopicMaker.tsx` / `LoadingView.tsx` | いまのお題・書く・作る・読み込み中 |
| `tests/…` | 各 Task が作る |

**新規（配備）**: `deploy/topic/app.env` / `deploy/topic/caddy/40-topic.conf` / `deploy/topic/NOTES.md`

**変更（玄関）**: `src/tools.ts`（`id`・3 枚目）・`src/ToolMark.tsx`（旗）・`src/screens/RoomChoice.tsx`（在席の名前を ID で引く・いまのお題）・`src/screens/HistoryLink.tsx`（timer の公開パスを `TOOLS` から引く）・`src/hub/use-hub-sync.ts`（`topic` フレームを読む）・`src/App.tsx`・`src/index.css`・`vite.config.ts`（`/topic` の中継）・`package.json`

**変更（topic-core）**: `src/error-messages.ts`・`tests/error-messages.test.ts`

**変更（検査・E2E・文書）**: `scripts/audit-dependency-direction.mjs`・`audit-structure.mjs`・`audit-log-hygiene.mjs`・`audit-domain-side-effects.mjs`・`audit-web-sync-boundary.mjs`・`mutation-check.mjs`・`scripts/mutations/m87〜m91-*.patch`・`apps/landing/tests/dev-hub-redirect-wiring.test.ts`・`apps/landing/tests/index-html-loading-placeholder.test.ts`・`e2e/package.json`・`e2e/harness/paths.ts`・`e2e/support/a11y.ts`（新規・`timer-a11y.spec.ts` から移す）・`e2e/support/topic.ts`（新規）・`e2e/specs/topic.spec.ts`（新規）・`README.md`・`docs/guides/development.md`・`deploy/README.md`・`deploy/caddy/README.md`

---

### Task 1: topic-web の雛形・ルーティング・検査の登録

**Files:**
- Create: `apps/topic-web/package.json` / `tsconfig.json` / `vite.config.ts` / `vitest.config.ts` / `index.html` / `src/main.tsx` / `src/index.css` / `src/router.ts` / `src/App.tsx` / `src/components/LoadingView.tsx` / `tests/setup.ts` / `tests/router.test.ts`
- Modify: `scripts/audit-dependency-direction.mjs` / `scripts/audit-structure.mjs` / `scripts/audit-log-hygiene.mjs` / `scripts/audit-domain-side-effects.mjs` / `scripts/audit-web-sync-boundary.mjs` / `apps/landing/tests/dev-hub-redirect-wiring.test.ts` / `apps/landing/tests/index-html-loading-placeholder.test.ts`

**Interfaces:**
- Produces: `parseRoute(pathname: string, search?: string): Route`（`Route = { name: 'room'; roomCode: string } | { name: 'redirect'; to: string }`）/ `hubPathFor(roomCode: string, departure?: DepartureReason): string` / `redirectTo(to: string): void`（`src/router.ts`）

- [ ] **Step 1: 雛形を置く**

`apps/topic-web/package.json`:

```json
{
  "name": "@tasuki/topic-web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tasuki/protocol": "workspace:*",
    "@tasuki/room-core": "workspace:*",
    "@tasuki/sync-client": "workspace:*",
    "@tasuki/topic-core": "workspace:*",
    "@tasuki/ui": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tasuki/dev-hub-redirect": "workspace:*",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^26.1.2",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^6.0.5",
    "jsdom": "^30.0.1",
    "typescript": "^6.0.3",
    "vite": "^8.2.0",
    "vitest": "^4.1.11"
  }
}
```

`apps/topic-web/tsconfig.json`（`tests/` が `node:fs` を使うので `node` 型が要る。landing と同じ理由）:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    // tests/ が node:fs・node:path を使う（書体の base 層の検査）。landing と同じ理由で明示する
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests"]
}
```

`apps/topic-web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hubRedirectPlugin } from '@tasuki/dev-hub-redirect';

// サブパス /topic/ 配信（#91）。公開パスは `apps/landing/src/tools.ts`・`deploy/topic/app.env` の
// PUBLIC_PATH・`deploy/topic/caddy/40-topic.conf` と揃える（1 つでも取り残すと白画面か 404）。
export default defineConfig({
  base: '/topic/',
  // hubRedirectPlugin: :5176 を直接開いたときの無限リロード対策（dev のみ・詳細は
  // @tasuki/dev-hub-redirect）。ルームコードを伴わない URL は `/` へ送り返すが、
  // :5176 では `/` がこのサーバー自身なので、`/` を玄関（:5175）へ送って断つ。
  plugins: [react(), hubRedirectPlugin()],
  server: {
    // 既定ポートを明示する。4 アプリを同時に起動するため、既定のままだと取り合いになる。
    port: 5176,
    // 全インターフェースで待受（コンテナ/WSL からホスト側ブラウザへ転送するため）。
    host: true,
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // 本番と同じ `/ws` で繋ぐ。入口は玄関（5175）なので普段この中継は通らないが、
      // 5176 を直接開いたときに要る。ツールの宣言はクエリ（`?tool=topic`）が持つ。
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
```

`apps/topic-web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 構成は apps/landing と同じ形。**`globals` は落とせない**（@testing-library/react の自動
// cleanup は `afterEach` がグローバルに居るときだけ登録される。poker-web の注釈を参照）。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

`apps/topic-web/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`apps/topic-web/index.html`（poker-web の `index.html` を写し、`<title>` と絵文字だけ変える。プレースホルダの色は `apps/landing/tests/index-html-loading-placeholder.test.ts` が固定しているので**色は変えない**）:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚩</text></svg>"
    />
    <title>Tasuki お題</title>
  </head>
  <body>
    <!--
      React 起動前（HTML 到着 → JS 取得・解析 → 起動）を埋める静的なプレースホルダ。
      CSS がまだ当たっていないため色はインラインで指定するしかない。
      背景/文字色は packages/ui/src/tokens/palette.css の --felt-950 / --ivory と
      一致させ、apps/landing/tests/index-html-loading-placeholder.test.ts で固定する。
    -->
    <div id="root">
      <div
        role="status"
        aria-live="polite"
        style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #071f18; color: #f5efdd; font-family: system-ui, -apple-system, sans-serif"
      >
        読み込んでいます…
      </div>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/topic-web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/topic-web/src/index.css`（この段は先頭の読み込みと待ち表示だけ。画面のスタイルは Task 5 で足す）:

```css
/* ============================================================
   Tasuki お題（#91）
   共通の世界観「夜のカードテーブル」は @tasuki/ui が持つ。
   ここにはお題ツール固有のもの（いまのお題・書く・作る）だけを置く。
   **Tailwind と併用しない**（#297：`@import` の書体の url() が解決されず全滅した）。
   ============================================================ */

@import '@tasuki/ui';

/* 遷移中・参加中の一言。卓の上で控えめに置く（poker-web と同じ役割）。 */
.loading-note {
  margin: 0;
  padding: var(--space-6) 0;
  color: var(--ivory-dim);
  text-align: center;
}
```

- [ ] **Step 2: ルーティングの失敗するテストを書く**

`apps/topic-web/tests/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hubPathFor, parseRoute } from '../src/router';

/**
 * お題ツールの入口は玄関の札（`/topic/?room=CODE`）だけである（`docs/adr/0018`）。
 *
 * @requirements #91 spec §5.4
 */
describe('お題ツールの URL', () => {
  it('Given 玄関の札の URL / When 開く / Then そのルームの画面になる', () => {
    expect(parseRoute('/topic/', '?room=R1')).toEqual({ name: 'room', roomCode: 'R1' });
  });

  it('Given 日本語を含むルームコード / When 開く / Then 復号したコードで入る', () => {
    const search = `?room=${encodeURIComponent('朝会モブ-a1b2')}`;
    expect(parseRoute('/topic/', search)).toEqual({ name: 'room', roomCode: '朝会モブ-a1b2' });
  });

  it('Given ルームコードの無い URL / When 開く / Then 玄関へ送り返す', () => {
    expect(parseRoute('/topic/', '')).toEqual({ name: 'redirect', to: '/' });
    expect(parseRoute('/topic/', '?room=')).toEqual({ name: 'redirect', to: '/' });
  });

  it('Given 知らない下位パス / When 開く / Then 玄関へ送り返す', () => {
    expect(parseRoute('/topic/room/R1', '')).toEqual({ name: 'redirect', to: '/' });
  });

  it('Given ルームコード / When 玄関のそのルームを組み立てる / Then 符号化した ?room= になる', () => {
    // 玄関は `URLSearchParams` で読む（`apps/landing/src/hub/room-param.ts`）ので、読み戻して比べる
    const url = new URL(hubPathFor('朝会 a&b'), 'http://x');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('room')).toBe('朝会 a&b');
  });

  it('Given 抜けた理由 / When 玄関のそのルームを組み立てる / Then 理由を ?left= で運ぶ', () => {
    // 玄関が告知を出す（#290・`@tasuki/room-core` の DEPARTURE_PARAM）
    expect(hubPathFor('R1', 'self')).toBe('/?room=R1&left=self');
    expect(hubPathFor('R1', 'removed')).toBe('/?room=R1&left=removed');
  });
});
```

- [ ] **Step 3: 依存を入れて、落ちることを確かめる**

```bash
cd /workspaces/claym/local/Tasuki
pnpm install
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL（`../src/router` が無い）。`pnpm install` は lockfile に `apps/topic-web` の importer を足すだけで、新しい版は取らない（`minimumReleaseAge` に掛からない）。**`git diff pnpm-lock.yaml` で、足されたのが importer だけであることを目で見る**

- [ ] **Step 4: 実装する**

`apps/topic-web/src/router.ts`:

```ts
/**
 * URL からルートを決める（#91・`docs/adr/0018`）。
 *
 * **入口は玄関の札（`/topic/?room=CODE`）だけである。** 名乗りと合言葉の入力は玄関に 1 つだけあり、
 * ルームコードを伴わない URL には行き先が無いので玄関へ送る。新しいアプリなので、poker の
 * 旧リンク（`/poker/room/<id>`）のような救済は持たない。
 *
 * ルームコードには日本語が入りうるので、復号は `URLSearchParams` に任せる。
 */
import { DEPARTURE_PARAM, type DepartureReason } from '@tasuki/room-core';

export type Route = { name: 'room'; roomCode: string } | { name: 'redirect'; to: string };

const BASE = '/topic';

export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest !== '' && rest !== '/') return { name: 'redirect', to: '/' };
  const roomCode = new URLSearchParams(search).get('room');
  return roomCode ? { name: 'room', roomCode } : { name: 'redirect', to: '/' };
}

/**
 * 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。
 *
 * 抜けた・外されたときは理由を `?left=` で運ぶ（#290）。文言は玄関が `@tasuki/room-core` から引く
 * （timer の `ui/entry.ts` の `hubRoomPath` と同じ形）。
 */
export function hubPathFor(roomCode: string, departure?: DepartureReason): string {
  const params = new URLSearchParams({ room: roomCode });
  if (departure !== undefined) params.set(DEPARTURE_PARAM, departure);
  return `/?${params.toString()}`;
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる
 * （テストは `vi.mock` で差し替える）。`assign` だと戻るボタンで送り返しの往復になる
 * （poker-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
```

`apps/topic-web/src/components/LoadingView.tsx`（`App` と `TopicRoom` の両方が使うので部品に置く。`App.tsx` に置くと Task 5 で `App` ↔ `TopicRoom` の import が循環する）:

```tsx
/** 送り返している間・読み込み中の画面（白いままにしない。poker-web の `RedirectingView` と同じ役割）。 */
export function LoadingView() {
  return (
    <main className="page">
      <p className="loading-note" role="status">
        読み込んでいます…
      </p>
    </main>
  );
}
```

`apps/topic-web/src/App.tsx`（この段はルーティングだけ。ルームの画面は Task 5 で差し込む）:

```tsx
import { useEffect, useState } from 'react';
import { LoadingView } from './components/LoadingView';
import { parseRoute, redirectTo } from './router';

export function App() {
  // ルートはページ読み込みで決まる（札からの遷移は全ページ読み込み）。
  const [route] = useState(() => parseRoute(location.pathname, location.search));

  // 行き先の無い URL は玄関へ送る。**判定は `parseRoute`、適用はここ 1 箇所**（`docs/adr/0015`）。
  useEffect(() => {
    if (route.name === 'redirect') redirectTo(route.to);
  }, [route]);

  return <LoadingView />;
}
```

（`LoadingView` の文言は Task 2 で `copy.ts` へ移す。）

- [ ] **Step 5: テストが通ることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
pnpm --filter @tasuki/topic-web typecheck
pnpm --filter @tasuki/topic-web lint
pnpm --filter @tasuki/topic-web build
```

Expected: すべて成功。`build` は `apps/topic-web/dist/index.html` を作り、アセットが `/topic/assets/…` を指す

- [ ] **Step 6: 新しいアプリを検査に登録する**

新しい `apps/*` を足すと赤になる検査がある。**列挙を信じず、登録した後に全部回して確かめる**（Step 7）。

`scripts/audit-dependency-direction.mjs` の `ALLOWED`（`"apps/poker-web"` の欄の後ろ）:

```js
  // #91 PR 2: お題ツール。お題を変えられる唯一の画面（spec T4）。
  // **timer-core・poker-core を知らない**（ツール同士は直接の関係を持たない・spec T1）。
  // room-core はハブの形（`room.join` の応答・参加の失敗）を検めるために使う。
  "apps/topic-web": [
    "@tasuki/dev-hub-redirect",
    "@tasuki/protocol",
    "@tasuki/room-core",
    "@tasuki/sync-client",
    "@tasuki/topic-core",
    "@tasuki/ui",
  ],
```

`scripts/audit-structure.mjs` のパッケージ一覧（`apps/landing` の行の後ろ）:

```js
  // #91 PR 2 で新設（お題ツール）。
  { pkg: "apps/topic-web", src: "src", test: "tests", entry: "main.tsx" },
```

`scripts/audit-log-hygiene.mjs` の `SCANNED_PACKAGES`（`"apps/timer-web",` の後ろ）:

```js
  // #91 PR 2 で新設（お題ツール）。
  "apps/topic-web",
```

`scripts/audit-domain-side-effects.mjs` の `EXCLUDED_PACKAGES`（`apps/poker-web` の行の後ろ）:

```js
  { pkg: "apps/topic-web", reason: "アプリ層。副作用を置いてよい境界" },
```

`scripts/audit-web-sync-boundary.mjs` の `WEB_APPS`（`apps/landing` の項の後ろ）:

```js
  {
    app: "apps/topic-web",
    // #91 PR 2。接続の実体は `@tasuki/sync-client` にあり、**src は WS を自分で持たない**
    // （landing と同じ宣言。`wsHolders: []` は「1 行でも `new WebSocket(` を書いたら違反」）。
    // ⚠ この宣言は**画面（`.tsx`）が `@tasuki/sync-client` を直接 import することは見ない**
    // （`syncModules` はアプリ内の相対パスだけを見る）。その守りは Task 4 の
    // `tests/screens-do-not-import-sync-client.test.ts` が topic-web の中で持つ。
    syncModules: [],
    allowedImporters: [],
    wsHolders: [],
  },
```

`apps/landing/tests/dev-hub-redirect-wiring.test.ts` の `TOOL_APPS`:

```ts
const TOOL_APPS = ['timer-web', 'poker-web', 'topic-web'];
```

`apps/landing/tests/index-html-loading-placeholder.test.ts` の `APPS`（既存の要素は `{ name, indexHtml }` のオブジェクト。**配列の形で足すと型検査とテストの両方が落ちる**・試走で実測）:

```ts
  { name: 'topic-web', indexHtml: 'apps/topic-web/index.html' },
```

同じファイルの冒頭の注釈（「選択画面から timer / poker へ移動する…」）に topic を足す。

`scripts/audit-web-sync-boundary.test.mjs` の「WEB_APPS は 3 つの web アプリすべてを宣言している」（**計画の段では見落としていた赤**・試走で実測）: 期待する一覧に `"apps/topic-web"` を足し、テスト名を「4 つの web アプリ」に直す。`scripts/audit-web-sync-boundary.mjs` の冒頭の注釈（「3 つの web アプリすべてを宣言する（timer / poker / LP）」）も直す。

- [ ] **Step 7: 新しいファイルを索引へ載せてから、全検査を回して赤を直す**

**先に `git add` する。** 走査対象を `git ls-files` で集める検査（`audit-dependency-direction.mjs`・scripts の自己テストの `scan-target-wiring.test.mjs`）は、未追跡の `apps/topic-web` を 0 件と数えて落ちる（試走で実測）。

```bash
git add apps/topic-web pnpm-lock.yaml
pnpm --filter @tasuki/landing test
node scripts/audit-structure.mjs; echo "exit=$?"
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
node scripts/audit-domain-side-effects.mjs; echo "exit=$?"
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/audit-web-sync-boundary.mjs; echo "exit=$?"
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'; echo "exit=$?"
```

Expected: すべて `exit=0`。**出力を `| head` / `| tail` で切らない**（パイプは終了コードを隠す）。赤があれば、その検査が名指しする一覧へ `apps/topic-web` を足して直す（例: `scripts/list-scan-targets.mjs` の導出が落ちる／自己テストが件数を固定している）。**直したものは PR 本文の「検査の登録」に列挙する**

- [ ] **Step 8: コミットする**

```bash
git add apps/topic-web pnpm-lock.yaml scripts apps/landing/tests
git commit -m "feat: お題ツールの雛形とルーティングを足す（#91 PR 2）"
```

---

### Task 2: UI の文言と、書体の base 層の検査

**Files:**
- Create: `apps/topic-web/src/copy.ts` / `apps/topic-web/tests/copy-fits-font-base.test.ts`
- Modify: `packages/topic-core/src/error-messages.ts` / `packages/topic-core/tests/error-messages.test.ts` / `apps/topic-web/src/App.tsx`

**Interfaces:**
- Produces: `src/copy.ts` の定数（下の全部。後続の Task はここからだけ文言を引く）

- [ ] **Step 1: 失敗するテストを書く**

書体の判定は Task 5 の「描いた画面の文字」の検査でも使うので、支援へ置く。

`apps/topic-web/tests/support/font-base.ts`:

```ts
/**
 * 書体の常用の層（base）の範囲に、文字が収まるかを判定する（`packages/ui/README.md`）。
 *
 * base 層に無い字を 1 つ画面に出すと、その字が出た瞬間に拡張の層（約 210KB）を取りに行き、
 * `font-display: swap` で代替字形が一瞬見える。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/ui/src/tokens/fonts.css',
);

type Range = readonly [number, number];

/** `fonts.css` の `@font-face` のうち、ファイル名が `zkgn-` で始まり `-base` を含む面の範囲（太さごと）。 */
export function baseFaces(): Map<string, Range[]> {
  const css = readFileSync(FONTS_CSS, 'utf8');
  const faces = new Map<string, Range[]>();
  for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const file = /url\('[^']*\/([^'/]+)'\)/.exec(block ?? '')?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block ?? '')?.[1];
    if (file === undefined || range === undefined) continue;
    if (!file.startsWith('zkgn-') || !file.includes('-base')) continue;
    faces.set(
      file,
      range.split(',').map((part) => {
        const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
        const start = Number.parseInt(from ?? '', 16);
        return [start, to === undefined ? start : Number.parseInt(to, 16)] as const;
      }),
    );
  }
  return faces;
}

/** 文言ごとに、どれかの太さの base 層から外れる字を「面名「文言」: 字」の形で返す（外れなければ空）。 */
export function outsideBase(texts: readonly string[]): string[] {
  const failures: string[] = [];
  for (const text of texts) {
    for (const [file, ranges] of baseFaces()) {
      const outside = [...new Set(text)].filter((ch) => {
        const cp = ch.codePointAt(0) ?? 0;
        return cp > 0x7e && !ranges.some(([from, to]) => cp >= from && cp <= to);
      });
      if (outside.length > 0) failures.push(`${file}「${text}」: ${outside.join('')}`);
    }
  }
  return failures;
}
```

`apps/topic-web/tests/copy-fits-font-base.test.ts`:

```ts
/**
 * UI の文言は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * 計画を書く段の実測で、spec の「掲げる」「本文」、PR 1 の topic-core の文言 3 件が外れていた
 * （計画「実測で spec から外したこと」）。
 *
 * **ここが見るのは `src/copy.ts` と topic-core の文言表だけである。** 画面（`.tsx`）に直書きした
 * 文言は、Task 5 の `tests/rendered-text-fits-font-base.test.tsx`（描いた画面の文字を当てる）が拾う。
 */
import { describe, expect, it } from 'vitest';
import { TOPIC_ERROR_CODES, topicErrorMessageFor } from '@tasuki/topic-core';
import * as copy from '../src/copy';
import { baseFaces, outsideBase } from './support/font-base';

/** 文言の一覧。`copy.ts` の文字列と、文字列の表（難易度の名前など）の値を平たくする。 */
function allTexts(): string[] {
  const fromCopy = Object.values(copy).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value as Record<string, string>),
  );
  return [...fromCopy, ...TOPIC_ERROR_CODES.map(topicErrorMessageFor)];
}

/**
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe('UI の文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();
    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given お題ツールの文言とお題のエラーの文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given
    const texts = allTexts();
    // When
    const failures = outsideBase(texts);
    // Then（件数も固定する。`copy.ts` の import が空振りしても緑にしない）
    expect(failures).toEqual([]);
    expect(texts.length).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL（`../src/copy` が無い）。`copy.ts` を置いた後の赤は Step 4 で見る

- [ ] **Step 3: 文言を置く（topic-core は**まだ直さない**）**

`apps/topic-web/src/copy.ts`:

```ts
/**
 * お題ツールの UI 文言のすべて（#91）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言だけを書体の常用の層（base）に当てて守っている。直書きした文言はその検査を素通りする。
 *
 * spec の「掲げる」「本文」は base 層に無い字（掲・本・文）を含むので、画面では
 * 「このお題にする」「説明」と言う（計画「実測で spec から外したこと」・spec §10）。
 */
import type { Difficulty } from '@tasuki/topic-core';

export const LOADING_TEXT = '読み込んでいます…';
export const JOINING_HEADING = 'ルームに参加しています';
export const GONE_HEADING = 'ルームが見つかりません';
export const GONE_TEXT = 'ルームは終了したか、リンクが正しくない可能性があります。';
export const GONE_LINK = 'トップへ戻る';

export const PAGE_HEADING = 'お題';
export const BACK_LINK = '選択画面へ戻る';
// 招待リンク（poker の `InviteLink` と同じ文）
export const INVITE_COPY_BUTTON = '招待リンクをコピー';
export const INVITE_COPIED = 'コピーしました';
export const INVITE_COPY_FAILED = 'コピーできません（URL を選択してください）';

export const CURRENT_HEADING = 'いまのお題';
export const EMPTY_TEXT = 'お題はまだありません。書くか、作ってください。';
export const CLEAR_BUTTON = 'お題を下ろす';
export const GENERATING_TEXT = '作っています…';
export const DEGRADED_TEXT = 'AI で作れなかったため、定型のお題にしました。';

export const WRITE_HEADING = '書く';
export const TITLE_LABEL = 'タイトル';
export const BODY_LABEL = '説明（なくてもよい）';
export const SET_BUTTON = 'このお題にする';
export const REWRITE_BUTTON = '書き直す';

export const MAKE_HEADING = '作る';
export const LANGUAGE_LABEL = '言語';
export const DIFFICULTY_LABEL = '難易度';
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: '初級',
  medium: '中級',
  hard: '上級',
};
export const AI_BUTTON = 'AI で作る';
export const FALLBACK_BUTTON = '定型から選ぶ';
export const UNLOCK_LABEL = 'AI 生成の合言葉';
export const UNLOCK_BUTTON = '解錠する';

/** 参加の失敗のうち、サーバーの文言を持たない（または空の）ときの既定。 */
export const DEFAULT_ERROR_TEXT = '操作を完了できませんでした';

// 接続の告知（poker-web の `connection-notice.ts` と同じ文。3 つとも base 層に収まる）
export const RECONNECTING_TEXT = '接続中です…（切断された場合は自動で再接続します）';
export const UNREACHABLE_TEXT =
  '同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。';
export const STALE_TEXT = '同期できていません。表示が最新でない可能性があります。';

// 混雑で参加を拒まれたとき。**poker の「混み合っています」を写さない**（「混」「雑」が base 層外）
export const RETRY_WAITING_TEXT = '参加を待っています。自動で入り直しています…';
export const RETRY_EXHAUSTED_TEXT = '参加できません。時間をおいてから再読込してください';
```

`apps/topic-web/src/components/LoadingView.tsx` の文言を `LOADING_TEXT` に差し替える（`import { LOADING_TEXT } from '../copy';`）。

- [ ] **Step 4: topic-core の文言で赤になることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL。失敗の一覧に次の 3 件（× 3 つの太さ）が**ちょうど**出る:
`「少し待ってから、もう一度作ってください。」: 少` / `「合言葉が違います。」: 違` / `「試行が多すぎます。しばらく待ってから再試行してください。」: 多`
**これ以外が出たら copy.ts の文言が外れている**（計画の実測と食い違ったら、まず `fonts.css` が変わっていないかを見る）

- [ ] **Step 5: topic-core の文言を直す（Red → Green）**（**置き換えるのは文言表の 3 行と、表の上の注釈だけ**。`import` と `topicErrorMessageFor` の定義は残す）

先に `packages/topic-core/tests/error-messages.test.ts` を書き換える。`TIMER_MESSAGES` から `RATE_LIMITED` と `AI_UNLOCK_FAILED` を外し、下の describe を足す:

```ts
/**
 * timer-core（`packages/timer-core/src/error-messages.ts`）の文言をそのまま書き写したもの。
 * topic-core は timer-core に依存できないため、直書きして比べる。
 *
 * **`RATE_LIMITED` / `AI_UNLOCK_FAILED` は #91 PR 2 で timer と揃えるのをやめた。** timer の文は
 * 書体の常用の層に無い字（「多」「違」）を含み、お題ツールが出すたびに拡張の層を取りに行く。
 * timer の同じコードは、timer のお題の経路ごと PR 3 で消える（spec §9）。
 */
const TIMER_MESSAGES: Partial<Record<TopicErrorCode, string>> = {
  NOT_IN_ROOM: "ルームに参加していません",
};
```

```ts
/**
 * お題ツールが画面に出す文。書体の常用の層に収まることは
 * `apps/topic-web/tests/copy-fits-font-base.test.ts` が守る。ここは文そのものを固定する。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe("お題ツールが出す文", () => {
  /**
   * @requirements #91 E22
   */
  describe("作り直しの拒否", () => {
    it("作り直しがクールダウンで拒まれたら、待ってから作り直すよう促す", () => {
      expect(topicErrorMessageFor("GENERATION_COOLDOWN")).toBe("しばらく待ってから、もう一度作ってください。");
    });
  });

  it("合言葉が合わなければ、正しくないと伝える", () => {
    expect(topicErrorMessageFor("AI_UNLOCK_FAILED")).toBe("合言葉が正しくありません。");
  });

  it("合言葉を続けて外したら、待ってから再試行するよう促す", () => {
    expect(topicErrorMessageFor("RATE_LIMITED")).toBe("続けて失敗しました。しばらく待ってから再試行してください。");
  });
});
```

```bash
pnpm --filter @tasuki/topic-core test
```

Expected: FAIL（新しい 3 件）。次に `packages/topic-core/src/error-messages.ts` を直す:

```ts
/**
 * お題の接続へ返すエラーの文言(#91)。
 *
 * **お題ツールが画面に出す文なので、書体の常用の層（base）に収める**
 * （`apps/topic-web/tests/copy-fits-font-base.test.ts` が守る）。PR 1 では「timer に同じコードが
 * あるものは timer と同じ文にする」としていたが、timer の `RATE_LIMITED` / `AI_UNLOCK_FAILED` は
 * base 層に無い字を含むので、#91 PR 2 で揃えるのをやめた（timer の同じコードは PR 3 で消える）。
 * `MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は接続層（`ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` /
 * `INTERNAL_ERROR_TEXT`）と同じ文にする。
 */
const TOPIC_ERROR_MESSAGES: Record<TopicErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "続けて失敗しました。しばらく待ってから再試行してください。",
  AI_UNLOCK_FAILED: "合言葉が正しくありません。",
  GENERATION_COOLDOWN: "しばらく待ってから、もう一度作ってください。",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
};
```

- [ ] **Step 6: 両方が通り、同期サーバーの文言の参照が壊れていないことを確かめる**

```bash
pnpm --filter @tasuki/topic-core test
pnpm --filter @tasuki/topic-web test
pnpm --filter @tasuki/sync test
grep -rn "少し待ってから、もう一度\|合言葉が違います\|試行が多すぎます。しばらく待ってから再試行" apps/tasuki-sync packages/topic-core --include='*.ts'
```

Expected: 3 つとも成功。`grep` は**`packages/timer-core` 以外に 0 件**（**`--include` の引数は引用符で囲む** —— zsh は囲まないと `no matches found` で grep を走らせず、何も出ないのを 0 件と読み違える）（同期サーバーのテストがお題の文言を字面で固定していたら、ここで出る。出たら新しい文に直す）

- [ ] **Step 7: コミットする**

```bash
git add apps/topic-web packages/topic-core
git commit -m "feat: お題ツールの文言を書体の常用の層に収め、検査で守る（#91 PR 2）"
```

---

### Task 3: 受信の境界と、純粋な判断

**Files:**
- Create: `apps/topic-web/src/server-message.ts` / `src/join-error-plan.ts` / `src/topic-view.ts`
- Test: `apps/topic-web/tests/server-message.test.ts` / `tests/join-error-plan.test.ts` / `tests/topic-view.test.ts`

**Interfaces:**
- Consumes: `copy.ts` の `DEFAULT_ERROR_TEXT` / `GENERATING_TEXT` / `DEGRADED_TEXT` / `RECONNECTING_TEXT` / `UNREACHABLE_TEXT` / `STALE_TEXT`
- Produces:
  - `parseTopicWebMessage(raw: string): TopicWebMessage | null`（`TopicWebMessage = { type: 'topic'; state: TopicState } | HubServerMsg`）
  - `planForError(code: string, message: string): ErrorPlan`（`ErrorPlan = { kind: 'gone' } | { kind: 'left'; reason: DepartureReason } | { kind: 'to-hub' } | { kind: 'retry' } | { kind: 'show'; message: string }`）
  - `canSubmitTopic(title: string, enabled: boolean): boolean` / `canUnlock(key: string, enabled: boolean): boolean`
  - `type ConnectionStatus = 'connecting' | 'open' | 'closed'`
  - `canOperate(status: ConnectionStatus, joined: boolean): boolean`
  - `generationNotice(state: TopicState | null): string | null`
  - `connectionNotice(input: { status; everConnected; failedAttempts; syncStale }): { kind: 'none' } | { kind: 'reconnecting' | 'unreachable' | 'stale'; text: string }`

- [ ] **Step 1: 失敗するテストを書く**

`apps/topic-web/tests/server-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTopicWebMessage } from '../src/server-message';

const STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * お題の接続へ届くのは、`topic` フレームと、ハブと同じ形の応答（`room.joined`・参加の失敗）である
 * （`apps/tasuki-sync/src/ports/topic-server-msg.ts`）。参加の失敗のコードはハブのもの
 * （`ROOM_NOT_FOUND` 等）なので、お題のエラーのスキーマ（`TopicErrorFrameSchema`）では検めない。
 *
 * @requirements #91 E4
 */
describe('お題ツールが受け取るフレーム', () => {
  it('Given お題の状態のフレーム / When 検める / Then 状態として受け取る', () => {
    expect(parseTopicWebMessage(JSON.stringify({ type: 'topic', state: STATE }))).toEqual({
      type: 'topic',
      state: STATE,
    });
  });

  it('Given 参加の応答 / When 検める / Then ハブと同じ形で受け取る', () => {
    const joined = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };
    expect(parseTopicWebMessage(JSON.stringify(joined))).toEqual(joined);
  });

  it('Given ハブのコードの参加の失敗 / When 検める / Then エラーとして受け取る', () => {
    const error = { type: 'error', code: 'ROOM_NOT_FOUND', message: 'ルームが見つかりません' };
    expect(parseTopicWebMessage(JSON.stringify(error))).toEqual(error);
  });

  it('Given 契約に合わないフレーム / When 検める / Then 受け取らない', () => {
    expect(parseTopicWebMessage('not json')).toBeNull();
    expect(parseTopicWebMessage(JSON.stringify({ type: 'topic', state: { topic: null } }))).toBeNull();
  });
});
```

`apps/topic-web/tests/join-error-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ERROR_TEXT } from '../src/copy';
import { planForError } from '../src/join-error-plan';

/**
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。お題ツールは失敗を見て、
 * 玄関へ戻すか・待って入り直すか・その場で伝えるかだけを決める。
 *
 * @requirements #91 spec §5.4
 */
describe('参加の失敗から次の一手を決める', () => {
  it('Given ルームが見つからない / When 決める / Then 消えたルームの案内にする', () => {
    expect(planForError('ROOM_NOT_FOUND', 'x')).toEqual({ kind: 'gone' });
  });

  it('Given 自分で抜けた・外された知らせ / When 決める / Then 理由を持って玄関へ戻す', () => {
    // 別のタブで抜けても、サーバーはその人の全接続へ知らせる（participant-remove.ts・#290）
    expect(planForError('LEFT_ROOM', 'x')).toEqual({ kind: 'left', reason: 'self' });
    expect(planForError('REMOVED_FROM_ROOM', 'x')).toEqual({ kind: 'left', reason: 'removed' });
    expect(planForError('REMOVED_BY_HOST', 'x')).toEqual({ kind: 'left', reason: 'removed' });
  });

  it('Given 合言葉を求められた・合わなかった / When 決める / Then 玄関へ戻す', () => {
    expect(planForError('PASSPHRASE_REQUIRED', 'x')).toEqual({ kind: 'to-hub' });
    expect(planForError('PASSPHRASE_MISMATCH', 'x')).toEqual({ kind: 'to-hub' });
  });

  it('Given 混雑で拒まれた / When 決める / Then 待って入り直す', () => {
    expect(planForError('JOIN_RATE_LIMITED', 'x')).toEqual({ kind: 'retry' });
  });

  it('Given それ以外 / When 決める / Then サーバーの文をその場で伝える', () => {
    expect(planForError('GENERATION_COOLDOWN', 'しばらく待って')).toEqual({ kind: 'show', message: 'しばらく待って' });
  });

  it('Given 文が空白だけ / When 決める / Then 既定の文で伝える', () => {
    expect(planForError('INTERNAL_ERROR', '  ')).toEqual({ kind: 'show', message: DEFAULT_ERROR_TEXT });
  });
});
```

`apps/topic-web/tests/topic-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from '../src/copy';
import { canOperate, canSubmitTopic, canUnlock, connectionNotice, generationNotice } from '../src/topic-view';

const IDLE = { topic: null, generating: false, degraded: false, aiUnlocked: false };

/**
 * 切断中・入り直しの途中の操作は、確立時に入り直しより先に流れて `NOT_IN_ROOM` で拒まれる
 * （`SyncConnection` の送信キュー）。押せなくすることで防ぐ。
 *
 * @requirements #91 spec §5.4
 */
describe('お題ツールの操作可否と知らせ', () => {
  it('Given 繋がっていて参加済み / When 可否を見る / Then 操作できる', () => {
    expect(canOperate('open', true)).toBe(true);
  });

  it('Given 繋がっているが参加前 / When 可否を見る / Then 操作できない', () => {
    expect(canOperate('open', false)).toBe(false);
  });

  it('Given 切断中 / When 可否を見る / Then 参加済みの印が残っていても操作できない', () => {
    expect(canOperate('closed', true)).toBe(false);
  });

  it('Given 空白だけのタイトル・書いたタイトル / When 押せるかを決める / Then 空白だけなら押せない', () => {
    expect(canSubmitTopic('   ', true)).toBe(false);
    expect(canSubmitTopic('FizzBuzz', true)).toBe(true);
    expect(canSubmitTopic('FizzBuzz', false)).toBe(false);
  });

  it('Given 空白だけの合言葉・書いた合言葉 / When 押せるかを決める / Then 空白だけなら押せない', () => {
    expect(canUnlock(' ', true)).toBe(false);
    expect(canUnlock('secret', true)).toBe(true);
    expect(canUnlock('secret', false)).toBe(false);
  });

  it('Given 生成中 / When 知らせを決める / Then 作っていると伝える', () => {
    expect(generationNotice({ ...IDLE, generating: true })).toBe(GENERATING_TEXT);
  });

  it('Given 定型に落ちた / When 知らせを決める / Then 定型にしたと伝える', () => {
    expect(generationNotice({ ...IDLE, degraded: true })).toBe(DEGRADED_TEXT);
  });

  it('Given 何も起きていない・状態がまだ無い / When 知らせを決める / Then 何も出さない', () => {
    expect(generationNotice(IDLE)).toBeNull();
    expect(generationNotice(null)).toBeNull();
  });

  it('Given 一度も繋がらないまま失敗した / When 告知を決める / Then 繋がらないと伝える', () => {
    expect(connectionNotice({ status: 'closed', everConnected: false, failedAttempts: 1, syncStale: false })).toEqual({
      kind: 'unreachable',
      text: UNREACHABLE_TEXT,
    });
  });

  it('Given 使えていた接続が切れた / When 告知を決める / Then 再接続中と伝える', () => {
    expect(connectionNotice({ status: 'closed', everConnected: true, failedAttempts: 1, syncStale: false })).toEqual({
      kind: 'reconnecting',
      text: RECONNECTING_TEXT,
    });
  });

  it('Given 繋がっているが合わないフレームを捨てた / When 告知を決める / Then 同期できていないと伝える', () => {
    expect(connectionNotice({ status: 'open', everConnected: true, failedAttempts: 0, syncStale: true })).toEqual({
      kind: 'stale',
      text: STALE_TEXT,
    });
  });

  it('Given 繋がり始めたばかり / When 告知を決める / Then 何も出さない（正常時にちらつかせない）', () => {
    expect(connectionNotice({ status: 'connecting', everConnected: false, failedAttempts: 0, syncStale: false })).toEqual({
      kind: 'none',
    });
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL（3 つのモジュールが無い）

- [ ] **Step 3: 実装する**

`apps/topic-web/src/server-message.ts`:

```ts
/**
 * お題の接続が受け取るフレームの境界検証（原則 IV）。
 *
 * 届くのは `topic` フレームと、ハブと同じ形の応答（`room.joined`・参加の失敗）である
 * （`apps/tasuki-sync/src/ports/topic-server-msg.ts`）。**参加の失敗はハブのコード体系**
 * （`ROOM_NOT_FOUND`・`PASSPHRASE_REQUIRED` 等）なので、お題のエラーのスキーマでは検めない。
 * お題のコマンドの失敗（`GENERATION_COOLDOWN` 等）もハブの `error` の形（コードは非空文字列）に収まる。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubServerMsg } from '@tasuki/room-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';

export type TopicWebMessage = { type: 'topic'; state: TopicState } | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseTopicWebMessage(raw: string): TopicWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}
```

`apps/topic-web/src/join-error-plan.ts`:

```ts
/**
 * 参加・操作の失敗から、次の一手を決める（`docs/adr/0015` MUST 1：副作用の無い判断は `.ts` に置く）。
 *
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。合言葉を求められたら、ここで聞かずに
 * 玄関へ戻す —— 玄関が名乗りと合言葉を聞き直し、新しい復帰の組を端末に置く。
 */
import type { DepartureReason } from '@tasuki/room-core';
import { DEFAULT_ERROR_TEXT } from './copy';

export type ErrorPlan =
  | { kind: 'gone' }
  | { kind: 'left'; reason: DepartureReason }
  | { kind: 'to-hub' }
  | { kind: 'retry' }
  | { kind: 'show'; message: string };

export function planForError(code: string, message: string): ErrorPlan {
  if (code === 'ROOM_NOT_FOUND') return { kind: 'gone' };
  // 抜けた・外された（timer の `error-action.ts` と同じ対応。`REMOVED_BY_HOST` は旧名で、同じ扱いにする）。
  if (code === 'LEFT_ROOM') return { kind: 'left', reason: 'self' };
  if (code === 'REMOVED_FROM_ROOM' || code === 'REMOVED_BY_HOST') return { kind: 'left', reason: 'removed' };
  if (code === 'PASSPHRASE_REQUIRED' || code === 'PASSPHRASE_MISMATCH') return { kind: 'to-hub' };
  if (code === 'JOIN_RATE_LIMITED') return { kind: 'retry' };
  // 未知のコードも含め、文はサーバーのものを使う（意味を知るのは向こうだけ）。
  // 空白だけの文は見た目で空の箱になるので既定の文に替える（poker-web の useSync と同じ扱い）。
  return { kind: 'show', message: message.trim() === '' ? DEFAULT_ERROR_TEXT : message };
}
```

`apps/topic-web/src/topic-view.ts`:

```ts
/**
 * お題ツールの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 */
import type { TopicState } from '@tasuki/topic-core';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from './copy';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * 操作できるか。**切断中と参加前は押させない。**
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に**
 * 流す。押せたままにすると、切断中に押した操作はサーバーで `NOT_IN_ROOM` になる。
 */
export function canOperate(status: ConnectionStatus, joined: boolean): boolean {
  return status === 'open' && joined;
}

/** タイトルを書いてあれば「このお題にする」を押せる（空白だけはサーバーも拒む・topic-core の `titleStr`）。 */
export function canSubmitTopic(title: string, enabled: boolean): boolean {
  return enabled && title.trim() !== '';
}

/** 合言葉を書いてあれば「解錠する」を押せる。 */
export function canUnlock(key: string, enabled: boolean): boolean {
  return enabled && key.trim() !== '';
}

/** 生成の知らせ。生成中が優先する（生成を始めると `degraded` は下りる・spec §5.1）。 */
export function generationNotice(state: TopicState | null): string | null {
  if (state === null) return null;
  if (state.generating) return GENERATING_TEXT;
  if (state.degraded) return DEGRADED_TEXT;
  return null;
}

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting' | 'unreachable' | 'stale'; text: string };

/** 一度繋がった後、ここまで連続で失敗したら「戻る見込み」を諦めて伝え方を変える（poker-web と同じ値）。 */
const GIVE_UP_AFTER_ATTEMPTS = 3;

/** 接続状態を利用者向けの告知に翻訳する（poker-web の `connection-notice.ts` と同じ規則）。 */
export function connectionNotice(input: {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
}): ConnectionNotice {
  if (input.status === 'open') {
    return input.syncStale ? { kind: 'stale', text: STALE_TEXT } : { kind: 'none' };
  }
  if (input.failedAttempts === 0) return { kind: 'none' };
  if (!input.everConnected || input.failedAttempts >= GIVE_UP_AFTER_ATTEMPTS) {
    return { kind: 'unreachable', text: UNREACHABLE_TEXT };
  }
  return { kind: 'reconnecting', text: RECONNECTING_TEXT };
}
```

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
pnpm --filter @tasuki/topic-web typecheck
```

Expected: PASS。`typecheck` で `topic.value` が `TopicWebMessage` に代入できないと出たら、`TopicFrameSchema` の出力と topic-core の `TopicState` の形が食い違っている（topic-core 側を読み、型を合わせる。`as` で黙らせない）

- [ ] **Step 5: コミットする**

```bash
git add apps/topic-web
git commit -m "feat: お題ツールの受信の境界と画面の判断を足す（#91 PR 2）"
```

---

### Task 4: 同期フック（`use-topic-sync.ts`）

**Files:**
- Create: `apps/topic-web/src/hooks/use-topic-sync.ts` / `apps/topic-web/tests/support/scripted-web-socket.ts` / `apps/topic-web/tests/use-topic-sync.test.tsx` / `apps/topic-web/tests/screens-do-not-import-sync-client.test.ts`
- Modify: `apps/topic-web/src/App.tsx`（ルームの画面の仮置き）/ `scripts/audit-log-hygiene.mjs`（コンソールへ書くファイルの許可）

**Interfaces:**
- Consumes: Task 3 の `parseTopicWebMessage` / `planForError` / `ConnectionStatus`、Task 1 の `hubPathFor` / `redirectTo`
- Produces:

```ts
export function topicSyncUrl(location: { protocol: string; host: string }): string;
export interface TopicSync {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** この接続で `room.joined` を受け取ったか（再接続で下りる） */
  readonly joined: boolean;
  /** ルームが見つからないと分かった */
  readonly gone: boolean;
  /** 玄関へ戻す必要がある（端末に復帰の組が無い・合言葉を求められた） */
  readonly needsHub: boolean;
  /** 抜けた・外された（玄関へ理由を運んで戻す。#290） */
  readonly departed: DepartureReason | null;
  /** このルームの参加用 URL（配るもの。組み立ては `@tasuki/sync-client` が持つ） */
  readonly inviteUrl: string;
  /** いまのお題の状態（最初の `topic` フレームまで null） */
  readonly topicState: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  setTopic(title: string, body: string): void;
  clearTopic(): void;
  generate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty): void;
  unlock(key: string): void;
}
export function useTopicSync(roomCode: string): TopicSync;
```

- [ ] **Step 1: テスト用の WebSocket を置く**

`apps/topic-web/tests/support/scripted-web-socket.ts`（landing の `tests/hub/use-hub-sync.test.tsx` の `ScriptedWebSocket` と同じ形。ここでは 2 つのテストファイルが使うので切り出す）:

```ts
/** 送った中身を覚え、サーバーからの応答を差し込める WebSocket。 */
export class ScriptedWebSocket {
  static instances: ScriptedWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    ScriptedWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.();
  }

  /** サーバー側から切る（`onclose` を起こす）。 */
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** 送った中身を JSON として読む。 */
  sentJson(): Record<string, unknown>[] {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }
}

export const latestSocket = (): ScriptedWebSocket => {
  const socket = ScriptedWebSocket.instances.at(-1);
  if (socket === undefined) throw new Error('WebSocket が 1 本も張られていない');
  return socket;
};

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };

export const IDLE_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };
```

- [ ] **Step 2: 失敗するテストを書く**

`apps/topic-web/tests/use-topic-sync.test.tsx`:

```tsx
/**
 * お題ツールの同期フック（#91 PR 2）。**サーバーは立てない**（実サーバーとの配線は
 * `apps/tasuki-sync/test/live-ws.topic.test.ts` が受け持つ）。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { redirectTo } from '../src/router';
import { GONE_HEADING, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT, STALE_TEXT } from '../src/copy';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * @requirements #91 E4 spec §5.4
 */
describe('お題ツールのルームへの入り方', () => {
  it('Given 復帰の組がある / When お題ツールを開く / Then お題の入口へ繋ぎ、保存済みの組で入る', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    render(<App />);
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().url).toMatch(/\/ws\?tool=topic$/);
    expect(latestSocket().sentJson()[0]).toEqual({
      command: 'room.join',
      code: 'R1',
      displayName: 'あや',
      resumeToken: 't1',
    });
  });

  it('Given 復帰の組が無い / When お題ツールを開く / Then 繋がずに玄関のそのルームへ送り返す', () => {
    // When
    render(<App />);
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 入れた / When いまのお題が届く / Then 画面にタイトルが出る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => {
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({
        type: 'topic',
        state: { ...IDLE_STATE, topic: { title: 'FizzBuzz', body: '', source: 'manual' } },
      });
    });
    // Then
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 組を捨てて、見つからないと伝える', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(screen.getByRole('heading', { name: GONE_HEADING })).toBeInTheDocument();
  });

  it('Given 合言葉つきのルームで組が効かない / When 合言葉を求められる / Then 玄関のそのルームへ送り返す', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: 'x' }));
    // Then
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 混雑で拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず、過ぎたら入り直す', () => {
    // Given
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    const joins = () => latestSocket().sentJson().filter((m) => m['command'] === 'room.join');
    const delay = joinRetryDelayMs(1, () => 0.5)!;
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // Then その1: 知らせが出て、**待ち時間の手前ではまだ送らない**（即時に送り直す誤りを捕まえる）
    expect(screen.getByText(RETRY_WAITING_TEXT)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(joins()).toHaveLength(1);
    // Then その2: 過ぎたら 1 通だけ送り直す
    act(() => vi.advanceTimersByTime(1));
    expect(joins()).toHaveLength(2);
  });

  it('Given 混雑で拒まれ続けた / When 試行を使い切る / Then 諦めたと伝え、それ以上は送らない', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When: 拒まれるたびに待ちを進める（`joinRetryDelayMs` が null を返すまで）
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
      act(() => vi.advanceTimersByTime(60_000));
    }
    const sentBefore = latestSocket().sent.length;
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(screen.getByText(RETRY_EXHAUSTED_TEXT)).toBeInTheDocument();
    expect(latestSocket().sent.length).toBe(sentBefore);
  });

  it('Given 混雑の待ちの途中で切れた / When 繋ぎ直す / Then 入り直しは 1 通だけ送る', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // When: 待ちの途中で切れ、待ち時間も再接続の待ちも過ぎてから開く
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(60_000));
    act(() => latestSocket().open());
    // Then: 新しい接続で送った room.join は 1 通（待ちのタイマーの分がキューに溜まっていない）
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(1);
  });

  it('Given 入れていた接続が切れた / When 繋ぎ直す / Then もう一度入る', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    // When: 切れて、再接続の待ち（既定の上限 30 秒）が過ぎて、新しい接続が開く
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    expect(latestSocket().sentJson().some((m) => m['command'] === 'room.join')).toBe(true);
  });

  it('Given 入れた / When 契約に合わないフレームが届く / Then 同期できていないと伝える', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: { topic: 'broken' } }));
    // Then
    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
  });

  it('Given 合わないフレームで告知が出ている / When 正しいフレームが届く / Then 告知が下りる', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'topic', state: { topic: 'broken' } }));
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: IDLE_STATE }));
    // Then
    expect(screen.queryByText(STALE_TEXT)).toBeNull();
  });

  it('Given 入れた / When 参加の応答が届く / Then 新しい復帰の組を名乗った名前のまま保存する', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When: サーバーが新しいトークンを返した（復帰の組の更新）
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't2' }));
    // Then
    expect(loadResumeIdentity('R1')).toEqual({ ...RESUME, resumeToken: 't2' });
  });

  it('Given 切れている間に別のタブが組を捨てた / When 繋ぎ直す / Then 入ろうとせずに玄関へ送り返す', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    act(() => latestSocket().drop());
    localStorage.clear();
    // When
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(0);
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 入れた / When 別のタブで抜けた知らせが届く / Then 組を捨て、理由を持って玄関へ戻る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'LEFT_ROOM', message: 'x' }));
    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1&left=self');
  });

  it('Given 入れた / When 外された知らせが届く / Then 外された理由を持って玄関へ戻る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'REMOVED_FROM_ROOM', message: 'x' }));
    // Then
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1&left=removed');
  });
});
```

（「入れた」の後の画面の中身は Task 5 で作る。この段で落ちる理由は `App` がルームの画面を持たないこと。Step 4 の仮置きで、上のテストが見る 4 つ（`heading` のタイトル・消えたルームの見出し・再試行の知らせ・同期の告知）だけを出す。）

- [ ] **Step 3: 落ちることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL

- [ ] **Step 4: 実装する**

`apps/topic-web/src/hooks/use-topic-sync.ts`:

```ts
/**
 * お題ツールの同期フック（#91 PR 2・spec §5.4）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * ## ルームへの入り方
 *
 * 名乗りは玄関に 1 つだけある（`docs/adr/0018`）。ここは**端末の復帰の組（玄関・timer・poker と
 * 同じ鍵）で `room.join` を送るだけ**で、組が無い・合言葉を求められたら玄関へ戻す（`needsHub`）。
 * 参加の応答と失敗はハブと同じ形で返る（`apps/tasuki-sync/src/application/topic-handlers.ts`）。
 *
 * ## 送信キューとの付き合い方
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**`onReconnected` より先に**流す。
 * 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は
 * `canOperate`（`topic-view.ts`）で押させない。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DepartureReason } from '@tasuki/room-core';
import {
  SyncConnection,
  buildInviteUrl,
  clearResumeIdentity,
  joinRetryDelayMs,
  loadResumeIdentity,
  saveResumeIdentity,
} from '@tasuki/sync-client';
import type { Difficulty, Language, TopicCommand, TopicState } from '@tasuki/topic-core';
import { RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { planForError } from '../join-error-plan';
import { parseTopicWebMessage } from '../server-message';
import type { ConnectionStatus } from '../topic-view';

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function topicSyncUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws?tool=topic`;
}

export interface TopicSync {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** この接続で `room.joined` を受け取ったか（再接続で下りる） */
  readonly joined: boolean;
  /** ルームが見つからないと分かった */
  readonly gone: boolean;
  /** 玄関へ戻す必要がある（端末に復帰の組が無い・合言葉を求められた） */
  readonly needsHub: boolean;
  /** 抜けた・外された（玄関へ理由を運んで戻す。#290） */
  readonly departed: DepartureReason | null;
  /** このルームの参加用 URL（配るもの。組み立ては `@tasuki/sync-client` が持つ） */
  readonly inviteUrl: string;
  /** いまのお題の状態（最初の `topic` フレームまで null） */
  readonly topicState: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  setTopic(title: string, body: string): void;
  clearTopic(): void;
  generate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty): void;
  unlock(key: string): void;
}

export function useTopicSync(roomCode: string): TopicSync {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [everConnected, setEverConnected] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [syncStale, setSyncStale] = useState(false);
  const [joined, setJoined] = useState(false);
  const [gone, setGone] = useState(false);
  // **初期値を端末の組で決める。** 組の無い人は繋がずに玄関へ戻す（下の効果も同じ判定で抜ける）。
  const [needsHub, setNeedsHub] = useState(() => loadResumeIdentity(roomCode) === null);
  const [departed, setDeparted] = useState<DepartureReason | null>(null);
  const [topicState, setTopicState] = useState<TopicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const connRef = useRef<SyncConnection | null>(null);
  /** 混雑で拒まれた回数（入れたら・繋ぎ直したら数え直す）。 */
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  useEffect(() => {
    // 初期化子と効果の間に、別のタブが組を捨てていることがある。**ここでも玄関へ戻す印を立てる**
    // （立てずに return すると、接続も送り返しもしないまま「参加しています」で止まる）。
    // ⚠ この窓はテストで作れない（初期化子と効果の間に `localStorage` を変える手立てが無い）。
    // テストの無い防御なので、消すときはこの注釈ごと判断すること。
    if (loadResumeIdentity(roomCode) === null) {
      setNeedsHub(true);
      return;
    }

    /**
     * 保存済みの組で入る。**毎回読み直す** —— 同じ端末の別のタブが、消えたルームの組を
     * 捨てていることがある（`localStorage` は同じオリジンで共有される）。
     */
    const sendJoin = (): void => {
      const saved = loadResumeIdentity(roomCode);
      if (saved === null) {
        setNeedsHub(true);
        return;
      }
      conn.send({ command: 'room.join', code: roomCode, displayName: saved.displayName, resumeToken: saved.resumeToken });
    };

    const applyError = (code: string, message: string): void => {
      const plan = planForError(code, message);
      switch (plan.kind) {
        case 'gone':
          // 残すと、消えたルームへ毎回入り直そうとする（poker・玄関と同じ扱い）。
          clearResumeIdentity(roomCode);
          setGone(true);
          return;
        case 'left':
          // 抜けた・外された（別のタブの操作でも届く）。timer と同じく、組を捨てて接続を畳み、
          // 理由を持って玄関へ戻る（#290）。**畳まないと「押せるのに効かない」画面が残る。**
          cancelRetry();
          clearResumeIdentity(roomCode);
          conn.dispose();
          setJoined(false);
          setDeparted(plan.reason);
          return;
        case 'to-hub':
          setNeedsHub(true);
          return;
        case 'retry': {
          // **即時に送り直さない。** 待ち時間とばらつきは `joinRetryDelayMs` が決める（#147）。
          const delay = joinRetryDelayMs((retryRef.current += 1));
          if (delay === null) {
            setRetryNotice(RETRY_EXHAUSTED_TEXT);
            return;
          }
          setRetryNotice(RETRY_WAITING_TEXT);
          cancelRetry();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            sendJoin();
          }, delay);
          return;
        }
        case 'show':
          setError(plan.message);
          return;
      }
    };

    const handleMessage = (raw: string): void => {
      const msg = parseTopicWebMessage(raw);
      if (msg === null) {
        // 境界検証に落ちたフレームは画面へ渡さない（原則 IV）。**捨てたことは必ず伝える**（#212）。
        console.warn('契約に合わないサーバーメッセージを捨てました'); // log-hygiene:allow 固定の文言のみ（経路も値も出さない）
        setSyncStale(true);
        return;
      }
      setSyncStale(false);
      switch (msg.type) {
        case 'topic':
          setTopicState(msg.state);
          return;
        case 'room.joined': {
          // 端末の同一性は 4 つの画面で 1 つ（#95 S5b・D12）。名前は送ったときのものを残す。
          const saved = loadResumeIdentity(roomCode);
          saveResumeIdentity({
            code: msg.code,
            participantId: msg.participantId,
            resumeToken: msg.resumeToken,
            displayName: saved?.displayName ?? '',
          });
          retryRef.current = 0;
          setRetryNotice(null);
          setJoined(true);
          return;
        }
        case 'error':
          applyError(msg.code, msg.message);
          return;
        default:
          // `roster` / `room.created` はこの接続へは届かない（届いても読まない）。
          return;
      }
    };

    const conn = new SyncConnection({
      url: topicSyncUrl(window.location),
      onMessage: handleMessage,
      onOpen: () => {
        setStatus('open');
        setEverConnected(true);
        setFailedAttempts(0);
      },
      onClose: () => {
        // **待っている入り直しを畳む。** 切断中に発火すると `room.join` が送信キューに溜まり、
        // 再接続で `onReconnected` の分と合わせて 2 通流れる（2 通目はサーバーが拒み、
        // 「コマンドの形式が不正です」が出る）。入り直しは `onReconnected` が 1 回だけ行う。
        cancelRetry();
        setStatus('closed');
        setFailedAttempts((n) => n + 1);
        // 新しい接続はサーバー側で未参加から始まる。捨てたフレームの告知も前の接続のもの。
        setJoined(false);
        setSyncStale(false);
      },
      onReconnected: () => {
        // 繋ぎ直したら数え直して入り直す（前の接続で諦めていても、新しい接続では試してよい）。
        cancelRetry();
        retryRef.current = 0;
        setRetryNotice(null);
        sendJoin();
      },
    });
    connRef.current = conn;
    conn.connect();
    // 確立前の送信はキューに溜まり、開いたときに流れる。
    sendJoin();

    return () => {
      cancelRetry();
      conn.dispose();
      connRef.current = null;
    };
    // 接続はこの画面の生存期間で 1 本（ルームコードはページ読み込みで決まる）。
  }, [roomCode, cancelRetry]);

  const actions = useMemo(() => {
    const send = (cmd: TopicCommand): void => {
      setError(null);
      connRef.current?.send(cmd as unknown as Record<string, unknown>);
    };
    return {
      clearError: () => setError(null),
      setTopic: (title: string, body: string) => send({ command: 'topic.set', title, body }),
      clearTopic: () => send({ command: 'topic.clear' }),
      generate: (mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty) =>
        send({ command: 'topic.generate', mode, language, difficulty }),
      unlock: (key: string) => send({ command: 'ai.unlock', key }),
    };
  }, []);

  return useMemo(
    () => ({
      status,
      everConnected,
      failedAttempts,
      syncStale,
      joined,
      gone,
      needsHub,
      departed,
      inviteUrl: buildInviteUrl(window.location.origin, roomCode),
      topicState,
      error,
      retryNotice,
      ...actions,
    }),
    [status, everConnected, failedAttempts, syncStale, joined, gone, needsHub, departed, roomCode, topicState, error, retryNotice, actions],
  );
}
```

（`TopicCommand` 型は topic-core の `TopicCommandSchema` の出力。`ai.unlock` の `key` の制約は送った先の境界が見る。）

`apps/topic-web/src/App.tsx` に、Task 5 で差し替える**仮置き**のルームの画面を足す（`route.name === 'room'` のとき `<TopicRoomDraft roomCode={route.roomCode} />` を返す）:

```tsx
// Task 5 で src/screens/TopicRoom.tsx に置き換える仮置き。
function TopicRoomDraft({ roomCode }: { roomCode: string }) {
  const sync = useTopicSync(roomCode);
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);
  const notice = connectionNotice(sync);
  if (sync.gone) return <h1>{GONE_HEADING}</h1>;
  return (
    <main className="page">
      {notice.kind !== 'none' && <p role="status">{notice.text}</p>}
      {sync.retryNotice && <p role="status">{sync.retryNotice}</p>}
      {sync.topicState?.topic && <h2>{sync.topicState.topic.title}</h2>}
    </main>
  );
}
```

**画面が同期クライアントを直接 import しないことを守るテスト**を置く。`scripts/audit-web-sync-boundary.mjs` の宣言は `new WebSocket(` しか見ず、`.tsx` からの `@tasuki/sync-client` の import は素通りする（PR #268 のレビューで、画面が同期クライアントを直接 import していたのが実際に見つかった）。`apps/topic-web/tests/screens-do-not-import-sync-client.test.ts`:

```ts
/**
 * 画面（`.tsx`）は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2・`docs/guides/architecture.md`）。
 * `@tasuki/sync-client` を読んでよいのは同期フック（`src/hooks/use-topic-sync.ts`）だけである。
 *
 * **`scripts/audit-web-sync-boundary.mjs` はこれを見ない**（`new WebSocket(` と、アプリ内の相対パスの
 * 同期モジュールだけを見る）。検査を広げる代わりに、このアプリの中で持つ。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED = new Set(['hooks/use-topic-sync.ts']);

/** `src` 配下の `.ts` / `.tsx` を再帰で集める（`src` からの相対パス）。 */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [path.relative(SRC, full).split(path.sep).join('/')] : [];
  });
}

/**
 * @requirements #91 spec §5.4（web 層の 3 責務）
 */
describe('同期クライアントを読むのは同期フックだけ', () => {
  it('Given src のファイル / When import を見る / Then 同期フック以外は @tasuki/sync-client を読まない', () => {
    // Given
    const files = sourceFiles();
    // When
    const offenders = files.filter(
      (file) => !ALLOWED.has(file) && /from\s+['"]@tasuki\/sync-client['"]/.test(readFileSync(path.join(SRC, file), 'utf8')),
    );
    // Then（走査が空振りしていないことも固定する）
    expect(offenders).toEqual([]);
    expect(files).toContain('hooks/use-topic-sync.ts');
    expect(files.length).toBeGreaterThan(5);
  });
});
```

`scripts/audit-log-hygiene.mjs` のコンソールへ書いてよいファイルの一覧（`"apps/poker-web/src/hooks/useSync.ts",` の後ろ）:

```js
  // #91 PR 2。契約に合わないフレームを捨てたときの固定の文言（poker-web の useSync と同じ）。
  "apps/topic-web/src/hooks/use-topic-sync.ts",
```

- [ ] **Step 5: 通ることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
pnpm --filter @tasuki/topic-web typecheck
pnpm --filter @tasuki/topic-web lint
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
node scripts/audit-web-sync-boundary.mjs; echo "exit=$?"
```

Expected: すべて成功。**「繋ぎ直す」テストが落ちたら**、`SyncConnection` の再接続の待ちが `ExponentialBackoff` の既定（上限 30 秒）より長くなっていないかを `packages/sync-client/src/backoff.ts` で見る（待ちを伸ばさずテストの前提を直す）

- [ ] **Step 6: コミットする**

```bash
git add apps/topic-web scripts/audit-log-hygiene.mjs
git commit -m "feat: お題ツールの同期フックを足す（#91 PR 2）"
```

---

### Task 5: お題ツールの画面

**Files:**
- Create: `apps/topic-web/src/screens/TopicRoom.tsx` / `src/components/CurrentTopic.tsx` / `src/components/TopicEditor.tsx` / `src/components/TopicMaker.tsx` / `src/components/InviteLink.tsx` / `apps/topic-web/tests/topic-room.test.tsx` / `apps/topic-web/tests/rendered-text-fits-font-base.test.tsx`
- Modify: `apps/topic-web/src/App.tsx`（仮置きを外す）/ `apps/topic-web/src/index.css`

**Interfaces:**
- Consumes: Task 4 の `useTopicSync` / `TopicSync`、Task 3 の `canOperate` / `generationNotice` / `connectionNotice`、Task 2 の `copy.ts`、topic-core の `LANGUAGES` / `DIFFICULTIES` / `MAX_TOPIC_TITLE` / `MAX_TOPIC_BODY` / `MAX_AI_UNLOCK_KEY`
- Produces: `TopicRoom({ roomCode }: { roomCode: string })`

- [ ] **Step 1: 失敗するテストを書く**

`apps/topic-web/tests/topic-room.test.tsx`（`beforeEach` / `afterEach` と `vi.mock` は Task 4 のテストと同じものを置く）:

```tsx
/**
 * お題ツールの画面（#91 PR 2・spec §5.4）。WebSocket を差し替え、フックと画面を通しで見る。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from '@tasuki/topic-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { redirectTo } from '../src/router';
import * as copy from '../src/copy';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  // 偽のタイマーを使うテストが途中で落ちても、後続へ漏らさない
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIZZ = { title: 'FizzBuzz', body: '3 のときは Fizz を出す', source: 'manual' as const };

/** 入った状態まで進め、お題の状態を 1 通届ける。 */
function enterWith(state: object = IDLE_STATE): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'topic', state });
  });
}

const lastSent = () => latestSocket().sentJson().at(-1);
const setButton = () => screen.getByRole('button', { name: copy.SET_BUTTON });

/**
 * @requirements #91 E10 spec §5.4
 */
describe('いまのお題', () => {
  it('Given お題なし / When 画面を開く / Then 書く・作るへ誘い、下ろすボタンは無い', () => {
    enterWith();
    expect(screen.getByText(copy.EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.WRITE_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.MAKE_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.CLEAR_BUTTON })).toBeNull();
  });

  it('Given お題がある / When 画面を開く / Then タイトルと説明が出て、下ろすと topic.clear が送られる', () => {
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    const current = screen.getByRole('region', { name: copy.CURRENT_HEADING });
    expect(within(current).getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    expect(within(current).getByText('3 のときは Fizz を出す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.CLEAR_BUTTON }));
    expect(lastSent()).toEqual({ command: 'topic.clear' });
  });

  it('Given 生成していない / When 画面を見る / Then いまのお題は忙しい印を持たない', () => {
    // Given / When（aria-busy を常に true にする誤りを捕まえる）
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // Then
    expect(screen.getByRole('region', { name: copy.CURRENT_HEADING })).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText(copy.GENERATING_TEXT)).toBeNull();
  });

  it('Given お題があって生成中 / When 画面を見る / Then 作っていることが見え、掲げる・下ろす・作り直すはどれも押せる', () => {
    // Given
    enterWith({ ...IDLE_STATE, generating: true, aiUnlocked: true, topic: FIZZ });
    // When
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    // Then: 生成中も押せる（押すと進行中の生成をサーバーが中断する・E11 はサーバー側の単体が見る）
    expect(screen.getByRole('region', { name: copy.CURRENT_HEADING })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(copy.GENERATING_TEXT)).toBeInTheDocument();
    expect(setButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.CLEAR_BUTTON })).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.AI_BUTTON })).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.FALLBACK_BUTTON })).toBeEnabled();
  });

  it('Given 定型に落ちた / When 画面を見る / Then 定型にしたと伝える', () => {
    enterWith({ ...IDLE_STATE, degraded: true, topic: { ...FIZZ, source: 'fallback' } });
    expect(screen.getByText(copy.DEGRADED_TEXT)).toBeInTheDocument();
  });
});

/**
 * @requirements #91 E2 spec §5.4
 */
describe('書く', () => {
  it('Given タイトルと説明を書いた / When このお題にする / Then topic.set が送られ、欄が空に戻る', () => {
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    fireEvent.change(screen.getByLabelText(copy.BODY_LABEL), { target: { value: '3 のときは Fizz を出す' } });
    fireEvent.click(setButton());
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '3 のときは Fizz を出す' });
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('');
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveValue('');
  });

  it('Given 前後に空白のあるタイトル / When このお題にする / Then 空白を落として送る', () => {
    // Given
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '  FizzBuzz  ' } });
    // When
    fireEvent.click(setButton());
    // Then
    expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '' });
  });

  it('Given タイトルが空白だけ / When 書いた / Then このお題にするは押せない', () => {
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '   ' } });
    expect(setButton()).toBeDisabled();
  });

  it('Given 画面 / When 欄を見る / Then タイトルと説明の欄は topic-core の上限で止まる', () => {
    enterWith();
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveAttribute('maxLength', String(MAX_TOPIC_TITLE));
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveAttribute('maxLength', String(MAX_TOPIC_BODY));
  });

  it('Given 下書きの途中 / When 別の人のお題が届く / Then 下書きは残る', () => {
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: '書きかけ' } });
    act(() => latestSocket().deliver({ type: 'topic', state: { ...IDLE_STATE, topic: FIZZ } }));
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('書きかけ');
  });

  it('Given いまのお題がある / When 書き直す / Then 欄にいまのお題が入る', () => {
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
    expect(screen.getByLabelText(copy.TITLE_LABEL)).toHaveValue('FizzBuzz');
    expect(screen.getByLabelText(copy.BODY_LABEL)).toHaveValue('3 のときは Fizz を出す');
  });
});

/**
 * @requirements #91 E7 E8 E22 spec §5.4
 */
describe('作る', () => {
  it('Given 未解錠 / When 画面を見る / Then 合言葉の欄があり、AI で作るは出ない', () => {
    enterWith();
    expect(screen.getByLabelText(copy.UNLOCK_LABEL)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.AI_BUTTON })).toBeNull();
  });

  it('Given 未解錠 / When 合言葉を送る / Then ai.unlock が送られ、欄から合言葉が消える', () => {
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.UNLOCK_LABEL), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: copy.UNLOCK_BUTTON }));
    expect(lastSent()).toEqual({ command: 'ai.unlock', key: 'secret' });
    expect(screen.getByLabelText(copy.UNLOCK_LABEL)).toHaveValue('');
  });

  it('Given 解錠済み / When 言語と難易度を選んで AI で作る / Then 選んだ値で topic.generate が送られる', () => {
    enterWith({ ...IDLE_STATE, aiUnlocked: true });
    expect(screen.queryByLabelText(copy.UNLOCK_LABEL)).toBeNull();
    fireEvent.change(screen.getByLabelText(copy.LANGUAGE_LABEL), { target: { value: 'Go' } });
    fireEvent.change(screen.getByLabelText(copy.DIFFICULTY_LABEL), { target: { value: 'hard' } });
    fireEvent.click(screen.getByRole('button', { name: copy.AI_BUTTON }));
    expect(lastSent()).toEqual({ command: 'topic.generate', mode: 'ai', language: 'Go', difficulty: 'hard' });
  });

  it('Given 画面 / When 定型から選ぶ / Then 既定の言語と難易度で topic.generate が送られる', () => {
    enterWith();
    fireEvent.click(screen.getByRole('button', { name: copy.FALLBACK_BUTTON }));
    expect(lastSent()).toEqual({ command: 'topic.generate', mode: 'fallback', language: 'TypeScript', difficulty: 'easy' });
  });

  it('Given 作り直しが早すぎた / When サーバーが拒む / Then 待ってから作り直すよう伝える', () => {
    enterWith();
    act(() =>
      latestSocket().deliver({ type: 'error', code: 'GENERATION_COOLDOWN', message: 'しばらく待ってから、もう一度作ってください。' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('しばらく待ってから、もう一度作ってください。');
  });
});

/**
 * @requirements #91 spec §5.4（ルームへの入り方・戻り方は timer / poker と同じ）
 */
describe('操作できない間', () => {
  it('Given 参加の応答がまだ / When 画面を開く / Then 参加していると伝える', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    expect(screen.getByRole('heading', { name: copy.JOINING_HEADING })).toBeInTheDocument();
  });

  it('Given 解錠済みで下書きと合言葉がある / When 切れて繋ぎ直し、参加の返事を待つ / Then どの操作も押せず、返事が来たら押せる', () => {
    // Given
    vi.useFakeTimers();
    enterWith({ ...IDLE_STATE, aiUnlocked: true, topic: FIZZ });
    fireEvent.change(screen.getByLabelText(copy.TITLE_LABEL), { target: { value: 'FizzBuzz' } });
    const buttons = () => [
      setButton(),
      screen.getByRole('button', { name: copy.CLEAR_BUTTON }),
      screen.getByRole('button', { name: copy.AI_BUTTON }),
      screen.getByRole('button', { name: copy.FALLBACK_BUTTON }),
    ];
    // When: 切れて、繋ぎ直した（**接続は開いているが、まだ参加していない窓**）
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then その1: 参加の返事が来るまでは押せない（切断中だけを見ると、参加の判定が壊れていても隠れる）
    for (const button of buttons()) expect(button).toBeDisabled();
    // Then その2: 返事が来たら押せる
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    for (const button of buttons()) expect(button).toBeEnabled();
    vi.useRealTimers();
  });

  it('Given 未解錠で合言葉を書いてある / When 切れる / Then 解錠するは押せない', () => {
    // Given（空のままでは誤実装でも押せないので、書いてから見る）
    enterWith();
    fireEvent.change(screen.getByLabelText(copy.UNLOCK_LABEL), { target: { value: 'secret' } });
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeEnabled();
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByRole('button', { name: copy.UNLOCK_BUTTON })).toBeDisabled();
  });

  it('Given 入れていた / When 切れる / Then 画面を保ったまま再接続中と伝える', () => {
    // Given
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByText(copy.RECONNECTING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
  });

  it('Given 一度も繋がらない / When 失敗する / Then 繋がらないと警告する', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByRole('alert')).toHaveTextContent(copy.UNREACHABLE_TEXT);
  });

  it('Given 繋ぎ直して入り直す途中 / When 混雑で拒まれる / Then お題の画面のまま待っていると伝える', () => {
    // Given
    vi.useFakeTimers();
    enterWith({ ...IDLE_STATE, topic: FIZZ });
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // Then
    expect(screen.getByText(copy.RETRY_WAITING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('Given 画面 / When 戻る導線を見る / Then 同じルームの選択画面を指す', () => {
    enterWith();
    expect(screen.getByRole('link', { name: copy.BACK_LINK })).toHaveAttribute('href', '/?room=R1');
  });

  it('Given 画面 / When 招待リンクを見る / Then 玄関のそのルームの参加用 URL を配る', () => {
    enterWith();
    expect(screen.getByText(`${location.origin}/?room=R1`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.INVITE_COPY_BUTTON })).toBeInTheDocument();
  });
});
```

`apps/topic-web/tests/rendered-text-fits-font-base.test.tsx`（**画面に直書きした文言を拾う**。`copy-fits-font-base` は `copy.ts` しか見ないので、`.tsx` に「掲げる本文」と直書きしても緑だった・検出力の検証で実測。判定は実装より広く、**描いた画面の文字すべて**から利用者の内容だけを除いて当てる）:

```tsx
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { outsideBase } from './support/font-base';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 利用者の内容（ルームコード・表示名・お題）は ASCII にして、判定から外れるようにする。 */
const TOPIC = { title: 'FizzBuzz', body: 'fizz', source: 'manual' as const };

/** 描いた画面の文字（見出し・ボタン・ラベル・選択肢・知らせ）を 1 本にする。 */
function renderedText(): string {
  return document.body.textContent ?? '';
}

/**
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe('描いたお題ツールの文字は書体の常用の層に収まる', () => {
  it.each([
    ['お題なし・未解錠', IDLE_STATE],
    ['お題あり・生成中・解錠済み', { ...IDLE_STATE, topic: TOPIC, generating: true, aiUnlocked: true }],
    ['定型に落ちた', { ...IDLE_STATE, topic: { ...TOPIC, source: 'fallback' as const }, degraded: true }],
  ])('Given %s / When 画面を描く / Then 外れる字は無い', (_label, state) => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'topic', state });
    });
    // Then（描けていることも固定する。空の画面なら何も外れない）
    expect(outsideBase([renderedText()])).toEqual([]);
    expect(renderedText().length).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
```

Expected: FAIL（画面が無い）

- [ ] **Step 3: 実装する**

`apps/topic-web/src/screens/TopicRoom.tsx`:

```tsx
/**
 * お題ツールのルームの画面（#91 PR 2・spec §5.4）。1 画面で完結させる（timer の形は引き継がない）。
 *
 * **ここで名前は聞かない**（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・
 * 合言葉を求められたら、玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect } from 'react';
import { CurrentTopic } from '../components/CurrentTopic';
import { InviteLink } from '../components/InviteLink';
import { LoadingView } from '../components/LoadingView';
import { TopicEditor } from '../components/TopicEditor';
import { TopicMaker } from '../components/TopicMaker';
import { BACK_LINK, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useTopicSync } from '../hooks/use-topic-sync';
import { hubPathFor, redirectTo } from '../router';
import { canOperate, connectionNotice, generationNotice } from '../topic-view';

export function TopicRoom({ roomCode }: { roomCode: string }) {
  const sync = useTopicSync(roomCode);

  // 玄関へ戻す。抜けた・外されたときは理由を運ぶ（玄関が告知を出す・#290）。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  const notice = connectionNotice(sync);
  const banner = notice.kind !== 'none' && (
    <div className={`connection-banner${notice.kind === 'unreachable' ? ' unreachable' : ''}`} role={notice.kind === 'unreachable' ? 'alert' : 'status'}>
      {notice.text}
    </div>
  );

  if (sync.gone) {
    return (
      <main className="page">
        <h1>{GONE_HEADING}</h1>
        <p>{GONE_TEXT}</p>
        {/* 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する・poker と同じ扱い） */}
        <a href="/">{GONE_LINK}</a>
      </main>
    );
  }
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;
  // 最初の入室が成立するまで。再接続の間は画面を保ち、操作だけを止める（`canOperate`）。
  if (!sync.joined && sync.topicState === null) {
    return (
      <>
        {banner}
        <main className="page">
          <h1>{JOINING_HEADING}</h1>
          {sync.retryNotice && <p role="status">{sync.retryNotice}</p>}
          {sync.error && <p className="topic-error" role="alert">{sync.error}</p>}
        </main>
      </>
    );
  }

  const enabled = canOperate(sync.status, sync.joined);
  return (
    <>
      {banner}
      <main className="page topic-page">
        <header className="topic-header">
          <h1>{PAGE_HEADING}</h1>
          <a className="topic-back" href={hubPathFor(roomCode)}>
            {BACK_LINK}
          </a>
        </header>
        <InviteLink url={sync.inviteUrl} />
        {/* 入り直しの途中の混雑も、この画面で伝える（伝えないと、ボタンが黙って押せなくなる） */}
        {sync.retryNotice && <p className="topic-notice" role="status">{sync.retryNotice}</p>}
        {sync.error && <p className="topic-error" role="alert">{sync.error}</p>}
        <CurrentTopic state={sync.topicState} notice={generationNotice(sync.topicState)} enabled={enabled} onClear={sync.clearTopic} />
        <div className="topic-tools">
          <TopicEditor current={sync.topicState?.topic ?? null} enabled={enabled} onSubmit={sync.setTopic} />
          <TopicMaker aiUnlocked={sync.topicState?.aiUnlocked ?? false} enabled={enabled} onGenerate={sync.generate} onUnlock={sync.unlock} />
        </div>
      </main>
    </>
  );
}
```

`apps/topic-web/src/components/CurrentTopic.tsx`:

```tsx
import type { TopicState } from '@tasuki/topic-core';
import { CLEAR_BUTTON, CURRENT_HEADING, EMPTY_TEXT } from '../copy';

interface Props {
  readonly state: TopicState | null;
  readonly notice: string | null;
  readonly enabled: boolean;
  onClear(): void;
}

/**
 * いまのお題。**生成中は全員の画面で `aria-busy` を立てる**（spec §5.4・E10）。
 * 知らせは `role="status"`（控えめな読み上げ）で出し、操作の邪魔をしない。
 */
export function CurrentTopic({ state, notice, enabled, onClear }: Props) {
  const topic = state?.topic ?? null;
  return (
    <section className="topic-current" aria-labelledby="topic-current-heading" aria-busy={state?.generating ?? false}>
      <h2 id="topic-current-heading">{CURRENT_HEADING}</h2>
      {notice && (
        <p className="topic-notice" role="status">
          {notice}
        </p>
      )}
      {topic === null ? (
        <p className="topic-empty">{EMPTY_TEXT}</p>
      ) : (
        <article className="topic-card">
          <h3 className="topic-title">{topic.title}</h3>
          {topic.body !== '' && <p className="topic-body">{topic.body}</p>}
        </article>
      )}
      {topic !== null && (
        <button type="button" className="secondary" onClick={onClear} disabled={!enabled}>
          {CLEAR_BUTTON}
        </button>
      )}
    </section>
  );
}
```

`apps/topic-web/src/components/InviteLink.tsx`（poker-web の `RoomPage.tsx` の `InviteLink` と同じ形。配るのは玄関のそのルームの URL で、組み立ては同期フックが持つ）:

```tsx
import { useCopyText } from '@tasuki/invite-ui';
import { INVITE_COPIED, INVITE_COPY_BUTTON, INVITE_COPY_FAILED } from '../copy';

export function InviteLink({ url }: { url: string }) {
  const { state, copy } = useCopyText(url);
  return (
    <div className="topic-invite">
      <span className="topic-invite-url">{url}</span>
      <button type="button" className="secondary" onClick={copy}>
        {state === 'done' && INVITE_COPIED}
        {state === 'failed' && INVITE_COPY_FAILED}
        {state === 'idle' && INVITE_COPY_BUTTON}
      </button>
    </div>
  );
}
```

`apps/topic-web/package.json` の `dependencies` に `"@tasuki/invite-ui": "workspace:*"` を足して `pnpm install` し、`scripts/audit-dependency-direction.mjs` の `"apps/topic-web"` の欄にも `"@tasuki/invite-ui"` を足す。

`apps/topic-web/src/components/TopicEditor.tsx`:

```tsx
import { useId, useState } from 'react';
import { MAX_TOPIC_BODY, MAX_TOPIC_TITLE, type Topic } from '@tasuki/topic-core';
import { BODY_LABEL, REWRITE_BUTTON, SET_BUTTON, TITLE_LABEL, WRITE_HEADING } from '../copy';
import { canSubmitTopic } from '../topic-view';

interface Props {
  readonly current: Topic | null;
  readonly enabled: boolean;
  onSubmit(title: string, body: string): void;
}

/**
 * 手で書いてお題にする（spec §5.4 の「書く」）。
 *
 * **下書きはこの部品だけが持ち、届いたお題で上書きしない。** 書いている途中に別の人がお題を
 * 変えても、入力は消さない。いまのお題を下書きへ写すのは「書き直す」を押したときだけ。
 */
export function TopicEditor({ current, enabled, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const titleId = useId();
  const bodyId = useId();
  const canSubmit = canSubmitTopic(title, enabled);

  return (
    <section className="topic-panel" aria-labelledby={`${titleId}-heading`}>
      <h2 id={`${titleId}-heading`}>{WRITE_HEADING}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit(title.trim(), body);
          setTitle('');
          setBody('');
        }}
      >
        <label htmlFor={titleId}>{TITLE_LABEL}</label>
        <input id={titleId} value={title} maxLength={MAX_TOPIC_TITLE} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor={bodyId}>{BODY_LABEL}</label>
        <textarea id={bodyId} value={body} rows={6} maxLength={MAX_TOPIC_BODY} onChange={(e) => setBody(e.target.value)} />
        <div className="topic-actions">
          <button type="submit" disabled={!canSubmit}>
            {SET_BUTTON}
          </button>
          {current !== null && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setTitle(current.title);
                setBody(current.body);
              }}
            >
              {REWRITE_BUTTON}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
```

`apps/topic-web/src/components/TopicMaker.tsx`:

```tsx
import { useId, useState } from 'react';
import { DIFFICULTIES, LANGUAGES, MAX_AI_UNLOCK_KEY, type Difficulty, type Language } from '@tasuki/topic-core';
import {
  AI_BUTTON,
  DIFFICULTY_LABEL,
  DIFFICULTY_NAMES,
  FALLBACK_BUTTON,
  LANGUAGE_LABEL,
  MAKE_HEADING,
  UNLOCK_BUTTON,
  UNLOCK_LABEL,
} from '../copy';
import { canUnlock } from '../topic-view';

interface Props {
  readonly aiUnlocked: boolean;
  readonly enabled: boolean;
  onGenerate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty): void;
  onUnlock(key: string): void;
}

/**
 * AI か定型で作る（spec §5.4 の「作る」）。**選択肢は topic-core の許可リストから引く**
 * （画面と境界で別の一覧を持つと、選べるのに拒まれる値が生まれる・`docs/adr/0012` D10）。
 *
 * 未解錠なら合言葉の欄を出し、「AI で作る」は出さない。合言葉は送ったら欄から消す
 * （平文を画面の状態に残さない）。
 */
export function TopicMaker({ aiUnlocked, enabled, onGenerate, onUnlock }: Props) {
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [key, setKey] = useState('');
  const id = useId();

  return (
    <section className="topic-panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{MAKE_HEADING}</h2>
      <label htmlFor={`${id}-language`}>{LANGUAGE_LABEL}</label>
      <select
        id={`${id}-language`}
        value={language}
        onChange={(e) => {
          const next = LANGUAGES.find((l) => l === e.target.value);
          if (next !== undefined) setLanguage(next);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-difficulty`}>{DIFFICULTY_LABEL}</label>
      <select
        id={`${id}-difficulty`}
        value={difficulty}
        onChange={(e) => {
          const next = DIFFICULTIES.find((d) => d === e.target.value);
          if (next !== undefined) setDifficulty(next);
        }}
      >
        {DIFFICULTIES.map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_NAMES[d]}
          </option>
        ))}
      </select>
      <div className="topic-actions">
        {aiUnlocked && (
          <button type="button" onClick={() => onGenerate('ai', language, difficulty)} disabled={!enabled}>
            {AI_BUTTON}
          </button>
        )}
        <button type="button" className="secondary" onClick={() => onGenerate('fallback', language, difficulty)} disabled={!enabled}>
          {FALLBACK_BUTTON}
        </button>
      </div>
      {!aiUnlocked && (
        <form
          className="topic-unlock"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canUnlock(key, enabled)) return;
            onUnlock(key);
            setKey('');
          }}
        >
          <label htmlFor={`${id}-key`}>{UNLOCK_LABEL}</label>
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            maxLength={MAX_AI_UNLOCK_KEY}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="submit" disabled={!canUnlock(key, enabled)}>
            {UNLOCK_BUTTON}
          </button>
        </form>
      )}
    </section>
  );
}
```

`apps/topic-web/src/App.tsx` から仮置き（`TopicRoomDraft`）を外し、`route.name === 'room'` のとき `<TopicRoom roomCode={route.roomCode} />` を返す。

`apps/topic-web/src/index.css` へ画面のスタイルを足す（**色・字の大きさは `@tasuki/ui` の語彙だけを使う**。α の数値・生の色を書かない —— `design-system-invariants`。字の大きさは `--font-size-xs`〜`-xl` の 5 段。細部は Task 11 の実画面で詰める）:

```css
/* ---------- 見出しと戻る導線（poker-web の `.room-title` と同じ組み方） ---------- */

.topic-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.topic-back {
  flex: none;
  font-size: var(--font-size-sm);
}

/* ---------- いまのお題（象牙の札） ---------- */

.topic-current {
  display: grid;
  gap: var(--space-3);
}

.topic-card {
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--ivory);
  color: var(--coal);
}

.topic-title {
  margin: 0;
  font-size: var(--font-size-lg);
}

.topic-body {
  margin: var(--space-3) 0 0;
  /* 改行をそのまま見せる（本文は自由文。定型バンクは段落を改行で分けている） */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.topic-empty,
.topic-notice {
  margin: 0;
  color: var(--ivory-dim);
}

.topic-error {
  color: var(--rose-bright);
}

/* ---------- 接続の告知（poker-web と同じ役割。色は @tasuki/ui の警告の語彙で表す） ---------- */

.connection-banner {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: var(--space-2) var(--space-4);
  background: var(--rose-tint);
  border-bottom: 1px solid var(--rose-edge);
  color: var(--rose-pale);
  font-size: var(--font-size-sm);
  text-align: center;
}

/* 繋がらない状態は「切れて戻る途中」より強く出す（色だけに頼らず文言でも区別している）。 */
.connection-banner.unreachable {
  background: var(--rose-veil);
  font-weight: 700;
}

/* ---------- 招待リンク（poker-web の `.invite` と同じ組み方） ---------- */

.topic-invite {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
}

.topic-invite-url {
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  color: var(--ivory-dim);
  font-family: var(--font-mono);
  word-break: break-all;
}

/* ---------- 入力欄（玄関の `.hub-input` と同じ組み方） ---------- */

/* `@tasuki/ui` は入力欄の規則を持たない（#280 で要素層から外した）。書かないと、フェルトの上に
   ブラウザ既定の白い欄が出る。字の大きさは玄関と同じく `1rem` —— 16px を下回ると iOS Safari が
   フォーカス時に画面を拡大する（`apps/landing/src/index.css` の `.hub-input` の注記）。 */
.topic-panel input,
.topic-panel textarea,
.topic-panel select {
  min-width: 0;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--felt-950);
  color: var(--ivory);
  font: inherit;
  font-size: 1rem;
}

.topic-panel textarea {
  resize: vertical;
}

.topic-panel input:focus-visible,
.topic-panel textarea:focus-visible,
.topic-panel select:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

/* ---------- 書く・作る ---------- */

.topic-tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: var(--space-5);
}

.topic-panel {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--felt-900);
}

.topic-panel form {
  display: grid;
  gap: var(--space-2);
}

.topic-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
```

**使ったトークンが実在することを確かめる**（無いトークンは黙って効かない）:

```bash
for t in space-2 space-3 space-4 space-5 font-size-sm font-size-lg radius-md radius-lg ivory coal ivory-dim rose-bright rose-tint rose-veil rose-edge rose-pale line-strong felt-900 felt-950 gold font-mono; do
  grep -q -- "--$t:" packages/ui/src/tokens/*.css && echo "ok $t" || echo "MISSING $t"
done
```

Expected: `MISSING` が 0 件（出たら同じ役割の既存トークンへ替える。**新しいトークンを足さない**）

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test
pnpm --filter @tasuki/topic-web typecheck
pnpm --filter @tasuki/topic-web lint
pnpm --filter @tasuki/topic-web build
grep -nE 'font-size:\s*[0-9.]+(px|em|rem)' apps/topic-web/src/index.css
```

Expected: テストと build は成功。`grep` は**入力欄の `font-size: 1rem` の 1 行だけ**（それ以外の字の大きさは `--font-size-*` の 5 段で書く。`packages/ui/tests/typography-scale.test.mjs` はアプリの CSS を見ないので、ここで見る）。画面に直書きした文言は `rendered-text-fits-font-base` が拾う

- [ ] **Step 5: コミットする**

```bash
git add apps/topic-web
git commit -m "feat: お題ツールの画面（いまのお題・書く・作る）を足す（#91 PR 2）"
```

---

### Task 6: 玄関の 3 枚目の札と「いまのお題」

**Files:**
- Modify: `apps/landing/src/tools.ts` / `src/ToolMark.tsx` / `src/screens/RoomChoice.tsx` / `src/screens/HistoryLink.tsx` / `src/hub/use-hub-sync.ts` / `src/App.tsx` / `src/index.css` / `vite.config.ts` / `package.json`
- Modify: `scripts/audit-dependency-direction.mjs`（`apps/landing` の欄）
- Test: `apps/landing/tests/room-choice-layout.test.tsx` / `tests/hub/use-hub-sync.test.tsx` / `tests/history-link.test.tsx` / `tests/App.test.tsx`

**Interfaces:**
- Produces: `Tool.id: 'timer' | 'poker' | 'topic'`（`tools.ts`）/ `HubSync.topicTitle: string | null` / `RoomChoiceProps.topicTitle: string | null`

**札の名前（利用者が承認した・2026-09-24）**: pip「お題」・名前 **`Topic Board`**・一行説明「お題を用意して全員に見せる」・意匠は旗（`flag`）。既存の 2 枚が英語の名前（`TDD Mob Pro Timer` / `Planning Poker`）なので揃える。一行説明は base 層に収まる（実測済み）。名前を後で変えるなら `tools.ts` の 1 か所と、E2E の支援関数（Task 9 の `support/topic.ts`）の名前だけ。

- [ ] **Step 1: 失敗するテストを書く**

`apps/landing/tests/room-choice-layout.test.tsx` に足す:

```tsx
/**
 * 在席の表示の名前は、ツール ID で `TOOLS` から引く（spec §5.5）。並び順で引いていた頃は、
 * 札を足すとお題ツールに居る人が「topic にいます」と生の ID で出た。
 *
 * @requirements #91 spec §5.5
 */
describe('どのツールに居るか', () => {
  it('Given お題ツールと timer に居る人 / When 選択画面を開く / Then 札の名前で出る', () => {
    // Given
    const roster = { code: 'R1', participants: [
      { participantId: 'a', displayName: 'あや', presence: 'online' as const, tools: ['topic', 'timer'] },
    ] };
    // When
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={roster} connection="online" topicTitle={null} />);
    // Then
    expect(screen.getByText('Topic Board / TDD Mob Pro Timer にいます')).toBeVisible();
  });
});

/**
 * @requirements #91 E15 E16
 */
describe('玄関のいまのお題', () => {
  it('Given ルームにお題がある / When 選択画面を開く / Then 札の近くにタイトルだけが出る', () => {
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={null} connection="online" topicTitle="FizzBuzz" />);
    const tools = within(screen.getByRole('region', { name: '道具を選ぶ' }));
    expect(tools.getByText('いまのお題')).toBeVisible();
    expect(tools.getByText('FizzBuzz')).toBeVisible();
  });

  it('Given ルームにお題が無い / When 選択画面を開く / Then お題の行は出ない', () => {
    render(<RoomChoice code="R1" inviteUrl="https://example.test/?room=R1" roster={null} connection="online" topicTitle={null} />);
    expect(screen.queryByText('いまのお題')).toBeNull();
  });
});
```

既存の `render(<RoomChoice … />)` の呼び出し（このファイルと `tests/App.test.tsx`・`tests/room-choice-invite.test.tsx`。複数行で書かれたものもある）にも `topicTitle={null}` を足す。`tests/App.test.tsx` の「再接続中」のテストは `const props = { … } as const` を `{...props}` で渡しているので、**オブジェクトの側に `topicTitle: null` を足す**（**型検査で拾えるので、`pnpm --filter @tasuki/landing typecheck` で漏れを数える**。試走では 8 か所）。

`apps/landing/tests/hub/use-hub-sync.test.tsx` の `describe('ハブの同期')` に足す:

```tsx
  it('Given 参加の応答 / When お題の状態が届く / Then 選択画面にいまのお題のタイトルが出る', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());

    // When（操作）
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({
        type: 'topic',
        state: {
          topic: { title: 'FizzBuzz', body: '説明は出さない', source: 'manual' },
          generating: false,
          degraded: false,
          aiUnlocked: false,
        },
      });
    });

    // Then: タイトルだけを出し、説明は出さない（spec §5.5）
    expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    expect(screen.queryByText('説明は出さない')).toBeNull();
  });

  it('Given いまのお題が出ている / When お題が下ろされる / Then 行が消える', () => {
    // Given（準備）
    window.history.replaceState(null, '', '/?room=R1');
    render(<App />);
    act(() => socket().open());
    const state = { generating: false, degraded: false, aiUnlocked: false };
    act(() => {
      socket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      socket().deliver({ type: 'topic', state: { ...state, topic: { title: 'FizzBuzz', body: '', source: 'manual' } } });
    });
    expect(screen.getByText('FizzBuzz')).toBeInTheDocument();

    // When（操作）
    act(() => socket().deliver({ type: 'topic', state: { ...state, topic: null } }));

    // Then
    expect(screen.queryByText('いまのお題')).toBeNull();
  });
```

`apps/landing/tests/history-link.test.tsx` の `TIMER_BASE` を ID で引く形に変える（`mark` で引いていたのは `Tool` に識別子が無かったため）:

```ts
/**
 * **選ぶ鍵に `href` を使わない** —— 使うと突き合わせが恒真になる。ツール ID で引く
 * （#91 PR 2 で `Tool` に `id` を足した。それまでは札の意匠（`mark`）で引いていた）。
 */
const TIMER_BASE = TOOLS.find((tool) => tool.id === 'timer')?.href;
```

- [ ] **Step 2: 落ちることを確かめる**

```bash
pnpm --filter @tasuki/landing test
```

Expected: FAIL（`topicTitle` の prop が無い・`Topic Board` が無い・`topic` フレームを捨てている・`id` が無い）

- [ ] **Step 3: 実装する**

`apps/landing/package.json` の `dependencies` に `"@tasuki/topic-core": "workspace:*"` を足し、`pnpm install`。`scripts/audit-dependency-direction.mjs` の `"apps/landing"` の欄に `"@tasuki/topic-core",` を足し、欄の注釈に 1 行足す:

```js
  // #91 PR 2: 玄関は `topic` フレームを topic-core のスキーマで検め、タイトルだけを出す（spec §5.5）。
```

`apps/landing/src/tools.ts`:

```ts
/**
 * LP に並べるツール。
 *
 * href は**公開パス**で、変える場所はここ 1 箇所。
 * ただし公開パスは web 側だけでは決まらない。ツールを足す・移すときは
 * `vite.config.ts` の `base`・`deploy/<app>/app.env` の `PUBLIC_PATH`・
 * Caddy 断片を必ず揃える（1 つでも取り残すと白画面か 404 になる）。
 */
export interface Tool {
  /**
   * ツール ID。**綴りの正本は同期サーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、
   * 名簿の `tools` に載る値と同じ。在席の表示（`RoomChoice.tsx`）はこれで名前を引く
   * —— 並び順で引くと、札を足したときに名前がずれる（#91 PR 2 で直した）。
   */
  readonly id: "timer" | "poker" | "topic";
  /** 札の左上に出る一語。そのツールが扱うもの。 */
  readonly pip: string;
  /** ツール名（札の下端） */
  readonly name: string;
  /** 何をする道具かを 1 行で */
  readonly summary: string;
  /** 公開パス */
  readonly href: string;
  /** 札の中央に出る意匠 */
  readonly mark: "ring" | "spade" | "flag";
}

export const TOOLS: readonly Tool[] = [
  {
    id: "timer",
    pip: "交代",
    name: "TDD Mob Pro Timer",
    summary: "ドライバーの交代を計る",
    href: "/timer/",
    mark: "ring",
  },
  {
    id: "poker",
    pip: "見積",
    name: "Planning Poker",
    summary: "見積もりを揃える",
    href: "/poker/",
    mark: "spade",
  },
  {
    id: "topic",
    pip: "お題",
    name: "Topic Board",
    summary: "お題を用意して全員に見せる",
    href: "/topic/",
    mark: "flag",
  },
];
```

`apps/landing/src/ToolMark.tsx`（`kind` に `"flag"` を足し、スペードの前に旗の分岐を置く）:

```tsx
interface Props {
  readonly kind: "ring" | "spade" | "flag";
}
```

```tsx
  if (kind === "flag") {
    // お題の旗。竿が 1 本立ち、上に三角の旗がはためく（「掲げる」の姿）。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <line x1="14" y1="6" x2="14" y2="42" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M15 8c6-3 11 3 19 0v14c-8 3-13-3-19 0z" strokeWidth="0" />
      </svg>
    );
  }
```

`apps/landing/src/screens/RoomChoice.tsx`:

- `RoomChoiceProps` に `readonly topicTitle: string | null;`（JSDoc:「いまのお題のタイトル（無ければ null）。**説明は受け取らない**（玄関はタイトルだけを出す・spec §5.5）」）
- 札の `<ul className="hand">` の直後（`hub-tools` の section の中）に:

```tsx
          {topicTitle !== null && (
            <p className="hub-topic">
              <span className="hub-label">いまのお題</span>
              <span className="hub-topic-title">{topicTitle}</span>
            </p>
          )}
```

- `whereLabel` と `TOOL_NAMES` を置き換える:

```tsx
/**
 * その人がいまどのツールに居るかの表示。
 *
 * **綴りの正本はサーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、
 * 見せ方の正本は `src/tools.ts` である（設計正本 §7 の既知の地雷 4）。
 * **名前はツール ID で引く**（並び順で引くと、札を足したときにずれる・#91 PR 2）。
 * 知らない綴りはそのまま出す —— 隠すと、増えたツールが黙って消える。
 */
function whereLabel(tools: readonly string[]): string {
  const names = tools.map((id) => TOOLS.find((tool) => tool.id === id)?.name ?? id);
  return `${names.join(' / ')} にいます`;
}
```

`apps/landing/src/screens/HistoryLink.tsx`: 直書きの `/timer/` を `TOOLS` から引く形にし、⚠ の注釈（「`Tool` に識別子が無いため…この段では行わない」）を書き換える:

```tsx
import { TOOLS } from '../tools.js';

/** timer の公開パス。**宣言の正本は `src/tools.ts`**（#91 PR 2 で `Tool` に `id` が入り、引けるようになった）。 */
const TIMER_BASE = TOOLS.find((tool) => tool.id === 'timer')?.href ?? '/timer/';
```

（`href` の組み立ては `${TIMER_BASE}?view=history…` に変える。`?? '/timer/'` は型のための既定で、`tests/history-link.test.tsx` が `TOOLS` と突き合わせる。）

`apps/landing/src/hub/use-hub-sync.ts`:

- import に `import { TopicFrameSchema } from '@tasuki/topic-core';`
- `HubSync` に:

```ts
  /**
   * いまのお題のタイトル（無ければ null）。**タイトルだけを持ち、説明は持たない**（spec §5.5）。
   *
   * お題の状態はハブの言葉ではなく、ルーム横断の `topic` フレームで届く（spec T3）。
   */
  readonly topicTitle: string | null;
```

- state: `const [topicTitle, setTopicTitle] = useState<string | null>(null);`
- `onMessage` の先頭（`HubServerMsgSchema` で検める**前**）に:

```ts
        // お題の状態（spec T3）。ハブの言葉ではないので、ハブのスキーマより先に topic-core の
        // スキーマで見分ける（見分けるのはアプリ層・spec §5.5）。
        const topic = parseBoundaryMessage(TopicFrameSchema, raw);
        if (topic.isOk()) {
          setTopicTitle(topic.value.state.topic?.title ?? null);
          return;
        }
```

- **`room.created` / `room.joined` で `topicTitle` を空に戻す処理は置かない。** 玄関は 1 ページで 1 つのルームしか映さず（別のルームへは全ページ読み込みで移る。#290 の退出も `?left=` 付きの読み込み）、サーバーは作成・参加の直後にそのルームのお題を必ず送る（`hub-handlers.ts` の `sendCurrent`）。置いても守るのは一瞬の窓だけで、外してもテストは緑のまま（検出力の検証で実測）
- 戻り値に `topicTitle,`

`apps/landing/src/App.tsx` の `<RoomChoice …>` に `topicTitle={hub.topicTitle}` を足す。

`apps/landing/vite.config.ts` の `proxy` に:

```ts
      '/topic': { target: 'http://127.0.0.1:5176', changeOrigin: true, ws: true },
```

`apps/landing/src/index.css`:

- 札 3 枚の配る演出と傾き（2 枚前提の `:first-child` / `:last-child` だけでは、真ん中の札が傾かず・遅れずに先に出る）。`.hand li:last-child` の規則の後ろに:

```css
/* 3 枚目（#91）。真ん中の札は傾けず、配る順は左 → 真ん中 → 右にする。 */
.hand li:nth-child(2) {
  animation-delay: 0.12s;
}
```

  （`:last-child` の遅延 0.18s は 3 枚目にそのまま効く。2 枚目は傾けない —— 扇の中心になる。）

- いまのお題の行（`.hub-tools .hand li` の規則の後ろ）:

```css
/* いまのお題（#91・spec §5.5）。札の下に 1 行だけ。長いタイトルは折り返さず省略する
   （本文は出さない。全文はお題ツールで読む）。 */
.hub-topic {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
  margin: var(--space-4) 0 0;
  justify-content: center;
}
.hub-topic-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- **札 3 枚が 1280px で 1 行に収まるかは Task 9 の E2E（`landing-design.spec.ts` の `checkCardText`）が測る。** 落ちたら、中幅で縦に積む・札の幅を詰めるのどちらかで直す（文言は変えない）

- 札 3 枚の組み方（`apps/landing/src/index.css`）。**いまの選択画面は札の列と部屋の列が 3fr : 2fr の 2 列で、札 3 枚だと 1 枚の文字の入る幅が約 147px（1280px）になり、一行説明「お題を用意して全員に見せる」（約 171px）が折り返す**（CSS からの概算・設計と過去の失敗の検証が独立に同じ数を出した）。**札の列を全幅にし、部屋の 2 つのパネルをその下に並べる**:

```css
/* 札が 3 枚になった（#91）。札の列を全幅に取り、参加者と招待のパネルはその下に並べる。
   3fr : 2fr の 2 列のままだと、1280px で札 1 枚の文字の入る幅が約 147px になり、
   一行説明が折り返す（#270 と同じ型）。札は実物大（15rem）より大きくしない。 */
.hub-workspace {
  grid-template-columns: minmax(0, 1fr);
}
.hub-tools .hand li {
  max-width: 15rem;
}
.hub-room {
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
}
```

  （既存の `.hub-workspace` の 2 列の宣言をこれに置き換える。`@media (max-width: 720px)` の中の縦積みはそのまま残す。**札の傾き・配る演出の注釈の「2 枚」を「3 枚」に直す**。）
  **768px で一行説明が折り返すかは概算では決まらない**（札 1 枚の文字の入る幅が約 165〜180px で、説明の約 160〜171px と近い）。Task 9 で `landing-design.spec.ts` に 768・1024 を足して測る。折り返したら、`@media (max-width: 720px)` の縦積みの境目を**折り返さなかった幅まで**上げる（文言は変えない）

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm install
pnpm --filter @tasuki/landing test
pnpm --filter @tasuki/landing typecheck
pnpm --filter @tasuki/landing lint
pnpm --filter @tasuki/landing build
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node --test packages/ui/tests/typography-scale.test.mjs
```

Expected: すべて成功

- [ ] **Step 5: コミットする**

```bash
git add apps/landing scripts/audit-dependency-direction.mjs pnpm-lock.yaml
git commit -m "feat: 玄関に 3 枚目の札といまのお題の 1 行を足す（#91 PR 2）"
```

---

### Task 7: dev で玄関から届くことを確かめる

**Files:**
- Modify: `docs/guides/development.md` / `README.md` / `docs/guides/architecture.md` / `packages/ui/README.md` ほか、Step 3.5 の一覧

- [ ] **Step 1: 自分がポートを掴んでいないことを確かめる**（`free-dev-ports-when-done`・`headroom-proxy-owns-8787`）

```bash
ss -ltnp | grep -E ':(5173|5174|5175|5176|8787)\b' || echo "空いている"
```

Expected: 8787 以外は空いている。**8787 を headroom のプロキシが持っていたら kill しない**（会話の API 経路）。そのときは同期サーバーを `PORT=18787` で起動し、手で試すのは画面の配信だけにする（WS の往復は Task 9 の E2E が見る）

- [ ] **Step 2: 起動して、玄関の中継で届くことを見る**

```bash
pnpm dev   # 別端末（run_in_background）で
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:5175/topic/
curl -s http://localhost:5175/topic/ | grep -o '<title>[^<]*</title>'
```

Expected: `200 text/html` と `<title>Tasuki お題</title>`（**玄関の `index.html` ではないこと**。中継が無いと玄関の SPA フォールバックが 200 で自分を返し、エラーにならずに静かに壊れる）

- [ ] **Step 3: 文書の dev の表を直す**

`docs/guides/development.md` の URL の表に `<http://localhost:5175/topic/>` の行（「お題ツール（札をクリックしても移動する）」）、プロセスの表に `pnpm --filter @tasuki/topic-web dev` / `<http://localhost:5176/topic/>` の行を足し、「:5173 / :5174 を直接開かない」の注意に `:5176` を足す。`README.md` の「`pnpm dev` は 4 つのプロセス」を 5 つに、「:5173 / :5174」の注意に `:5176` を足す。**数え上げを書き換えたら、同じ文書の中に同じ数を名指しする文が残っていないかを grep する**:

```bash
grep -n "4 つのプロセス\|5173 / :5174\|3 系統" README.md docs/guides/development.md
```

- [ ] **Step 3.5: topic-web を足したことで嘘になる文を直す**（過去の失敗との照合で洗い出した。**この PR で事実が変わるものだけ**を直す。配布で変わるもの（公開中のツールの一覧・Caddy の断片の顔ぶれの本番の記述）は PR 3 へ申し送る —— Task 12）

| 何が嘘になるか | 場所 |
|---|---|
| 「3 アプリが `@tasuki/ui` を使う」 | `packages/ui/README.md`（利用側の表に topic-web の行を足す）・`packages/ui/src/index.css`・`packages/ui/src/tokens/index.css`・`packages/ui/src/elements/index.css`・`packages/ui/tests/tokens.test.mjs` の注釈・`docs/adr/0001-design-system-scope.md`（**ADR は本文を書き換えず末尾へ追記**） |
| 「dev サーバーは 3 つ／:5173 / :5174 を直接開かない」 | `packages/dev-hub-redirect/README.md`・`packages/dev-hub-redirect/src/index.ts` の注釈・`apps/landing/vite.config.ts`（札の中継の注釈）・`apps/poker-web/vite.config.ts` の注釈・`apps/landing/tests/dev-hub-redirect-wiring.test.ts` の冒頭・`docs/guides/security.md` |
| 「端末の同一性は 3 つの画面で 1 つ」 | `packages/sync-client/src/index.ts`・`resume-identity.ts`・`invite-url.ts`・`apps/poker-web/src/hooks/useSync.ts`・`apps/timer-web/test/sync/resume-identity.test.ts`・`apps/timer-web/test/ui/room-url.test.ts` の注釈 |
| 用語「お題」が「timer では実装済み、poker では未実装」／ドメインの一覧に topic-core が無い | `docs/guides/architecture.md`（用語集の行と、文脈の一覧）。**お題は PR 1 で 4 つ目の文脈になっている** |
| e2e の「3 つの web アプリ」 | `e2e/harness/paths.ts` の冒頭・`e2e/README.md`（**`e2e/tests/workspace.test.ts` は Task 8 で直す**） |

**一覧を信じ切らない。** 直した後に、同じ言い回しが他に残っていないかを数える:

```bash
grep -rnE "3 つの web|3 アプリ|3 つの画面|timer / poker / (LP|landing|玄関)|:5173 / :5174" \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md' --include='*.css' \
  apps packages scripts e2e docs/guides docs/adr README.md AGENTS.md \
  | grep -v node_modules | grep -v '/dist/'
```

残ったものは 1 行ずつ読み、**この PR で嘘になるなら直し、配布で嘘になるなら Task 12 の申し送りへ書き、記録（振り返り・過去の計画・ADR の過去の節）なら触らない**。

- [ ] **Step 4: dev を止め、ポートを放す**

```bash
ss -ltnp | grep -E ':(5173|5174|5175|5176)\b' || echo "空いている"
```

Expected: `空いている`

- [ ] **Step 5: コミットする**

```bash
git add -A
git status --short   # 直したファイルだけが並ぶこと（別の作業が混ざっていないこと）
git commit -m "docs: お題ツールを足したことに文書と注釈を追随させる（#91 PR 2）"
```

---

### Task 8: 配備資材と E2E のハーネス

**Files:**
- Create: `deploy/topic/app.env` / `deploy/topic/caddy/40-topic.conf` / `deploy/topic/NOTES.md` / `apps/landing/tests/tool-public-paths.test.ts`
- Modify: `e2e/package.json` / `e2e/harness/paths.ts` / `scripts/audit-dependency-direction.mjs`（`e2e` の欄）/ `deploy/README.md` / `deploy/caddy/README.md` / `README.md`（ステータスの表）

- [ ] **Step 1: 断片の名前と評価順を確かめる**（spec §5.6）

Caddy はファイル名ではなくマッチャの具体性で並べる（`caddy-fragment-evaluation-order`）。`/topic/*` は既存の `/poker/*`・`/timer/*`・`/ws` のどれとも接頭辞が重ならず、包括フォールバック（`90-landing.conf` の `handle`）より具体的なので先に評価される。**番号 40 は人が読むための規約**（timer の 30 の後）。

- [ ] **Step 1.5: 公開パスを揃えるテストを先に置く（Red）**

公開パスの 4 か所を揃えるテスト。`apps/landing/tests/tool-public-paths.test.ts`（timer の `apps/timer-web/test/ui/room-url.test.ts` が #76 F-1 の再発防止に持つ 3 点比較と同じ考え方。**4 か所のうち 1 つでも取り残すと白画面か 404 になる**のに、揃っていることを機械で見る場所が無かった）:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/tools.js';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** ツール ID → アプリと配備資材のディレクトリ（名前の形で導出しない。載っていない ID は下のテストで落ちる）。 */
const LOCATIONS: Record<string, { app: string; deploy: string }> = {
  timer: { app: 'timer-web', deploy: 'timer' },
  poker: { app: 'poker-web', deploy: 'poker' },
  topic: { app: 'topic-web', deploy: 'topic' },
};

const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * @requirements #91 spec §5.6（公開パスは 4 か所を揃える）
 */
describe.each(TOOLS.map((tool) => [tool.id, tool.href] as const))('%s の公開パス', (id, href) => {
  const where = LOCATIONS[id];

  it('Given tools.ts の札 / When 置き場を引く / Then アプリと配備資材の対応がある', () => {
    expect(where).toBeDefined();
  });

  it('Given 札の href / When vite の base・app.env・Caddy 断片を読む / Then どれも同じ公開パスを指す', () => {
    // Given
    const { app, deploy } = where!;
    // When
    // 引用符は一重・二重の両方を拾う（timer は `base: "/timer/"`、poker と topic は一重）
    const base = /base:\s*['"]([^'"]+)['"]/.exec(read(`apps/${app}/vite.config.ts`))?.[1];
    const publicPath = /^PUBLIC_PATH=(.+)$/m.exec(read(`deploy/${deploy}/app.env`))?.[1];
    const caddyDir = path.join(REPO_ROOT, 'deploy', deploy, 'caddy');
    const fragments = readdirSync(caddyDir).map((name) => readFileSync(path.join(caddyDir, name), 'utf8')).join('\n');
    // Then
    expect(base).toBe(href);
    expect(publicPath).toBe(href);
    expect(fragments).toContain(`handle_path ${href}*`);
  });
});
```

  （`readdirSync` も `node:fs` から import する。試走で、timer の断片は `handle_path /timer/*` で合い、topic の断片か `base` をずらすとそれぞれ赤になることを確かめてある。先にこのテストを置いて topic の行が赤になること（`deploy/topic` が無い）を見てから、資材を置く）

```bash
pnpm --filter @tasuki/landing test
```

Expected: FAIL（topic の行だけ。timer と poker の行は緑）

- [ ] **Step 2: 資材を置く**

`deploy/topic/app.env`:

```sh
# お題ツールのデプロイ定義（#91・この値の定義場所はここだけ）
#
# **静的サイト。** 同期は統合サーバー `tasuki-sync`（8787）が `?tool=topic` で受ける
# （`apps/tasuki-sync/src/adapters/ws-adapter.ts`）。WebSocket の入口は `/ws` の 1 本で、
# 中継は `../landing/caddy/05-hub-ws.conf` が持つ。お題専用のユニット・ポート・env は無い。
#
# ⚠ **STATIC_ONLY のときに SERVICE / PORT / APP_DIR / SYNC_ENTRY / ENV_FILE を
# 書いてはならない。** `deploy/lib/common.sh` が起動を止める（fail-closed で正しい挙動）。

APP_NAME=topic
STATIC_ONLY=1

WEB_ROOT=/var/www/tasuki-topic

BUILD_FILTER=@tasuki/topic-web
WEB_DIST=apps/topic-web/dist

# 公開パス。vite.config.ts の base・apps/landing/src/tools.ts・Caddy 断片（40-topic.conf）と揃っていること。
PUBLIC_PATH=/topic/
```

`deploy/topic/caddy/40-topic.conf`:

```caddy
# お題ツールの配信断片（#91）
# 設置先: /etc/caddy/tasuki/apps/40-topic.conf
#
# この断片を置いた瞬間に /topic/ が公開される。**置き忘れると /topic/ は包括フォールバック
# （玄関）に吸われ、札を押しても玄関が再描画されるだけになる**（本番の /poker 事故と同じ型。
# ../../caddy/README.md）。
#
# 番号は人が読むための規約。Caddy はマッチャの具体性で並べ替えるので、/topic/* は
# 包括フォールバックより必ず先に評価される。
#
# WebSocket の handle は置かない。入口は `/ws`（`../landing/caddy/05-hub-ws.conf`）の 1 本で、
# お題ツールはクエリ（`?tool=topic`）で宣言する。
#
# ⚠ **40 番は、#95 S5a で撤去した旧 `40-timer-legacy-room.conf` と同じ番号である。** 別物。
# ホストに旧断片が残っていたら `../../caddy/README.md` の手順で消してから、これを置く。

# 静的配信（SPA フォールバック付き・base=/topic/ でビルドしたもの）
handle_path /topic/* {
	root * /var/www/tasuki-topic
	try_files {path} /index.html
	file_server
}

# /topic（末尾スラッシュなし）を /topic/ へ
redir /topic /topic/ permanent
```

`deploy/topic/NOTES.md`（中に ```` ```bash ```` を含むので、外側を 4 つの ` で囲んで写す）:

````markdown
# topic（お題ツール）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## まだ公開していない

**#91 の PR 3 が main に入った後、1 回だけ配る**（設計正本 `docs/superpowers/specs/2026-09-23-shared-topic-design.md` §6）。
PR 2 と PR 3 の間の main は、玄関でお題を出せるのに timer に出ない中間状態なので、**配らない**。
順序（topic → poker → landing → timer）と配布中の窓は §6 にあり、PR 3 でこの文書へ書き足す。

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh topic` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-topic`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-topic
# 断片の設置と検証・再読込は ../caddy/README.md の手順に従う
```

## base パスに注意

公開パス `/topic/` は **`apps/landing/src/tools.ts`・`apps/topic-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/40-topic.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
````

`e2e/package.json` の `dependencies` に `"@tasuki/topic-web": "workspace:*"`（ビルドを turbo の `^build` に伝える宣言。`e2e/harness/build.ts` はここを名簿として読む）。`scripts/audit-dependency-direction.mjs` の `e2e` の欄に `"@tasuki/topic-web"` を足す。

`e2e/harness/paths.ts`:

```ts
export const WEB_ROOTS: readonly WebRoot[] = [
  { link: '/var/www/tasuki', dist: path.join(REPO_ROOT, 'apps/timer-web/dist') },
  { link: '/var/www/tasuki-poker', dist: path.join(REPO_ROOT, 'apps/poker-web/dist') },
  { link: '/var/www/tasuki-home', dist: path.join(REPO_ROOT, 'apps/landing/dist') },
  // #91 PR 2
  { link: '/var/www/tasuki-topic', dist: path.join(REPO_ROOT, 'apps/topic-web/dist') },
];

/** 経路の本体。**内容を 1 バイトも書き換えずに**設置する。 */
export const FRAGMENT_SOURCES: readonly string[] = [
  // （既存の注釈はそのまま）
  'deploy/landing/caddy/05-hub-ws.conf',
  'deploy/poker/caddy/20-poker.conf',
  'deploy/timer/caddy/30-timer-spa.conf',
  // #91 PR 2
  'deploy/topic/caddy/40-topic.conf',
  'deploy/landing/caddy/90-landing.conf',
].map((rel) => path.join(REPO_ROOT, rel));
```

文書:

- `deploy/README.md` のアプリの表に `topic` の行（サービス無し・静的・`/var/www/tasuki-topic`・`/topic/`・**未公開（#91 の PR 3 の後に配布）**）。「3 系統（timer / poker / landing）はいずれも公開中である」は事実のままなので書き換えず、topic が未公開であることを表の行で示す
- `deploy/caddy/README.md`: **「設置」の節は、まっさらなホストへの初回設置にも使う一般の手順である**（S5c の移行の書き方を含むが、それだけではない）。断片の木・`scp` / `install` の列挙・確認の繰り返し（`for p in / /timer/ /poker/`）の 3 か所に `40-topic.conf` と `/topic/` を足す。足さないと、手順どおりに作業した人の `/topic/` は包括フォールバックに吸われる（README 自身が警告する「本番の /poker 事故」と同じ型）。**topic は PR 3 の後まで配らない**ことを、足した行の近くに 1 行で書く
- `deploy/caddy/tasuki.conf` の「断片の顔ぶれ」の注釈に `40-topic.conf` を足す
- `README.md` のステータスの表に `| Topic Board | `/topic/` | 未公開（#91 の配布で公開） |`、「収録ツール」に「### 4. お題（Topic Board）」の節（構成: `packages/topic-core`・`apps/topic-web`・`apps/tasuki-sync`（共用）。**状態は「未公開」と書き、完了形を書かない**）

`e2e/tests/fragment-sources.test.ts`: 断片の本数を `toHaveLength(4)` で固定している 2 件を 5 本に直し、テスト名も合わせる（**計画の段では見落としていた赤**・試走で実測）。

`e2e/tests/workspace.test.ts`: 「3 つの web アプリ」を名指しする期待に `@tasuki/topic-web` を足し、名前を「4 つ」に直す（**いまのままだと `e2e/package.json` から topic-web を落としても緑**）。

- [ ] **Step 3: 自己テストと断片の検査を回す**

```bash
pnpm install
pnpm --filter @tasuki/landing test        # caddy-fragment-order / caddy-fragment-port
pnpm --filter @tasuki/e2e test            # fragment-sources / workspace / build 等の自己テスト
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/check-links.mjs; echo "exit=$?"
bash deploy/deploy.sh 2>&1 | grep -o '利用可能なアプリ: .*'   # topic が並ぶこと（引数なしは使い方を出して止まる）
```

Expected: すべて成功。`grep` は `利用可能なアプリ: landing poker timer topic` を出す（**0 行なら観測が壊れている**）。`fragment-sources` は本数と集合の一致を、`build.test.ts` は `WEB_ROOTS` の過不足を見ている（試走で、それぞれ消すと赤になることを確かめてある）

- [ ] **Step 4: コミットする**

```bash
git add deploy e2e/package.json e2e/harness/paths.ts e2e/tests scripts/audit-dependency-direction.mjs apps/landing/tests README.md pnpm-lock.yaml
git commit -m "chore: お題ツールの配備資材と E2E の配信元を足す（#91 PR 2）"
```

---

### Task 9: E2E（玄関への配信・a11y・書体）

**Files:**
- Create: `e2e/support/a11y.ts`（`timer-a11y.spec.ts` から移す）/ `e2e/support/topic.ts` / `e2e/specs/topic.spec.ts`
- Modify: `e2e/specs/timer-a11y.spec.ts`（移した関数を import に替える）/ `e2e/specs/landing-design.spec.ts`（札の枚数の固定・幅 768 と 1024）

**Interfaces:**
- Produces（`e2e/support/a11y.ts`）: `interface ContrastScan` / `pairKey(ink, ground)` / `resolveColors(page, tokens)` / `scanContrast(page, minTargets = 20)` / `expectReadable(scan, minMeasured, thinnest)` / `expectFocusVisibleOnTab(page, presses = 6)`
- Produces（`e2e/support/topic.ts`）: `openTopicTool(page, name): Promise<string>`（参加用 URL を返す）/ `setTopic(page, title, body)` / `currentTopic(page): Locator`

- [ ] **Step 1: a11y の測り方を支援へ移す（振る舞いを変えない移動）**

`e2e/specs/timer-a11y.spec.ts` の `ContrastScan` / `pairKey` / `resolveColors` / `scanContrast` / `expectReadable` を**そのまま** `e2e/support/a11y.ts` へ移し、`export` を付ける。変えるのは 1 点だけ: `scanContrast` の第 2 引数 `minTargets = 20` を足し、`expect(elements.length, '測る対象が見つからない').toBeGreaterThan(minTargets);` にする（お題ツールの画面は timer より要素が少ない）。「キーボードのフォーカスが必ず見える」のテスト本体のループ（`seen` を集めて判定する部分）も `expectFocusVisibleOnTab(page: Page, presses = 6)` として移し、timer-a11y のテストはそれを呼ぶだけにする。**注釈（#297 の実測・「当てた時と当てていない時」）も一緒に移す**（消さない）。

移した後、timer-a11y だけを流して**移す前と同じ件数が緑**であることを見る:

```bash
pnpm --filter @tasuki/e2e e2e specs/timer-a11y.spec.ts
```

Expected: 移す前と同じ件数が passed（移す前に 1 度流して件数を控えておく）

- [ ] **Step 2: 支援を書く**

`e2e/support/topic.ts`:

```ts
/**
 * お題ツールの共通手順と選択子（#91 PR 2）。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（poker・timer の支援と同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** 玄関でルームを作ってお題ツールを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openTopicTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Topic Board').click();
  await expect(page.getByRole('heading', { level: 1, name: 'お題', exact: true })).toBeVisible();
  return inviteUrl;
}

/** いまのお題の領域。 */
export function currentTopic(page: Page): Locator {
  return page.getByRole('region', { name: 'いまのお題' });
}

/** 手で書いてお題にし、**自分の画面に出るまで待つ**。 */
export async function setTopic(page: Page, title: string, body: string): Promise<void> {
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('説明（なくてもよい）').fill(body);
  await page.getByRole('button', { name: 'このお題にする' }).click();
  await expect(currentTopic(page).getByRole('heading', { name: title })).toBeVisible();
}
```

- [ ] **Step 3: シナリオを書く**

`e2e/specs/topic.spec.ts`:

```ts
/**
 * お題ツール（#91 PR 2）。
 *
 * **タグを付けない（`local` 専用）。** 本番にはまだ `/topic/` が無い（配布は #91 の PR 3 の後に 1 回）。
 * `@core` を付けると `pnpm e2e:prod` が現行の本番に対して落ちる。付けるかどうかは配布の段で決める。
 *
 * お題の文面は**書体の常用の層に収まるもの**を使う（`3 のときは Fizz を出す`。`倍`・`返` は外れる）。
 * 利用者の内容で拡張の層を引くのは正しい振る舞いだが、書体の検査が UI の劣化と区別できなくなる。
 */
import { expect, test } from '../fixtures/test';
import { expectFocusVisibleOnTab, expectReadable, scanContrast } from '../support/a11y';
import { currentTopic, openTopicTool, setTopic } from '../support/topic';

const TITLE = 'FizzBuzz';
const BODY = '3 のときは Fizz を出す';

test.describe('お題を玄関へ配る', () => {
  test('Given 2 人が同じルームに居る / When 片方がお題ツールでお題にする / Then もう片方の玄関にタイトルが出て、下ろすと消える', async ({
    page,
    openPeer,
    consoleWatcher,
  }) => {
    // Given: 2 人目は玄関の選択画面に居る（別の文脈で開く。同じ文脈だと 1 人目として復帰する）
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const guest = await openPeer('topic-guest');
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('e2e-topic-b');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    const tools = guest.page.getByRole('region', { name: '道具を選ぶ' });
    await expect(tools.getByRole('list', { name: 'ツール' })).toBeVisible();

    // When
    await setTopic(page, TITLE, BODY);

    // Then その1: タイトルだけが出る（説明は出さない）
    await expect(tools.getByText(TITLE, { exact: true })).toBeVisible();
    await expect(guest.page.getByText(BODY)).toHaveCount(0);
    //   新しい 1 行も読めること（玄関の走査は札の文字を含む）
    expectReadable(await scanContrast(guest.page, 5), 5, []);

    // Then その2: 下ろすと消える（**出ていたことを上で確かめてから**消えたことを見る。
    //   領域ごと消えても否定は通るので、領域と札が見えていることも合わせて見る）
    await page.getByRole('button', { name: 'お題を下ろす' }).click();
    await expect(tools.getByText(TITLE, { exact: true })).toHaveCount(0);
    await expect(tools.getByRole('list', { name: 'ツール' })).toBeVisible();

    // Then その3: 後から開いた玄関にも、いまのお題が届く（参加・復帰の直後に 1 通）
    await setTopic(page, TITLE, BODY);
    await guest.page.reload();
    await expect(guest.page.getByRole('region', { name: '道具を選ぶ' }).getByText(TITLE, { exact: true })).toBeVisible();

    // どちらの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(guest.console.errors).toEqual([]);
  });

  test('Given お題ツールに居る人 / When 玄関の参加者を見る / Then 札の名前で居場所が出る', async ({ page, openPeer }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const guest = await openPeer('topic-guest');
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('e2e-topic-b');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    // Then: 生の ID（「topic にいます」）で出ない
    await expect(guest.page.getByRole('list', { name: '参加者' })).toContainText('Topic Board にいます');
  });
});

test.describe('お題ツールの入口', () => {
  test('Given 名乗っていない人 / When お題ツールの URL を直接開く / Then 玄関のそのルームで名乗りを求められる', async ({
    page,
    openPeer,
  }) => {
    // Given: ルームは在る（1 人目が作る）
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const code = new URL(inviteUrl).searchParams.get('room')!;
    const stranger = await openPeer('topic-stranger');
    // When: 復帰の組を持たない別の文脈で、お題ツールを直接開く
    await stranger.page.goto(`/topic/?room=${encodeURIComponent(code)}`);
    // Then: 玄関のそのルームへ送り返され、コードを失っていない
    await expect(stranger.page.getByRole('button', { name: '参加する' })).toBeVisible();
    expect(new URL(stranger.page.url()).pathname).toBe('/');
    expect(new URL(stranger.page.url()).searchParams.get('room')).toBe(code);
  });
});

test.describe('お題ツールの文字と書体', () => {
  test('Given お題を出した画面 / When 文字を測る / Then すべて AA を満たし、常用の層の書体だけを読める', async ({ page }) => {
    // Given（何を取得したかを記録する）
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.woff2')) fonts.push(request.url().split('/').pop() ?? request.url());
    });
    await openTopicTool(page, 'a11y-topic');
    await setTopic(page, TITLE, BODY);
    await expect(currentTopic(page)).toContainText(BODY);

    // When / Then その1: 文字が読める（象牙の札の上の字も含む）
    expectReadable(await scanContrast(page, 10), 8, []);

    // Then その2: 何かは取っていて、拡張の層を引いていない
    expect(fonts.length, `書体を 1 つも取っていない（${fonts.join(', ')}）`).toBeGreaterThan(0);
    const ext = fonts.filter((f) => f.includes('-ext-') || f.includes('-ext.'));
    expect(ext, `常用の層に無い字が画面に出ている（${ext.join(', ')}）`).toEqual([]);

    // Then その3: 取りにいった書体が、書体として読めている（#297：URL を数えるだけでは全滅を緑と判定した）
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((face) => face.status !== 'unloaded')
        .map((face) => `${face.family} ${face.weight} ${face.status}`);
    });
    expect(faces.filter((f) => f.endsWith(' error')), `読めなかった書体（${faces.join(', ')}）`).toEqual([]);
    expect(faces.filter((f) => f.endsWith(' loaded')).length, `読めた書体が無い（${faces.join(', ')}）`).toBeGreaterThan(0);
  });

  test('Given お題ツール / When Tab で送る / Then 当たった操作要素に輪郭が出る', async ({ page }) => {
    await openTopicTool(page, 'focus-topic');
    await expectFocusVisibleOnTab(page);
  });
});
```

**動きを抑える設定（reduced-motion）の走査は置かない。** お題ツールは演出を持たないので、「演出が止まる」を見ると 0 件で恒真になる（timer-a11y は「animation を持つ要素が 1 つ以上ある」を先に固定して避けている）。演出を足すときに、その固定と一緒に足す。

- [ ] **Step 3.5: 玄関の見た目の検査を札 3 枚に合わせる**（`e2e/specs/landing-design.spec.ts`）

`checkCardText` は札が 0 枚のとき何もせずに戻り、枚数を見ていない —— 3 枚目が出なくても緑になる。**枚数を固定する**（札を出していない画面（作成・参加）では呼び出し側が 0 を渡す）:

```ts
async function checkCardText(page: Page, expectedCards: number): Promise<void> {
  const cards = page.locator('.tool-card');
  // 札の枚数を固定する（3 枚目が出なくても、0 枚でも黙って通るのを防ぐ）
  await expect(cards).toHaveCount(expectedCards);
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
```

`checkText(page)` の呼び出しを `checkText(page, 0)`（作成・参加の画面）と `checkText(page, 3)`（選択画面）に分け、`checkText` は受け取った枚数を `checkCardText` へ渡す。幅の繰り返しを `for (const width of [1280, 1024, 768, 320])` にする（**721〜1100px は札 3 枚で最も狭くなる帯**で、いままで 1 度も測っていなかった）。

- [ ] **Step 4: 流す**（ハーネスが dist をビルドし、Caddy に断片を置いて配信する。sudo を使う）

```bash
pnpm --filter @tasuki/e2e e2e specs/topic.spec.ts specs/landing-design.spec.ts specs/timer-a11y.spec.ts
```

Expected: すべて passed。落ちたら:
- `landing-design` の `checkCardText` が 2 行と言う → **768px なら** Task 6 の縦積みの境目を折り返さなかった幅まで上げる。**1024・1280px なら** Task 6 の組み方の前提（札の列が全幅）が効いていない（`.hub-workspace` の宣言が上書きされていないかを見る）。**文言は変えない**
- `topic.spec` のコントラストで AA 割れ → `index.css` のトークンの組を替える（**新しい色・α を足さない**）
- `scanContrast` の件数が足りない → `minTargets` を下げる前に、画面が本当に出ているか（`page.screenshot`）を見る

- [ ] **Step 5: E2E を全部流す**（ほかのシナリオが札 3 枚で壊れていないか）

```bash
pnpm e2e
```

Expected: すべて passed。**`| tail` を付けない**

- [ ] **Step 6: コミットする**

```bash
git add e2e
git commit -m "test: お題ツールの E2E（玄関への配信・a11y・書体）を足す（#91 PR 2）"
```

---

### Task 10: 変異検査（原則 VII）

**Files:**
- Create: `scripts/mutations/m87-*.patch` 〜 `m93-*.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾に 7 件）

**変異 ID は既存の最大値の次から採る。** 並びに頼らず確かめてから採番する（PR 1 の終了時点で最大は 86。**MUTATIONS は ID 順に並んでいない**）:

```bash
grep -o -E '^\s+id: [0-9]+' scripts/mutation-check.mjs | grep -o -E '[0-9]+' | sort -n | tail -1
```

| ID | 変異 | pkg | 赤になるべきテスト |
|---|---|---|---|
| 87 | 玄関の `whereLabel` が ID ではなく並び順で名前を引く（`TOOLS[['timer', 'poker'].indexOf(id)]?.name ?? id`） | `apps/landing` | `tests/room-choice-layout.test.tsx`「お題ツールと timer に居る人…札の名前で出る」 |
| 88 | 玄関の `use-hub-sync.ts` が `topic` フレームを検めずに捨てる（`TopicFrameSchema` の分岐を消す） | `apps/landing` | `tests/hub/use-hub-sync.test.tsx`「お題の状態が届く…タイトルが出る」 |
| 89 | お題ツールの `canOperate` が参加を見ない（`return status === 'open';`） | `apps/topic-web` | `tests/topic-room.test.tsx`「解錠済みで下書きと合言葉がある / When 切れて繋ぎ直し、参加の返事を待つ…」・`tests/topic-view.test.ts` |
| 90 | お題ツールの下書きが届いたお題で上書きされる（`TopicEditor` に `useEffect(() => { if (current) { setTitle(current.title); setBody(current.body); } }, [current]);` を足す） | `apps/topic-web` | `tests/topic-room.test.tsx`「下書きの途中で別の人のお題が届く…下書きは残る」 |
| 91 | topic-core の `GENERATION_COOLDOWN` の文を「少し待ってから、もう一度作ってください。」へ戻す | `apps/topic-web` | `tests/copy-fits-font-base.test.ts` |
| 92 | 同期フックの `onClose` から `cancelRetry()` を外す | `apps/topic-web` | `tests/use-topic-sync.test.tsx`「混雑の待ちの途中で切れた…入り直しは 1 通だけ」 |
| 93 | `planForError` が抜けた知らせを `left` にせず、`show` へ落とす（`LEFT_ROOM` / `REMOVED_*` の 2 行を消す） | `apps/topic-web` | `tests/use-topic-sync.test.tsx`「別のタブで抜けた知らせが届く…玄関へ戻る」・`tests/join-error-plan.test.ts` |

- m89 は判断の関数を壊す。**切断中だけを見る画面のテストは、この変異で緑のまま残った**（切断で `joined` が下りるので、参加の判定が壊れていても隠れる・検出力の検証で実測）。対応表には「繋ぎ直して参加の返事を待つ窓」を見る画面のテストを先に載せる
- m91 はパッチが `packages/topic-core` を変え、テストは `apps/topic-web` で流す（topic-web は topic-core を `src` のまま読むのでビルドは要らない）。**`packages/topic-core/tests/error-messages.test.ts` も赤になるが、対応表に載せるのは書体の検査**（こちらが「base 層に収める」を守っている本体）

- [ ] **Step 1: 作業ツリーが空であることを確かめる**

```bash
git status --porcelain
```

Expected: 何も出ない。**出たら先にコミットする**（変異パッチを作る手順は `git checkout --` で未コミットの変更を消しうる。過去 4 度実装を消している）

- [ ] **Step 2: 1 件ずつ、壊して・パッチを取り・戻す**（PR 1 の計画 Task 12 と同じ手順。パッチの冒頭に既存の m86 と同じ形の注釈（検出を期待するテスト・適用と復元のコマンド・何が起きるか）を書く）

```bash
# 例: m89
$EDITOR apps/topic-web/src/topic-view.ts
git diff > scripts/mutations/m89-topic-web-operate-ignores-join.patch
git checkout -- apps/topic-web/src/topic-view.ts
git status --porcelain   # パッチ以外が出ないこと
```

- [ ] **Step 3: `MUTATIONS` に登録する**（既存の項目と同じ形。`note` には spec の EARS 番号と「何が起きるか」を書く）

```js
  {
    id: 89,
    label: "お題ツールの操作可否が参加を見ない",
    patch: "m89-topic-web-operate-ignores-join.patch",
    pkg: "apps/topic-web",
    tests: ["tests/topic-room.test.tsx", "tests/topic-view.test.ts"],
    note:
      "#91 PR 2。入り直しの途中に押した操作は、送信キューから `room.join` より先に流れて " +
      "`NOT_IN_ROOM` で拒まれる。利用者から見ると、押したのに何も起きない。",
  },
```

- [ ] **Step 4: 登録をコミットする**（`mutation-check.mjs` は作業ツリーが空でないと走らない）

```bash
git add scripts/mutation-check.mjs scripts/mutations
git commit -m "test: お題ツールと玄関の守りに変異検査を足す（#91 PR 2）"
```

- [ ] **Step 5: 全変異を回す**

```bash
node scripts/mutation-check.mjs; echo "exit=$?"
```

Expected: `exit=0`。新しい 7 件がどれも「対照で緑・変異で赤」。**`| head` / `| tail` を付けない**（SIGPIPE で中断しても exit 0 に見える）

- 新しい変異が緑のまま残った → そのテストを、正しい実装と誤った実装で値が分かれる局面へ置き直す（テストを消さない・緩めない）
- **既存の変異のパッチが当たらない** → この PR で製品コードを触った箇所（`apps/landing/src/screens/RoomChoice.tsx`・`use-hub-sync.ts`・`HistoryLink.tsx`・`packages/topic-core/src/error-messages.ts`）に掛かる既存パッチ。同じ変異を今のコードに入れ直してパッチを作り直す。**当たらないパッチでスクリプトが止まると、それ以降の変異がすべて無検査になる**（#276 で 2 度）

直したらコミットして、もう一度 Step 5 を回す。

---

### Task 11: 全検査・実画面検証・記録

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§10 に実測を追記）

- [ ] **Step 0: 合否の無い指標の基準値を取る**（SC-029 などは「—」で出て、後退しても CI が緑）

```bash
git status --porcelain   # 空であることを先に見る
git worktree add /tmp/tasuki-main-pr2 main
(cd /tmp/tasuki-main-pr2 && pnpm install --frozen-lockfile >/dev/null && node scripts/audit-structure.mjs > /tmp/tasuki-main-pr2.structure.txt 2>&1; echo "exit=$?")
node scripts/audit-structure.mjs > /tmp/tasuki-pr2.structure.txt 2>&1; echo "exit=$?"
diff /tmp/tasuki-main-pr2.structure.txt /tmp/tasuki-pr2.structure.txt
git worktree remove /tmp/tasuki-main-pr2
```

Expected: 差分は**この PR が足したパッケージの行が増えたこと**だけ。とりわけ次の 2 つを数値で比べる:
- SC-029（テスト名の仕様番号）が main の値を超えていたら、この PR のテスト名に番号が残っている（直す）
- **SC-032（`// Given` / `// When` の区切りを持つテストの割合）が main の値を下回っていたら**、この PR の新しいテストが区切りを落としている（直す）。main は 2026-09-24 に `1796/1879（95.6%）`。**計画のテストをそのまま写した段階の測定では、新しい単体テストの 34 件中 10 件しか満たしていなかった**（過去の失敗の照合で実測。計画の改訂で主なテストには足したが、足りないものは写すときに足す）**worktree では依存を入れ直す必要がある**（`tasuki-dev-environment`）

- [ ] **Step 1: 全体を回す**

```bash
pnpm test
pnpm -r typecheck
pnpm -r lint
node scripts/audit-structure.mjs; echo "exit=$?"
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
node scripts/audit-assembly-wiring.mjs; echo "exit=$?"
node scripts/audit-domain-error-shape.mjs; echo "exit=$?"
node scripts/audit-domain-side-effects.mjs; echo "exit=$?"
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/audit-web-sync-boundary.mjs; echo "exit=$?"
node scripts/check-links.mjs; echo "exit=$?"
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'; echo "exit=$?"
pnpm audit; echo "exit=$?"
```

Expected: すべて成功。**`pnpm test` に scripts の自己テストと `pnpm audit` は入っていない**（`local-green-is-not-ci-green`）ので、上の全部を回す。`scripts/` に `audit-*.mjs` が上以外にもあれば、それも回す（`ls scripts/audit-*.mjs` で数える）

- [ ] **Step 2: 実画面で確かめる**（原則 V・spec §7.4。**アサーションを書く前に 1 回「探索」する**）

`pnpm dev` を起動し（Task 7 の Step 1 でポートを確かめてから）、Playwright MCP で 2 つのブラウザ文脈を使う。
**AI は無効のまま**（`CLAUDE_CODE_OAUTH_TOKEN` を渡さない）。この構成では、生成中（`aria-busy`）・定型への縮退の知らせ・クールダウンの文は**出せない**（計画「実測で spec から外したこと」）。それらは Task 5 の画面の単体テストが受け持つ:

1. 1 人目: <http://localhost:5175/> でルームを作り、札「Topic Board」でお題ツールへ
2. 2 人目: 参加用 URL で玄関に入り、選択画面に留まる
3. 1 人目: 書いてお題にする → 2 人目の玄関に 1 行が出る
4. 1 人目: 「書き直す」→ 書き換えてお題にする → 2 人目の行が追従する
5. 1 人目: 「定型から選ぶ」→ お題が変わり（説明の改行がそのまま見える）、2 人目の行も変わる。合言葉を送ると「合言葉が正しくありません。」が出る（AI が無効でも、機能の存在を隠すため同じ失敗が返る）
6. 1 人目: 「お題を下ろす」→ 2 人目の行が消える
7. 幅 320 / 768 / 1280 で玄関（札 3 枚）とお題ツールのスクリーンショットを撮る。**札の傾きと配る順**、**長いタイトル（200 字）で玄関の行が省略されること**、**定型のお題の説明の改行**を目で見る
8. 1 人目のタブを閉じて開き直す → 名乗りを求められずにお題ツールへ戻る
9. 1 人目: 別のタブで timer を開き、そこで「ルームを抜ける」→ **お題ツールのタブも**玄関の「ルームから抜けました。」へ移る
10. 同期サーバーを止める → お題ツールに再接続中の告知が出て、操作ボタンが押せなくなる。起動し直す → 告知が消え、押せるようになる

スクリーンショットは scratchpad へ置き、PR 本文に所見を書く（画像は貼らない）。**見つけた欠陥は同じ PR で直す**（Issue を増やさない）。直したらテストを足す。**dev を止め、ポートを放したことを確かめる**。

- [ ] **Step 3: spec §10 に実測を記録する**（`docs/superpowers/specs/2026-09-23-shared-topic-design.md` の §10 の末尾へ。**§ の途中へ挿入しない** —— 追記は末尾へ）

```markdown
- **UI の言葉と書体の base 層（2026-09-24・#91 PR 2 の計画を書く段で実測）**: `packages/ui/src/tokens/fonts.css` の
  `zkgn-{400,500,700}-base` の `unicode-range` に当てると、§5.4 の「掲げる」の「掲」と「本文」の 2 字が 3 つの太さすべてで外れた。
  画面では「このお題にする」「お題を下ろす」「説明（なくてもよい）」と言う（EARS の「掲げる／下ろす」は振る舞いの名前として残す）。
  PR 1 の topic-core の文言も 3 件外れていたので改めた（`GENERATION_COOLDOWN`「少」・`AI_UNLOCK_FAILED`「違」・`RATE_LIMITED`「多」）。
  以後は `apps/topic-web/tests/copy-fits-font-base.test.ts` が、topic-web の文言と topic-core の文言表を機械的に守る
```

同じ段で次も §10 に足す（どれも計画「実測で spec から外したこと」の記録。**§7.4 の本文は書き換えず、§10 で外したことを言う**）:
- Caddy 断片の評価順: `40-topic.conf`・`/topic/*` は既存の断片と接頭辞が重ならない
- お題ツールの招待はリンクのコピーだけで、QR は玄関に任せた
- お題ツールは演出を持たないので、a11y の走査のうち reduced-motion は置かない
- AI 無効の構成では生成中・縮退・クールダウンを実画面で出せない（`aiReady` と `TopicGenerator#request` の分岐）。画面の単体テストで見た
- 参加の返事が来ないまま待つ期限は置かない（timer は 10 秒・#292。poker にも無い）。受容

- [ ] **Step 4: コミットして push する**（**オーケストレーターが行う**。コミットしたらすぐ push する —— 保留した間にマージされて修正が落ちたことがある）

```bash
git add docs/superpowers/specs/2026-09-23-shared-topic-design.md
git commit -m "docs: お題ツールの文言と書体の実測を設計正本へ記録する（#91 PR 2）"
git push -u origin feature/issue-91-topic-web
```

---

### Task 12: 独立したレビューと PR

- [ ] **Step 1: PR を作る**（**オーケストレーターが行う**。本文は `.claude/rules/git-workflow.md` の形。**`Closes` を書かない・地の文にも「closes #91」と書かない**。`Refs #91`）

本文に書くこと:
- 概要（PR 2 / 3。**この PR の後の main は配らない**：玄関でお題を出せるが timer に出ない）
- 変更内容（Task ごと）と、検査の登録（Task 1 Step 7 で直したもの）
- 実測で spec から外したこと（UI の言葉と topic-core の文言 3 件。表をそのまま）
- 実画面検証の所見（Task 11 Step 2）
- PR 3 へ申し送ること（下の Step 3）

- [ ] **Step 2: 独立したレビューを回す**（`/code-review` に **PR 番号を明示する**。カレントブランチを見る仕様なので、番号を渡さないと別の差分を見る。**採点が走っている間は直さない**）。本物の指摘は同じ PR で直し、直したら Task 10 Step 5 と Task 11 Step 1 を回し直す

- [ ] **Step 3: PR 3 の計画へ申し送る事項を PR 本文に書く**（PR 1 の申し送りに足すもの）
  - `apps/timer-web` と `apps/poker-web` が `topic` フレームを読めるようにしてから、`TOPIC_RECIPIENT_TOOLS` に timer・poker を足す（spec §9 の 3）
  - timer・poker の表示部品の文言も base 層に収める（お題の**中身**は対象外）。`copy-fits-font-base` と同じ検査を足すかを決める
  - `packages/timer-core/src/error-messages.ts` の `AI_UNLOCK_FAILED` / `RATE_LIMITED` は、timer のお題の経路と一緒に消えるか確かめる（消えなければ、topic-core と同じ文へ揃えるか判断する）
  - `deploy/topic/NOTES.md` と `deploy/timer/NOTES.md` に配布中の窓 3 つを書く（spec §6）。E2E の `topic.spec.ts` に `@core` を付けるかを配布の段で決める
  - 玄関の在席表示が ID で引くようになったので、`HistoryLink.tsx` のような「並びや意匠で `TOOLS` を引く」箇所が他に無いかを grep する（この PR では `HistoryLink.tsx` だけだった）
  - **配布で嘘になる文書**（この PR では直さない。topic はまだ公開していないので、いまは正しい）: `docs/adr/0018` 決定 2 の URL の表に `/topic/?room=CODE`・`deploy/README.md` の「3 系統はいずれも公開中」と表の topic の状態・`deploy/deploy.sh` の使い方の注釈・`deploy/caddy/README.md` の本番の断片の記述・`e2e/specs/routing.spec.ts` の `PAGES`・`e2e/specs/landing.spec.ts` の札の一覧・`README.md` のステータスの表
  - `topic-core` の `AI_UNLOCK_FAILED` / `RATE_LIMITED` の文と timer-core の同じコードの文が別になった（利用者承認済み・2026-09-24）。timer のお題の経路を消したあと、timer-core にこのコードが残るなら揃え直す
