# お題を timer・poker に出し、timer のお題作成を畳む（#91 PR 3）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** お題の `topic` フレームを timer・poker の接続にも配り、両者が読んで表示するだけにする。timer のお題作成（編集・生成・解錠・自動用意・`problemEnabled`）と旧 wire を撤去する。完成記録はサーバーが写したお題のタイトルを持ち、端末はそれをそのまま保存する。

**Architecture:** 同期サーバーは `TOPIC_RECIPIENT_TOOLS` に timer・poker を足し、参加・復帰した timer・poker の接続にも 1 通送る。timer-web と poker-web は、ツール固有のスキーマより**先に** topic-core の `TopicFrameSchema` で `topic` フレームを見分ける。お題の本文の Markdown は、新しい純粋なパッケージ `@tasuki/markdown` が「ブロックと行内要素の木」へ解析し、描画は各アプリ（timer・poker・topic-web）が持つ。完成記録はアプリ層が `TopicStore` からタイトルを値として `session.complete` に渡して作り（お題の有無を問わない）、timer-web は snapshot の `sessionRecords` に新しく加わった 1 件をそのまま保存する。

**Tech Stack:** TypeScript / React 19 / Vite 8 / vitest 4 / bun test / valibot / Playwright

**Spec:** `docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§9 の PR 3。§5.2・§5.3 の撤去・§5.5・§6・§7・§8）。**計画と spec が食い違ったら spec が正本。** 実装者は両方を読むこと。例外は下の「spec から外したこと・決めたこと」に挙げたものだけで、Task 12 で spec §10 へ記録する。

**前の PR の計画:** `docs/superpowers/plans/2026-09-23-shared-topic-pr1-topic-context.md`（サーバー側の契約・変異 m76〜m86）／`docs/superpowers/plans/2026-09-24-shared-topic-pr2-topic-web.md`（お題ツール・変異 m87〜m95）。**PR #311 の本文の「PR 3 への申し送り」**を着手前に読むこと（`gh pr view 311`）。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 追加する振る舞いはすべて Red → Green で書く。撤去は「撤去で落ちるテストを消す／書き換える」を先に行い、全体を緑に戻してから次へ進む |
| II. 技術選定は ADR を通す | 通過 | 外部依存は足さない。新しい内部パッケージ `@tasuki/markdown` は依存 0 の純粋な関数で、置き場の判断を ADR 0021 に記録する（Task 12） |
| III. 揮発インメモリと単純運用 | 通過 | お題はサーバーのメモリにだけ置く。端末に残すのは timer の完成記録（IndexedDB・タイトルだけ）だけ |
| IV. 境界の型安全 | 通過 | timer-web・poker-web は `topic` フレームを `TopicFrameSchema` で検める。完成記録の wire は `topicTitle: v.nullable(v.string())` |
| V. 実画面検証 | 通過 | Task 11 の E2E（お題ツールで掲げ、玄関・timer・poker の別ページで追従）と Task 13 の実画面検証 |
| VI. 依存は内向き | 通過 | `timer-core`・`poker-core` は `topic-core` にも `@tasuki/markdown` にも依存しない（spec T1）。お題のタイトルはアプリ層が値として渡す（spec T9）。許可表を Task 1・3・4 で更新する |
| VII. 検査は壊して確かめる | 通過 | 新しいガードに変異を足し、撤去で意味を失った変異を消し、当たらなくなった変異を作り直す（Task 10） |
| VIII. 記録が正本 | 通過 | ADR 0021 新設、ADR 0011・0012・0017・timer ADR 0005・0008 の追記、spec §10 への記録（Task 12） |
| IX. 小さく回す | 通過 | #91 の 3 本目。**この PR のマージ後に 1 回だけ配る**（配布は利用者の明示の指示を待つ。この計画は配布を含まない） |
| X. 抽象は実需で | 通過 | 新しいポートは作らない。`@tasuki/markdown` は 3 つのアプリが同じ解析を使う実需から出す（写しが 3 つになる直前） |
| XI. 秘密と個人情報を持ち込まない | 通過 | お題のタイトル・本文をログへ出さない（ADR 0012）。完成記録に写すのはタイトルだけ |

**逸脱なし。**

## Global Constraints

- **timer-core・poker-core は topic-core を import しない（MUST NOT・spec T1）。** お題のタイトルはアプリ層（`apps/tasuki-sync`）が `TopicStore` から引いて**文字列として**渡す
- **表示側（玄関・timer・poker）はお題を変えない。** お題のコマンドは timer・poker・ハブのスキーマに存在しない（spec T4）
- `topic` フレームは**ツール固有のスキーマより先に**、topic-core の `TopicFrameSchema` で見分ける。契約に合わないフレームとして扱ってはならない（timer は #209、poker は #212 の「同期できていません」を出してしまう）
- お題の本文は **`@tasuki/markdown` で解析し、描画は各アプリ**が持つ。`dangerouslySetInnerHTML` を使わない。リンクは `safeHref` が通したもの（http(s)・mailto）だけを `<a>` にする
- 完成記録は**お題の有無にかかわらず毎回作る**（spec T9・E17）。写すのは**タイトルだけ**（本文は写さない）
- **UI の文言は書体の base 層に収める**（`packages/ui/src/tokens/fonts.css` の `zkgn-*-base`）。この計画に出る新しい文言（「お題」「説明を見る」「お題なし」「の記録を削除」など）は計画の段で実測済み。**計画に無い文言を足したら、その場で測る**（Task 3・4・6 に検査がある）
- **テスト名は利用者から見た結果を述べ、仕様の識別番号（E1・T4 など）を入れない**（`docs/adr/0006` 決定 5・MUST）。追跡は `describe` の直上の JSDoc `@requirements #91 E…` に書く
- テスト名の形は `Given … / When … / Then …`（bun test の同期サーバーは既存の各ファイルの形に揃える）。**本文が 3 行以上のテストには `// Given` / `// When` / `// Then` の区切りを置く**（SC-032・合否の出ない指標なので Task 13 で main と数値で比べる）
- **同期サーバーのフィルタ名は `@tasuki/sync`**（`@tasuki/tasuki-sync` は 0 件実行で exit 0 の偽の緑）
- **push・PR の作成・`/code-review` の起動・マージはオーケストレーター（この会話の主）だけが行う。** サブエージェントへ渡すときは、dispatch の本文に「commit はしてよい。push・merge・PR 作成・`git reset --hard`・`git checkout -- <path>` は禁止」と書き、戻ってきたら `git log origin/feature/issue-91-topic-display` が動いていないことを見る
- **撤去は grep で数えて 0 にする。** 型検査は宣言・例外表・散文・変異パッチ・E2E の造作を拾わない（メモリ「消した記号は宣言の側に生き残る」）。各撤去 Task の最後に、決まった grep を流して結果を貼る
- **出力を `| head` / `| tail` で切って数えない。** パイプは終了コードを隠す
- 本番の env 名 `AI_PROBLEM_MODEL`（`config.ts` の `aiProblemModel`）は**変えない**（本番の env の書き換えを増やさない）。注釈で「お題の生成のモデル」と読めるようにだけする
- 作業は `/workspaces/claym/local/Tasuki` の `feature/issue-91-topic-display` ブランチで行う。**素の `pnpm install` は仮想ストアを 9p へ戻す**ので、依存を入れ直すときは `docs/guides/development.md` の手順（`--virtual-store-dir`）に従う
- PR は `Refs #91`。**#91 を閉じるのは、配布して本番で確かめたあと**（地の文にも閉鎖キーワードを書かない）
- **本番へデプロイしない**

## spec から外したこと・決めたこと（2026-09-25・計画を書く段で測った／利用者が決めた）

| 項目 | spec | この計画 | 根拠 |
|---|---|---|---|
| Markdown の解析 | （記述なし。PR 2 §10.1 が「PR 3 で決める」と申し送り） | **解析は新しいパッケージ `@tasuki/markdown` の純粋な関数、描画は各アプリ** | 利用者の決定（2026-09-25）。解析は timer と topic-web で**逐語で同一**（`diff` で確認。違うのはクラス名と見出しの段だけ）で、poker が 3 つ目の使い手になる |
| timer-web の完成記録の出どころ | §5.5「新しい記録は `topicTitle`（null 可）を持つ」 | **端末は組み立てない。snapshot の `sessionRecords` に新しく加わった 1 件をそのまま保存する** | 利用者の決定（2026-09-25）。タイトルがサーバーの写し（T9）と必ず一致し、記録の ID もサーバーのものになるので二重保存が消える |
| 終わり方（完成／中断）の判定 | （記述なし） | **snapshot から導く**: `celebration` へ入った snapshot で `sessionRecords` が増えていれば完成、増えていなければ中断 | 現行は押した本人の端末でしか「中断」にならず、**押していない端末は中断でも完成記録を作る**（`snapshot-intents.ts` の条件が `next.problem && ctx.endType !== "abort"` で、`endType` を変えるのは押した人だけ。コードを読んでの見込み。Task 6 のテストで実在を確かめてから直す） |
| timer のロビー | §5.5「ロビーとセッション中の画面に、いまのお題を読むだけで出す」 | **タブ（「ルーム」「お題」）をやめて 1 画面にする**。お題があるときだけ最上部にお題の札を出す | 利用者の決定（2026-09-25）。「お題」タブの中身は全部が撤去対象 |
| E2E が固定する翡翠の組 | — | `timer-a11y.spec.ts` の「翡翠の『初級』（`--ok` on `--ok-tint`）」の組を外す | 使っていたのは撤去する `ProblemEditor` の難易度バッジだけ（`git grep ok-tint`）。**この色の組は timer で測られなくなる**ことを Task 12 で記録する |
| `topic.spec.ts` のタグ | — | `@core` を付ける | `e2e:prod` は CI では走らず、配布の後に手で流す（`package.json`）。本番に `/topic/` が入ってから走る |
| 品質実験のスクリプト | — | `apps/tasuki-sync/scripts/quality-*.mjs` を topic-core の `buildTopicPrompt` / `validateTopicDraft` へ差し替える | timer-core の `buildProblemPrompt` / `validateProblem` が消える。実験の記録（`docs/timer/experiments/`）から参照されているので残す |
| 完了画面での再読込 | — | **終わり方が分からないので記録を出さず、保存もしない**（受容） | 入った瞬間を見ていない端末には「増えたか」を判定する前の snapshot が無い。現行は同じ場面で**記録を二重に保存し**、中断でも「完了」と出している。今回は二重保存だけを消す。終わり方を wire に載せるのは範囲外（Task 12 で spec §10 に受容として記録） |

**ADR 0011 S9 の改定に使う事実（spec §10 の「`problem.submit` を消した後に、実行者で選別する関門が残るか」）:** 計画の段で `apps/tasuki-sync/src/application` を `actor.id` / `=== actor` / `STALE_SUBMISSION` で grep した。当たったのは `problem-submit.ts` と `problem-delegation.ts` だけで、**撤去後に実行者で選別する関門は残らない**（`participant-remove.ts` の `removalNotificationFor` は文言の出し分けで、受理の可否を決めない）。Task 12 で撤去後にもう一度 grep してから書く。

## Review Focus

spec が求めるのに、どのタスクのテストも踏まないまま利用者に当たりやすい入力（上ほど当たりやすい）:

1. **他の人が「中断」したとき、押していない端末** → 完成記録を作らない・保存しない。完了画面は「中断」と出す。Task 6 のテスト「別の人が中断した snapshot を受けても、記録を保存せず中断と出す」
2. **完了画面で再読込する・完了の後にルームへ入ってきた端末**（前の snapshot が無い）→ 記録を二重に保存しない。Task 6 のテスト「前の snapshot を持たずに完了画面へ入っても、記録を保存しない」
3. **お題の本文に `[` や URL を大量に貼る**（4000 字が、在室者全員の timer・poker・topic-web のタブで解析される）→ 解析が固まらない。Task 1 のテスト「`[` を 10 万字並べても 1 秒以内に解析を終える」（O(N²) なら 1 万倍以上かかる）
4. **timer・poker を開いたまま、お題が掲げ直される・下ろされる** → 表示が追従し、「同期できていません」（#209・#212）を出さない。Task 3・4 のテスト「お題のフレームを受けても同期不整合にならない」
5. **お題を掲げずにセッションを完了し、履歴を開く** → 記録ができていて、見出しに「お題なし」、削除ボタンの名前が完了日時で区別できる（E17・E23）。Task 6 のテスト
6. **旧い端末の IndexedDB に残る記録**（`problemTitle` / `language` / `difficulty` を持つ）→ 履歴に元のお題名が出る（E18）。Task 6 のテスト

---

## ファイル構成

**新規（`packages/markdown`・`@tasuki/markdown`）**

| ファイル | 責務 |
|---|---|
| `package.json` / `tsconfig.json` / `vitest.config.ts` / `README.md` | 雛形（`packages/invite-ui` の形。依存 0） |
| `src/index.ts` | 公開記号の明示列挙 |
| `src/inline.ts` | 行内要素の解析（`parseInline`）と `safeHref` |
| `src/blocks.ts` | ブロックの解析（`parseMarkdown`） |
| `tests/inline.test.ts` / `tests/blocks.test.ts` / `tests/performance.test.ts` | 単体 |

**変更（描画）**: `apps/topic-web/src/components/Markdown.tsx`（解析を削って描画だけに）・`apps/timer-web/src/ui/components/Markdown.tsx`（同）・`apps/poker-web/src/components/Markdown.tsx`（新規・描画だけ）

**変更（timer-web）**: `src/sync/dispatch.ts`・`src/sync/client.ts`・`src/sync/use-timer-sync.ts`・`src/sync/snapshot-intents.ts`・`src/sync/commands.ts`・`src/App.tsx`・`src/ui/Lobby.tsx`・`src/ui/Session.tsx`・`src/ui/History.tsx`・`src/ui/components/TopicCard.tsx`（新規）・`src/records/indexeddb.ts`・`src/records/stored-record.ts`（新規）・`src/prefs/local-prefs.ts`・`vite.config.ts`・`vitest.config.ts`・`package.json`／削除: `src/ai/`・`ProblemEditor`・`ProblemConfigPanel`・`ProblemModeToggle`・`AiUnlockPanel`・`ui/problem-generation.ts`・`ui/problem-text.ts`

**変更（poker-web）**: `src/hooks/useSync.ts`・`src/pages/RoomPage.tsx`・`src/components/CurrentTopic.tsx`（新規）・`src/components/Markdown.tsx`（新規）・`src/index.css`・`package.json`

**変更（同期サーバー）**: `application/topic-broadcast.ts`・`handlers.ts`・`command-handlers/room-join.ts`・`command-handlers/room-create.ts`・`poker-handlers.ts`・`apply-room-level-event.ts`・`build-domain-command.ts`・`join-room.ts`・`initial-timer-state.ts`・`timer-snapshot-dto.ts`・`command-handlers/participant-remove.ts`・`destroy-room.ts`・`rate-limit-gate.ts`（注釈）・`topic-generation.ts`・`topic-handlers.ts`（注釈）・`log/vocabulary.ts`・`adapters/ws-adapter.ts`・`adapters/claude-cli-topic-provider.ts`・`ports/server-topic-provider.ts`・`ports/topic-server-msg.ts`（注釈）・`create-sync-server.ts`・`config.ts`（注釈）・`scripts/quality-*.mjs`／削除: `problem-delegation.ts`・`lobby-problem.ts`・`command-handlers/{ai-unlock,problem-request,problem-submit}.ts`・`adapters/claude-cli-problem-provider.ts`・`ports/server-problem-provider.ts`

**変更（timer-core）**: `aggregate.ts`・`wire.ts`・`schemas.ts`・`decide.ts`・`events.ts`・`evolve.ts`・`records.ts`・`errors.ts`・`error-messages.ts`・`index.ts`／削除: `problem.ts`・`problem-bank.ts`

**変更（検査・E2E・文書）**: `scripts/audit-*.mjs`（登録と例外表）・`scripts/mutation-check.mjs`・`scripts/mutations/*`・`e2e/specs/{topic,timer-a11y,routing,landing}.spec.ts`・`e2e/support/timer.ts`・`docs/adr/0021-*.md`（新規）・`docs/adr/{0011,0012,0017,0018}`・`docs/timer/adr/{0005,0008}`・`docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§10）・`deploy/**`・`README.md`・`docs/guides/*`・`docs/retrospectives/2026-09-XX-issue-91-shared-topic.md`（新規）

---

### Task 0: 準備と基準値

**Files:** なし（測るだけ）

- [ ] **Step 1: ブランチと作業ツリーを確かめる**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain            # 空であること
git branch --show-current         # feature/issue-91-topic-display
git log --oneline -1 origin/main  # 42872e3 以降
```

- [ ] **Step 2: 撤去前の緑を確かめる（対照実行）**

```bash
pnpm test; echo "exit=$?"
pnpm -r typecheck; echo "exit=$?"
node scripts/mutation-check.mjs; echo "exit=$?"
```

Expected: すべて `exit=0`。**赤があれば着手しない**（原因が main にあるなら利用者へ報告する）。`@tasuki/sync` の `live-ws.multi-connection.test.ts` の「AI 鍵を持つ別接続へ need-problem が届き…」は既知のフレーキーで、この PR で**ファイルごと消える**（Task 8）

- [ ] **Step 3: 合否の無い指標の基準値を控える**

```bash
node scripts/audit-structure.mjs 2>&1 | grep -E 'SC-029|SC-032'
```

控えた値を Task 13 で比べる（**後退しても CI は緑のまま**）。

---

### Task 1: `@tasuki/markdown`（解析の純粋な関数）

**Files:**
- Create: `packages/markdown/{package.json,tsconfig.json,vitest.config.ts,README.md}`・`src/{index.ts,inline.ts,blocks.ts}`・`tests/{inline.test.ts,blocks.test.ts,performance.test.ts}`
- Modify: `scripts/audit-dependency-direction.mjs`・`scripts/audit-structure.mjs`・`scripts/audit-log-hygiene.mjs`・`scripts/audit-domain-side-effects.mjs`・`scripts/check-links.mjs`（README を載せるなら）

**Interfaces:**
- Produces:
  - `type MdInline = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "strong"; children: MdInline[] } | { kind: "em"; children: MdInline[] } | { kind: "link"; href: string | null; text: string }`
  - `type MdBlock = { kind: "heading"; level: 1 | 2 | 3; inline: MdInline[] } | { kind: "code"; text: string } | { kind: "quote"; lines: MdInline[][] } | { kind: "ul"; items: MdInline[][] } | { kind: "ol"; items: MdInline[][] } | { kind: "p"; lines: MdInline[][] }`
  - `parseMarkdown(src: string): MdBlock[]`・`parseInline(text: string): MdInline[]`・`safeHref(url: string): string | null`
  - `link.href === null` は「安全でないので `<a>` にせず `text` を素の文字として出す」を意味する

- [ ] **Step 1: 雛形を置く**

`packages/markdown/package.json`:

```json
{
  "name": "@tasuki/markdown",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "vitest": "^4.1.11"
  }
}
```

`packages/markdown/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"] },
  "include": ["src", "tests"]
}
```

`packages/markdown/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

`packages/markdown/README.md`:

```markdown
# @tasuki/markdown

お題の本文・共有メモの**安全な Markdown サブセット**を、ブロックと行内要素の木へ解析する純粋な関数。
**描画はしない**（React を知らない）。描画は各アプリが持つ（timer-web・poker-web・topic-web の `Markdown.tsx`）。

- `parseMarkdown(src)` — ブロック（見出し `#`〜`###`・箇条書き・番号付き・引用・コードの囲み・段落）の配列
- `parseInline(text)` — 行内要素（`**太字**`・`*斜体*`・`` `コード` ``・`[表示](URL)`・生 URL）の配列
- `safeHref(url)` — `http(s)://` と `mailto:` だけを通す。通らなければ `null`（描画側は `<a>` にしない）

解析は入力の長さに対して線形に近い時間で終わる（リンクの表示と URL の長さに上限を置いている）。
置き場の判断: [ADR-0021](../../docs/adr/0021-topic-as-shared-context.md)。
```

- [ ] **Step 2: 行内要素の失敗するテストを書く**

`packages/markdown/tests/inline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseInline, safeHref } from '../src/index';

/**
 * @requirements #91 spec §5.4（お題の本文を Markdown として描く・PR 2 §10.1）
 */
describe('行内要素を解析する', () => {
  it('Given 記法の無い文 / When 解析する / Then 文字が 1 つだけ返る', () => {
    expect(parseInline('ただの文')).toEqual([{ kind: 'text', text: 'ただの文' }]);
  });

  it('Given コード・太字・斜体 / When 解析する / Then それぞれの種類になる', () => {
    // Given
    const src = '`x` と **強く** と *弱く*';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes).toEqual([
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' と ' },
      { kind: 'strong', children: [{ kind: 'text', text: '強く' }] },
      { kind: 'text', text: ' と ' },
      { kind: 'em', children: [{ kind: 'text', text: '弱く' }] },
    ]);
  });

  it('Given 太字の中のコード / When 解析する / Then 太字の子として解析される', () => {
    expect(parseInline('**`a` b**')).toEqual([
      { kind: 'strong', children: [{ kind: 'code', text: 'a' }, { kind: 'text', text: ' b' }] },
    ]);
  });

  it('Given 安全なリンクと危険なリンク / When 解析する / Then 危険なものは href が null になる', () => {
    // Given
    const src = '[見る](https://example.com) [罠](javascript:alert(1))';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes[0]).toEqual({ kind: 'link', href: 'https://example.com', text: '見る' });
    expect(nodes.find((n) => n.kind === 'link' && n.text === '罠')).toEqual({
      kind: 'link',
      href: null,
      text: '罠',
    });
  });

  it('Given 文末の句点が付いた生 URL / When 解析する / Then 句点は URL に含まれない', () => {
    expect(parseInline('https://example.com。')).toEqual([
      { kind: 'link', href: 'https://example.com', text: 'https://example.com' },
      { kind: 'text', text: '。' },
    ]);
  });
});

describe('リンクの行き先の安全判定', () => {
  it.each([
    ['https://a.example', 'https://a.example'],
    ['http://a.example', 'http://a.example'],
    ['mailto:x@example.com', 'mailto:x@example.com'],
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    ['//a.example', null],
  ])('Given %s / When 判定する / Then %s', (url, expected) => {
    expect(safeHref(url)).toBe(expected);
  });
});
```

- [ ] **Step 3: ブロックの失敗するテストを書く**

`packages/markdown/tests/blocks.test.ts`（**U+2028 / U+2029 の無限ループの再発防止を必ず含める**。timer・topic-web の既存テスト `markdown.test.tsx` の該当ケースを写す）:

```ts
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/index';

const text = (t: string) => [{ kind: 'text', text: t }];

/**
 * @requirements #91 spec §5.4（お題の本文を Markdown として描く・PR 2 §10.1）
 */
describe('ブロックを解析する', () => {
  it('Given 見出し 3 段 / When 解析する / Then 段の数が level になる', () => {
    expect(parseMarkdown('# 一\n## 二\n### 三')).toEqual([
      { kind: 'heading', level: 1, inline: text('一') },
      { kind: 'heading', level: 2, inline: text('二') },
      { kind: 'heading', level: 3, inline: text('三') },
    ]);
  });

  it('Given 箇条書き・番号付き・引用 / When 解析する / Then 行ごとに項目になる', () => {
    // Given
    const src = '- a\n- b\n\n1. c\n2. d\n\n> e\n> f';
    // When
    const blocks = parseMarkdown(src);
    // Then
    expect(blocks).toEqual([
      { kind: 'ul', items: [text('a'), text('b')] },
      { kind: 'ol', items: [text('c'), text('d')] },
      { kind: 'quote', lines: [text('e'), text('f')] },
    ]);
  });

  it('Given コードの囲み / When 解析する / Then 中身は行内解析されない', () => {
    expect(parseMarkdown('```\n**a**\n```')).toEqual([{ kind: 'code', text: '**a**' }]);
  });

  it('Given 空行で区切った段落 / When 解析する / Then 段落が 2 つになり行内の改行は行として残る', () => {
    expect(parseMarkdown('a\nb\n\nc')).toEqual([
      { kind: 'p', lines: [text('a'), text('b')] },
      { kind: 'p', lines: [text('c')] },
    ]);
  });

  it('Given CRLF の改行 / When 解析する / Then LF と同じ結果になる', () => {
    expect(parseMarkdown('a\r\nb')).toEqual(parseMarkdown('a\nb'));
  });

  it('Given 空文字 / When 解析する / Then ブロックは無い', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

/**
 * 行区切りの文字（U+2028 / U+2029）で解析が止まらなくなった不具合（PR 2 の最終レビュー C1）の再発防止。
 * 在室者が 1 回貼るとルームの全員のタブが固まる。
 */
describe('行区切りの文字を含む本文', () => {
  it.each([' ', ' ', '# 見出し 続き', 'a  b'])(
    'Given %j / When 解析する / Then 終わって段落か見出しが返る',
    (src) => {
      // When
      const blocks = parseMarkdown(src);
      // Then: 終わること自体が主張。中身は改行と同じに扱われる
      expect(blocks.length).toBeGreaterThanOrEqual(0);
      expect(parseMarkdown(src.replace(/[  ]/g, '\n'))).toEqual(blocks);
    },
  );
});
```

- [ ] **Step 4: 解析の時間の失敗するテストを書く**

`packages/markdown/tests/performance.test.ts`（**現行の正規表現は O(N²)**。PR 2 の実測で n=16000 の `[` に約 167ms。10 万字なら数秒〜十数秒かかる）:

```ts
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/index';

/**
 * 病的な入力でも解析が入力の長さにほぼ比例する時間で終わる。
 *
 * **閾値は緩く取ってある。** 線形なら 10 万字でも数十 ms で、O(N²) なら 1 万倍以上かかる。
 * 1 秒は CI の揺れを吸収しつつ、O(N²) を確実に落とす値である。
 *
 * @requirements #91 spec §5.4（PR #311 の申し送り: `INLINE_RE` の O(N²)）
 */
describe('病的な入力でも解析が詰まらない', () => {
  it.each([
    ['[ の羅列', '['.repeat(100_000)],
    ['閉じない URL の羅列', 'http://'.repeat(15_000)],
    ['閉じない太字の羅列', '**a'.repeat(30_000)],
  ])('Given %s / When 解析する / Then 1 秒以内に終わる', (_label, src) => {
    // Given
    const started = performance.now();
    // When
    parseMarkdown(src);
    // Then
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
```

- [ ] **Step 5: 落ちることを確かめる**

```bash
pnpm install   # 仮想ストアの逃がしは docs/guides/development.md の手順に従う
pnpm --filter @tasuki/markdown test
```

Expected: FAIL（`../src/index` が無い）。`git diff pnpm-lock.yaml` で、足されたのが importer だけであることを見る

- [ ] **Step 6: 実装する**

`packages/markdown/src/inline.ts`:

```ts
/**
 * 行内要素の解析（#91 PR 3）。timer-web と topic-web に逐語で同じ写しがあったものを 1 つにした。
 *
 * **HTML を作らない。** 返すのはデータの木で、描画は各アプリが React 要素として組む
 * （innerHTML を使わないので、利用者の入力をそのまま渡しても XSS にならない）。
 */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: MdInline[] }
  | { kind: 'em'; children: MdInline[] }
  /** `href` が null なら安全でない行き先。描画側は `<a>` にせず `text` を素の文字で出す。 */
  | { kind: 'link'; href: string | null; text: string };

/** 許可するリンクスキームだけを通す（javascript: 等を無効化）。 */
export function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

/**
 * リンクの表示と URL の長さの上限。
 *
 * **上限が無いと解析は O(N²) になる**（PR #311 の申し送り）。`[` を並べた入力では、
 * 各位置から `[^\]\n]*` が行末まで読んで失敗するのを N 回繰り返す。上限を置くと 1 位置あたりの
 * 読みが定数で止まる。お題の本文は 4000 字が上限なので、正当なリンクはこの中に収まる。
 */
const MAX_LINK_TEXT = 200;
const MAX_URL = 2000;

// コード→太字→斜体→リンク→生 URL の順で評価する（元の timer-web の順序のまま）。
// 生 URL は末尾の約物（. , ; : 。 、 ） ）を含めない。
const INLINE_RE = new RegExp(
  [
    '(`[^`]+`)',
    '(\\*\\*[^*]+?\\*\\*)',
    '(\\*[^*]+?\\*)',
    `(\\[[^\\]\\n]{0,${MAX_LINK_TEXT}}\\]\\([^)\\s]{0,${MAX_URL}}\\))`,
    `((?:https?:\\/\\/|mailto:)[^\\s)]{0,${MAX_URL}}[^\\s).,;:。、）])`,
  ].join('|'),
  'g',
);

/**
 * 1 行を行内要素に分ける。
 *
 * **`lastIndex` で進める**（元の実装は一致のたびに `rest.slice` で残りを切り出しており、
 * 一致の数だけ文字列を複製していた）。
 */
export function parseInline(text: string): MdInline[] {
  const nodes: MdInline[] = [];
  const re = new RegExp(INLINE_RE.source, 'g');
  let pos = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > pos) nodes.push({ kind: 'text', text: text.slice(pos, m.index) });
    nodes.push(toNode(m));
    pos = m.index + m[0].length;
  }
  if (pos < text.length) nodes.push({ kind: 'text', text: text.slice(pos) });
  return nodes;
}

function toNode(m: RegExpExecArray): MdInline {
  const token = m[0];
  if (m[1]) return { kind: 'code', text: token.slice(1, -1) };
  if (m[2]) return { kind: 'strong', children: parseInline(token.slice(2, -2)) };
  if (m[3]) return { kind: 'em', children: parseInline(token.slice(1, -1)) };
  if (m[4]) {
    const sep = token.indexOf('](');
    return { kind: 'link', href: safeHref(token.slice(sep + 2, -1)), text: token.slice(1, sep) };
  }
  return { kind: 'link', href: safeHref(token), text: token };
}
```

`packages/markdown/src/blocks.ts`（**ブロックの規則は `apps/topic-web/src/components/Markdown.tsx` の `parseBlocks` を逐語で写し、最後に行内を解析する**。U+2028 の正規化と「前進の保証」を落とさない）:

```ts
/**
 * ブロックの解析（#91 PR 3）。規則は timer-web・topic-web の `parseBlocks` と同じ。
 *
 * 対応: 見出し（# / ## / ###）・箇条書き（- / *）・番号付き（1.）・引用（>）・
 * コードの囲み（```）・段落（空行区切り。行内の改行は行として残す）。
 */
import { parseInline, type MdInline } from './inline';

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: MdInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; lines: MdInline[][] }
  | { kind: 'ul'; items: MdInline[][] }
  | { kind: 'ol'; items: MdInline[][] }
  | { kind: 'p'; lines: MdInline[][] };

type RawBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote' | 'ul' | 'ol' | 'p'; lines: string[] };

export function parseMarkdown(src: string): MdBlock[] {
  return parseRawBlocks(src).map(toBlock);
}

function toBlock(b: RawBlock): MdBlock {
  switch (b.kind) {
    case 'heading':
      return { kind: 'heading', level: b.level, inline: parseInline(b.text) };
    case 'code':
      return b;
    case 'ul':
    case 'ol':
      return { kind: b.kind, items: b.lines.map(parseInline) };
    case 'quote':
    case 'p':
      return { kind: b.kind, lines: b.lines.map(parseInline) };
  }
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const QUOTE_RE = /^>\s?/;
const UL_RE = /^\s*[-*]\s+/;
const OL_RE = /^\s*\d+\.\s+/;
const isFence = (line: string) => line.trimStart().startsWith('```');

/** 同じ規則に当たる行が続く間を 1 つのブロックへ集める。 */
function collect(lines: string[], start: number, re: RegExp): { taken: string[]; next: number } {
  const taken: string[] = [];
  let i = start;
  while (i < lines.length && re.test(lines[i] ?? '')) {
    taken.push((lines[i] ?? '').replace(re, ''));
    i++;
  }
  return { taken, next: i };
}

/** 段落を止める行か（空行・別のブロックの始まり）。 */
function endsParagraph(line: string): boolean {
  return (
    line.trim() === '' || HEADING_RE.test(line) || UL_RE.test(line) || OL_RE.test(line) || QUOTE_RE.test(line) || isFence(line)
  );
}

// 規則は timer-web・topic-web の `parseBlocks` と同じ（見出しの判定だけ、段落の停止と同じ
// `HEADING_RE` を使うよう揃えた —— 元は `/^(#{1,3})\s+(.*)$/` と `/^(#{1,3})\s+/` の 2 つで、
// U+2028 を残すと食い違って止まらなくなった）。
function parseRawBlocks(src: string): RawBlock[] {
  // U+2028 / U+2029（行区切り・段落区切り）も改行として扱う。正規表現の `.` はこれらに
  // 一致しないので、残すと見出しの判定と段落の停止条件が食い違う（下の前進の保証を参照）。
  const lines = src.replace(/\r\n?|[  ]/g, '\n').split('\n');
  const blocks: RawBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isFence(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // 閉じの囲みを飛ばす
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, text: h[2]! });
      i++;
      continue;
    }
    const listLike: Array<[RegExp, 'quote' | 'ul' | 'ol']> = [[QUOTE_RE, 'quote'], [UL_RE, 'ul'], [OL_RE, 'ol']];
    const hit = listLike.find(([re]) => re.test(line));
    if (hit) {
      const { taken, next } = collect(lines, i, hit[0]);
      blocks.push({ kind: hit[1], lines: taken });
      i = next;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !endsParagraph(lines[i] ?? '')) {
      para.push(lines[i] ?? '');
      i++;
    }
    // 前進の保証: どの規則にも当たらずに止まった（段落が空の）ときは、その 1 行を段落として
    // 取り込んで進める。規則の片方だけが変わっても、空の段落を積み続けて止まらなくならない。
    if (para.length === 0) {
      para.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}
```

**元の `parseBlocks` との差は、見出しの正規表現を 1 つにまとめたことだけである**（元は判定と段落の停止で 2 つの正規表現を持っていた）。規則を変えていないことは、Task 2 で両アプリの既存の描画テストを**書き換えずに**通すことで確かめる。

`packages/markdown/src/index.ts`:

```ts
/**
 * @tasuki/markdown の公開記号（明示列挙・ADR-0016 決定 2 項目 2）。
 */
export { parseMarkdown } from './blocks';
export type { MdBlock } from './blocks';
export { parseInline, safeHref } from './inline';
export type { MdInline } from './inline';
```

- [ ] **Step 7: テストが通ることを確かめる**

```bash
pnpm --filter @tasuki/markdown test
pnpm --filter @tasuki/markdown typecheck
pnpm --filter @tasuki/markdown lint
```

Expected: すべて成功。**時間のテストは、上限（`{0,200}` など）を `*` に戻すと落ちることを 1 度手で確かめる**（落ちなければ、テストの入力が上限に当たっていない。Task 10 で変異に固定する）

- [ ] **Step 8: 新しいパッケージを検査に登録する**

`scripts/audit-dependency-direction.mjs` の `ALLOWED`（`"packages/invite-ui"` の行の後ろ）:

```js
  // #91 PR 3: Markdown サブセットの解析（純粋な関数・描画は各アプリ）。依存 0。
  "packages/markdown": [],
```

`scripts/audit-structure.mjs` のパッケージ一覧（`packages/invite-ui` の行の後ろ）:

```js
  { pkg: "packages/markdown", src: "src", test: "tests", entry: "index.ts" },
```

`scripts/audit-log-hygiene.mjs` の `SCANNED_PACKAGES`（`"packages/invite-ui",` の後ろ）に `"packages/markdown",`。

`scripts/audit-domain-side-effects.mjs`: `packages/markdown` を**除外しない**（純粋な関数なので、`Date.now()` や `Math.random()` を置いたら赤になるべき）。一覧が「走査するパッケージ」を列挙する形なら足し、「除外」を列挙する形なら何もしない。どちらの形かは開いて見る。

`scripts/check-links.mjs`: `packages/invite-ui/README.md` と同じ扱いの一覧があれば `packages/markdown/README.md` を足す。

- [ ] **Step 9: 索引に載せてから全検査を回し、赤を直す**

```bash
git add packages/markdown pnpm-lock.yaml
node scripts/audit-structure.mjs; echo "exit=$?"
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
node scripts/audit-domain-side-effects.mjs; echo "exit=$?"
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/audit-public-surface.mjs; echo "exit=$?"
node scripts/check-links.mjs; echo "exit=$?"
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'; echo "exit=$?"
```

Expected: すべて `exit=0`。赤は、その検査が名指しする一覧へ `packages/markdown` を足して直す。**直したものは PR 本文の「検査の登録」に列挙する**

- [ ] **Step 10: コミットする**

```bash
git add packages/markdown pnpm-lock.yaml scripts
git commit -m "feat: Markdown の解析を純粋なパッケージへ出す（#91 PR 3）"
```

---

### Task 2: topic-web と timer-web の描画を共有の解析へ載せ替える

**Files:**
- Modify: `apps/topic-web/src/components/Markdown.tsx`・`apps/topic-web/package.json`・`apps/timer-web/src/ui/components/Markdown.tsx`・`apps/timer-web/package.json`・`scripts/audit-dependency-direction.mjs`
- Test: `apps/topic-web/tests/markdown.test.tsx`・`apps/timer-web/test/ui/components/Markdown.test.tsx`（既存。名前は `git ls-files '*arkdown*'` で確かめる）

**Interfaces:**
- Consumes: `parseMarkdown` / `MdBlock` / `MdInline`（Task 1）
- Produces: timer-web の `Markdown` に `headingBase?: 3 | 4`（既定 3 = `#`→h3。Task 3 の `TopicCard` が 4 を渡す）。topic-web の `Markdown` は従来どおり `#`→h4

- [ ] **Step 1: 既存の描画テストが緑であることを確かめる（対照）**

```bash
pnpm --filter @tasuki/topic-web test -- markdown
pnpm --filter @tasuki/timer-web test -- Markdown
```

Expected: PASS。**このテストを書き換えずに載せ替えるのが目標**（振る舞いを変えない移設）。解析の単体（U+2028 など）は Task 1 へ移ったので、描画のテストに解析の細部を見る重複があれば、そのケースは残してよい（描画の経路で固まらないことの確認になる）

- [ ] **Step 2: timer-web に見出しの段のテストを足す（失敗する）**

`apps/timer-web/test/ui/components/Markdown.test.tsx` に:

```tsx
/**
 * @requirements #91 spec §5.5（timer のお題の札は h2「お題」・h3 タイトルの下に本文を置く）
 */
describe('見出しの段を下げる', () => {
  it('Given headingBase が 4 / When # 見出しを描く / Then h4 になる', () => {
    // Given / When
    render(<Markdown source={'# 見出し'} headingBase={4} />);
    // Then
    expect(screen.getByRole('heading', { level: 4, name: '見出し' })).toBeInTheDocument();
  });

  it('Given 指定なし / When # 見出しを描く / Then 従来どおり h3 になる', () => {
    render(<Markdown source={'# 見出し'} />);
    expect(screen.getByRole('heading', { level: 3, name: '見出し' })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @tasuki/timer-web test -- Markdown` → FAIL（`headingBase` が効かない）

- [ ] **Step 3: 載せ替える**

両アプリの `package.json` の `dependencies` に `"@tasuki/markdown": "workspace:*"` を足し、`scripts/audit-dependency-direction.mjs` の `"apps/timer-web"` と `"apps/topic-web"` の欄に `"@tasuki/markdown"` を足す。

`apps/topic-web/src/components/Markdown.tsx`（**解析を消し、描画だけを残す**。クラス名・`tabIndex={0}`・見出しの段は今のまま）:

```tsx
/**
 * お題の説明の描画（#91）。**解析は `@tasuki/markdown` が持つ**（PR 3 で 3 つのアプリへ共有した）。
 * ここは解析結果の木を React 要素へ組むだけで、文字列 HTML を作らない。
 *
 * topic-web では札のタイトル（h3）の下に置くので段を 1 つ下げる（`#`→h4・`##`→h5・`###`→h6）。
 */
import React from 'react';
import { parseMarkdown, type MdBlock, type MdInline } from '@tasuki/markdown';

function Inline({ nodes, keyBase }: { nodes: readonly MdInline[]; keyBase: string }) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${keyBase}-${i}`;
        switch (n.kind) {
          case 'text':
            return <React.Fragment key={key}>{n.text}</React.Fragment>;
          case 'code':
            return <code key={key} className="md-code">{n.text}</code>;
          case 'strong':
            return <strong key={key}><Inline nodes={n.children} keyBase={key} /></strong>;
          case 'em':
            return <em key={key}><Inline nodes={n.children} keyBase={key} /></em>;
          case 'link':
            return n.href === null ? (
              <React.Fragment key={key}>{n.text}</React.Fragment>
            ) : (
              <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
                {n.text}
              </a>
            );
        }
      })}
    </>
  );
}

function Lines({ lines, keyBase }: { lines: readonly MdInline[][]; keyBase: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={`${keyBase}-l${i}`}>
          {i > 0 && <br />}
          <Inline nodes={line} keyBase={`${keyBase}-l${i}`} />
        </React.Fragment>
      ))}
    </>
  );
}

const HEADING_TAG = { 1: 'h4', 2: 'h5', 3: 'h6' } as const;

function Block({ block, keyBase }: { block: MdBlock; keyBase: string }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = HEADING_TAG[block.level];
      return <Tag className="md-h"><Inline nodes={block.inline} keyBase={keyBase} /></Tag>;
    }
    case 'code':
      // 横にスクロールするコードへキーボードでも届くように、フォーカスを受けさせる。
      return <pre className="md-pre" tabIndex={0}>{block.text}</pre>;
    case 'quote':
      return <blockquote className="md-quote"><Lines lines={block.lines} keyBase={keyBase} /></blockquote>;
    case 'ul':
    case 'ol': {
      const List = block.kind;
      return (
        <List className={`md-${block.kind}`}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </List>
      );
    }
    case 'p':
      return <p className="md-p"><Lines lines={block.lines} keyBase={keyBase} /></p>;
  }
}

interface MarkdownProps {
  source: string;
  className?: string;
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, className = '' }: MarkdownProps) {
  return (
    <div className={`md ${className}`}>
      {parseMarkdown(source).map((b, i) => <Block key={`b${i}`} block={b} keyBase={`b${i}`} />)}
    </div>
  );
}
```

`apps/timer-web/src/ui/components/Markdown.tsx` も同じ骨組みで書き直す。**クラス名は現行のものを 1 字も変えずに写す**（現行の `renderInline` の `className`・`HEADING_CLASS`・各ブロックの `className`・外側の `div` の `className`）。違いは次の 2 つだけ:

```tsx
interface MarkdownProps {
  source: string;
  className?: string;
  /**
   * `#` を何段の見出しにするか（#91 PR 3）。既定 3（`#`→h3・`##`→h4・`###`→h5）は共有メモの段。
   * お題の札（`TopicCard`）は h2「お題」・h3 タイトルの下に置くので 4 を渡す。
   */
  headingBase?: 3 | 4;
}

// 見出しの段: level 1〜3 に headingBase - 1 を足す（3 なら h3〜h5、4 なら h4〜h6）
const tagFor = (level: 1 | 2 | 3, base: 3 | 4) => `h${level + base - 1}` as 'h3' | 'h4' | 'h5' | 'h6';
```

`HEADING_CLASS` は `block.level`（1〜3）で引く（段を下げてもクラスは level のまま）。

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm --filter @tasuki/topic-web test && pnpm --filter @tasuki/topic-web typecheck
pnpm --filter @tasuki/timer-web test && pnpm --filter @tasuki/timer-web typecheck
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
git grep -n 'INLINE_RE\|function parseBlocks' -- apps
```

Expected: テスト・型検査は成功。**最後の grep は 0 件**（解析の写しが残っていない）

- [ ] **Step 5: コミットする**

```bash
git add apps/topic-web apps/timer-web scripts/audit-dependency-direction.mjs pnpm-lock.yaml
git commit -m "refactor: topic-web と timer-web の Markdown を共有の解析へ載せ替える（#91 PR 3）"
```

---

### Task 3: timer-web が `topic` フレームを受けてお題を出す

**Files:**
- Modify: `apps/timer-web/src/sync/dispatch.ts`・`src/sync/client.ts`・`src/sync/use-timer-sync.ts`・`src/App.tsx`・`src/ui/Lobby.tsx`・`src/ui/Session.tsx`・`package.json`・`scripts/audit-dependency-direction.mjs`
- Create: `apps/timer-web/src/ui/components/TopicCard.tsx`
- Test: `apps/timer-web/test/sync/dispatch.test.ts`・`test/sync/use-timer-sync.test.tsx`・`test/ui/TopicCard.test.tsx`（新規）・`test/ui/topic-copy-fits-font-base.test.ts`（新規）

**Interfaces:**
- Consumes: `TopicFrameSchema` / `Topic` / `TopicState`（`@tasuki/topic-core`）・`Markdown` の `headingBase`（Task 2）
- Produces: `ServerMessageCallbacks.onTopic?: (state: TopicState) => void`・`SyncClientOptions.onTopic?`・`TimerSync.topic: Topic | null`・`<TopicCard topic={Topic} />`
- **この Task ではまだお題の作成 UI を消さない**（Task 7）。お題の札をロビーの「ルーム」タブの最上部とセッション画面の最上部に**足す**だけにする

- [ ] **Step 1: 振り分けの失敗するテストを書く**

`apps/timer-web/test/sync/dispatch.test.ts` に:

```ts
/**
 * @requirements #91 E2 E15 E16（timer はお題を読んで表示するだけ・spec T3）
 */
describe('お題のフレームを振り分ける', () => {
  it('Given お題のフレーム / When 振り分ける / Then onTopic に状態が渡り、捨てたとは言わない', () => {
    // Given
    const state = { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false };
    const onTopic = vi.fn();
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: 'topic', state }), { onTopic, onInvalidFrame });
    // Then
    expect(onTopic).toHaveBeenCalledWith(state);
    expect(onInvalidFrame).not.toHaveBeenCalled();
  });

  it('Given 形の崩れたお題のフレーム / When 振り分ける / Then 捨てたことを知らせる', () => {
    // Given
    const onTopic = vi.fn();
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: 'topic', state: { topic: 1 } }), { onTopic, onInvalidFrame });
    // Then
    expect(onTopic).not.toHaveBeenCalled();
    expect(onInvalidFrame).toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @tasuki/timer-web test -- dispatch` → FAIL

- [ ] **Step 2: 振り分けを実装する**

`package.json` に `"@tasuki/topic-core": "workspace:*"`、`scripts/audit-dependency-direction.mjs` の `"apps/timer-web"` に `"@tasuki/topic-core"` を足す（注釈:「#91 PR 3: `topic` フレームを topic-core のスキーマで検め、お題を読むだけで出す（spec §5.5）。timer-core は topic-core を知らない（T1）」）。

`src/sync/dispatch.ts`:

```ts
import { TopicFrameSchema, type TopicState } from "@tasuki/topic-core";
// …
export interface ServerMessageCallbacks {
  // …既存…
  /**
   * いまのお題の状態（#91・spec T3）。**ツールをまたぐフレームなので timer の契約
   * （`ServerMsgSchema`）には無い**。下の振り分けがそれより先に見分ける。
   */
  onTopic?: (state: TopicState) => void;
}
```

`dispatchServerMessage` の `JSON.parse` の直後、`ServerMsgSchema` の検証より前に:

```ts
  // **お題のフレームは timer の契約より先に見分ける**（#91・spec §5.5）。順を逆にすると
  // `ServerMsgSchema` が未知の type として落とし、「同期できていません」（#209）を出す。
  // `type` が "topic" なのに形が崩れているものは、ここで拾わず下の検証に落として知らせる。
  const topic = v.safeParse(TopicFrameSchema, json);
  if (topic.success) {
    cb.onTopic?.(topic.output.state);
    return;
  }
```

`src/sync/client.ts` の `SyncClientOptions` に `onTopic?: (state: TopicState) => void` を足し、`handleMessage` の振り分けに `onTopic: (state) => this.options.onTopic?.(state),` を足す（`onNotice` と同じ形）。

- [ ] **Step 3: 同期フックの失敗するテストを書く**

`test/sync/use-timer-sync.test.tsx` に、既存のフェイクの WebSocket の使い方に合わせて:

- 「Given ルームに入った timer / When お題のフレームが届く / Then `topic` にタイトルと本文が入る」
- 「Given お題がある / When お題なしのフレームが届く / Then `topic` が null に戻る」
- 「Given お題がある / When ルームから抜けた知らせが届く / Then `topic` が null に戻る」（抜けたルームのお題を次のルームへ持ち越さない）
- 「Given ルームに入った timer / When お題のフレームが届く / Then `syncStale` は立たない」（Review Focus 4）

Run → FAIL

- [ ] **Step 4: 同期フックを実装する**

`src/sync/use-timer-sync.ts`:

- `TimerSync` に `topic: Topic | null;`（docstring:「ルームのいまのお題（#91）。**timer は読むだけ**。`topic` フレームで届き、snapshot には含まれない（spec T3）」）
- `const [topic, setTopic] = useState<Topic | null>(null);`
- `const handleTopic = (state: TopicState) => setTopic(state.topic);`（`handlersRef` に載せる必要は無い。setter だけなので `makeClient` で `onTopic: (state) => setTopic(state.topic)` と直接渡す —— `onConnectionChange` と同じ理由）
- `leave-room` の分岐で `setTopic(null);`（`setRoom(null)` の隣。注釈:「お題はルームのもの。抜けたら畳む」）
- 返り値に `topic,`

- [ ] **Step 5: お題の札の失敗するテストを書く**

`test/ui/TopicCard.test.tsx`（新規）:

```tsx
/**
 * @requirements #91 E15（timer はお題のタイトルと本文を出す）
 */
describe('お題の札', () => {
  it('Given タイトルと本文 / When 描く / Then 「お題」の領域にタイトルと本文の見出しが出る', () => {
    // Given
    const topic = { title: 'FizzBuzz', body: '# 振る舞い\n- 3 のときは Fizz', source: 'manual' as const };
    // When
    render(<TopicCard topic={topic} />);
    // Then
    const region = screen.getByRole('region', { name: 'お題' });
    expect(within(region).getByRole('heading', { level: 3, name: 'FizzBuzz' })).toBeInTheDocument();
    expect(within(region).getByRole('heading', { level: 4, name: '振る舞い' })).toBeInTheDocument();
    expect(within(region).getByRole('listitem')).toHaveTextContent('3 のときは Fizz');
  });

  it('Given 本文が空 / When 描く / Then タイトルだけが出る', () => {
    render(<TopicCard topic={{ title: 'FizzBuzz', body: '', source: 'manual' }} />);
    expect(screen.getByRole('region', { name: 'お題' }).querySelector('.md')).toBeNull();
  });
});
```

`Lobby` と `Session` の既存テストに、それぞれ:

- 「Given お題がある / When ロビーを描く / Then お題の札が出る」
- 「Given お題が無い / When ロビーを描く / Then お題の札は出ない」（E16）
- セッションも同じ 2 件

`test/ui/topic-copy-fits-font-base.test.ts`（新規。**topic-web の `tests/support/font-base.ts` を timer-web の `test/support/font-base.ts` へ写す**。相対パスの深さを合わせる）:

```ts
/**
 * お題の札の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe('お題の札の文言は書体の常用の層に収まる', () => {
  it('Given お題の札が出す固定の文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    expect(outsideBase([TOPIC_CARD_HEADING])).toEqual([]);
  });
});
```

Run → FAIL

- [ ] **Step 6: お題の札を実装し、画面へ差し込む**

`src/ui/components/TopicCard.tsx`:

```tsx
/**
 * いまのお題（#91・spec §5.5）。**timer は読むだけ**で、変えるのはお題ツールである（spec T4）。
 *
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から（`headingBase={4}`）。
 */
import React from "react";
import { Code } from "lucide-react";
import type { Topic } from "@tasuki/topic-core";
import { Card, SectionHeader } from "../primitives.js";
import { Markdown } from "./Markdown.js";

/** 札の見出し。書体の常用の層に収まることを `topic-copy-fits-font-base.test.ts` が見る。 */
export const TOPIC_CARD_HEADING = "お題";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <Card>
      <section aria-label={TOPIC_CARD_HEADING}>
        <SectionHeader icon={Code} color="text-[var(--signal)]" title={TOPIC_CARD_HEADING} />
        {/* 区切りの無い長いタイトルが横へはみ出さないように折り返す（PR 2 の実画面で topic-web が踏んだ） */}
        <h3 className="text-lg font-bold text-[var(--bone)] [overflow-wrap:anywhere]">{topic.title}</h3>
        {topic.body !== "" && <Markdown source={topic.body} headingBase={4} className="mt-3" />}
      </section>
    </Card>
  );
}
```

`App.tsx` から `Lobby` と `Session` へ `topic={sync.topic}` を渡す。`Lobby` の `LobbyProps` と `Session` の `SessionProps` に `topic: Topic | null` を足し、描画の最上部（ロビーは「ルーム」タブの `startButton` の上、セッションは `sessionPanel` の最上部）に `{topic && <TopicCard topic={topic} />}` を置く。

- [ ] **Step 7: 通ることを確かめる**

```bash
pnpm --filter @tasuki/timer-web test
pnpm --filter @tasuki/timer-web typecheck
pnpm --filter @tasuki/timer-web lint
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/audit-web-sync-boundary.mjs; echo "exit=$?"
```

Expected: すべて成功

- [ ] **Step 8: コミットする**

```bash
git add apps/timer-web scripts/audit-dependency-direction.mjs pnpm-lock.yaml
git commit -m "feat: timer がお題のフレームを読んで表示する（#91 PR 3）"
```

---

### Task 4: poker-web が `topic` フレームを受けてお題を出す

**Files:**
- Modify: `apps/poker-web/src/hooks/useSync.ts`・`src/pages/RoomPage.tsx`・`src/index.css`・`package.json`・`scripts/audit-dependency-direction.mjs`
- Create: `apps/poker-web/src/components/CurrentTopic.tsx`・`src/components/Markdown.tsx`・`tests/…`（既存の配置に合わせる）

**Interfaces:**
- Consumes: `TopicFrameSchema` / `Topic`（`@tasuki/topic-core`）・`parseBoundaryMessage`（`@tasuki/protocol`）・`parseMarkdown`（Task 1）
- Produces: `PokerSync.topic: Topic | null`・`<CurrentTopic topic={Topic} />`

- [ ] **Step 1: 同期フックの失敗するテストを書く**

poker-web の `useSync` の既存テスト（`git ls-files 'apps/poker-web/**useSync*'`）の形に合わせて:

- 「Given 接続済み / When お題のフレームが届く / Then `topic` にタイトルと本文が入り、`syncStale` は立たない」（Review Focus 4。**#212 は「捨てたフレームは必ず知らせる」なので、ここを見分けないと必ず立つ**）
- 「Given お題がある / When お題なしのフレームが届く / Then `topic` が null に戻る」

Run → FAIL

- [ ] **Step 2: 同期フックを実装する**

`package.json` に `"@tasuki/protocol"`・`"@tasuki/topic-core"`・`"@tasuki/markdown"`（いずれも `workspace:*`）、`scripts/audit-dependency-direction.mjs` の `"apps/poker-web"` に同じ 3 つを足す（注釈:「#91 PR 3: `topic` フレームを topic-core のスキーマで検め、お題を読むだけで出す。poker-core は topic-core を知らない（T1）」）。

`src/hooks/useSync.ts`:

- `PokerSync` に `topic: Topic | null;`（docstring は timer と同じ趣旨）
- `const [topic, setTopic] = useState<Topic | null>(null);`
- `handleMessage` の先頭（`parseServerMessage` より前）:

```ts
    // **お題のフレームは poker の契約より先に見分ける**（#91・spec §5.5）。
    // 順を逆にすると `parseServerMessage` が落とし、#212 の告知（同期できていません）が立つ。
    const topicFrame = parseBoundaryMessage(TopicFrameSchema, raw);
    if (topicFrame.isOk()) {
      setTopic(topicFrame.value.state.topic);
      return;
    }
```

- `onClose` では `topic` を畳まない（再接続して `join-room` が成立すれば、サーバーが改めて 1 通送る。畳むと再接続のたびにお題が一瞬消える）
- 返り値の `useMemo` に `topic` を足す（依存配列にも）

- [ ] **Step 3: 画面の失敗するテストを書く**

- 「Given お題がある / When ルーム画面を描く / Then 『お題』の見出しとタイトルが出て、説明は畳まれている」（`<details>` が `open` でない）
- 「Given お題の説明 / When 『説明を見る』を開く / Then 本文が読める」
- 「Given お題が無い / When ルーム画面を描く / Then お題の見出しは出ない」（E16）
- 文言の書体の検査（Task 3 と同じ形で `font-base.ts` を写し、`お題`・`説明を見る` を当てる）

Run → FAIL

- [ ] **Step 4: 表示を実装する**

`src/components/Markdown.tsx`: Task 2 の topic-web の描画をそのまま写す（クラス名 `md-*`、見出しの段 h4〜h6。**解析は写さない**）。`src/index.css` に topic-web の `.md*` の規則を写す（`apps/topic-web/src/index.css` の `.md` で始まる規則。**`font-size` は `--font-size-*` の 5 段で書く**）。

`src/components/CurrentTopic.tsx`:

```tsx
/**
 * いまのお題（#91・spec §5.5）。**poker は読むだけ**（spec T4）。
 *
 * 本文は畳んでおき、開けるようにする（見積もりの画面を本文で押し下げない）。
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から。
 */
import type { Topic } from '@tasuki/topic-core';
import { Markdown } from './Markdown';

export const TOPIC_HEADING = 'お題';
export const TOPIC_BODY_TOGGLE = '説明を見る';

export function CurrentTopic({ topic }: { topic: Topic }) {
  return (
    <section className="topic" aria-labelledby="poker-topic-heading">
      <h2 id="poker-topic-heading">{TOPIC_HEADING}</h2>
      <h3 className="topic-title">{topic.title}</h3>
      {topic.body !== '' && (
        <details className="topic-details">
          <summary>{TOPIC_BODY_TOGGLE}</summary>
          <Markdown source={topic.body} />
        </details>
      )}
    </section>
  );
}
```

`src/index.css` に `.topic`（**地を持たせる**: `background: var(--felt-900)`・枠線と角丸は topic-web の `.topic-current` と同じ。理由の注釈:「地の無い h2（`--gold`）は body の felt-700 の上で約 3.92:1 と AA を割る（PR 2 の topic-web の実測）」）と `.topic-title { overflow-wrap: anywhere; }` を足す。

`src/pages/RoomPage.tsx` の `<header>` の直後（`ErrorNote` の前）に `{sync.topic && <CurrentTopic topic={sync.topic} />}`。

- [ ] **Step 5: 通ることを確かめる**

```bash
pnpm --filter @tasuki/poker-web test && pnpm --filter @tasuki/poker-web typecheck && pnpm --filter @tasuki/poker-web lint
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
node scripts/audit-web-sync-boundary.mjs; echo "exit=$?"
```

- [ ] **Step 6: コミットする**

```bash
git add apps/poker-web scripts/audit-dependency-direction.mjs pnpm-lock.yaml
git commit -m "feat: poker がお題のフレームを読んで表示する（#91 PR 3）"
```

---

### Task 5: 同期サーバーの配信先を広げ、ハブの隔離を塞ぐ

**Files:**
- Modify: `apps/tasuki-sync/src/application/topic-broadcast.ts`・`handlers.ts`・`command-handlers/room-join.ts`・`command-handlers/room-create.ts`・`poker-handlers.ts`・`create-sync-server.ts`・`adapters/ws-adapter.ts`・`ports/topic-server-msg.ts`（注釈）
- Test: `test/live-ws.topic.test.ts`・`test/topic-handlers.test.ts`・`test/support/room-builder.ts`・`test/support/live-sync-server.ts`・ws-adapter の既存の隔離のテスト

**Interfaces:**
- Consumes: `TopicBroadcaster#sendCurrent`（PR 1）
- Produces: `HandlerDeps.topicBroadcaster: Pick<TopicBroadcaster, "sendCurrent">`（**必須**）・poker の `HandlerDeps.topicBroadcaster`（同じく必須）・`makeTestHandlers` が返す `topics`（`InMemoryTopicStore`。Task 6 が使う）

- [ ] **Step 1: 配信先の失敗するテストを書く**

`test/live-ws.topic.test.ts` の「timer・poker の接続は、お題の配信を受け取らない（この PR の配信先ではない）」を**逆の主張へ書き換える**（同じ 4 接続の準備を使う）:

```ts
/**
 * お題を掲げると、ルームの全接続（ハブ・timer・poker・お題）へ同じ状態が届く。
 *
 * **timer・poker の接続で見る**（お題の接続だけで見ると、配信先を狭める誤りと区別できない・spec §7.3）。
 *
 * @requirements #91 E2 E3
 */
describe("お題を掲げる・下ろすと、ルームの全接続へ届く", () => {
  it("topic.set の結果が、timer と poker の接続にも届く", async () => {
    // Given: 既存の 4 接続の準備
    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });
    // Then
    await timer.until((r) => r.some((m) => (m as { type: string }).type === "topic" && …title === "決めた"), "timer への配信");
    await poker.until((r) => r.some(…), "poker への配信");
  });

  it("topic.clear の結果（お題なし）が、timer と poker の接続にも届く", async () => { /* 同じ形 */ });
});
```

さらに E4:

```ts
/**
 * @requirements #91 E4
 */
describe("timer・poker の接続がルームへ入ると、いまのお題が 1 通届く", () => {
  it("お題を掲げたルームに timer で参加すると、参加の直後にそのお題が届く", async () => { … });
  it("お題を掲げたルームに poker で参加すると、参加の直後にそのお題が届く", async () => { … });
  it("timer で復帰（resumeToken）しても、そのお題が届く", async () => { … });
});
```

`test/support/live-sync-server.ts` の、timer・poker のクライアントが受信を型で絞っている箇所（293 行付近の注釈「PR の配信先…実際に `type: "topic"` のフレームが届くため」）を読み、`topic` フレームを受けても既存のテストの `take` が誤一致しないことを確かめる（**`take(m => m.type === "snapshot")` のような型で絞る待ち方なら影響しない**。`received.length` を数える待ち方があれば、その箇所だけ `topic` を除いて数える）。

Run: `pnpm --filter @tasuki/sync test -- live-ws.topic` → FAIL

- [ ] **Step 2: 配信先と参加時の 1 通を実装する**

`topic-broadcast.ts`:

```ts
/**
 * お題の状態を受け取る接続のツール。**ルームの全接続である**（spec T3・E2）。
 *
 * PR 1・2 の間はお題とハブだけだった（timer・poker は未知のフレームを捨てて利用者へ
 * 通知するため）。PR 3 で両者が `topic` フレームを先に見分けるようになったので足した。
 */
export const TOPIC_RECIPIENT_TOOLS: readonly (ToolId | null)[] = [TOOL_TOPIC, TOOL_HUB, TOOL_TIMER, TOOL_POKER];
```

冒頭の docstring の「配信先は PR ごとに広げる…PR 3 で両者が…読めるようになってから足す」を、現況（全接続）へ書き換える。

timer の入口: `HandlerDeps` に

```ts
  /**
   * いまのお題を参加・復帰した本人へ 1 通送る（#91・E4）。
   *
   * **必須にしてある**（理由は {@link HandlerDeps.tokens} と同じ）。既定を持たせると、
   * 注入を忘れた瞬間に timer で入った人にだけお題が出なくなり、しかもハブと
   * お題ツールでは正しく出るので誰も気づかない。
   */
  topicBroadcaster: Pick<TopicBroadcaster, "sendCurrent">;
```

を足し、`createRoomJoinHandler` と `createRoomCreateHandler` へ渡す。`room-join.ts` は `commit({ membership, timer });` の直後、`room-create.ts` は同じく `commit` の直後に `deps.topicBroadcaster.sendCurrent(connId, <コード>)`（注釈:「**名簿の保管のあとに呼ぶ**（ルームの在否を名簿で見るため・ハブと同じ）」）。

poker の入口: `poker-handlers.ts` の `HandlerDeps` に同じ `topicBroadcaster` を足し、`completeJoin` の `commit(state)` の直後（`persist` が false の枝でも）に `deps.topicBroadcaster.sendCurrent(ws.data.connId, roomId)`。

`create-sync-server.ts` の `makeHandlers({ … })` と `makePokerHandlers({ … })` に `topicBroadcaster` を渡す（`topicBroadcaster` は既にこの 2 つより上で組み立ててある）。

`test/support/room-builder.ts` の `makeTestHandlers`: **本物の `makeTopicBroadcaster` を組む**（何もしない既定にしない）。

```ts
  // お題の保管と配信は本番と同じ形で組む（#91 PR 3）。破棄経路（`createRoomDestroyer`）とも
  // **同じ保管を共有する** —— 別々にすると、破棄したルームのお題が残っても誰も気づかない。
  const topics = overrides?.topics ?? new InMemoryTopicStore();
  const topicFrames: Array<{ connIds: string[]; msg: TopicServerMsg }> = [];
  const topicBroadcaster = makeTopicBroadcaster({
    store,
    topics,
    send: (connIds, msg) => topicFrames.push({ connIds, msg }),
  });
```

`makeHandlers` に `topicBroadcaster` を、`createRoomDestroyer` に同じ `topics` を渡し、返り値に `topics` と `topicFrames` を足す。`TestHandlerOverrides` に `topics?` を足す。poker のテストの組み立て（`makePokerHandlers` を直接呼ぶテスト支援）にも同じく渡す。

`ports/topic-server-msg.ts` の注釈「この PR の配信先はお題の接続とハブの接続だけなので」を現況へ直す。`ws-adapter.ts` の `sendTopic` の docstring「この PR の配信先はお題の接続とハブの接続だけ」も同じ。

- [ ] **Step 3: ハブの同期 throw の隔離の失敗するテストを書く**

PR 1 の申し送り（「ハブの `handleHubMessage` にも同期 throw の隔離が無い」）。`ws-adapter.ts` の注釈（843 行付近）が既知の差分として名指ししている。

お題の経路の同じテストを探して写す:

```bash
git grep -n 'onTopicMessage' -- apps/tasuki-sync/test
```

見つかったテスト（`onTopicMessage` に同期で throw する関数を渡し、プロセスが落ちず `INTERNAL_ERROR` が返ることを見るもの）を、`onHubMessage` について同じ形で足す。テスト名は「ハブの処理が同期で例外を投げても、プロセスは落ちず内部エラーが返る」。

Run → FAIL（`uncaughtException` になるか、応答が返らない）

- [ ] **Step 4: ハブの隔離を実装する**

`ws-adapter.ts` の `handleHubMessage` を `handleTopicMessage` と同じ形（`try { void …catch(…) } catch { … }`）にする。`handleTopicMessage` の docstring の「⚠ `handleHubMessage` は同じ隔離を持たない（`.catch()` のみ）。…変更しない」を消し、`handleHubMessage` の docstring に隔離の理由（同期 throw が `uncaughtException` に達すると、同じプロセスの全ルームが消える）を書く。

- [ ] **Step 5: ハブの二重参加を実測する**

PR 1 の申し送り（「ハブの二重参加も未確認」）。**直す前に、いまの振る舞いを特徴づけのテストで固定する。** `test/live-ws.hub.test.ts` の形で:

- 1 本のハブの接続で、ルーム A に `room.join` した後、ルーム B に `room.join` を送る
- 観測: 2 通目への応答（`room.joined` か `error` か）・ルーム A の名簿にその接続がまだ載っているか（`server.store.get(A)` の `connections`）・ルーム A のお題を掲げたとき、その接続へ `topic` フレームが届くか

**判断の規則:**

- 2 通目が拒まれる、または A から外れて B だけに載る → 振る舞いをテストで固定して終わり
- **A と B の両方に載る** → 接続 ID からルームを引く処理（`findParticipantByConnId` を使う箇所）が曖昧になる欠陥である。**この PR では直さず、止まって利用者へ報告する**（直し方がハブの画面の遷移の設計に関わるため。お題の接続は PR 1 で 2 通目を `INVALID_COMMAND` にしている）

結果（どちらだったか）を Task 12 で spec §10 に書く。

- [ ] **Step 6: 通ることを確かめる**

```bash
pnpm --filter @tasuki/sync test; echo "exit=$?"
pnpm --filter @tasuki/sync typecheck; echo "exit=$?"
```

- [ ] **Step 7: コミットする**

```bash
git add apps/tasuki-sync
git commit -m "feat: お題をルームの全接続へ配り、ハブの例外を隔離する（#91 PR 3）"
```

---

### Task 6: 完成記録はサーバーが写したお題のタイトルを持つ

**Files:**
- Modify: `packages/timer-core/src/{aggregate.ts,wire.ts,schemas.ts,records.ts,events.ts,decide.ts}`・`apps/tasuki-sync/src/application/{handlers.ts,build-domain-command.ts,apply-room-level-event.ts}`・`apps/timer-web/src/sync/{snapshot-intents.ts,use-timer-sync.ts}`・`src/records/indexeddb.ts`・`src/ui/History.tsx`・`src/App.tsx`
- Create: `apps/timer-web/src/records/stored-record.ts`
- Test: `packages/timer-core/test/records.test.ts`・`apps/tasuki-sync/test/handlers.lifecycle.test.ts`・`apps/timer-web/test/sync/snapshot-intents.test.ts`・`test/records/stored-record.test.ts`（新規）・`test/ui/History.test.tsx`

**Interfaces:**
- Produces:
  - `CompletionRecord` = `{ id; roomId?; topicTitle: string | null; elapsedSeconds; members; totalSwitches; completedAt; driverCounts?; rounds? }`（`problemTitle` / `language` / `difficulty` は無くなる）
  - `buildCompletionRecord(agg, topicTitle: string | null, memberNames, now, roomId?)`
  - `DecideCommand` の `{ command: "session.complete"; topicTitle: string | null }`・イベント `SessionCompleted { now; topicTitle: string | null }`
  - `SnapshotIntent` の `persist-completion` は `record` をサーバーの記録から取る。新しい意図 `{ kind: "set-end"; endType: EndType }`
  - `normalizeStoredRecord(raw: unknown): CompletionRecord | null`（`src/records/stored-record.ts`）

- [ ] **Step 1: timer-core の失敗するテストを書く**

`packages/timer-core/test/records.test.ts`（既存の `buildCompletionRecord` のテストを新しい引数へ書き換え、次を足す）:

```ts
/**
 * @requirements #91 E17（お題の有無にかかわらず記録を作り、お題があればタイトルを写す）
 */
describe('完成記録にお題のタイトルを写す', () => {
  it('Given お題のタイトル / When 記録を作る / Then topicTitle に写り、言語と難易度は持たない', () => {
    // Given / When
    const record = buildCompletionRecord(anAggregate(), 'FizzBuzz', ['あや'], 1_000);
    // Then
    expect(record.topicTitle).toBe('FizzBuzz');
    expect(record).not.toHaveProperty('language');
    expect(record).not.toHaveProperty('difficulty');
    expect(record).not.toHaveProperty('problemTitle');
  });

  it('Given お題なし / When 記録を作る / Then topicTitle は null で記録はできる', () => {
    expect(buildCompletionRecord(anAggregate(), null, ['あや'], 1_000).topicTitle).toBeNull();
  });
});
```

`decide` のテストに「Given お題のタイトル / When session.complete / Then SessionCompleted がタイトルを運ぶ」（null も 1 件）。`schemas` のテストに「Given topicTitle が null の記録を持つ snapshot / When 検証する / Then 通る」「Given 旧い形（`problemTitle` だけ）の記録を持つ snapshot / When 検証する / Then 落ちる」（**後者は配布中の窓 2 の実在を固定するテスト**。spec §6）。

Run: `pnpm --filter @tasuki/timer-core test` → FAIL

- [ ] **Step 2: timer-core を実装する**

- `aggregate.ts` の `CompletionRecord`: `problemTitle` / `language` / `difficulty` を落とし、`topicTitle: string | null;` を足す（docstring:「完了した時点で掲げていたお題のタイトル（#91・spec T9）。お題なしで完了したら null。**本文は持たない**（`sessionRecords` は件数の上限が無く、毎回の snapshot で配られる）」）
- `schemas.ts` の `CompletionRecordSchema`: 同じく。**`topicTitle: v.nullable(v.string())`**（`nonEmptyString` にしない —— 1 件の値で snapshot 全体が落ちる型の欠陥を #276 D2 で直している）
- `records.ts`: `buildCompletionRecord(agg, topicTitle: string | null, memberNames, now, roomId?)`。`problem` と `config` の引数を落とす
- `events.ts`: `SessionCompleted` に `topicTitle: string | null;`（docstring:「アプリ層が値として渡す。timer-core は topic-core を知らない（spec T1・T9）」）
- `decide.ts`: `DecideCommand` の `session.complete` に `topicTitle: string | null`、`case "session.complete": return ok([{ type: "SessionCompleted", now, topicTitle: cmd.topicTitle }]);`

- [ ] **Step 3: 同期サーバーの失敗するテストを書く**

`test/handlers.lifecycle.test.ts` に（`makeTestHandlers` が返す `topics` を使う）:

```ts
/**
 * @requirements #91 E17 E19
 */
describe("完成記録とお題", () => {
  it("お題を掲げずに完了しても、完成記録ができてお題のタイトルは null になる", async () => {
    // **お題なしで見る**（お題ありで見ると、「お題があるときだけ記録を作る」誤りと区別できない・spec §7.3）
  });

  it("お題を掲げて完了すると、そのときのタイトルが記録に写り、本文は写らない", async () => {
    // Given: topics.put(code, { ...INITIAL_TOPIC_STATE, topic: { title: "FizzBuzz", body: "長い本文", source: "manual" } })
    // Then: record.topicTitle === "FizzBuzz" かつ JSON.stringify(record) に "長い本文" が含まれない
  });

  it("完了してロビーへ戻っても、お題は変わらない", async () => {
    // E19。完了 → phase.set setup の後に topics.get(code) が同じお題
  });
});
```

既存の「お題があるときだけ記録を作る」前提のテスト（`git grep -n 'sessionRecords' -- apps/tasuki-sync/test`）は、新しい前提へ書き換える。

Run → FAIL

- [ ] **Step 4: 同期サーバーを実装する**

`HandlerDeps` に:

```ts
  /**
   * お題の状態の保管（#91）。**完成記録にタイトルを写すためだけに読む**（spec T9）。
   * timer の文脈はお題を変えない（T4）ので `get` だけに絞る。
   */
  topics: Pick<TopicStore, "get">;
```

`build-domain-command.ts`: `case "session.complete": return { command: "session.complete" as const, topicTitle: null as string | null };`（注釈:「タイトルは handleRoomCommand が保管から埋める。wire からは受け取らない」）。

`handlers.ts` の `handleRoomCommand`、`driver.assign` の解決の後・`if (!domainCmd)` の前に:

```ts
    // 完成記録に写すお題のタイトル（#91・spec T9）。**完了した時点**の保管から引く。
    // wire では受け取らない —— 利用者が好きなタイトルを記録へ差し込めてしまう。
    if (domainCmd && domainCmd.command === "session.complete") {
      domainCmd.topicTitle = deps.topics.get(state.timer.code)?.topic?.title ?? null;
    }
```

`apply-room-level-event.ts` の `SessionCompleted`:

```ts
    case "SessionCompleted": {
      // 既に完成済みなら二重計上しない（complete の冪等性）
      if (room.phase === "celebration") return state;
      // **お題の有無にかかわらず記録を作る**（#91・spec T9・E17）。お題なしが既定になったので、
      // 「お題があるときだけ」を残すと大半のセッションで記録が消える（#273 の欠陥の拡大版）。
      const record = buildCompletionRecord(
        { session: room.session, clock: room.clock },
        event.topicTitle,
        rotationDisplayNames(state.membership, room),
        event.now,
        room.code,
      );
      return withTimer(state, { ...room, phase: "celebration", sessionRecords: [...room.sessionRecords, record] });
    }
```

`create-sync-server.ts` の `makeHandlers({ … })` に `topics` を渡す。

- [ ] **Step 5: timer-web の失敗するテストを書く**

`test/sync/snapshot-intents.test.ts`（既存の完成記録のテストはサーバーの記録を前提に書き換える。`aRoomView` に `sessionRecords` を渡せるようにする）:

```ts
/**
 * @requirements #91 E17（端末はサーバーが作った記録をそのまま保存する）
 */
describe('完了の snapshot から終わり方と記録を決める', () => {
  it('Given 記録が 1 件増えて完了へ入った / When 意図を決める / Then その記録を保存し、完成と出す', () => {
    // Given
    const record = aRecord({ id: 'r1', topicTitle: null });
    const prev = aRoomView({ phase: 'session', sessionRecords: [] });
    const next = aRoomView({ phase: 'celebration', sessionRecords: [record] });
    // When
    const intents = decideSnapshotIntents(prev, next, ctx());
    // Then
    expect(intents).toContainEqual({ kind: 'persist-completion', record });
    expect(intents).toContainEqual({ kind: 'set-end', endType: 'complete' });
  });

  it('Given 記録が増えずに完了へ入った（別の人が中断した） / When 意図を決める / Then 保存せず、中断と出す', () => {
    // Review Focus 1。押していない端末でも中断と分かる
  });

  it('Given 前の snapshot を持たずに完了画面へ入った / When 意図を決める / Then 記録を保存しない', () => {
    // Review Focus 2。再読込・完了後に入ってきた端末
  });

  it('Given 完了画面のまま次の snapshot が届いた / When 意図を決める / Then もう一度は保存しない', () => { … });
});
```

**Step 5 の 2 件目を書いたら、Step 6 の前に main の実装（`git stash` せず、`git show main:apps/timer-web/src/sync/snapshot-intents.ts` を読む）で同じ入力を考え、「中断でも記録を作る」が実在したかを確かめて PR 本文に書く**（計画の段では読んだだけで、動かしていない）。

`test/records/stored-record.test.ts`（新規）:

```ts
/**
 * @requirements #91 E18（旧い形の記録は、お題名を記録のお題のタイトルとして出す）
 */
describe('端末に保存された記録を読む', () => {
  it('Given 旧い形（problemTitle・language・difficulty） / When 読む / Then topicTitle に畳まれる', () => {
    // Given
    const raw = { id: 'a', problemTitle: 'FizzBuzz', language: 'Go', difficulty: 'easy', elapsedSeconds: 1, members: [], totalSwitches: 0, completedAt: 1 };
    // When
    const record = normalizeStoredRecord(raw);
    // Then
    expect(record?.topicTitle).toBe('FizzBuzz');
  });

  it('Given 新しい形で topicTitle が null / When 読む / Then null のまま（旧い形と取り違えない）', () => { … });

  it('Given 必須の項目が欠けた値 / When 読む / Then null（一覧から外す）', () => { … });
});
```

`test/ui/History.test.tsx`:

- 「Given お題なしの記録 / When 履歴を描く / Then 見出しに『お題なし』、削除ボタンの名前に完了日時が入る」（E23）
- 「Given 同じタイトルの記録が 2 件 / When 履歴を描く / Then 2 つの削除ボタンの名前が違う」
- 既存の `language`・`difficulty` を出す行のテストは消す

Run → FAIL

- [ ] **Step 6: timer-web を実装する**

`src/sync/snapshot-intents.ts`:

- `SnapshotIntent` に `| { kind: "set-end"; endType: EndType }` を足す（`EndType` は `ui/Summary.tsx` から型だけ import）
- `SnapshotContext` から `recordSaved` と `endType` を落とす
- 手順 4 を置き換える:

```ts
  // 4. 完了へ**入った瞬間**に、終わり方と記録を決める（#91 PR 3）。
  //
  //    **記録は端末で作らない。** サーバーが完了の時点で作った記録（お題のタイトルを写したもの・
  //    spec T9）が `sessionRecords` に 1 件増えている。それをそのまま保存するので、タイトルは
  //    必ずサーバーの写しと一致し、ID もサーバーのものになる（再読込で二重に保存しない）。
  //
  //    **終わり方も snapshot から導く。** 完成ならサーバーが記録を 1 件足し、中断なら足さない。
  //    かつては押した人の端末だけが「中断」を知っており、押していない端末は中断でも記録を作っていた。
  //
  //    **前の snapshot が無い端末（再読込・完了の後に入ってきた人）は判定しない。** 増えたかどうかを
  //    比べる相手が無い。記録も出さず、保存もしない（受容・spec §10）。
  if (prev !== null && prev.phase !== "celebration" && next.phase === "celebration") {
    const added = next.sessionRecords.length > prev.sessionRecords.length
      ? next.sessionRecords[next.sessionRecords.length - 1]
      : undefined;
    if (added !== undefined) {
      intents.push({ kind: "set-end", endType: "complete" });
      intents.push({ kind: "persist-completion", record: added });
    } else {
      intents.push({ kind: "set-end", endType: "abort" });
    }
  }
```

- `buildCompletionRecord` の import を消す

`src/sync/use-timer-sync.ts`:

- `recordSavedRef` を消す（完了へ入った瞬間にだけ保存するので、二重保存を防ぐ印が要らない）。`handleRoom` の `set-end` の分岐で `setEndType(intent.endType)`。`clear-completion` は `setRecord(null); setEndType("complete");` だけになる
- `complete()` と `abort()` から `setEndType` / `setRecord` を消す（終わり方は snapshot が決める。押した本人だけ先に変えると、押していない端末と食い違う）
- `leave-room` の `recordSavedRef.current = false;` を消す

`src/records/stored-record.ts`:

```ts
/**
 * 端末（IndexedDB）に保存された完成記録を、いまの形へ畳む（#91・spec §5.5・E18）。
 *
 * #91 PR 3 より前の記録は `problemTitle`（必須）と `language` / `difficulty` を持つ。
 * いまの記録は `topicTitle`（null 可）を持つ。**`topicTitle` の有無で見分ける** ——
 * null を「無い」と取り違えると、お題なしの新しい記録を旧い記録として読んでしまう。
 */
import type { CompletionRecord } from "@tasuki/timer-core";

export function normalizeStoredRecord(raw: unknown): CompletionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.completedAt !== "number") return null;
  if (typeof r.elapsedSeconds !== "number" || typeof r.totalSwitches !== "number") return null;
  if (!Array.isArray(r.members)) return null;
  const topicTitle =
    "topicTitle" in r
      ? (typeof r.topicTitle === "string" ? r.topicTitle : null)
      : (typeof r.problemTitle === "string" ? r.problemTitle : null);
  return {
    id: r.id,
    ...(typeof r.roomId === "string" ? { roomId: r.roomId } : {}),
    topicTitle,
    elapsedSeconds: r.elapsedSeconds,
    members: r.members.filter((m): m is string => typeof m === "string"),
    totalSwitches: r.totalSwitches,
    completedAt: r.completedAt,
    ...(Array.isArray(r.driverCounts) ? { driverCounts: r.driverCounts.filter((n): n is number => typeof n === "number") } : {}),
    ...(typeof r.rounds === "number" ? { rounds: r.rounds } : {}),
  };
}
```

`src/records/indexeddb.ts` の `loadRecords` は `request.result` を `normalizeStoredRecord` に通し、`null` を外して返す（`DB_VERSION` は変えない —— 形の移行は読むときに行い、保存し直さない）。

`src/ui/History.tsx`:

```tsx
/** お題なしで完了した記録の見出し（#91・E23）。 */
const NO_TOPIC_LABEL = "お題なし";
// …
<p className="truncate font-bold text-[var(--bone)]">{record.topicTitle ?? NO_TOPIC_LABEL}</p>
// 言語・難易度の行は消す
<GhostButton
  onClick={() => handleDelete(record.id)}
  // **完了日時を名前に入れる**（E23）。タイトルだけだと、お題なしの記録や同じお題の記録が
  // 並んだとき、支援技術から削除ボタンを区別できない。
  aria-label={`${formatCompletedAt(record.completedAt)} に完了した「${record.topicTitle ?? NO_TOPIC_LABEL}」の記録を削除`}
```

（「に完了した」「の記録を削除」「お題なし」は計画の段で base 層に収まることを実測済み。）

- [ ] **Step 7: 通ることを確かめる**

```bash
pnpm --filter @tasuki/timer-core test && pnpm --filter @tasuki/timer-core typecheck
pnpm --filter @tasuki/sync test; echo "exit=$?"
pnpm --filter @tasuki/sync typecheck
pnpm --filter @tasuki/timer-web test && pnpm --filter @tasuki/timer-web typecheck
git grep -n 'problemTitle' -- packages apps e2e ':!**/stored-record*'
```

Expected: テストと型検査は成功。**最後の grep は 0 件**（旧い形を読む `stored-record.ts` とそのテストだけが名指ししてよい）。E2E の `e2e/support/timer.ts` の `corruptSnapshotFrame` が `problemTitle` を持つので、ここで新しい形（`topicTitle: 'FizzBuzz'`・`language` と `difficulty` を落とす）へ直す。**壊しているのは `members: ['']` であって題名ではない**ことを注釈で確かめてから直す

- [ ] **Step 8: コミットする**

```bash
git add packages/timer-core apps/tasuki-sync apps/timer-web e2e/support/timer.ts
git commit -m "feat: 完成記録はお題の有無によらず作り、サーバーが写したタイトルを端末が保存する（#91 PR 3）"
```

---

### Task 7: timer-web のお題作成を撤去し、ロビーを 1 画面にする

**Files:**
- Delete: `apps/timer-web/src/ai/`・`src/ui/components/{ProblemEditor,ProblemConfigPanel,ProblemModeToggle,AiUnlockPanel}.tsx`・`src/ui/problem-generation.ts`・`src/ui/problem-text.ts`・対応するテスト（`test/ui/{AiUnlockPanel,ProblemConfigPanel,ProblemEditor,ProblemModeToggle}.test.tsx`・`test/ui/App.problem-generation.test.tsx`・`test/ui/Lobby.problem-gate.test.tsx`・`test/ui/Session.problem.test.tsx`・`test/ui/problem-generation.test.ts`・`test/ui/problem-text.test.ts`）
- Modify: `src/App.tsx`・`src/ui/Lobby.tsx`・`src/ui/Session.tsx`・`src/sync/{use-timer-sync.ts,commands.ts,client.ts,dispatch.ts}`・`src/prefs/local-prefs.ts`・`src/ui/use-latest-ref.ts`（注釈）・`vite.config.ts`・`vitest.config.ts`・残りのテスト

**Interfaces:**
- Consumes: `TopicCard`（Task 3）
- Produces: `TimerCommands` から `setProblemMode` / `editProblem` / `requestProblem` / `aiUnlock` が消える。`TimerSync` から `generatingProblem` / `showsFallbackNotice` / `regenerateProblem` が消える。`room.join` の送信から `hasAiKey` が消える

- [ ] **Step 1: ロビーが 1 画面になる失敗するテストを書く**

`test/ui/Lobby.*.test.tsx` のうち、タブを操作しているもの（`git grep -n "getByRole('tab'\|getByRole(\"tab\"" -- apps/timer-web/test`）を書き換え、次を足す:

- 「Given ロビー / When 描く / Then タブは無く、開始ボタンと参加者の一覧が 1 画面に出る」（`queryByRole('tablist')` が null）
- 「Given お題が無いロビー / When 描く / Then 開始ボタンは押せる」（**いまは `problemEnabled && !room.problem` で押せない**。お題なしが既定になった以上、押せないと誰も始められない）

Run → FAIL

- [ ] **Step 2: 撤去する**

1. **ロビー**: `Tabs` をやめ、「ルーム」タブの `content`（`<div className="space-y-6">…</div>`）をそのまま返す。最上部に `{topic && <TopicCard topic={topic} />}`（Task 3 で「ルーム」タブの中に置いたもの）。`startButton` から `disabled={problemEnabled && !room.problem}` を外す。`problemEnabled`・お題タブの `items[1]`・お題まわりの props（`onEditProblem`・`onRegenerateProblem`・`onPasteProblem`・`onCopyProblem`・`generatingProblem`・`showsFallbackNotice`・`onAiUnlock`・`onProblemModeSet`）と import を消す
2. **セッション**: `room.config.problemEnabled !== false && (room.problem ? … : awaitingProblem && …)` の塊を消す（Task 3 で置いた `TopicCard` が代わる）。お題まわりの props（`awaitingProblem`・`generatingProblem`・`showsFallbackNotice`・`aiUnlocked`・`aiMode`・`onEditProblem`・`onCopyProblem`・`onRegenerateProblem`・`onPasteProblem`）を消す
3. **App**: `copyProblem`・`pasteProblem`・`formatProblemText` の import・`Lobby` / `Session` へ渡していたお題の props を消す
4. **同期フック**: `handleNeedProblem`・`resolveProvider`・`NoAiProvider` / `ProblemProvider` の import・`isGeneratingProblem` / `showsFallbackNotice` の import と返り値・`regenerateProblem`・`startSession` の `requestProblem` の 2 行（`problemEnabled` の判定ごと）・`room.join` の 2 箇所の `hasAiKey: false` を消す。`TimerSync` の型からも消す
5. **commands**: `setProblemMode`・`editProblem`・`requestProblem`・`aiUnlock` を消す
6. **client / dispatch**: `onNeedProblem` と `need-problem` の分岐を消す
7. **local-prefs**: `RANDOM_LANG_POOL_KEY` とその読み書きを消し、冒頭の「ここに残る 3 つは生きている」の数と一覧を直す（**数を書かずに性質で指す**形へ直すのがよい）
8. **vite / vitest の alias**: `@tasuki/timer-core/problem` の行を消す。`packages/timer-core/src/index.ts` の冒頭の「並んでいるのは 8 モジュールだけ（… problem / records）」も数ごと直す（Task 9 で `problem.ts` が消えるので、ここで先に直しておく）
9. 上の「Delete」のファイルを `git rm` する

- [ ] **Step 3: 撤去を grep で数える**

```bash
git grep -nE 'ProblemEditor|ProblemConfigPanel|ProblemModeToggle|AiUnlockPanel|problem-generation|problem-text|NoAiProvider|ProblemProvider|need-problem|onNeedProblem|hasAiKey|problemEnabled|problemMode|problemGeneration|aiUnlock|generatingProblem|showsFallbackNotice|regenerateProblem|requestProblem|editProblem|RANDOM_LANG_POOL' -- apps/timer-web
```

Expected: **0 件**。残ったものは 1 件ずつ消すか、残す理由を注釈に書く（例: 過去の経緯を語る注釈で記号名が要るなら、「#91 PR 3 で撤去した」と書き添える）

- [ ] **Step 4: 通ることを確かめる**

```bash
pnpm --filter @tasuki/timer-web test && pnpm --filter @tasuki/timer-web typecheck && pnpm --filter @tasuki/timer-web lint && pnpm --filter @tasuki/timer-web build
```

- [ ] **Step 5: コミットする**

```bash
git add -A apps/timer-web packages/timer-core/src/index.ts
git commit -m "feat: timer のお題作成を撤去し、ロビーを 1 画面にする（#91 PR 3）"
```

---

### Task 8: 同期サーバーの旧いお題の経路を撤去する

**Files:**
- Delete: `apps/tasuki-sync/src/application/{problem-delegation.ts,lobby-problem.ts}`・`command-handlers/{ai-unlock.ts,problem-request.ts,problem-submit.ts}`・`adapters/claude-cli-problem-provider.ts`・`ports/server-problem-provider.ts`・テスト（`test/{claude-cli-problem-provider,handlers.ai-unlock,handlers.problem,lobby-problem-autorequest,problem-delegation.ai,problem-delegation.clock,problem-delegation,problem-generation-state}.test.ts`）
- Modify: `handlers.ts`・`command-handlers/{room-join,room-create,participant-remove}.ts`・`join-room.ts`・`initial-timer-state.ts`・`timer-snapshot-dto.ts`・`apply-room-level-event.ts`・`build-domain-command.ts`・`destroy-room.ts`・`rate-limit-gate.ts`・`topic-generation.ts`・`topic-handlers.ts`・`log/vocabulary.ts`・`adapters/claude-cli-topic-provider.ts`・`ports/server-topic-provider.ts`・`create-sync-server.ts`・`config.ts`・`server.ts`・`listening-log.ts`（注釈）・`scripts/quality-{experiment,judge}.mjs`・残りのテスト

**Interfaces:**
- Produces: `ProviderFailure` と `ProviderFailureReason` は `ports/server-topic-provider.ts` から export する

- [ ] **Step 1: `ProviderFailure` を移す（振る舞いを変えない移設）**

`ports/server-problem-provider.ts` の `ProviderFailure` クラスと `ProviderFailureReason` 型を、注釈ごと `ports/server-topic-provider.ts` へ移す。冒頭の「失敗は `ProviderFailure`（`server-problem-provider.ts`）で投げる。PR 3 でこちらへ移す。」を消す。import を張り替える:

```bash
git grep -ln 'server-problem-provider' -- apps/tasuki-sync
```

`topic-generation.ts`・`claude-cli-topic-provider.ts`・`log/vocabulary.ts`（注釈の「`ProviderFailureReason`（`ports/server-problem-provider.ts`）と 1 対 1」）・テストを直す。

```bash
pnpm --filter @tasuki/sync test; pnpm --filter @tasuki/sync typecheck
git add -A apps/tasuki-sync && git commit -m "refactor: ProviderFailure をお題の provider のポートへ移す（#91 PR 3）"
```

- [ ] **Step 2: 旧い経路を外す**

1. `handlers.ts`: `delegator` と `aiUnlockKey` を `HandlerDeps` から消す。`problem.request` / `problem.submit` / `ai.unlock` の分岐・`handleAiUnlock` / `handleProblemRequest` / `handleProblemSubmit` の組み立て・`fillLobbyProblem` / `regenerateLobbyProblem` の呼び出し（`configBefore` を控える行ごと）と import を消す。`rateLimitGate` の「★ room.join と ai.unlock は…同一インスタンスのバケツを共有する」の注釈を現況へ直す —— **いまこのゲートを共有するのは、timer の `room.join`・ハブの参加・お題ツールの参加と `ai.unlock`**（`create-sync-server.ts` が `handlers.rateLimitGate` をハブとお題へ渡す）。**経路を列挙せず、「入室と合言葉の照合を行う入口はすべてこのゲートを通す」と性質で書く**
2. `room-join.ts` / `room-create.ts`: `delegator` と `fillLobbyProblem` を消す。`room-join.ts` の `hasAiKey` を消す
3. `join-room.ts`: 入力の `hasAiKey` と `aiKeyHolders` を書く分岐を消す
4. `participant-remove.ts`: `aiKeyHolders` の書き換えを消す
5. `initial-timer-state.ts`: `language` / `difficulty`（`DEFAULT_LANGUAGE` / `DEFAULT_DIFFICULTY`）・`problem`・`aiKeyHolders` を消す
6. `timer-snapshot-dto.ts`: `problem`・`problemMode`・`aiUnlocked`・`problemGeneration`・`hasAiKey` を載せる行と台帳の項目 8 を消す（台帳に「#91 PR 3 で落とした」を 1 行残す —— **振る舞いの台帳から項目が消えた理由が追えなくなる**）
7. `apply-room-level-event.ts`: `PhaseSet` のお題を落とす分岐（`usesLobbyProblem` の import ごと）と長い注釈、`ProblemSet` / `ProblemEdited` / `ProblemModeSet` の case を消す。`PhaseSet` の注釈に「お題はルームのもので、timer のセッションをまたいで残る（#91・spec T11・E19）。#273 の『前のセッションのお題を持ち越さない』は廃止した」と書く
8. `build-domain-command.ts`: `problem.edit` / `problem.mode.set` の case と `ProblemMode` の import を消す
9. `destroy-room.ts`: `delegator` を消す（`delegator?.cancel(roomCode)` の行と deps）
10. `create-sync-server.ts`: `ProblemDelegator`・`ClaudeCliProblemProvider`・`serverProvider`・`delegator`（組み立て・`makeHandlers` と `createRoomDestroyer` への受け渡し・`close()` の `delegator.cancelAll()`）・`makeHandlers` への `aiUnlockKey` を消す。`aiLimiter` の注釈「timer の `delegator` と同じインスタンスを渡す」を「サーバー全体で 1 つの予算」へ直す。冒頭の docstring の `delegator` の列挙も直す
11. `rate-limit-gate.ts`・`topic-handlers.ts`・`topic-generation.ts`・`destroy-room.ts`・`ports/timer-store.ts` の注釈で、消したファイル（`ai-unlock.ts`・`problem-delegation.ts`）を名指ししている箇所を直す。**`topic-handlers.ts` の「手順は `command-handlers/ai-unlock.ts` を写す」は、写した手順そのもの（定数時間の照合・存在の秘匿・ゲートの積算）を注釈に書き下ろす**（写し元が消えるので）
12. `config.ts`・`server.ts`・`listening-log.ts`: `aiProblemModel` / `AI_PROBLEM_MODEL` は**名前を変えない**。注釈を「お題（topic）の AI 生成に使うモデル。env 名は #91 以前からのものを据え置く」へ直す
13. `scripts/quality-experiment.mjs`: `import { buildProblemPrompt, validateProblem } from "@tasuki/timer-core";` を `import { buildTopicPrompt, validateTopicDraft } from "@tasuki/topic-core";` へ。`buildProblemPrompt(language, difficulty)` → `buildTopicPrompt(language, difficulty)`、`validateProblem(raw)` → `validateTopicDraft(raw)`（戻り値の扱いは `validateTopicDraft` の `Result` に合わせる）。`quality-judge.mjs` は採点するフィールドを `title` / `body` に合わせる。**実行はしない**（OAuth トークンと課金が要る）。`node --check` だけ通す
14. 上の「Delete」のファイルを `git rm` する
15. 残りのテストを直す: 型検査の赤と、`hasAiKey`・`aiKeyHolders`・`problem` を造作に持つテスト（`git grep -ln 'hasAiKey\|aiKeyHolders\|problem' -- apps/tasuki-sync/test`）。`join-rate-limit.test.ts` の「room.join と ai.unlock のレート制限バケツの共有」（timer の `ai.unlock`）は消す —— **同じ主張はお題の `ai.unlock` について `live-ws.topic.test.ts` が持っている**（削除の前にそのテストが緑であることを見る）

- [ ] **Step 3: 旧いクライアントの参加が通ることを固定する**

`test/live-ws.room-ops.test.ts`（または timer の参加の実 WS テスト）に:

```ts
/**
 * 配布中の窓 3（古い web × 新しいサーバー）で、古い timer の参加が通ることを固定する（spec §6）。
 * 古い timer は `hasAiKey` を付けて送る。スキーマは未知の項目を出力に残さないので通る。
 */
it("hasAiKey を付けた旧い形の room.join でも参加できる", async () => { … });
```

- [ ] **Step 4: 撤去を grep で数える**

```bash
git grep -nE 'ProblemDelegator|problem-delegation|lobby-problem|fillLobbyProblem|regenerateLobbyProblem|usesLobbyProblem|ClaudeCliProblemProvider|claude-cli-problem-provider|server-problem-provider|ServerProblemProvider|problem\.request|problem\.submit|problem\.edit|problem\.mode\.set|need-problem|hasAiKey|aiKeyHolders|STALE_SUBMISSION|DELEGATION_UNAVAILABLE|problemGeneration|problemMode' -- apps/tasuki-sync
```

Expected: **0 件**（Step 3 の旧いクライアントのテストの `hasAiKey` と、その注釈だけは残ってよい。残したものを PR 本文に書く）

- [ ] **Step 5: 通ることを確かめる**

```bash
pnpm --filter @tasuki/sync test; echo "exit=$?"
pnpm --filter @tasuki/sync typecheck; echo "exit=$?"
node --check apps/tasuki-sync/scripts/quality-experiment.mjs && node --check apps/tasuki-sync/scripts/quality-judge.mjs
```

- [ ] **Step 6: コミットする**

```bash
git add -A apps/tasuki-sync
git commit -m "feat: 同期サーバーから timer のお題の経路を撤去する（#91 PR 3）"
```

---

### Task 9: timer-core からお題を撤去する

**Files:**
- Delete: `packages/timer-core/src/{problem.ts,problem-bank.ts}`・`test/{problem.test.ts,problem.golden.test.ts,ai-unlock.test.ts,schemas.problem-enabled.test.ts}`
- Modify: `src/{aggregate.ts,wire.ts,schemas.ts,decide.ts,events.ts,evolve.ts,errors.ts,error-messages.ts,index.ts}`・残りのテスト・`packages/topic-core/src/limits.ts`（注釈）・`scripts/audit-structure.mjs`（例外表）

- [ ] **Step 1: 撤去する**

spec §5.2 の「消える」をすべて消す:

- `aggregate.ts`: `Problem` / `ProblemSource` / `ProblemMode` / `ProblemGeneration`・`TimerConfig.language` / `difficulty` / `problemEnabled`・`TimerState.problem` / `problemMode` / `aiUnlocked` / `problemGeneration` / `aiKeyHolders`・`MAX_PROBLEM_REQUIREMENTS` / `MAX_PROBLEM_TITLE` / `MAX_PROBLEM_TEXT` / `MAX_PROBLEM_HINT` / `MAX_PROBLEM_HINTS` / `MAX_CONFIG_LANGUAGE` / `MAX_CONFIG_DIFFICULTY` / `MAX_AI_UNLOCK_KEY`
- `wire.ts`: `Room.problem` / `problemMode` / `aiUnlocked` / `problemGeneration`・`Participant.hasAiKey`。末尾の「かつて…あった」の注記の並びに、#91 PR 3 で落としたものを 1 段落足す（**`RoomSchema` は非 strict なので、これらを載せた古い snapshot も読める。窓 2 の読み方**）
- `schemas.ts`: `SessionConfigSchema` の 3 項目・`ProblemSchema`・`RoomJoinCommand.hasAiKey`・`ProblemRequestCommand` / `ProblemSubmitCommand` / `ProblemEditCommand` / `ProblemModeSetCommand` / `AiUnlockCommand`（と `CommandSchema` の並び）・`ProblemPatchSchema`・`ParticipantSchema.hasAiKey`・`RoomSchema` のお題の 4 項目・`ProblemGenerationSchema`・`SignalNeedProblemMsg`・使われなくなった文字列スキーマ（`problemTitleStr` など）と import
- `decide.ts`: `problem.edit` / `problem.mode.set` の型と case・`decideProblemEdit`・`decideConfigSet` の `language` / `difficulty` / `problemEnabled` の行
- `events.ts`: `ProblemSet` / `ProblemEdited` / `ProblemModeSet`
- `evolve.ts`: 同 3 つの case。`buildConfigFromReset` の `language` / `difficulty`
- `errors.ts`: `DELEGATION_UNAVAILABLE` / `STALE_SUBMISSION` / `AI_UNLOCK_FAILED`（「お題の委譲」「AI 解錠」の見出しごと）・`InputLimitExceeded`（`problem.edit` だけが使っていた。`git grep -n InputLimitExceeded` で確かめる）。**消した理由を注記する**: 「#91 PR 3 で発行元ごと消えた。旧いサーバーの応答として届く経路も無い —— 新しい timer はこれらを起こすコマンド（`problem.request` / `ai.unlock`）を送らない」（FR-137・SC-047 の「旧いサーバーの応答を引ける」の対象外である根拠）
- `error-messages.ts`: 同じコードの文言
- `index.ts`: お題の型と `validateProblem` / `pickFallback` / `buildProblemPrompt` の export。冒頭の注記の `validateProblem` / `ProblemValidationError` の例と「8 モジュール」を直す
- `packages/topic-core/src/limits.ts` の `MAX_AI_UNLOCK_KEY` の注釈が `packages/timer-core/src/aggregate.ts:337` を名指ししているので、「かつて timer-core に同じ値があった（#91 PR 3 で撤去）」へ直す
- テスト: 上の「Delete」を `git rm`。残りは型検査の赤に従って直す

- [ ] **Step 2: 例外表と散文を直す**

```bash
node scripts/audit-structure.mjs; echo "exit=$?"
```

`RoomSchema` の SC-039③ の例外（理由が `packages/timer-core/test/ai-unlock.test.ts` を名指ししている）が腐る。`RoomSchema` がまだ外から直接使われているか（`git grep -n 'RoomSchema' -- ':!packages/timer-core/src'`）を見て、使われていれば理由を書き直し、使われていなければ例外を消して `export` を外す。**ほかに赤が出たら同じ手順で直す**。

- [ ] **Step 3: 撤去を全体で grep する**

```bash
git grep -nE '\bProblem\b|ProblemSource|ProblemMode|ProblemGeneration|ProblemSchema|validateProblem|pickFallback\b|buildProblemPrompt|FALLBACK_PROBLEMS|problem-bank|MAX_PROBLEM_|MAX_CONFIG_LANGUAGE|MAX_CONFIG_DIFFICULTY|problemEnabled|hasAiKey|aiKeyHolders|need-problem|AI_UNLOCK_FAILED|STALE_SUBMISSION|DELEGATION_UNAVAILABLE|InputLimitExceeded' -- packages apps e2e scripts ':!scripts/mutations'
```

Expected: **0 件**（Task 8 Step 3 の旧いクライアントのテストの `hasAiKey` を除く）。`scripts/mutations` は Task 10 で扱う

- [ ] **Step 4: 全体が通ることを確かめる**

```bash
pnpm test; echo "exit=$?"
pnpm -r typecheck; echo "exit=$?"
pnpm -r lint; echo "exit=$?"
```

- [ ] **Step 5: コミットする**

```bash
git add -A packages apps scripts/audit-structure.mjs
git commit -m "feat: timer-core からお題を撤去する（#91 PR 3）"
```

---

### Task 10: 変異検査（原則 VII）

**Files:**
- Modify: `scripts/mutation-check.mjs`
- Delete / Create: `scripts/mutations/*.patch`

**変異 ID は並びに頼らず、既存の最大値（95）から採番する**（`MUTATIONS` は ID 順に並んでいない。並列で作業しているブランチがあれば、その最大値も見る）。

- [ ] **Step 1: 意味を失った変異を消す**

撤去した実装を壊すものと、解析の写しを壊すもの:

| ID | 消す理由 |
|---|---|
| m07・m43・m44・m45・m46・m47 | お題の生成の帳簿（`ProblemDelegator`・`pickFallback`・timer-web の生成中の表示）を壊すもの。実装ごと消えた |
| m39・m40 | 「新しいセッションで前のお題を持ち越さない」（#273）を壊すもの。規則ごと廃止した（spec T11） |
| m72 | 端末が完成記録の名前を席から引く処理を壊すもの。端末は記録を組み立てなくなった（Task 6） |
| m94・m95 | topic-web・timer-web の Markdown の写しを壊すもの。解析は `@tasuki/markdown` へ移った（m107 が引き継ぐ） |

`mutation-check.mjs` の該当項目と `scripts/mutations/` のパッチを消す。**消す前に 1 件ずつ、壊している対象が本当に無くなったかを `git grep` で見る**（例: m72 はパッチの中身を読み、壊している関数を grep する）。

- [ ] **Step 2: 当たらなくなった変異を作り直す**

```bash
node scripts/mutation-check.mjs; echo "exit=$?"
```

**パッチが当たらない変異があると、そこで止まって以降が全部無検査になる**（メモリ「書き換えたら変異検査」）。止まったものを 1 件ずつ、いまのコードに対して同じ壊し方で作り直す。見込み: m27（timer の名簿の絞り込み・文脈に `hasAiKey` がある）・m80（破棄で `delegator` の隣を触る）・m85（配信先の行が変わった）・m83。**作り直すときは作業ツリーを clean にしてから**（`git status --porcelain` が空であることを見る）。

- [ ] **Step 3: 新しい変異を足す**

| ID | 壊し方 | 赤になるテスト | 守る EARS |
|---|---|---|---|
| m96 | `TOPIC_RECIPIENT_TOOLS` から `TOOL_TIMER` を落とす | `live-ws.topic.test.ts`「timer と poker の接続にも届く」 | E2 |
| m97 | `SessionCompleted` で `event.topicTitle !== null` のときだけ記録を作る | `handlers.lifecycle.test.ts`「お題を掲げずに完了しても…」 | E17 |
| m98 | timer の参加で `topicBroadcaster.sendCurrent` を呼ばない | `live-ws.topic.test.ts`「timer で参加すると…届く」 | E4 |
| m99 | timer-web の `dispatch.ts` でお題のフレームの見分けを外す | `dispatch.test.ts`「onTopic に状態が渡り、捨てたとは言わない」 | E15 |
| m100 | poker-web の `useSync.ts` でお題のフレームの見分けを外す | `useSync` のテスト「syncStale は立たない」 | E15 |
| m101 | `normalizeStoredRecord` が `problemTitle` を読まない | `stored-record.test.ts`「旧い形…畳まれる」 | E18 |
| m102 | 履歴の削除ボタンの名前から完了日時を落とす | `History.test.tsx`「2 つの削除ボタンの名前が違う」 | E23 |
| m103 | `snapshot-intents.ts` で記録が増えたかを見ずに保存する | `snapshot-intents.test.ts`「別の人が中断した…保存せず」 | E17 |
| m104 | `snapshot-intents.ts` で前の snapshot が無くても保存する | 同「前の snapshot を持たずに…保存しない」 | — |
| m105 | 完成記録の `topicTitle` を `handleRoomCommand` で埋めない（常に null） | `handlers.lifecycle.test.ts`「そのときのタイトルが記録に写り」 | E17 |
| m106 | `@tasuki/markdown` のリンクの表示と URL の上限を外す（`{0,200}` → `*`） | `performance.test.ts` | spec §5.4 |
| m107 | `@tasuki/markdown` の改行の正規化から U+2028 / U+2029 を外し、前進の保証を消す | `blocks.test.ts`「行区切りの文字を含む本文」 | spec §5.4 |

各項目の `note` には、壊すと利用者に何が起きるかを書く（既存の項目の書き方に合わせる）。m107 は m94 / m95 と同じく**ワーカーのメモリ切れで検出される**（無限ループは `testTimeout` が効かない）ので、その旨と所要時間を `note` に写す。

**アサーションが値の分かれる局面にあるかを確かめる**: 各変異を当てて赤になることに加え、**当てる前に緑**であることを見る（対照）。赤にならない変異があれば、テストが恒真である —— テストを直す。

- [ ] **Step 4: 全部を回す**

```bash
git status --porcelain   # 空であること
node scripts/mutation-check.mjs; echo "exit=$?"
```

Expected: `exit=0`（全件検出）。**出力を切らない**

- [ ] **Step 5: コミットする**

```bash
git add -A scripts/mutation-check.mjs scripts/mutations
git commit -m "test: お題の配信と完成記録の変異を足し、撤去で意味を失った変異を消す（#91 PR 3）"
```

---

### Task 11: E2E

**Files:**
- Modify: `e2e/specs/topic.spec.ts`・`e2e/specs/timer-a11y.spec.ts`・`e2e/specs/routing.spec.ts`・`e2e/specs/landing.spec.ts`・（新規 or 既存）poker の a11y の spec

- [ ] **Step 1: お題を timer・poker で見る E2E を足す**

`e2e/specs/topic.spec.ts` に（`openTopicTool`・`setTopic` は `e2e/support/topic.ts` にある）:

```ts
test.describe('お題をツールへ配る', () => {
  test('Given 3 人が同じルームの timer・poker・お題ツールに居る / When お題ツールでお題にする・下ろす / Then timer と poker に出て、消える', async ({ page, openPeer }) => {
    // Given: 1 人目がお題ツール、2 人目が timer、3 人目が poker
    // When その1: お題にする（文面は書体の常用の層に収まるもの: `3 のときは Fizz を出す`）
    // Then その1: timer の「お題」の領域にタイトルと本文、poker の「お題」の見出しとタイトルが出る。
    //             poker の説明は畳まれていて、「説明を見る」で開ける
    // When その2: お題を下ろす
    // Then その2: timer と poker からお題の領域が消える
    // Then その3: どちらの画面にも「同期できていません」が出ていない（#209・#212）
  });
});
```

**`@core` を付ける**（テスト名の末尾に ` @core`。E2E のタグはタイトルへ埋め込む）。付けるのは玄関への配信（PR 2 からある 1 本目）とこの 1 本だけ。

- [ ] **Step 2: timer の a11y の走査を直す**

`e2e/specs/timer-a11y.spec.ts`:

- ロビーの走査: タブのクリック 2 行を消し、1 画面を 1 回測る。**お題を掲げてから測る**（お題の札の色の組を測る対象に入れる）。固定する組（`pairKey(signal, …)`）はそのまま
- セッションの走査: 翡翠の組（`--ok` on `--ok-tint`）を固定から外し、`resolveColors` の並びからも落とす。注釈に「#91 PR 3 で難易度バッジごと撤去した。この色の組はもう timer に出ない」
- テスト名の「ルームとお題のタブを測る」を「ロビーを測る」へ

- [ ] **Step 3: poker の文字のコントラストを測る**

poker には走査が無い（PR #311 の申し送り）。`e2e/support/a11y.ts` の `scanContrast` / `expectReadable` を使い、**お題を出した poker のルーム画面**を測る spec を足す（`e2e/specs/poker-a11y.spec.ts`・タグ無し）。

**先に探索を 1 回走らせる**（メモリ「実画面の検証は、アサーションを書く前に 1 回探索を走らせる」）: `expectReadable` の前に `scanContrast` の結果の失敗の一覧を出して見る。

- 失敗が**お題の札の中だけ**なら、Task 4 の `.topic` の地が効いていない —— 直す
- 失敗が**既存の poker の要素**（地の無い h2 など）に出たら、その要素に同じ地（`--felt-900`）を与えて直す。直した要素と前後の比を PR 本文と spec §10 に書く（**この PR の範囲に入れてよい**。利用者の方針「ここでの問題はここで直せ」）

- [ ] **Step 4: 配布で事実と合わなくなる E2E を直す**

- `e2e/specs/routing.spec.ts` の `PAGES` に `/topic/` を足す（本番にも出るので、既存の項目と同じタグの付け方にする）
- `e2e/specs/landing.spec.ts` の札の一覧に 3 枚目を足す（`@core` の検査が本番で 3 枚を見るようになる）

- [ ] **Step 5: 回す**

```bash
pnpm e2e; echo "exit=$?"
pnpm --filter @tasuki/e2e test; echo "exit=$?"   # spec のタグの自己テスト（e2e/tests）
```

Expected: すべて成功。件数を控える（PR 2 の後は 66 passed）

- [ ] **Step 6: コミットする**

```bash
git add e2e
git commit -m "test: お題が timer・poker に出る E2E と poker の文字の走査を足す（#91 PR 3）"
```

---

### Task 12: 文書

**Files:**
- Create: `docs/adr/0021-topic-as-shared-context.md`
- Modify: `docs/adr/{0011,0012,0017,0018}-*.md`・`docs/adr/README.md`（索引）・`docs/timer/adr/{0005,0008}-*.md`・`docs/timer/adr/README.md`（必要なら）・`docs/superpowers/specs/2026-09-23-shared-topic-design.md`（§10.2 新設）・`deploy/README.md`・`deploy/topic/NOTES.md`・`deploy/timer/NOTES.md`・`deploy/caddy/README.md`・`deploy/deploy.sh`（注釈のみ）・`README.md`・`docs/guides/{architecture,development}.md`・`docs/timer/ARCHITECTURE.md`

**完了形は、この PR が実際に入れたものについてだけ書く。** 本番への配布は済んでいないので、「本番で動いている」とは書かない（メモリ「決定を記録する段で完了形を書かない」）。

- [ ] **Step 1: ADR 0021 を書く**

`docs/adr/template.md` の形で。載せる決定:

1. お題は 4 つ目の文脈 `packages/topic-core` で、ルームの持ち物である。**ツールのドメイン（timer-core・poker-core）は topic-core に依存しない**（spec T1）
2. お題の状態は、変わるたびにルームの全接続へ同じ `topic` フレームで配る。各ツールのスナップショットへは埋め込まない（spec T3）。受け手はツール固有のスキーマより先に見分ける
3. お題を変えられるのはお題ツールの接続だけ。拒否は接続の種類ごとのスキーマの振り分けで行う（spec T4）
4. お題は timer のセッションをまたいで残る（spec T11）
5. topic-core の表現は直接遷移関数＋`Result`（spec T12・`docs/adr/0016` 決定 1 の MUST）。理由
6. 完成記録はアプリ層が値として写したタイトルだけを持つ（spec T9）
7. **お題の本文の Markdown は `@tasuki/markdown` が解析し、描画は各アプリが持つ**（この PR の決定。理由: 写しが 2 つあり、U+2028 の不具合を 2 箇所で別々に直した。3 つ目の使い手が現れた。描画は各アプリの見た目の規約が違う）

「却下した案」: スナップショットへの埋め込み・表示側が 2 本目の接続を張る案・Markdown の描画まで共有する案（`packages/ui` は React の基盤を持たない・spec T13）。

`docs/adr/README.md` の索引に足す。

- [ ] **Step 2: 既存の ADR に追記する（末尾へ・日付つき）**

**節を途中へ挿し込まない**（メモリ「節を追記すると直後の小節が親を変える」）。

- `docs/adr/0017`: 文脈が 4 つになった（topic-core）追記。依存方向の許可表の正本は `scripts/audit-dependency-direction.mjs` であることを指す（列挙を写さない）
- `docs/adr/0011`:
  - **脅威表 S9 を改める**。`problem.submit` を「実行者で選別する唯一の関門」として名指ししている文を、**撤去後の事実**（この計画の冒頭で grep した結果を Task 8 の後にもう一度確かめたもの）へ直す: 「実行者で選別する関門は無い。受理はまず在室を見て、あとはドメインの事前条件だけが残る」。`docs/adr/0002` の 2026-09-09 追記に従い、**改定節**（`## 改定（2026-09-XX・#91 PR 3）`）を末尾に足して差分を明記する
  - 「影響」の持ち出し経路の段落の後ろに、**D10 の実装が入った**ことを改定節で記録する（ツールを閉じる指定 `--setting-sources "" --tools ""` と列挙検証・実測の記録は spec §10）。**受容の判断は変えない** —— 経路の成立条件（AI を解錠していること）は残るが、Read で秘密ファイルを読む段は閉じた
- `docs/adr/0012` D10: 実装が入った旨を追記する（「実装は提案 #91 へ送る」の後ろに、どこで満たしたか: `apps/tasuki-sync/src/adapters/claude-cli-topic-provider.ts` の起動引数と `@tasuki/topic-core` の `v.picklist`）
- `docs/adr/0018`: URL の表に `/topic/` を足す
- `docs/timer/adr/0008`: AI 生成の置き場がお題の文脈（`topic-generation.ts`・`claude-cli-topic-provider.ts`）へ移った追記
- `docs/timer/adr/0005`: クライアントへ生成を委ねる経路（代表・`hasAiKey`・`need-problem`・`problem.submit`）を廃止した改定（spec T7）

- [ ] **Step 3: spec §10 に記録する**

`docs/superpowers/specs/2026-09-23-shared-topic-design.md` の末尾に `### 10.2 PR 3（timer・poker の表示と撤去）で実測して外したこと（2026-09-XX）` を足す（**§10.1 の後ろ・ファイルの末尾**）。この計画の「spec から外したこと・決めたこと」の表の中身（Markdown の共有・完成記録の出どころ・終わり方の判定・ロビーの 1 画面化・翡翠の組・`@core`・品質実験・**完了画面での再読込の受容**）と、Task 5 Step 5（ハブの二重参加）、Task 11 Step 3（poker の走査の結果）の結果を書く。

- [ ] **Step 4: 配布の文書を直す**

- `deploy/topic/NOTES.md` と `deploy/timer/NOTES.md` に、**配布中の窓 3 つ**を spec §6 のとおり書く。配布の順序（topic → poker → landing → timer・静的な 3 本と timer は間を空けずに続けて流す）も書く
- `deploy/topic/NOTES.md` の「まだ公開していない」節を、配布の手順へ書き換える（**配った後の完了形では書かない**）
- `deploy/README.md`: 冒頭の「PR 2 の後の main は配らない」の注意を外し、「3 系統」を 4 本へ直す（同期サーバーは 1 本のまま）
- `deploy/deploy.sh` の注釈、`deploy/caddy/README.md` の本番の断片の一覧（`40-topic.conf` を足す。PR 2 で「PR 3 より前に公開されない形」にした install の手順を、公開する形へ戻す）
- `README.md` のステータス

- [ ] **Step 5: 生きている文書から消した記号を掃く**

```bash
git grep -nE 'ProblemDelegator|problem-delegation|lobby-problem|claude-cli-problem-provider|problem\.submit|problem\.request|need-problem|hasAiKey|problemEnabled|ProblemEditor|AiUnlockPanel|ProblemConfigPanel|buildProblemPrompt|validateProblem|pickFallback\b|problem-bank' -- docs/guides docs/adr docs/timer/adr docs/timer/ARCHITECTURE.md docs/poker deploy README.md AGENTS.md packages/*/README.md apps/*/README.md
```

当たったものを 1 件ずつ見る。**ADR は過去の決定の記録なので本文を書き換えず、末尾の追記で現況を示す**。ガイド・README・ARCHITECTURE は現況へ書き換える。**計画・設計・振り返り（`docs/superpowers/`・`docs/plans/`・`docs/retrospectives/`）は当時の記録なので触らない**。

- [ ] **Step 6: リンクを検査する**

```bash
node scripts/check-links.mjs; echo "exit=$?"
node scripts/audit-plan-gate.mjs; echo "exit=$?"
```

消したファイル（`problem-delegation.ts` など）へのリンクが残っていれば赤になる。

- [ ] **Step 7: コミットする**

```bash
git add docs deploy README.md
git commit -m "docs: ADR 0021 を書き、お題の撤去と配信を ADR・配布の文書へ記録する（#91 PR 3）"
```

---

### Task 13: 全検査・実画面検証・振り返り

**Files:**
- Create: `docs/retrospectives/2026-09-XX-issue-91-shared-topic.md`

- [ ] **Step 1: 全検査を回す**

```bash
git status --porcelain   # 空であること
pnpm test; echo "exit=$?"
pnpm -r typecheck; echo "exit=$?"
pnpm -r lint; echo "exit=$?"
pnpm -r build; echo "exit=$?"
pnpm audit; echo "exit=$?"
for s in scripts/audit-*.mjs; do case "$s" in *.test.mjs) continue;; esac; node "$s" >/dev/null 2>&1; echo "$s exit=$?"; done
bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'; echo "exit=$?"
node scripts/check-links.mjs; echo "exit=$?"
node scripts/mutation-check.mjs; echo "exit=$?"
pnpm e2e; echo "exit=$?"
```

Expected: すべて `exit=0`（**`pnpm test` に scripts の自己テストと `pnpm audit` は入っていない**ので、別に回す）

- [ ] **Step 2: 合否の無い指標を基準値と比べる**

```bash
node scripts/audit-structure.mjs 2>&1 | grep -E 'SC-029|SC-032'
```

Task 0 の値と並べる。後退していたら、この PR の新しいテストが原因か（テスト名の番号・`// Given` の区切りの欠け）を見て直す。

- [ ] **Step 3: 実画面で確かめる（dev・2 つのブラウザ文脈）**

`pnpm dev` を起動し、**入口は <http://localhost:5175/> だけ**（:5173 / :5174 を直接開かない）。

1. 1 つ目の文脈で玄関からルームを作り、お題ツールを開く。2 つ目の文脈で同じルームに入り、timer を開く。3 つ目のタブで poker を開く
2. お題ツールで定型から作る → timer のロビーと poker にタイトルと本文が出る。poker は「説明を見る」で開ける。**Markdown（見出し・箇条書き・コード）が記法のまま出ていない**
3. 書き直す → 追従する。下ろす → 消える。**どの画面にも「同期できていません」が出ない**
4. お題を掲げたまま timer のセッションを開始 → セッション画面にお題が出る → 完了 → 両方の端末の完了画面に記録が出る → 履歴にタイトルが出る
5. お題を下ろしてもう 1 本完了 → 履歴に「お題なし」、削除ボタンの名前（開発者ツールのアクセシビリティ）に完了日時が入っている
6. もう 1 本を 2 つ目の文脈から「中断」→ **1 つ目の文脈（押していない側）も「中断」と出て、履歴に記録が増えない**
7. 完了画面で再読込 → 記録が二重に保存されない（履歴の件数が変わらない）
8. **timer の書体が読めている**（`document.fonts` の各面の `status`。#297 で本番の timer の書体が全滅していた）
9. 終わったら dev のポートを放す（メモリ「dev のポートは自分が掴んでいないか疑う」）

見つけた欠陥は、この PR で直す。

- [ ] **Step 4: 振り返りを書く**

`docs/retrospectives/2026-09-XX-issue-91-shared-topic.md`（既存の振り返りの形）。#91 の 3 本を通して: 設計・計画のレビューで拾った欠陥の数と型、実画面でしか出なかった欠陥、書体の base 層の実測で UI の言葉を変えたこと、D10 の実測（`--tools ""` だけでは閉じない）、変異検査が拾ったもの、受容したこと。**数値は公開の記録（PR・コミット・spec）にあるものだけを書く**（メモリにしか無い途中値を書くと出典の無い数になる）。

- [ ] **Step 5: コミットする**

```bash
git add docs/retrospectives
git commit -m "docs: #91 の振り返りを書く"
```

---

### Task 14: 独立したレビューと PR

- [ ] **Step 1: push して PR を作る**（オーケストレーターだけが行う）

```bash
git push -u origin feature/issue-91-topic-display
gh pr create --title "feat: お題を timer・poker に出し、timer のお題作成を畳む（#91 PR 3）" --body-file <本文>
```

本文は `.claude/rules/git-workflow.md` の構成（概要・変更内容・テスト方法）に、PR 2 と同じく「spec から外したこと」「検査の登録」「消した変異・作り直した変異・足した変異」「受容したこと」「**配布の手順と窓 3 つ**（`deploy/topic/NOTES.md` を指す）」を足す。末尾は `Refs #91`。**本番検証は未実施**と明記する。

- [ ] **Step 2: `/code-review` を PR 番号を明示して回す**

**採点が出るまで直さない**（メモリ「採点が走っている間に直さない」）。本物の指摘は同じ PR で直し、直したら全検査（Task 13 Step 1）を回し直してから push する。

- [ ] **Step 3: 利用者へ報告する**

マージと配布の判断は利用者が行う。配布の手順は `deploy/topic/NOTES.md`・`deploy/timer/NOTES.md`。**配布は利用者の明示の指示を待つ**。
